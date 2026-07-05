# WeatherView

A fast, mobile-first weather app for any city in the world - current
conditions, 5-day/hourly forecasts with plain-language insights, air
quality, an interactive weather map, and rule-based smart alerts (rain
starting/ending, frost, air quality spikes). Installable as a PWA, works
offline, and never sends your location or API key anywhere it shouldn't.

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
- Hourly + 7-day forecast, with an interactive Chart.js temperature/
  feels-like chart
- **Forecast insights** - a plain-language summary ("best day this week",
  "pack an umbrella Wednesday", warming/cooling trend, dry-spell detection)
  computed from the same data instead of leaving you to read every row
- Air quality index with a description and a visual scale
- Dedicated detail pages for humidity/wind/pressure/visibility

### Smart alerts
Rule-based, computed client-side from data already fetched (no extra API
calls): rain starting soon, rain letting up (with the *city's own* local
time, not your browser's), air quality spikes, frost/temperature-swing
warnings, and "great day to be outside" callouts. Each is individually
toggleable in Settings.

### Location
- City search with debounced autocomplete
- **Geolocation** that actually works on desktop - network-based
  positioning instead of forcing a GPS-only fix, plus automatic re-detection
  on load if you've already granted permission
- Reverse-geocoded state/region info, so same-named towns in different
  places are distinguishable
- Up to 5 favorite cities, and a **two-location compare tool** with
  autocomplete and a written analysis (temperature/humidity/wind/air-quality
  deltas), not just a side-by-side stat dump

### Map
Interactive weather map (Leaflet) with precipitation/clouds/temperature/wind
overlay layers, an Esri basemap paired with its matching label/roads
reference layer for real geographic detail, and a legend that updates per
layer. Both the weather overlays and the basemap are proxied server-side -
your browser never talks to a third party directly.

### Experience
- Dark/light mode with automatic system-preference detection
- Fully responsive: desktop sidebar, tablet off-canvas drawer, phone bottom
  tab bar - three genuinely different navigation patterns, not one shrunk
  layout
- Animated sky/particle background that reflects the actual weather
  condition and time of day, everywhere in the app (not just the page you
  searched from)
- Installable PWA with offline shell caching and a install prompt that
  snoozes for 2 days if dismissed, and never nags again once installed
- Skeleton loading states, toasts, and accessible (WCAG-conscious) markup
  throughout

## Tech stack

**Backend** - Flask, a thin `services/weather_api.py` client that maps
OpenWeatherMap's raw JSON to a stable internal contract, a SQLite-backed
`Cache` (`services/cache.py`, shared across gunicorn workers) and matching
`RateLimiter` (`services/rate_limiter.py`).

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

## Deployment

See [docs/deployment.md](docs/deployment.md) for the recommended setup
(Render + a keep-alive ping) and the reasoning behind it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for the app's security posture and how to
report a vulnerability.

## License

[MIT](LICENSE) - see the LICENSE file for the full text.

## About

Built by [Yash More](https://github.com/yashmore18) in India. See the
[CHANGELOG](CHANGELOG.md) for the project's history.
