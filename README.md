# WeatherView

A Flask web application that provides current weather conditions and 5-day forecasts for any city worldwide. Features include geolocation support, interactive charts, air quality, and a responsive design with dark/light mode.

## Setup

Requires Python 3.11+ and an [OpenWeatherMap API key](https://openweathermap.org/api).

```bash
uv sync                          # or: pip install -r requirements.txt
cp .env.example .env             # then fill in WEATHER_API_KEY
```

## Running

```bash
.venv/bin/python main.py                                           # dev server on :5000
# or
.venv/bin/gunicorn --bind 0.0.0.0:5000 --reload main:app           # production-style server
```

## Testing

```bash
.venv/bin/python -m pytest
```

## Features

### Core Functionality
- **City Search**: Search weather by city name with debounced input
- **Geolocation**: Get weather for your current location using browser GPS
- **Current Weather**: Comprehensive current conditions including temperature, humidity, wind speed
- **5-Day Forecast**: Detailed forecast with interactive Chart.js temperature visualization
- **Units Toggle**: Switch between metric (°C, m/s) and imperial (°F, mph) units
- **Caching**: Smart 10-minute TTL caching to reduce API calls and improve performance

### User Experience
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Dark/Light Mode**: Automatic theme detection with manual toggle
- **Favorites**: Save up to 5 favorite cities for quick access
- **Loading States**: Skeleton screens and progress indicators
- **Error Handling**: Comprehensive error messages with retry options
- **Accessibility**: WCAG compliant with proper ARIA labels and keyboard navigation

### Technical Features
- **PWA Support**: Offline capabilities and app-like experience via a service worker
- **Caching Strategy**: Per-endpoint TTL caching (10 min weather/forecast, 5 min location search, 30 min air quality) to reduce upstream API calls
- **Logging**: Comprehensive request and error logging
- **Testing**: Full test suite with pytest

## Tech Stack

### Backend
- **Flask**: Python web framework
- **requests**: HTTP client for API calls
- **OpenWeatherMap API**: Weather data provider

### Frontend
- **Vanilla JavaScript**: No frameworks, a single `WeatherApp` class using the Fetch API
- **Custom CSS design system**: Hand-built glassmorphism UI (no CSS framework)
- **Chart.js**: Interactive temperature charts
- **Font Awesome**: Icon library

### Infrastructure
- **SQLite-backed caching**: TTL-based, shared across gunicorn worker processes (see `services/cache.py`)
- **Rate limiting & security headers**: flask-limiter, CSP, and standard security headers (see `app.py`)
- See [docs/deployment.md](docs/deployment.md) for gunicorn/nginx production deployment