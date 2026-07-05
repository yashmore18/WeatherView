# WeatherView

**v3.0.0**

A fast, mobile-first weather app for any city in the world - current
conditions, real hourly + 7-day forecasts, an algorithm-generated AI
Summary page, an interactive weather map, rule-based smart alerts, and
real push notifications for abrupt weather changes. Installable as a PWA,
works offline, and never sends your location or API key anywhere it
shouldn't.

**Live demo:** [weatherview-sol5.onrender.com](https://weatherview-sol5.onrender.com)

## Why WeatherView

- **No account, no tracking, no ads.** Everything you do stays in your
  browser's `localStorage` (units, favorites, dark mode) - nothing is sent
  to a server except the weather query itself.
- **Fast by default.** Server-side caching (SQLite-backed, shared across
  worker processes) means repeat lookups for the same city don't wait on
  OpenWeatherMap at all; static assets are self-hosted, so there's no
  third-party CDN in the critical path.
- **Actually secure, not just "has HTTPS".** See [SECURITY.md](SECURITY.md)
  for the specifics - strict CSP with per-request nonces, no third-party
  script/asset origins at all, allowlisted/bounds-checked input on every
  endpoint, a shared rate limiter that can't be starved by round-robin load
  balancing, and a manual security audit with no findings left open.
- **Installable and works offline.** A real PWA (manifest + service worker),
  not just a responsive website - install it to your home screen and the
  shell still loads without a connection.
- **Built for phones first.** A real bottom tab bar on phone widths (not
  just a shrunk desktop layout), touch gestures (pull-to-refresh,
  swipe-to-dismiss alerts), and every feature tested at 375px before it's
  considered done.

## Features

### Weather data
- Current conditions: temperature, feels-like, humidity, wind (speed/gust/
  direction), pressure, visibility, sunrise/sunset, cloud cover
- **Real hourly forecast** - OpenWeatherMap's free tier only returns
  3-hourly buckets; every in-between hour is linearly interpolated
  (temp/feels-like/pop/wind) and honestly flagged as estimated (a small dot
  + legend) versus the real readings either side of it, instead of just
  showing "5 PM, 8 PM, 11 PM..." with real gaps
- 7-day forecast with an interactive Chart.js temperature/feels-like chart
- **Forecast insights** - a plain-language summary ("best day this week",
  "pack an umbrella Wednesday", warming/cooling trend, dry-spell detection)
  computed from the same data instead of leaving you to read every row
- Air quality index with a description and a visual scale
- Dedicated detail pages for humidity/wind/pressure/visibility

### AI Summary
A dedicated page (right after Today in the nav) that reads the same
current/forecast/air-quality/alert data every other page already has and
synthesizes it into one narrative: a comfort-aware headline, the forecast
trend, an air quality callout, active alerts, and a closing recommendation
- plus a confidence badge and a temperature-trend chart. Revealed as a
staggered fade-in with a soft glow, not dumped in all at once. Despite the
name, it's our own rule-based algorithm over live data
(`static/js/ai-summary-engine.js`) - explicitly labeled
"Algorithm-generated" on the page itself, not a third-party AI/LLM call, so
there's no new API dependency, no added cost, and no data leaving the
server that wasn't already being fetched.

Also surfaces concrete, icon-labeled call-outs alongside the narrative -
bring an umbrella, wear sunscreen, bundle up, secure loose items, stay
indoors, or limit exertion outside - driven by rain/heat/cold/wind/AQI/alert
rules rather than only prose. A short, skippable one-time prompt (also
editable anytime from Settings) asks whether you tend to run warm or cold,
and shifts the comfort thresholds behind both the narrative and the
recommendations accordingly, so the summary reflects the reader instead of
one fixed baseline for everyone.

### Smart alerts
Rule-based, computed client-side from data already fetched (no extra API
calls): rain starting soon, rain letting up (with the *city's own* local
time, not your browser's), air quality spikes, frost/temperature-swing
warnings, and "great day to be outside" callouts. Each is individually
toggleable in Settings.

Both rain alerts are confidence-weighted against the forecast itself rather
than trusting a single 3-hourly data point: "rain likely" vs. "rain
possible" depends on whether neighboring forecast buckets agree, and
"clearing" is only ever named from at least 3 consecutive buckets showing
a real break - a lone dip in an otherwise continuous multi-day rain event
no longer gets reported as "rain stopping" at some barely-plausible time.

### Push notifications
Real Web Push (VAPID + a service worker), not just an in-app toast - opt in
from Settings and get notified even when the app is closed, for genuinely
abrupt changes only: rain starting or stopping, a thunderstorm arriving, or
a sharp temperature swing. Not routine updates, which would make the
feature worthless within a day. Since there's no persistent server process
on a free-tier host to poll on a schedule, detection piggybacks on the same
external keep-alive-ping pattern already used for `/healthz` (see
[Deployment](#deployment)) - `services/push_service.py` compares fresh
weather against each subscription's last-seen snapshot whenever that ping
arrives, and only sends a push when something real changed.

### Location
- City search with debounced autocomplete
- **Geolocation** that actually works on desktop - network-based
  positioning instead of forcing a GPS-only fix, plus automatic re-detection
  on load if you've already granted permission
- Reverse-geocoded state/region info, so same-named towns in different
  places are distinguishable
- Up to 5 favorite cities, and a **two-location compare tool** with
  autocomplete (picking a suggestion compares by exact coordinates, so
  same-named towns in different states/countries never get mixed up) and a
  holistic written analysis - an overall "which is more pleasant right now,
  and why" verdict, a condition-level comparison (rain vs. clear, etc.), and
  per-city callouts, not just a flat list of independent stat deltas

### Map
Interactive weather map (Leaflet) with precipitation/clouds/temperature/wind
overlay layers, an Esri basemap paired with its matching label/roads
reference layer for real geographic detail, and a legend that updates per
layer. Both the weather overlays and the basemap are proxied server-side -
your browser never talks to a third party directly.

### Experience
- A one-time first-launch intro explains what WeatherView actually offers
  (real hourly data, the AI Summary page, offline PWA support, and that it's
  open-source) before asking anything of you - chains into the name prompt,
  which chains into the permissions prompt, so a brand-new visit never shows
  more than one modal at once
- A one-time, skippable name prompt personalizes the Today page with a
  time-of-day greeting ("Good afternoon, Yash") - stored in `localStorage`
  only, editable/clearable anytime from Settings, nothing sent to a server
- A second one-time prompt explains *why* before asking for location and
  notification permission, instead of the browser's native dialogs
  appearing out of nowhere with no context - skips itself if both are
  already decided either way
- "Clear cache & reset app" in Settings for a genuine fresh start if the
  app ever gets stuck on a stale cached version - the reload it triggers
  shows the same splash screen as a real cold start, not just a blank flash
- Toasts (success/error) are dismissible with their close button or by
  swiping them away on touch devices, same as alert banners
- Dark/light mode with automatic system-preference detection
- Fully responsive: desktop sidebar, tablet off-canvas drawer, phone bottom
  tab bar - three genuinely different navigation patterns, not one shrunk
  layout
- Animated sky/particle background that reflects the actual weather
  condition and time of day, everywhere in the app (not just the page you
  searched from)
- Installable PWA with offline shell caching and a install prompt that
  snoozes for 2 days if dismissed, and never nags again once installed
- Updates in the background like any PWA - but tells you about it, with a
  toast summarizing what changed right after the update takes effect,
  instead of silently reloading with no explanation
- Every card, toggle, and nav item reacts on hover, not just buttons
- Skeleton loading states, toasts, and accessible (WCAG-conscious) markup
  throughout

## Tech stack

**Backend** - Flask, a thin `services/weather_api.py` client that maps
OpenWeatherMap's raw JSON to a stable internal contract, a SQLite-backed
`Cache` (`services/cache.py`, shared across gunicorn workers), a matching
`RateLimiter` (`services/rate_limiter.py`), and `services/push_service.py`
(VAPID key management + subscription storage + abrupt-change detection for
Web Push, via `pywebpush`).

**Frontend** - No build step, no framework. `static/js/wv-shared.js` is the
shared app shell (search, units, dark mode, favorites, geolocation, PWA
install prompt); each page (`static/js/pages/*.js`) is its own small class
instantiated on load. `static/css/custom.css` is a hand-built design system
(~3,500 lines, no CSS framework). Font Awesome, Chart.js, Leaflet, and Inter
are all self-hosted under `static/vendor/` - zero third-party script/style
origins.

**Infrastructure** - gunicorn (`gthread` workers, load-tested to 100+
concurrent users), a Content-Security-Policy with per-request nonces, and a
service worker for offline/installable support.

## Setup

Requires Python 3.11+ and an [OpenWeatherMap API key](https://openweathermap.org/api)
(the free tier is enough).

```bash
uv sync                          # or: pip install -r requirements.txt
cp .env.example .env             # then fill in WEATHER_API_KEY
```

## Running

```bash
.venv/bin/python main.py                                           # dev server on :5000, opens a browser tab
# or
.venv/bin/gunicorn --config gunicorn.conf.py main:app              # production-style server
```

## Testing

```bash
.venv/bin/python -m pytest
```

Must be run as `python -m pytest` (or with `PYTHONPATH=.`), not a bare
`pytest` - `tests/` and `services/` have no `__init__.py`, so plain `pytest`
can't resolve the `from services...` imports.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `WEATHER_API_KEY` | Yes | OpenWeatherMap API key - the app exits at startup if unset |
| `SESSION_SECRET` | No | Falls back to a dev-only default; set a real value in production |
| `RATE_LIMIT_DEFAULT` | No | Per-IP requests/minute for normal endpoints (default 120) |
| `RATE_LIMIT_TILES` | No | Per-IP requests/minute for map tile endpoints (default 600) |
| `BEHIND_PROXY` | No | Set `true` if deploying behind nginx/a reverse proxy that isn't auto-detected (Render is auto-detected) |
| `FLASK_DEBUG` | No | Defaults to `true` for `main.py`'s dev server; set `false` in any environment where Werkzeug's debugger shouldn't be reachable |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | No | Identify this server to push services - auto-generated and persisted under `instance/` if unset, but **set both for any real deployment**: on a host with an ephemeral filesystem (e.g. Render's free tier), losing these on redeploy silently invalidates every existing push subscription. Generate once by running the app locally (it auto-generates on first run), then copy `public_key`/`private_key` out of `instance/vapid_keys.json` into these two env vars |
| `VAPID_CONTACT_EMAIL` | No | Contact email push services may use to reach you about your server (`mailto:` prefix added automatically if missing) |
| `PUSH_CHECK_TOKEN` | No | Shared secret for `/api/push/check` (see [Deployment](#deployment)) - same auto-generate-and-persist caveat as the VAPID keys |

## Deployment

See [docs/deployment.md](docs/deployment.md) for the recommended setup
(Render + a keep-alive ping) and the reasoning behind it. If you want push
notifications, add a second monitor on the same scheduler hitting
`/api/push/check?token=<PUSH_CHECK_TOKEN>` every 10-15 minutes - that's
what actually checks for abrupt weather changes and sends the pushes, in
lieu of a persistent background worker.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for the app's security posture and how to
report a vulnerability.

## License

[MIT](LICENSE) - see the LICENSE file for the full text.

## How WeatherView compares

An honest self-assessment against Apple Weather, Google Weather, AccuWeather,
and The Weather Channel - not a sales pitch.

**Where WeatherView genuinely does better:**
- **Privacy** - no account, no ad SDKs, no analytics/tracking scripts of any
  kind. Every big commercial weather app either sells ad inventory or is a
  data-collection arm of a larger platform; WeatherView has nothing to sell
  and nothing to collect. This is the one place a small, transparent, open-
  source app can credibly out-do a corporate one, and it's not close.
- **Transparency** - every algorithm (rain-confidence scoring, the AI
  Summary, forecast insights) is plain, readable JavaScript you can open
  and audit right now, not a black-box model. When WeatherView says
  "medium confidence," you can go read exactly what that means.
- **No third-party origins** - every asset (fonts, icons, charts, map
  tiles) is self-hosted or proxied server-side. The big apps all pull from
  multiple CDNs and ad/analytics domains; this one's CSP allows exactly
  one origin: itself.

**Where the big players still legitimately win:**
- **Forecast model quality.** Apple Weather (via WeatherKit/Dark Sky's
  legacy tech) and AccuWeather run proprietary hyperlocal nowcasting
  (minute-by-minute precipitation) and their own numerical weather models.
  WeatherView is a thin client over OpenWeatherMap's free tier - the
  *presentation* is arguably more transparent, but the underlying forecast
  accuracy is only as good as what OpenWeatherMap's free API provides, and
  hourly data beyond the real 3-hourly points is an honest interpolation,
  not a model output.
- **Severe weather integration.** The big apps plug directly into
  government weather services (NWS in the US, etc.) for legally-official
  severe weather warnings. WeatherView's alerts are self-computed from
  forecast data and are deliberately *not* a substitute for an official
  severe weather warning system.
- **Radar animation.** Apple/Google/AccuWeather all offer an animated,
  scrubbable precipitation radar loop; WeatherView's map shows a live
  snapshot per layer, not an animated timeline.
- **Scale and infrastructure.** Those apps run on dedicated global
  infrastructure with no rate limits a normal user would ever hit. This is
  one Flask app on a free-tier host with a metered upstream API key - it's
  built to handle that honestly (caching, rate limiting, a keep-alive
  ping), but it's not built for millions of concurrent users.

**Net assessment:** for what it's built to be - a fast, private,
transparent, installable weather app for checking conditions and getting
genuinely meaningful alerts - it holds its own and wins clearly on privacy
and transparency. It is not, and doesn't claim to be, a replacement for a
professional meteorological product's forecast model or official severe-
weather warning pipeline.

## About

Built by [Yash More](https://github.com/yashmore18) in India. See the
[CHANGELOG](CHANGELOG.md) for the project's history.
