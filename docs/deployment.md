# Deployment

## Recommended free host: Koyeb

Koyeb's free tier runs one web service as an **always-on container** (no
sleep-after-inactivity like Render's free tier), which is what actually
fixes the inconsistent-UX complaint - the app doesn't need to cold-start on
the first request after a period of no traffic.

The app doesn't need its own nginx layer on Koyeb: Koyeb's edge already
terminates TLS, and gzip/static-file serving at this traffic scale is fine
straight from Flask/gunicorn. (If you later move to a plain VM instead of
Koyeb, use `deploy/nginx.conf` in front of gunicorn there - see below.)

### One-time setup

1. Push this repo to GitHub (Koyeb deploys from a Git repo or a Dockerfile).
2. Create a free Koyeb account, then **Create Service → Docker** (or connect
   the GitHub repo directly - Koyeb detects the `Dockerfile` automatically).
3. Set these environment variables in the Koyeb service settings:
   - `WEATHER_API_KEY` - your OpenWeatherMap key (required)
   - `SESSION_SECRET` - any random string (`python -c "import secrets; print(secrets.token_hex(32))"`)
   - `BEHIND_PROXY=true` - so Flask reads the real client IP from
     `X-Forwarded-For` (Koyeb's edge sets it); without this, flask-limiter's
     per-IP rate limit would see every visitor as the same address
   - `LIMITER_STORAGE_URI` - leave unset (defaults to in-memory per worker;
     fine at this scale) unless you've added a shared Redis instance
4. Health check path: `/healthz` (added specifically for this - returns
   `{"status": "ok"}` without touching the cache or OpenWeatherMap, so it
   stays fast and isn't affected by rate limiting).
5. Port: Koyeb injects `PORT` automatically; `gunicorn.conf.py` already reads
   it, and the `Dockerfile`'s `CMD` doesn't hardcode a port.

### What's NOT persisted across redeploys/restarts

`services/cache.py`'s SQLite file (`instance/cache.sqlite3`) lives on the
container's local disk, which Koyeb's free tier doesn't guarantee persists
across restarts. This is fine - it's a TTL cache, not durable storage. Losing
it on redeploy is equivalent to a cold in-memory cache; the next request for
each city just refetches from OpenWeatherMap once.

### Verifying after deploy

- `curl https://<your-koyeb-url>/healthz` → `{"status": "ok"}`
- Open the app, search a city, toggle dark mode, try "Use My Location"
  (needs HTTPS to work in a real browser - Koyeb's edge provides this)
- Check response headers include `Content-Security-Policy`,
  `Strict-Transport-Security`, etc. (`curl -I`)

## Alternative: a plain VM (nginx + gunicorn)

If you end up with any persistent Linux VM (a different cloud free tier, a
spare machine, etc.) instead of Koyeb, use the two-process setup this repo
already ships:

1. `git clone` the repo, `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
2. Set `WEATHER_API_KEY`/`SESSION_SECRET` in a `.env` file or systemd
   environment file
3. Run gunicorn as a systemd service (`gunicorn.conf.py` is auto-loaded):
   ```
   ExecStart=/path/to/.venv/bin/gunicorn app:app
   ```
4. Copy `deploy/nginx.conf` to `/etc/nginx/sites-available/`, update
   `server_name` and the `alias /opt/weatherview/static/` path to match
   where the repo actually lives, symlink into `sites-enabled`, then
   `certbot --nginx` to provision a free TLS cert
5. Set `BEHIND_PROXY=true` in the gunicorn service's environment (same
   reasoning as the Koyeb case - nginx is the proxy now instead of Koyeb's edge)

## Local development

Unchanged from before - see the main `README.md` / `CLAUDE.md`:
`.venv/bin/python main.py` for the Flask dev server, or
`.venv/bin/gunicorn app:app` to run it the same way production does.
