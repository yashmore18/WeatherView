# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WeatherView is a Flask web app that shows current weather and a 5-day forecast for any city, with geolocation, an autocomplete location search, air quality, and PWA offline support. Backend is Python/Flask; frontend is server-rendered Jinja2 + a single vanilla-JS class (no build step, no frontend framework).

## Commands

Setup (uv-managed venv already present in `.venv`; `requirements.txt` is the authoritative dependency list for deployment):
```bash
uv sync                    # or: .venv/bin/pip install -r requirements.txt
```

Run the app locally (requires `WEATHER_API_KEY` in `.env`; the app exits at startup if it's missing):
```bash
.venv/bin/python main.py           # Flask dev server on :5000, auto-opens a browser tab
# or
.venv/bin/gunicorn --bind 0.0.0.0:5000 --reload main:app   # matches the Replit workflow config
```

Run tests:
```bash
.venv/bin/python -m pytest         # run the full suite
.venv/bin/python -m pytest tests/test_cache.py::TestCache::test_set_and_get   # single test
```
Must be invoked as `python -m pytest` (or with `PYTHONPATH=.`), not bare `pytest` — `tests/` and `services/` have no `__init__.py`, so plain `pytest` can't resolve `from services...` imports.

There is no linter/formatter configured in this repo.

## Environment

- `WEATHER_API_KEY` (required) — OpenWeatherMap API key. `services/weather_api.py` raises at construction time if unset; `app.py` checks it too and exits before starting the dev server.
- `SESSION_SECRET` (optional) — falls back to a hardcoded dev value.
- Loaded from `.env` via `python-dotenv` (see top of `app.py`).

## Architecture

**Entry points**: `main.py` just imports `app` from `app.py`. Two deployment targets point at different entry points: `Procfile` (Heroku-style) runs `gunicorn app:app`; `.replit` runs `gunicorn main:app`. Keep both working if you change how the Flask app is constructed.

**`app.py`** holds all routes directly (no blueprints):
- `/` — renders `templates/index.html`
- `/api/weather/current`, `/api/weather/forecast` — accept either `city` or `lat`+`lon`, plus `units` (`metric`/`imperial`)
- `/api/locations/search` — geocoding-based autocomplete
- `/api/air-quality` — accepts `lat`+`lon`

**Caching**: three module-level `Cache` instances, each with its own TTL — `cache` (10 min, current-weather/forecast), `search_cache` (5 min, location search), `aqi_cache` (30 min, air quality). Each route reads and writes the same instance for its own TTL bucket, so results actually persist across requests. Don't reintroduce per-request-local `Cache()` instances in a route — that silently disables caching for that endpoint since the instance is discarded when the request ends.

**`services/weather_api.py`** is the OpenWeatherMap client. It maps raw OpenWeatherMap JSON into a stable internal contract (flat dicts with keys like `temp`, `temp_unit`, `wind_speed`, `local_time_iso`, etc.) — routes and the frontend depend on this shape, not on OpenWeatherMap's raw response. `_convert_timestamp` applies the API's per-city `timezone` offset to produce local ISO timestamps.

**`services/cache.py`** is a plain in-memory dict with per-entry TTL (no persistence, no eviction beyond lazy expiry-on-read plus `cleanup_expired()`). Docstrings call it "Redis-ready" but there is no Redis integration — this is the only cache implementation.

**Frontend** is one `WeatherApp` class in `static/js/app.js` (~1000 lines) instantiated on `DOMContentLoaded`, owning all state and DOM updates: search/autocomplete, geolocation, unit toggling, dark mode, favorites (max 5), Chart.js temperature chart, and toast/error/loading UI. State that needs to persist (units, dark mode, favorites, last-searched city) goes in `localStorage`, not server-side sessions. `templates/base.html` defines the app shell (sidebar nav, header with search/unit-toggle/dark-mode/location button) with Jinja blocks (`title`, `head`, `content`, `scripts`); `templates/index.html` fills `content`. `static/css/custom.css` (~2600 lines) implements the whole visual design system in one file.

**PWA**: `manifest.json` + `static/sw.js` provide offline caching and an install prompt; service worker cache name is versioned (`yash-weather-app-v1`) and must be bumped when static asset caching behavior changes.

**Unused dependencies**: `pyproject.toml`/`uv.lock` list `flask-sqlalchemy`, `psycopg2-binary`, `email-validator`, and `trafilatura` — leftovers from Replit's agent scaffolding. Nothing in the codebase imports them; there is no database. `requirements.txt` (flask, requests, gunicorn, python-dotenv, pytest) reflects what's actually used.

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