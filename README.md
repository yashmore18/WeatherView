# Weather App

A production-ready Flask web application that provides current weather conditions and 5-day forecasts for any city worldwide. Features include geolocation support, interactive charts, and a responsive design with dark/light mode.

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
- **PWA Support**: Offline capabilities and app-like experience
- **Caching Strategy**: Intelligent API response caching with TTL
- **Rate Limiting**: Built-in protection against excessive API calls
- **Logging**: Comprehensive request and error logging
- **Testing**: Full test suite with pytest

## Tech Stack

### Backend
- **Flask**: Python web framework
- **requests**: HTTP client for API calls
- **OpenWeatherMap API**: Weather data provider

### Frontend
- **Vanilla JavaScript**: No heavy frameworks, pure JS with Fetch API
- **Bootstrap**: Responsive CSS framework (Replit themed)
- **Chart.js**: Interactive temperature charts
- **Font Awesome**: Icon library

### Infrastructure
- **In-memory Caching**: TTL-based caching system (Redis-ready architecture)