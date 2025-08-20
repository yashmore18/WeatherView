# Yash's Weather App

## Overview

A production-ready Flask web application that provides current weather conditions and 5-day forecasts for cities worldwide. The app features geolocation support, interactive temperature charts, responsive design with dark/light mode theming, and PWA capabilities for offline functionality. Built with a focus on performance, accessibility, and user experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Flask Framework**: Lightweight Python web framework serving as the main application server
- **Service Layer Pattern**: Modular design with separate services for weather API integration and caching
- **RESTful API Design**: Clean API endpoints for current weather (`/api/weather/current`) and forecasts (`/api/weather/forecast`)
- **Error Handling**: Comprehensive error management with proper HTTP status codes and user-friendly messages
- **Environment Configuration**: Secure API key management through environment variables

### Frontend Architecture
- **Server-Side Rendering**: Jinja2 templates with progressive enhancement
- **Vanilla JavaScript**: No heavy frameworks, using modern Fetch API for HTTP requests
- **Component-Based UI**: Modular JavaScript classes for weather data management
- **Progressive Web App**: Service worker implementation for offline capabilities and app-like experience
- **Responsive Design**: Bootstrap-based layout with custom CSS for enhanced user experience

### Data Storage & Caching
- **In-Memory Caching**: TTL-based caching system with 10-minute expiration to reduce API calls
- **Cache Architecture**: Redis-ready design pattern allowing easy migration to distributed caching
- **Local Storage**: Client-side persistence for user preferences (units, favorites, last searched city)
- **Favorites System**: Users can save up to 5 favorite cities with local storage persistence

### Authentication & Security
- **Rate Limiting**: Built-in protection against excessive API calls
- **Input Validation**: Server-side validation for search parameters and coordinates
- **Secure Headers**: Proper security headers and HTTPS enforcement
- **API Key Protection**: Environment variable-based API key management

### User Experience Features
- **Geolocation Integration**: Browser GPS API for location-based weather with graceful fallback
- **Units Toggle**: Metric/Imperial conversion with localStorage persistence
- **Dark/Light Theme**: Automatic theme detection with manual override
- **Debounced Search**: 300ms debouncing to optimize API calls during typing
- **Loading States**: Skeleton screens and progress indicators for better perceived performance
- **Accessibility**: WCAG compliant with ARIA labels, keyboard navigation, and screen reader support

### Data Visualization
- **Chart.js Integration**: Interactive temperature charts for 5-day forecast visualization
- **Responsive Charts**: Adaptive chart sizing for different screen sizes
- **Real-time Updates**: Dynamic chart updates based on unit preferences

## External Dependencies

### Third-Party APIs
- **OpenWeatherMap API**: Primary weather data provider
  - Current weather endpoint: `https://api.openweathermap.org/data/2.5/weather`
  - 5-day forecast endpoint: `https://api.openweathermap.org/data/2.5/forecast`
  - Requires `WEATHER_API_KEY` environment variable

### Frontend Libraries
- **Bootstrap**: Responsive CSS framework via CDN (Replit themed version)
- **Chart.js**: Interactive charting library for temperature visualization
- **Font Awesome**: Icon library for weather icons and UI elements

### Python Dependencies
- **Flask**: Core web framework
- **requests**: HTTP client for external API calls
- **pytest**: Testing framework for unit and integration tests

### Browser APIs
- **Geolocation API**: For user location detection
- **Service Worker API**: For PWA functionality and offline support
- **Local Storage API**: For client-side data persistence
- **Fetch API**: For modern HTTP requests

### Infrastructure
- **Replit**: Cloud hosting platform with integrated development environment
- **Environment Variables**: Secure configuration management through Replit Secrets