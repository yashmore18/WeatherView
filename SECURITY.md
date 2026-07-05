# Security

WeatherView has no user accounts, no stored personal data, and no
state-changing endpoints - every route is a read-only `GET`. That keeps the
attack surface small, but the app still follows standard hardening practice
for anything exposed on the public internet.

## What's in place

**Content Security Policy** - `default-src 'self'`, with `script-src`
restricted to a fresh per-request nonce (no `unsafe-inline`, no
`unsafe-eval`). Every third-party asset the app used to load from a CDN
(Font Awesome, Chart.js, Leaflet, Inter) is now self-hosted under
`static/vendor/`, and both the OpenWeatherMap tile overlays and the Esri
basemap are proxied through the Flask backend - the browser never makes a
cross-origin request to a third party at all.

**Standard security headers** on every response, not just HTML pages:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`,
and a `Permissions-Policy` that only allows `geolocation=(self)`.

**Input validation** on every query parameter that reaches an upstream API
call or a file/tile lookup: city names, lat/lon bounds, unit strings
(allowlisted to `metric`/`imperial`), map layer and basemap style names
(allowlisted, not passed through to the upstream URL raw), and tile z/x/y
coordinates (bounds-checked against what a valid slippy-map tile could
actually be, closing off any path-traversal or SSRF-via-parameter attempt
against the tile proxy).

**Rate limiting** - a shared, SQLite-backed per-IP counter
(`services/rate_limiter.py`) protects the single metered OpenWeatherMap API
key from being exhausted by one client, and bounds load on the app overall.
It's enforced globally across all gunicorn worker processes (not per-process
memory, which would let a client get roughly `workers x limit` through
before any one worker's own count tripped). Static assets, the service
worker, and the `/healthz` liveness check are exempt since they never touch
the metered API.

**No secrets in the client or the repo** - the OpenWeatherMap API key lives
only in `WEATHER_API_KEY` (an environment variable, never committed, loaded
via `.env` + `python-dotenv`) and is only ever used server-side; the browser
never sees it, including for map tiles (proxied) and geocoding (proxied).

**No injection surface found** - a manual audit (XSS payloads in every
user-controlled query parameter, path traversal against `/static/` and the
tile proxy, SSRF attempts against the map/basemap proxy, malformed/oversized
input, HTTP method fuzzing, and a check for verbose error/stack-trace
leakage) turned up no reflected input, no traversal, and no crashes -
details and the fixes that came out of it are in the commit history around
[this audit](../../commits/main).

## Reporting a vulnerability

This is a personal project without a dedicated security team, but reports
are taken seriously. If you find a vulnerability, please open a
[GitHub issue](https://github.com/yashmore18/WeatherView/issues) marked
`security`, or reach out to the maintainer directly rather than disclosing
publicly first, so there's time to ship a fix. There's no bug bounty - just
a genuine thank-you and a credit in the fix's commit message, if you'd like
one.
