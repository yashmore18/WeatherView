import os
import tempfile

# services/cache.py resolves CACHE_DB_PATH at import time - point tests at an
# ephemeral file instead of the real app's instance/cache.sqlite3, so a
# tile/weather response cached by one test run isn't still sitting there
# (making a route look like it skipped the upstream call it was supposed to
# make) the next time the suite runs.
_tmp_dir = tempfile.mkdtemp(prefix="wv_test_cache_")
os.environ.setdefault("CACHE_DB_PATH", os.path.join(_tmp_dir, "test_cache.sqlite3"))
