# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WeatherView is a Flask web app: current weather, real hourly + 7-day forecasts, an algorithm-generated AI Summary page, an interactive weather map, rule-based smart alerts, real Web Push notifications, geolocation, autocomplete location search, air quality, and full PWA offline support. Backend is Python/Flask; frontend is server-rendered Jinja2 + vanilla JS (no build step, no frontend framework, no database).

**Current version: v3.0.2** (v3.0.0 was tagged "Final release"; v3.0.1 is a follow-up fix round — see `CHANGELOG.md` for full history). Live demo: https://weatherview-sol5.onrender.com. Repo: `git@github.com:yashmore18/WeatherView.git` (origin), default branch `main`.

It's a multi-page app now, not a single-page one — see Architecture below. If you're recalling an older mental model of this repo (single `templates/index.html`, one `static/js/app.js`), that's stale; re-derive from the file list, not from memory.

## Commands

Setup (uv-managed venv already present in `.venv`; `requirements.txt` is the authoritative dependency list for deployment — `pyproject.toml`/`uv.lock` also list unused Replit-scaffolding leftovers, see below):
```bash
uv sync                    # or: .venv/bin/pip install -r requirements.txt
```

Run the app locally (requires `WEATHER_API_KEY` in `.env`; the app exits at startup if it's missing):
```bash
.venv/bin/python main.py           # Flask dev server on :5000, auto-opens a browser tab
# or, matching production:
.venv/bin/gunicorn --config gunicorn.conf.py main:app
```

**Gunicorn binds to `$PORT`, defaulting to 8000** (`gunicorn.conf.py`) — not 5000. `.replit`'s own workflow hardcodes `--bind 0.0.0.0:5000` instead of using `gunicorn.conf.py` at all; if you launch via `PORT=5050 gunicorn ...` (or any other value) in a background shell for manual testing, remember that value doesn't persist to a fresh shell/tool invocation — check `ps aux | grep gunicorn` and the actual bound port (`ss -tlnp`) rather than assuming, if you're not sure what's already running.

**Template changes need a gunicorn restart to show up** — non-debug mode disables Jinja's auto-reload, so editing `templates/*.html` while gunicorn is already running silently keeps serving the old version. Static JS/CSS edits, by contrast, are read fresh from disk on every request, no restart needed. To pick up a template change on an already-running background gunicorn without losing its bound port/workers, send it a graceful reload signal rather than killing and relaunching:
```bash
kill -HUP $(pgrep -f "gunicorn.*main:app" | head -1)
```

Run tests:
```bash
.venv/bin/python -m pytest         # run the full suite (53 tests as of v3.0.0)
.venv/bin/python -m pytest tests/test_cache.py::TestCache::test_set_and_get   # single test
```
Must be invoked as `python -m pytest` (or with `PYTHONPATH=.`), not bare `pytest` — `tests/` and `services/` have no `__init__.py`, so plain `pytest` can't resolve `from services...` imports. These are backend/unit tests only (cache, rate limiter, weather API mapping, routes) — there is no frontend test suite; verify JS/CSS/template changes by actually driving the app (see Manual/Playwright verification below).

There is no linter/formatter configured in this repo.

## Manual / Playwright verification

This app has no frontend test suite, so any UI-affecting change (JS, CSS, template) should be verified by actually driving a running instance, not just by reading the diff:

- Launch (or reuse) gunicorn as above, find its actual bound port, then drive it with Playwright (`.venv` has `playwright` installed; use `async_playwright`, headless chromium).
- First-run modals (onboarding intro → name prompt → permissions prompt) gate on specific `localStorage` keys — set them before testing anything else so they don't block clicks:
  - `wv_onboardingDismissed` — first-launch marketing intro
  - `wv_nameModalDismissed` — name/greeting prompt
  - `wv_permissionsPromptDismissed` — location/notification permissions prompt
- A full reload cold-starts these again only if the keys are cleared (which is exactly what Settings' "Clear cache & reset app" does) — a genuinely fresh Playwright context (no storage seeded) will hit all three in sequence.
- The app's own rate limiter (see below) is real and will 429 a fast, parallel Playwright sweep across many pages — prefer a single sequential pass over many concurrent page loads if you hit 429s in test output; that's the app working as intended, not a bug.
- Toast dismissal (X button and swipe) and the splash screen (`#wvSplash`, shown on real cold starts and after Settings' cache-clear via a one-shot `sessionStorage.wv_forceSplash` flag) are the two most recent areas that were silently broken before being fixed in v3.0.0 (see below) — worth a quick re-check if touching toast/animation CSS or the splash script in `templates/base.html` again.

## Environment

- `WEATHER_API_KEY` (required) — OpenWeatherMap API key. `services/weather_api.py` raises at construction time if unset; `app.py` checks it too and exits before starting the dev server.
- `SESSION_SECRET` (optional) — falls back to a hardcoded dev value.
- `PORT` (optional, default `8000`) — gunicorn bind port; see Commands above.
- `GUNICORN_WORKERS` / `GUNICORN_THREADS` (optional, default `3`/`8`) — see `gunicorn.conf.py`.
- `RATE_LIMIT_DEFAULT` (optional, default `120`/min/IP) and `RATE_LIMIT_TILES` (optional, default `600`/min/IP, map tiles fire dozens per pan/zoom) — enforced by `services/rate_limiter.py`, a shared SQLite-backed counter (correct across multiple gunicorn workers, unlike a naive in-process counter).
- `BEHIND_PROXY` (optional) — set `true` behind nginx/a reverse proxy not auto-detected. Render is auto-detected via Render's own `RENDER` env var (always set on Render) without needing this.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT_EMAIL` (optional) — Web Push identity for `services/push_service.py`; auto-generated and persisted under `instance/vapid_keys.json` if unset, but should be set explicitly for any deployment with an ephemeral filesystem (losing these silently invalidates every push subscription).
- `PUSH_CHECK_TOKEN` (optional) — shared secret gating `/api/push/check`, the endpoint an external scheduler hits periodically to detect abrupt weather changes and send pushes (no persistent worker on free-tier hosting — see `docs/deployment.md`).
- All loaded from `.env` via `python-dotenv` (see top of `app.py`).

## Architecture

**Entry points**: `main.py` just imports `app` from `app.py`. Two deployment targets point at different entry points: `Procfile` (Heroku-style/Render) runs `gunicorn app:app`; `.replit` runs `gunicorn main:app` on a hardcoded port. Keep both working if you change how the Flask app is constructed. `gunicorn.conf.py` is auto-loaded from the working directory by gunicorn regardless of which entry point is used.

**`app.py`** (~590 lines) holds all routes directly (no blueprints). Page routes (each renders a template extending `templates/base.html`): `/` (Today), `/ai-summary`, `/forecast`, `/map`, `/locations`, `/settings`, `/highlight/<metric>` (humidity/wind/pressure/visibility detail pages). API routes: `/api/weather/current`, `/api/weather/forecast` (accept either `city` or `lat`+`lon`, plus `units` = `metric`/`imperial`), `/api/locations/search` (geocoding autocomplete), `/api/air-quality` (`lat`+`lon`), `/api/map/tile/<layer>/<z>/<x>/<y>` and `/api/map/basemap/<style>/<z>/<x>/<y>` (both proxy OpenWeatherMap/basemap tiles server-side so the API key never reaches the browser), `/api/push/*` (VAPID key, subscribe, unsubscribe, the scheduler-hit check endpoint), `/healthz` (rate-limit-exempt, no-op, for keep-alive pings), `/sw.js` (serves the service worker at the root scope it needs).

**Caching**: `services/cache.py` — a SQLite-backed shared cache (correct across multiple gunicorn worker processes, unlike a plain in-process dict) with per-entry TTL. Three separate TTL buckets: current-weather/forecast (10 min), location search (5 min), air quality (30 min). Don't reintroduce per-request-local cache instances in a route — that silently disables caching for that endpoint.

**`services/weather_api.py`** is the OpenWeatherMap client. It maps raw OpenWeatherMap JSON into a stable internal contract (flat dicts with keys like `temp`, `temp_unit`, `wind_speed`, `local_time_iso`, `icon`, etc.) — routes and the frontend depend on this shape, not on OpenWeatherMap's raw response. `_convert_timestamp` applies the API's per-city `timezone` offset to produce local ISO timestamps. No UV index field is available from this API/contract — anything inferring "sunny/strong sun" (e.g. the AI Summary's sunscreen recommendation) does so from the `icon` code + temperature, not real UV data.

**`services/rate_limiter.py`** — shared SQLite-backed per-IP counter (see Environment above for the tunables). **`services/push_service.py`** — VAPID key management, subscription storage, and the abrupt-weather-change detection logic that `/api/push/check` runs.

**Frontend, one shared core + one class per page** (this replaced an earlier single-page/single-class architecture — don't assume the old shape):
- `static/js/wv-shared.js` (`WVShared`, ~975 lines) — loaded on every page via `templates/base.html`. Owns the app shell: header search/units/dark-mode, sidebar drawer / phone bottom tab bar, toasts (with swipe-to-dismiss on touch, see below), favorites, the dynamic sky/particle scene (`weather-scene.js`), fetch helpers (`fetchCurrentWeather`/`fetchForecast`/`fetchAirQuality`), the first-launch onboarding→name→permissions modal chain, and the splash screen trigger logic. Cross-page communication is `CustomEvent`s on `document` (`wv:cityselected`, `wv:geolocation`, `wv:unitschange`, `wv:themechange`, `wv:loadingchange`) since pages are independent full-page loads, not an SPA.
- `static/js/pages/{today,ai-summary,forecast,map,locations,settings,highlight}.js` — one class per page, instantiated on `DOMContentLoaded`, each reading `window.wv` (the shared `WVShared` instance) for the common helpers above.
- `static/js/ai-summary-engine.js` — pure functions (no DOM), the rule-based "AI" synthesis engine (see below).
- `static/js/{alerts,forecast-insights,compare-insights,hourly-interpolate,push-notifications,weather-scene}.js` — other single-purpose modules pulled in by whichever page(s) need them.
- `templates/base.html` defines the app shell (nav, header, all one-time modals, splash screen) with Jinja blocks (`title`, `head`, `content`, `scripts`); each `templates/*.html` page fills `content` (and `scripts` for its own page JS).
- `static/css/custom.css` (~4300 lines) implements the entire visual design system in one file. **Known footgun**: `--wv-transition-fast/base/slow` custom properties already bundle a duration *and* timing function (e.g. `--wv-transition-base: 200ms ease-out;`) — never append an additional `var(--wv-easing)` after one in an `animation`/`transition` shorthand. Browsers silently drop the *entire* shorthand on an invalid second timing-function token (reverting to `animation-name: none`) with no console error, which is exactly what broke toast dismissal, the hero card, `.wv-section` entrance fades, and the splash slide-up, all at once, before being fixed in v3.0.0. If an animation "looks like it should work" (rule matches, class is applied) but visibly never fires, check `getComputedStyle(el).animationName` directly rather than trusting rule-matching alone.

**AI Summary** (`static/js/ai-summary-engine.js` + `static/js/pages/ai-summary.js` + `templates/ai_summary.html`): reads the same current/forecast/air-quality/alert data every other page already has and synthesizes a narrative (comfort-aware headline, forecast trend, AQI callout, active alerts, closing recommendation), a confidence badge, a temperature-trend chart, and — as of v3.0.0 — concrete icon-labeled recommendation chips (umbrella/sunscreen/bundle-up/secure-loose-items/stay-indoors/limit-exertion) driven by rule-based thresholds on rain/heat/cold/wind/AQI/alerts. A short one-time prompt (`wv_aiPrefs` in localStorage, also editable from Settings' "AI Summary personalization" row) captures a heat/cold sensitivity preference that shifts those thresholds per-user. Explicitly labeled "Algorithm-generated" in the UI — this is not a third-party LLM call, just our own logic over live data, so there's no new API dependency or cost.

**Smart alerts** (`static/js/alerts.js`): rule-based, computed client-side from data already fetched — rain starting soon/ending (confidence-weighted against multiple consecutive forecast buckets, not a single 3-hourly point), AQI spikes, frost/temperature swings, "great weather" callouts. Individually toggleable in Settings (`wv_alertPrefs` in localStorage).

**PWA**: `manifest.json` + `static/sw.js` provide offline shell caching, an install prompt, and Web Push handling. `CACHE_NAME` in `sw.js` (currently `yash-weather-app-v23`) **must be bumped whenever any file in `STATIC_CACHE_URLS` changes**, or an installed PWA keeps serving stale cached assets. The splash screen (`#wvSplash` in `base.html`) normally shows only on a standalone-PWA cold launch (once per session, via `sessionStorage.wv_splashShown`); Settings' "Clear cache & reset app" additionally sets a one-shot `sessionStorage.wv_forceSplash` flag right after clearing storage so that reload also shows it, mimicking a genuine fresh start rather than a plain reload — the inline script in `base.html` reads and immediately consumes that flag. **`static/manifest.json` must be served as `Content-Type: application/manifest+json`** (forced explicitly in `app.py`'s `_set_security_headers`, since Flask's static handler otherwise guesses `application/json` by extension) — Chrome/Android's WebAPK minting requires the correct MIME type, and without it an installed PWA falls back to a bare Chrome-wrapped shortcut that Android/Play Protect flags as an unverified/unsafe app (fixed in v3.0.1).

**First-launch flow** (chained, so a brand-new visit never shows more than one modal at once): onboarding/marketing intro (`#onboardingModal`, `wv_onboardingDismissed`) → name prompt (`#nameModal`, `wv_nameModalDismissed`, sets `wv_userName`) → permissions prompt (`#permissionsModal`, `wv_permissionsPromptDismissed`, skips itself if geolocation + notification permissions are both already browser-decided). All wired in `WVShared.init()` in `wv-shared.js` — `setupOnboarding()` → `setupNameModal()` → `maybeShowPermissionsPrompt()`.

**Toasts** (`WVShared.showError`/`showSuccess`/`showUpdateToast` in `wv-shared.js`): dismissible via the `.wv-toast__close` button or by swiping on touch devices (`setupToastSwipe()`, mirrors the pre-existing alert-banner swipe gesture in `today.js`'s `setupSwipeToDismiss()`). `removeToast()` normally waits for a real `animationend` event before removing the element from the DOM — see the CSS footgun above for why that used to hang forever.

**Unused dependencies**: `pyproject.toml`/`uv.lock` list `flask-sqlalchemy`, `psycopg2-binary`, `email-validator`, and `trafilatura` — leftovers from Replit's agent scaffolding. Nothing in the codebase imports them; there is no database (SQLite is used only as a shared-cache/rate-limiter backing store, not an ORM-backed database). `requirements.txt` (flask, requests, gunicorn, python-dotenv, pytest, flask-limiter, pywebpush) reflects what's actually used.

## Release process

When asked to cut/tag a release: update `CHANGELOG.md` (newest entry on top) and `static/release-notes.json` (drives the in-app "what's new" toast shown once after a background PWA update — keep entries short, user-facing, and to at most ~4 bullets), bump `README.md`'s version line at the top, bump `CACHE_NAME` in `static/sw.js` if any static asset changed, run the full pytest suite plus a manual/Playwright pass on anything UI-affecting (see above), then:
```bash
git tag -a vX.Y.Z -m "..."
git push origin main
git push origin vX.Y.Z
```
Existing tags: `v1.0.0`, `v2.0.0`, `v3.0.0`, `v3.0.1`, `v3.0.2` (`git tag -l -n1` to see summaries). Don't push without the user's go-ahead if it wasn't already explicitly requested for this round of changes.

## Design Direction

Follow:
docs/product-design-spec.md

The application should feel:
- premium
- calm
- elegant
- Apple-inspired
- minimal
- fast

Avoid:
- unnecessary rewrites
- scope creep
- excessive animations

Maintain:
- Flask backend
- Jinja templates
- Vanilla JavaScript frontend

CLAUDE.md is the source of truth for AI development guidance.

Legacy agent configuration files may exist but should not override these instructions.
