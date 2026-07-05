# Deployment

## Recommended: keep Render, add a keep-alive ping

Two card-free alternatives (Koyeb, then a from-scratch VM) turned out not to
be practically available. The actual complaint - inconsistent UX - comes
from Render's free tier putting the service to sleep after ~15 minutes of
no traffic, so the *first* request after that has to cold-start the
dyno. The fix that needs no new signup, no card, and no host migration at
all: stop the dyno from ever going to sleep, by having something ping it
regularly.

`/healthz` (see `app.py`) exists specifically for this - it returns
`{"status": "ok"}` immediately, without touching the cache, the database
file, or OpenWeatherMap, so it's cheap to hit often and is exempt from rate
limiting.

### One-time setup

1. Pick a free external scheduler - neither requires a card:
   - **cron-job.org** - free account, no card, up to 1-minute intervals
   - **UptimeRobot** - free plan, no card, 5-minute minimum interval, and
     also gives you uptime/downtime alerting as a side benefit
2. Create a monitor/job hitting `https://<your-render-app>.onrender.com/healthz`
   every 10 minutes (comfortably under Render's ~15-minute sleep timeout,
   with margin).
3. No extra configuration needed for the rate limiter to see real client
   IPs on Render - `app.py` auto-detects Render's own `RENDER` environment
   variable (set automatically on every Render service) and enables the
   same proxy-IP handling that `BEHIND_PROXY=true` would on nginx/Koyeb.

### Why this is safe

- `/healthz` does no work (no cache read, no upstream call), so pinging it
  every 10 minutes adds negligible load and can't itself trigger rate
  limiting or burn OpenWeatherMap quota.
- It doesn't change the app's actual behavior or security posture - it just
  keeps the existing free dyno warm.

### Verifying

- `curl https://<your-render-app>.onrender.com/healthz` → `{"status": "ok"}`
- After the ping job has been running for a while, load the app and confirm
  the first request feels instant rather than showing a multi-second delay
  (the old cold-start symptom).
- Response headers should include `Content-Security-Policy`,
  `Strict-Transport-Security`, etc. (`curl -I`) - unaffected by any of this.

## Push notifications: a second scheduled ping

Push notifications (`services/push_service.py`) need something to
periodically check subscribed locations for abrupt weather changes and
send a push when one's found - there's no persistent worker process to
host that on a free-tier dyno, so it piggybacks on the same external
scheduler as the keep-alive ping above.

### One-time setup

1. **Set stable VAPID keys and a check token before deploying** (see the
   main README's Environment Variables table) - `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, and `PUSH_CHECK_TOKEN`. If you skip this, the app
   auto-generates them on first run, but they live on local disk - a
   redeploy on an ephemeral filesystem regenerates them, silently
   invalidating every existing push subscription and leaving the check
   endpoint's token unknown to you.
2. On the same scheduler (cron-job.org / UptimeRobot) used for `/healthz`,
   add a second monitor hitting:
   ```
   https://<your-render-app>.onrender.com/api/push/check?token=<PUSH_CHECK_TOKEN>
   ```
   every 10-15 minutes. This is the request that actually detects changes
   and sends pushes - without it, users can still opt in from Settings, but
   nothing will ever be sent.

### Why this is safe

- The endpoint 404s for any request without the correct `token` - it isn't
  discoverable or triggerable by unrelated traffic.
- Each check is one OpenWeatherMap call per active subscription (already
  cheap and cached everywhere else in the app) - this is the one endpoint
  that intentionally isn't cache-first, since it needs the *current* state
  to compare against, not a 10-minute-stale reading.

## Reference: Docker / a plain VM, if you revisit hosting later

The repo also ships a `Dockerfile` and `deploy/nginx.conf` in case a
card-free always-on host becomes available later, or you get access to any
persistent Linux VM (a different cloud free tier, a spare machine, etc.).

**Docker (single container, platform terminates TLS at its edge):**
```
docker build -t weatherview .
docker run -e WEATHER_API_KEY=... -e SESSION_SECRET=... -e BEHIND_PROXY=true -p 8000:8000 weatherview
```
Health check path: `/healthz`. `gunicorn.conf.py` reads `$PORT` automatically
if the platform sets one.

**Plain VM (nginx + gunicorn as two services):**
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
5. Set `BEHIND_PROXY=true` in the gunicorn service's environment so
   flask-limiter sees real client IPs via nginx's `X-Forwarded-For`

## What's NOT persisted across restarts (any host)

`services/cache.py`'s SQLite file (`instance/cache.sqlite3`) lives on local
disk. Losing it on a restart/redeploy is fine - it's a TTL cache, not
durable storage. The next request for each city just refetches from
OpenWeatherMap once.

`services/push_service.py`'s subscription store (`instance/push.sqlite3`)
and auto-generated VAPID keys/check token are a different story - **losing
those is not harmless**. Every existing push subscription becomes silently
unusable (the old keys no longer match), and everyone who opted in has to
re-enable it. Set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`PUSH_CHECK_TOKEN`
as real environment variables in production so they survive a redeploy -
the subscriptions table itself is still lost on redeploy either way (it's
local SQLite, not a managed database), but at least existing users
resubscribing works normally instead of failing silently against
regenerated keys.

## Local development

Unchanged from before - see the main `README.md` / `CLAUDE.md`:
`.venv/bin/python main.py` for the Flask dev server, or
`.venv/bin/gunicorn app:app` to run it the same way production does.
