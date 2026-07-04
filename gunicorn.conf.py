"""
Gunicorn config - auto-loaded from the working directory by gunicorn, so
this applies to both entry points (Procfile's `gunicorn app:app` and
.replit's `gunicorn main:app`) without changing either command.

Each request mostly waits on an outbound OpenWeatherMap HTTP call (or a
SQLite cache hit), not CPU - threads handle that kind of I/O-bound
concurrency well without needing the app to be rewritten as async, since
Python releases the GIL during blocking socket I/O.

workers=3, threads=8 gives 24 concurrent request slots, comfortably above
the 100-concurrent-user target once cache hits (see services/cache.py) serve
most repeat requests without an upstream call at all.
"""
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

worker_class = 'gthread'
workers = int(os.environ.get('GUNICORN_WORKERS', 3))
threads = int(os.environ.get('GUNICORN_THREADS', 8))

timeout = 30
graceful_timeout = 30
keepalive = 5

# Recycle workers periodically as a guard against slow memory growth from
# any single long-lived process - jitter staggers restarts so they don't
# all recycle at once and briefly drop capacity.
max_requests = 1000
max_requests_jitter = 50

accesslog = '-'
errorlog = '-'
