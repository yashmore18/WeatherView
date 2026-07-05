import os
import tempfile

# services/cache.py resolves CACHE_DB_PATH at import time - point tests at an
# ephemeral file instead of the real app's instance/cache.sqlite3, so a
# tile/weather response cached by one test run isn't still sitting there
# (making a route look like it skipped the upstream call it was supposed to
# make) the next time the suite runs.
_tmp_dir = tempfile.mkdtemp(prefix="wv_test_cache_")
os.environ.setdefault("CACHE_DB_PATH", os.path.join(_tmp_dir, "test_cache.sqlite3"))

# Same reasoning for services/push_service.py's subscription store, and
# fixed (not auto-generated) VAPID keys/check token so the test suite
# doesn't do real EC key generation on every run or touch instance/.
os.environ.setdefault("PUSH_DB_PATH", os.path.join(_tmp_dir, "test_push.sqlite3"))
os.environ.setdefault("VAPID_PUBLIC_KEY", "test-public-key")
os.environ.setdefault("VAPID_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----")
os.environ.setdefault("PUSH_CHECK_TOKEN", "test-check-token")
