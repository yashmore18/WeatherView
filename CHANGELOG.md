# Changelog

Notable changes to WeatherView, newest first.

## v2.1.0

- Fixed search suggestions becoming unreadable when they overlapped page
  content behind them (the empty-state welcome card, hero card, etc.) -
  the dropdown's glass background was only ~15-25% opaque (tuned for a
  flat page background), so busy content bled through strongly enough to
  make its own text hard to read. Now uses the same ~62%-opaque scrim
  every content card uses for real separation from the animated scene.
  Z-index/stacking was already correct; this was a contrast problem, not
  an overlap-order bug.
- Added a one-time "Get the most out of WeatherView" prompt (shown once,
  chained after the name prompt so the two never stack) that explains
  *why* before triggering the browser's own location and notification
  permission dialogs - skips itself entirely if both are already decided
  either way.
- Added "Clear cache & reset app" to Settings - resets all local data and
  the offline cache for a fresh start if the app ever gets stuck on a
  stale cached version, with an explicit warning it can't be undone.
- The WeatherView logo is now a real link back to Today, both in the
  desktop/tablet sidebar and (new) a compact icon in the mobile header,
  which previously had blank space there once the hamburger disappears at
  phone widths.
- Added a Changelog link to the footer's About section.
- Verified the smart alerts engine end-to-end against live rainy-city
  data (alert renders, sidebar badge updates, per-alert Settings toggles
  correctly suppress) - no issues found.

## v2.0.0

- **New AI Summary page** (right after Today in the nav) - synthesizes
  current conditions, forecast trend, air quality, and active alerts into
  one narrative with a confidence badge and a temperature chart, revealed
  as a staggered fade-in with a soft glow. Our own algorithm over live
  data, explicitly labeled as such - not a third-party AI/LLM call.
- **Real push notifications** - Web Push (VAPID) for abrupt weather
  changes (rain starting/stopping, thunderstorms, sharp temperature
  swings), triggered by a token-gated endpoint meant to be hit by the same
  external keep-alive scheduler already used for `/healthz`, since a
  free-tier host has no persistent worker to poll on its own schedule.
- **Real hourly forecast** - linear interpolation between OpenWeatherMap's
  3-hourly buckets to show one entry per hour, honestly flagged (a small
  dot + legend) wherever a reading is estimated rather than real.
- **"What's new" toast after a background update** - a PWA update used to
  reload silently; now the fresh page shows a toast summarizing what
  changed, sourced from `static/release-notes.json`.
- Fixed alerts/notifications being nearly invisible against a dark or
  cloudy animated sky scene (was a ~10%-opacity color wash meant for a flat
  page background; now uses the same opaque glass scrim every other card
  uses for contrast, plus a solid colored accent border).
- Footer's About section is now Settings-only on mobile web and installed
  PWA (was shown under every page's content, competing with the tab bar
  for the same screen space).
- Reworked the two-location compare tool's summary into a genuinely
  holistic comparison (overall verdict with reasoning, condition-level
  comparison, per-city callouts) instead of a flat list of stat deltas.
- Extended hover feedback to the compare/insight cards, tab bar, and
  settings toggles, which previously had none.
- Fixed the desktop/tablet sidebar hamburger doing nothing (a CSS
  specificity bug let an unrelated rule silently win at every screen
  width) and the "Add a City" button's icon rendering off-center and
  half-transparent (a descendant selector meant for a different icon was
  unintentionally also matching this one).

## v1.0.0 - First tagged release

- Added a one-time, skippable name prompt that personalizes the Today page
  with a time-of-day greeting; editable/clearable anytime from a new
  Profile section in Settings.
- Fixed the desktop/tablet sidebar hamburger doing nothing: an equal-
  specificity CSS rule defined later in the stylesheet was silently always
  winning regardless of screen width, so the toggle never actually hid or
  showed the sidebar as intended.
- Root-caused a real report of the rain-ending alert naming an implausible
  clearing time ("Friday 2pm" during ongoing Sunday rain) - a single
  isolated forecast bucket dipping under the rain threshold, right at the
  edge of the 5-day window, was being read as a genuine break in a
  continuous multi-day rain event. Both rain alerts now require multiple
  consecutive forecast buckets to agree before naming a specific outcome,
  and word their confidence ("likely" vs. "possible") based on how much of
  the forecast actually supports it, rather than trusting a single 3-hourly
  data point in isolation.
- Fixed the "Add a City" button's icon rendering off-center and half-
  transparent - a descendant CSS selector meant only for a different,
  unrelated icon was unintentionally also matching this button's icon two
  DOM levels down.
- Reworked the two-location compare tool's summary from a flat list of
  independent stat deltas into a genuinely holistic comparison: an overall
  comfort-based verdict with reasoning, a condition-level comparison, and
  per-city feels-like callouts.

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
