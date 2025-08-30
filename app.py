import os
from dotenv import load_dotenv
load_dotenv()  # this loads values from .env into os.environment
import webbrowser
import threading
import logging
from flask import Flask, render_template, jsonify, request
from services.weather_api import WeatherAPI
from services.cache import Cache


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key-change-in-production")

# Initialize services
weather_api = WeatherAPI()
cache = Cache(ttl=600)  # 10 minutes TTL

@app.route('/')
def index():
    """Render the main weather application page."""
    logger.info("Serving main page")
    return render_template('index.html')

@app.route('/api/weather/current')
def get_current_weather():
    """Get current weather data for a city or coordinates."""
    try:
        # Get query parameters
        city = request.args.get('city')
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        units = request.args.get('units', 'metric')
        
        # Validate input
        if not city and not (lat and lon):
            return jsonify({'error': 'Either city or lat/lon coordinates are required'}), 400
        
        # Create cache key
        if city:
            cache_key = f"current:{city}:{units}"
            query_params = {'q': city, 'units': units}
        else:
            cache_key = f"current:{lat},{lon}:{units}"
            query_params = {'lat': lat, 'lon': lon, 'units': units}
        
        # Check cache first
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for {cache_key}")
            return jsonify(cached_data)
        
        logger.info(f"Cache miss for {cache_key}")
        
        # Fetch from API
        if city:
            data = weather_api.get_current_weather(q=city, units=units)
        else:
            try:
                lat_float = float(lat) if lat else None
                lon_float = float(lon) if lon else None
                data = weather_api.get_current_weather(lat=lat_float, lon=lon_float, units=units)
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid latitude or longitude coordinates'}), 400
        
        # Cache the result
        cache.set(cache_key, data)
        
        return jsonify(data)
        
    except ValueError as e:
        logger.warning(f"Invalid request: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error fetching current weather: {str(e)}")
        return jsonify({'error': 'Failed to fetch weather data'}), 500

@app.route('/api/weather/forecast')
def get_weather_forecast():
    """Get 5-day weather forecast for a city or coordinates."""
    try:
        # Get query parameters
        city = request.args.get('city')
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        units = request.args.get('units', 'metric')
        
        # Validate input
        if not city and not (lat and lon):
            return jsonify({'error': 'Either city or lat/lon coordinates are required'}), 400
        
        # Create cache key
        if city:
            cache_key = f"forecast:{city}:{units}"
            query_params = {'q': city, 'units': units}
        else:
            cache_key = f"forecast:{lat},{lon}:{units}"
            query_params = {'lat': lat, 'lon': lon, 'units': units}
        
        # Check cache first
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for {cache_key}")
            return jsonify(cached_data)
        
        logger.info(f"Cache miss for {cache_key}")
        
        # Fetch from API
        if city:
            data = weather_api.get_forecast(q=city, units=units)
        else:
            try:
                lat_float = float(lat) if lat else None
                lon_float = float(lon) if lon else None
                data = weather_api.get_forecast(lat=lat_float, lon=lon_float, units=units)
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid latitude or longitude coordinates'}), 400
        
        # Cache the result
        cache.set(cache_key, data)
        
        return jsonify(data)
        
    except ValueError as e:
        logger.warning(f"Invalid request: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error fetching forecast: {str(e)}")
        return jsonify({'error': 'Failed to fetch forecast data'}), 500

@app.route('/api/locations/search')
def search_locations():
    """Search for locations using geocoding API."""
    try:
        query = request.args.get('q')
        if not query or len(query.strip()) < 2:
            return jsonify({'error': 'Search query must be at least 2 characters'}), 400
        
        # Cache search results briefly (5 minutes)
        cache_key = f"search:{query.lower()}"
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for search: {query}")
            return jsonify(cached_data)
        
        logger.info(f"Cache miss for search: {query}")
        
        # Search for locations
        locations = weather_api.search_locations(query.strip(), limit=8)
        
        # Cache the results
        search_cache = Cache(ttl=300)  # 5 minutes for search results
        search_cache.set(cache_key, locations)
        
        return jsonify(locations)
        
    except ValueError as e:
        logger.warning(f"Search error: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error searching locations: {str(e)}")
        return jsonify({'error': 'Failed to search locations'}), 500

@app.route('/api/air-quality')
def get_air_quality():
    """Get air quality data for coordinates."""
    try:
        lat = request.args.get('lat')
        lon = request.args.get('lon')
        
        if not lat or not lon:
            return jsonify({'error': 'Latitude and longitude are required'}), 400
        
        try:
            lat_float = float(lat)
            lon_float = float(lon)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid latitude or longitude coordinates'}), 400
        
        # Cache air quality data briefly (30 minutes)
        cache_key = f"aqi:{lat},{lon}"
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for air quality: {lat},{lon}")
            return jsonify(cached_data)
        
        logger.info(f"Cache miss for air quality: {lat},{lon}")
        
        # Fetch air quality data
        data = weather_api.get_air_pollution(lat_float, lon_float)
        
        # Cache the results for 30 minutes
        aqi_cache = Cache(ttl=1800)  # 30 minutes
        aqi_cache.set(cache_key, data)
        
        return jsonify(data)
        
    except ValueError as e:
        logger.warning(f"Air quality error: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error fetching air quality: {str(e)}")
        return jsonify({'error': 'Failed to fetch air quality data'}), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000/")

if __name__ == '__main__':
    # Check for required environment variables
    if not os.environ.get('WEATHER_API_KEY'):
        logger.error("WEATHER_API_KEY environment variable is required")
        exit(1)
    
    logger.info("Starting Weather App on port 5000")

    # Start a thread to open the browser automatically
    threading.Timer(1.0, open_browser).start()
    
    app.run(host='0.0.0.0', port=5000, debug=True)
