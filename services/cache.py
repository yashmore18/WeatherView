import os
import time
import pickle
import sqlite3
import logging
import uuid
import threading
from typing import Any, Optional, Dict

logger = logging.getLogger(__name__)

# A single shared SQLite file (WAL mode) backs every Cache instance, keyed by
# an internal namespace so app.py's separate cache/search_cache/aqi_cache/
# tile_cache instances don't collide on the same key. This makes cached data
# visible across gunicorn worker processes - the old plain-dict Cache only
# lived inside one process, so with >1 worker each process cached (and hit
# OpenWeatherMap for) the same city independently, defeating the point of
# caching under concurrent load.
_DB_PATH = os.environ.get(
    'CACHE_DB_PATH',
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance', 'cache.sqlite3')
)


class Cache:
    """TTL cache backed by a shared SQLite file (visible across gunicorn
    worker processes), falling back to a private in-memory dict if the
    SQLite file can't be opened (e.g. read-only filesystem)."""

    def __init__(self, ttl: int = 600, namespace: Optional[str] = None):
        """
        Initialize cache with TTL in seconds.

        Args:
            ttl: Time to live in seconds (default: 600 = 10 minutes)
            namespace: isolates this instance's keys from other Cache
                instances sharing the same SQLite file. Auto-generated if
                not given.
        """
        self.ttl = ttl
        # A random namespace (rather than a per-process counter) avoids
        # collisions with leftover rows from earlier, unrelated processes
        # sharing the same persistent SQLite file (e.g. separate test runs,
        # or dev-server restarts) that happened to assign the same ordinal.
        self.namespace = namespace or f"ns-{uuid.uuid4().hex}"
        self._lock = threading.Lock()
        self._memory: Dict[str, Dict[str, Any]] = {}
        self._sqlite_ok = self._init_sqlite()
        if self._sqlite_ok:
            self._purge_globally_expired()

    def _init_sqlite(self) -> bool:
        try:
            os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
            conn = sqlite3.connect(_DB_PATH, timeout=5)
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS cache_entries (
                        namespace TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value BLOB,
                        expires_at REAL NOT NULL,
                        created_at REAL NOT NULL,
                        PRIMARY KEY (namespace, key)
                    )
                """)
                conn.commit()
            finally:
                conn.close()
            return True
        except (sqlite3.Error, OSError) as e:
            logger.warning(
                f"SQLite cache unavailable ({e}) - falling back to in-memory "
                "cache for this process (not shared across workers)"
            )
            return False

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(_DB_PATH, timeout=5)

    def _purge_globally_expired(self) -> None:
        """Best-effort cleanup of expired rows across ALL namespaces, not
        just this one - random per-instance namespaces mean old rows from
        past process runs (dev-server restarts, test runs) would otherwise
        never get deleted and the file would grow unbounded."""
        try:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM cache_entries WHERE expires_at < ?", (time.time(),))
                conn.commit()
            finally:
                conn.close()
        except sqlite3.Error:
            pass

    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache if not expired.

        Args:
            key: Cache key

        Returns:
            Cached value if exists and not expired, None otherwise
        """
        current_time = time.time()

        if not self._sqlite_ok:
            with self._lock:
                entry = self._memory.get(key)
                if entry is None:
                    logger.debug(f"Cache miss: {key} (key not found)")
                    return None
                if current_time > entry['expires_at']:
                    del self._memory[key]
                    logger.debug(f"Cache miss: {key} (expired)")
                    return None
                logger.debug(f"Cache hit: {key}")
                return entry['data']

        try:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT value, expires_at FROM cache_entries WHERE namespace = ? AND key = ?",
                    (self.namespace, key)
                ).fetchone()

                if row is None:
                    logger.debug(f"Cache miss: {key} (key not found)")
                    return None

                value_blob, expires_at = row
                if current_time > expires_at:
                    conn.execute(
                        "DELETE FROM cache_entries WHERE namespace = ? AND key = ?",
                        (self.namespace, key)
                    )
                    conn.commit()
                    logger.debug(f"Cache miss: {key} (expired)")
                    return None

                logger.debug(f"Cache hit: {key}")
                return pickle.loads(value_blob)
            finally:
                conn.close()
        except (sqlite3.Error, pickle.PickleError) as e:
            logger.warning(f"SQLite cache read failed ({e}), treating as miss")
            return None

    def set(self, key: str, value: Any) -> None:
        """
        Set value in cache with TTL.

        Args:
            key: Cache key
            value: Value to cache
        """
        current_time = time.time()
        expires_at = current_time + self.ttl

        if not self._sqlite_ok:
            with self._lock:
                self._memory[key] = {
                    'data': value,
                    'expires_at': expires_at,
                    'created_at': current_time
                }
            logger.debug(f"Cached: {key} (expires in {self.ttl}s)")
            return

        try:
            value_blob = pickle.dumps(value)
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO cache_entries (namespace, key, value, expires_at, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(namespace, key) DO UPDATE SET
                        value = excluded.value,
                        expires_at = excluded.expires_at,
                        created_at = excluded.created_at
                    """,
                    (self.namespace, key, value_blob, expires_at, current_time)
                )
                conn.commit()
            finally:
                conn.close()
            logger.debug(f"Cached: {key} (expires in {self.ttl}s)")
        except (sqlite3.Error, pickle.PickleError) as e:
            logger.warning(f"SQLite cache write failed ({e}), value not cached")

    def delete(self, key: str) -> bool:
        """
        Delete entry from cache.

        Args:
            key: Cache key

        Returns:
            True if key existed and was deleted, False otherwise
        """
        if not self._sqlite_ok:
            with self._lock:
                if key in self._memory:
                    del self._memory[key]
                    logger.debug(f"Deleted from cache: {key}")
                    return True
                return False

        try:
            conn = self._connect()
            try:
                cursor = conn.execute(
                    "DELETE FROM cache_entries WHERE namespace = ? AND key = ?",
                    (self.namespace, key)
                )
                conn.commit()
                deleted = cursor.rowcount > 0
                if deleted:
                    logger.debug(f"Deleted from cache: {key}")
                return deleted
            finally:
                conn.close()
        except sqlite3.Error as e:
            logger.warning(f"SQLite cache delete failed ({e})")
            return False

    def clear(self) -> None:
        """Clear all entries from cache."""
        if not self._sqlite_ok:
            with self._lock:
                self._memory.clear()
            logger.debug("Cache cleared")
            return

        try:
            conn = self._connect()
            try:
                conn.execute("DELETE FROM cache_entries WHERE namespace = ?", (self.namespace,))
                conn.commit()
            finally:
                conn.close()
            logger.debug("Cache cleared")
        except sqlite3.Error as e:
            logger.warning(f"SQLite cache clear failed ({e})")

    def cleanup_expired(self) -> int:
        """
        Remove all expired entries from cache.

        Returns:
            Number of expired entries removed
        """
        current_time = time.time()

        if not self._sqlite_ok:
            with self._lock:
                expired_keys = [k for k, e in self._memory.items() if current_time > e['expires_at']]
                for k in expired_keys:
                    del self._memory[k]
            if expired_keys:
                logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")
            return len(expired_keys)

        try:
            conn = self._connect()
            try:
                cursor = conn.execute(
                    "DELETE FROM cache_entries WHERE namespace = ? AND expires_at < ?",
                    (self.namespace, current_time)
                )
                conn.commit()
                count = cursor.rowcount
                if count:
                    logger.debug(f"Cleaned up {count} expired cache entries")
                return count
            finally:
                conn.close()
        except sqlite3.Error as e:
            logger.warning(f"SQLite cache cleanup failed ({e})")
            return 0

    def size(self) -> int:
        """Get current cache size."""
        if not self._sqlite_ok:
            with self._lock:
                return len(self._memory)

        try:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT COUNT(*) FROM cache_entries WHERE namespace = ?",
                    (self.namespace,)
                ).fetchone()
                return row[0] if row else 0
            finally:
                conn.close()
        except sqlite3.Error as e:
            logger.warning(f"SQLite cache size query failed ({e})")
            return 0

    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        current_time = time.time()

        if not self._sqlite_ok:
            with self._lock:
                total_entries = len(self._memory)
                expired_entries = sum(
                    1 for e in self._memory.values() if current_time > e['expires_at']
                )
            return {
                'total_entries': total_entries,
                'active_entries': total_entries - expired_entries,
                'expired_entries': expired_entries,
                'ttl_seconds': self.ttl
            }

        try:
            conn = self._connect()
            try:
                total_entries = conn.execute(
                    "SELECT COUNT(*) FROM cache_entries WHERE namespace = ?",
                    (self.namespace,)
                ).fetchone()[0]
                expired_entries = conn.execute(
                    "SELECT COUNT(*) FROM cache_entries WHERE namespace = ? AND expires_at < ?",
                    (self.namespace, current_time)
                ).fetchone()[0]
            finally:
                conn.close()
            return {
                'total_entries': total_entries,
                'active_entries': total_entries - expired_entries,
                'expired_entries': expired_entries,
                'ttl_seconds': self.ttl
            }
        except sqlite3.Error as e:
            logger.warning(f"SQLite cache stats query failed ({e})")
            return {'total_entries': 0, 'active_entries': 0, 'expired_entries': 0, 'ttl_seconds': self.ttl}
