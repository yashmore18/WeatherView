# Changelog

Notable changes to WeatherView, newest first. This project doesn't cut
formal releases/tags, so entries are grouped by theme rather than a strict
version number.

## Security hardening & final polish

- Fixed the rate limiter's effective ceiling being ~3x looser than intended
  (each gunicorn worker was counting independently); replaced it with a
  shared SQLite-backed counter enforced globally.
- Ran a manual security audit (XSS, path traversal, SSRF, input fuzzing,
  header/method checks) - no injection surface found; added `SECURITY.md`
  documenting the app's actual security posture.
- Fixed geolocation throwing a timeout error on laptops/desktops
  (`enableHighAccuracy` was forcing a GPS-only fix); switched to
  network-based positioning and added automatic geolocation on load when
  permission is already granted.
- Fixed the "Add a City" button's icon rendering oversized on small buttons.
- Added a real two-location comparison tool (autocomplete + head-to-head
  analysis) to the Locations page, replacing a favorites-only grid.
- Added reverse geocoding to fill in a state/region field, so same-named
  towns in different states/countries are distinguishable.
- Fixed the rain-clearing alert showing a nonsensical "past" time - a bare
  clock time needs a "tomorrow"/weekday qualifier once the moment crosses
  into the next calendar day.
- Fixed every fresh visit silently reloading itself once (a service-worker
  `controllerchange` false positive on first install, not just updates).
- Added an intelligent "This Week at a Glance" insights section to the
  Forecast page (best day, umbrella day, temperature trend, dry-spell
  detection).
- Reworked the map's basemap to pair Esri's Canvas tiles with their matching
  Reference (labels/roads) layer for real geographic detail without hurting
  weather-overlay contrast.
- Added an About section and GitHub link to the site footer (now shown on
  mobile too, not just desktop).

## Mobile-first pass & self-hosting

- Fixed broken icons/map/interactions after the first production deploy by
  self-hosting Font Awesome, Chart.js, Leaflet, and Inter (previously loaded
  from third-party CDNs that were unreliable in production).
- Proxied all map tiles (both OpenWeatherMap overlays and the basemap)
  through the Flask backend for reliability and so the API key never
  reaches the browser.
- Added dedicated detail pages for the Today page's highlight tiles
  (humidity/wind/pressure/visibility).
- Added a real bottom tab bar for phone widths, replacing the desktop
  sidebar entirely below 768px instead of just collapsing it.
- Added site-wide entrance animations, a live "Popular Cities" preview for
  first-time visitors, and wired the animated sky/particle background to
  match real conditions on every page.

## Production hardening

- Added rate limiting, a Content-Security-Policy with per-request nonces,
  and standard security headers.
- Replaced in-process caching with a SQLite-backed shared cache so multiple
  gunicorn worker processes stop duplicating upstream API calls.
- Added gunicorn config (`gthread` workers/threads) and load-tested to
  100+ concurrent users.
- Added `/healthz`, deployment docs, and a keep-alive ping strategy for
  free-tier hosting.

## Redesign

- Multi-page routing (Today/Forecast/Map/Locations/Settings), an
  Apple-Weather-inspired UI, an interactive weather map, and rule-based
  smart alerts (rain soon/ending, air quality, frost, temperature swings,
  good-weather days).

## Initial prototype

- Single-page weather app: city search, current conditions, 5-day forecast,
  Chart.js temperature chart, dark/light mode, PWA offline support.
