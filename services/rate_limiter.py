import os
import time
import sqlite3
import logging
import threading
from typing import Dict

logger = logging.getLogger(__name__)

# Shared with cache.py's reasoning: a single SQLite file (WAL mode) makes the
# counter visible across all gunicorn worker processes. The previous
# in-memory-per-process rate limiter had to divide its intended ceiling by
# the worker count to approximate a global limit - traffic that round-robins
# across workers could still slip well past the nominal limit before any one
# worker's own counter tripped. A shared counter enforces the real limit.
_DB_PATH = os.environ.get(
    'RATE_LIMIT_DB_PATH',
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance', 'rate_limit.sqlite3')
)


class RateLimiter:
    """Fixed-window request counter backed by a shared SQLite file, falling
    back to a private in-memory dict if the file can't be opened (fails
    open, matching Cache's behavior - a rate limiter that can't be reached
    should never itself take the site down)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._memory: Dict[str, int] = {}
        self._sqlite_ok = self._init_sqlite()

    def _init_sqlite(self) -> bool:
        try:
            os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
            conn = sqlite3.connect(_DB_PATH, timeout=5)
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS rate_limit_counters (
                        bucket_key TEXT PRIMARY KEY,
                        count INTEGER NOT NULL,
                        window_start REAL NOT NULL
                    )
                """)
                conn.commit()
            finally:
                conn.close()
            return True
        except (sqlite3.Error, OSError) as e:
            logger.warning(f"SQLite rate limiter unavailable ({e}) - falling back to in-memory (per-process only)")
            return False

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(_DB_PATH, timeout=5)

    def allow(self, identifier: str, limit: int, window_seconds: int = 60) -> bool:
        """Returns True if this request is within `limit` requests per
        `window_seconds` for `identifier` (e.g. a client IP), incrementing
        the counter as a side effect. Fixed-window, not sliding - same
        trade-off flask-limiter's default MemoryStorage strategy makes."""
        now = time.time()
        window_start = now - (now % window_seconds)
        bucket_key = f"{identifier}:{window_seconds}:{window_start}"

        if not self._sqlite_ok:
            with self._lock:
                # Sweep stale buckets for this identifier so the dict doesn't
                # grow unbounded across windows (no separate cleanup pass
                # exists for the in-memory fallback).
                prefix = f"{identifier}:{window_seconds}:"
                for k in [k for k in self._memory if k.startswith(prefix) and k != bucket_key]:
                    del self._memory[k]
                count = self._memory.get(bucket_key, 0)
                if count >= limit:
                    return False
                self._memory[bucket_key] = count + 1
                return True

        try:
            conn = self._connect()
            try:
                # IMMEDIATE grabs the write lock up front so two workers
                # incrementing the same bucket at once can't both read the
                # same pre-increment count and both be allowed through.
                conn.execute("BEGIN IMMEDIATE")
                row = conn.execute(
                    "SELECT count FROM rate_limit_counters WHERE bucket_key = ?", (bucket_key,)
                ).fetchone()
                if row is None:
                    conn.execute(
                        "INSERT INTO rate_limit_counters (bucket_key, count, window_start) VALUES (?, 1, ?)",
                        (bucket_key, window_start)
                    )
                    conn.commit()
                    return True
                if row[0] >= limit:
                    conn.commit()
                    return False
                conn.execute("UPDATE rate_limit_counters SET count = count + 1 WHERE bucket_key = ?", (bucket_key,))
                conn.commit()
                return True
            finally:
                conn.close()
        except sqlite3.Error as e:
            logger.warning(f"SQLite rate limiter check failed ({e}), allowing request")
            return True

    def cleanup_expired(self, max_age_seconds: int = 3600) -> int:
        """Best-effort removal of old buckets so the file doesn't grow
        unbounded - one bucket row is written per (identifier, window) pair
        ever seen."""
        if not self._sqlite_ok:
            return 0
        try:
            conn = self._connect()
            try:
                cutoff = time.time() - max_age_seconds
                cursor = conn.execute("DELETE FROM rate_limit_counters WHERE window_start < ?", (cutoff,))
                conn.commit()
                return cursor.rowcount
            finally:
                conn.close()
        except sqlite3.Error:
            return 0
