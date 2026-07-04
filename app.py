import os
from dotenv import load_dotenv
load_dotenv()  # this loads values from .env into os.environment
import secrets
import webbrowser
import threading
import logging
from flask import Flask, render_template, jsonify, request, send_from_directory, g
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
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
if app.secret_key == "dev-secret-key-change-in-production":
    logger.warning("SESSION_SECRET not set - using the insecure default dev key. Set SESSION_SECRET in production.")

# Behind a reverse proxy (nginx, or Render's own edge - Render sets RENDER=true
# on every service automatically, no manual config needed there), every
# request otherwise arrives from the proxy's own address - without this,
# flask-limiter's per-IP rate limit would treat every real visitor as the
# same single client. Only trust one hop's worth of X-Forwarded-* (the proxy
# immediately in front of the app), not an arbitrary chain a client could spoof.
_behind_proxy = (
    os.environ.get('RENDER') is not None
    or os.environ.get('BEHIND_PROXY', 'false').lower() in ('1', 'true', 'yes')
)
if _behind_proxy:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Rate limiting: protects the single (paid/metered) OpenWeatherMap API key
# behind this proxy from being exhausted by one abusive client, and bounds
# how much load any single IP can put on the app under the 100-concurrent-
# user target. Default storage is per-process memory, so each gunicorn
# worker (see gunicorn.conf.py) counts independently - a single IP could
# otherwise get roughly workers x limit before ANY one worker's count trips,
# since requests are spread across them round-robin. Dividing the intended
# ceiling by the worker count keeps the effective per-IP limit close to the
# originally intended one without adding a shared backend. Swap
# LIMITER_STORAGE_URI to a real shared store (e.g. redis://...) for exact
# cross-worker accounting instead of this approximation.
_workers = int(os.environ.get('GUNICORN_WORKERS', 3))
_effective_limit = max(1, 120 // _workers)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[f"{_effective_limit} per minute"],
    storage_uri=os.environ.get("LIMITER_STORAGE_URI", "memory://"),
)

# Initialize services
weather_api = WeatherAPI()
# Explicit namespaces (rather than Cache's auto-generated random one) so that
# every gunicorn worker process - each running its own copy of this module -
# resolves to the same underlying SQLite-backed cache bucket instead of four
# different per-process buckets, which would silently defeat cross-worker
# cache sharing under concurrent load.
cache = Cache(ttl=600, namespace='weather')  # 10 minutes TTL
search_cache = Cache(ttl=300, namespace='search')  # 5 minutes TTL for location search results
aqi_cache = Cache(ttl=1800, namespace='aqi')  # 30 minutes TTL for air quality data
tile_cache = Cache(ttl=600, namespace='tile')  # 10 minutes TTL for map tile images (OWM tiles refresh roughly hourly)


ALLOWED_UNITS = {'metric', 'imperial'}


def parse_location_params():
    """Shared validation for the city/lat/lon/units query params used by both
    weather endpoints. Returns (city, lat, lon, units, error_response) - if
    error_response is set, the caller should return it immediately."""
    city = request.args.get('city')
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    units = request.args.get('units', 'metric')

    if units not in ALLOWED_UNITS:
        return None, None, None, None, (jsonify({'error': "units must be 'metric' or 'imperial'"}), 400)

    if not city and not (lat and lon):
        return None, None, None, None, (jsonify({'error': 'Either city or lat/lon coordinates are required'}), 400)

    if city:
        city = city.strip()
        if not city or len(city) > 100:
            return None, None, None, None, (jsonify({'error': 'City name must be between 1 and 100 characters'}), 400)
        return city, None, None, units, None

    try:
        lat_float = float(lat)
        lon_float = float(lon)
    except (ValueError, TypeError):
        return None, None, None, None, (jsonify({'error': 'Invalid latitude or longitude coordinates'}), 400)

    if not (-90 <= lat_float <= 90) or not (-180 <= lon_float <= 180):
        return None, None, None, None, (jsonify({'error': 'Latitude must be between -90/90 and longitude between -180/180'}), 400)

    return None, lat_float, lon_float, units, None


def _get_csp_nonce():
    # Lazily generated rather than set unconditionally in a before_request
    # hook: request handling can short-circuit before reaching that hook
    # (e.g. flask-limiter's own before_request calling abort(429) if it's
    # registered first), and after_request always runs regardless - reading
    # an unset g.csp_nonce there would itself crash the response into a 500.
    if not hasattr(g, 'csp_nonce'):
        g.csp_nonce = secrets.token_urlsafe(16)
    return g.csp_nonce


@app.context_processor
def _inject_csp_nonce():
    return {'csp_nonce': _get_csp_nonce()}


@app.after_request
def _set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # geolocation=(self) explicitly allows the "Use My Location" feature -
    # a blanket deny-all Permissions-Policy would silently break it.
    response.headers['Permissions-Policy'] = 'geolocation=(self), camera=(), microphone=()'
    # Ignored over plain HTTP, harmless to always set; matters once deployed
    # behind HTTPS (see nginx/deployment config).
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = (
        f"default-src 'self'; "
        f"script-src 'self' 'nonce-{_get_csp_nonce()}' https://cdn.jsdelivr.net https://unpkg.com; "
        f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com; "
        f"font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
        f"img-src 'self' data: https://*.basemaps.cartocdn.com https://unpkg.com; "
        f"connect-src 'self'; "
        f"object-src 'none'; "
        f"base-uri 'self'; "
        f"form-action 'self'; "
        f"frame-ancestors 'none'"
    )
    return response


@app.route('/healthz')
@limiter.exempt
def healthz():
    """Liveness check for the hosting platform (e.g. Koyeb) - deliberately
    doesn't touch the cache or OpenWeatherMap, just confirms the process is
    up and serving requests. Exempt from rate limiting since the platform
    calls this on its own schedule, independent of real traffic."""
    return jsonify({'status': 'ok'})

@app.route('/')
def index():
    """Render the Today page (current conditions hero + smart alerts)."""
    logger.info("Serving Today page")
    return render_template('index.html', active_page='today')

@app.route('/forecast')
def forecast_page():
    """Render the Forecast page (hourly, 7-day, temperature chart, details)."""
    logger.info("Serving Forecast page")
    return render_template('forecast.html', active_page='forecast')

@app.route('/map')
def map_page():
    """Render the interactive weather radar Map page."""
    logger.info("Serving Map page")
    return render_template('map.html', active_page='map')

@app.route('/locations')
def locations_page():
    """Render the Locations page (search, favorites, comparison)."""
    logger.info("Serving Locations page")
    return render_template('locations.html', active_page='locations')

@app.route('/settings')
def settings_page():
    """Render the Settings page (units, theme, alert preferences)."""
    logger.info("Serving Settings page")
    return render_template('settings.html', active_page='settings')

@app.route('/sw.js')
def service_worker():
    """Serve the service worker from the root so its default scope covers the
    whole app - registering it from /static/sw.js would scope it to /static/
    only, and it would never control navigations to '/'."""
    response = send_from_directory('static', 'sw.js')
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/api/weather/current')
def get_current_weather():
    """Get current weather data for a city or coordinates."""
    try:
        city, lat, lon, units, error = parse_location_params()
        if error:
            return error

        cache_key = f"current:{city}:{units}" if city else f"current:{lat},{lon}:{units}"

        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for {cache_key}")
            return jsonify(cached_data)

        logger.info(f"Cache miss for {cache_key}")

        if city:
            data = weather_api.get_current_weather(q=city, units=units)
        else:
            data = weather_api.get_current_weather(lat=lat, lon=lon, units=units)

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
        city, lat, lon, units, error = parse_location_params()
        if error:
            return error

        cache_key = f"forecast:{city}:{units}" if city else f"forecast:{lat},{lon}:{units}"

        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for {cache_key}")
            return jsonify(cached_data)

        logger.info(f"Cache miss for {cache_key}")

        if city:
            data = weather_api.get_forecast(q=city, units=units)
        else:
            data = weather_api.get_forecast(lat=lat, lon=lon, units=units)

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
        if not query or not (2 <= len(query.strip()) <= 100):
            return jsonify({'error': 'Search query must be between 2 and 100 characters'}), 400

        # Cache search results briefly (5 minutes)
        cache_key = f"search:{query.lower()}"
        cached_data = search_cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for search: {query}")
            return jsonify(cached_data)

        logger.info(f"Cache miss for search: {query}")

        # Search for locations
        locations = weather_api.search_locations(query.strip(), limit=8)

        # Cache the results
        search_cache.set(cache_key, locations)
        
        return jsonify(locations)
        
    except ValueError as e:
        logger.warning(f"Search error: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error searching locations: {str(e)}")
        return jsonify({'error': 'Failed to search locations'}), 500

ALLOWED_MAP_LAYERS = {'precipitation_new', 'clouds_new', 'temp_new', 'wind_new'}

@app.route('/api/map/tile/<layer>/<int:z>/<int:x>/<int:y>')
def map_tile(layer, z, x, y):
    """Proxy OpenWeatherMap tile requests so the API key stays server-side."""
    if layer not in ALLOWED_MAP_LAYERS:
        return jsonify({'error': 'Unknown map layer'}), 400

    # Standard slippy-map tile bounds: at zoom z there are 2**z tiles per
    # axis. Rejecting out-of-range x/y (and an unreasonable z) up front
    # avoids pointless upstream calls and cache entries for tile coordinates
    # that can't exist.
    if not (0 <= z <= 19) or not (0 <= x < 2 ** z) or not (0 <= y < 2 ** z):
        return jsonify({'error': 'Tile coordinates out of range'}), 400

    # Same (layer, z, x, y) tile is requested repeatedly - by the same user
    # panning back over an area, and independently by every other concurrent
    # user looking at the same region - so without a server-side cache every
    # one of those becomes its own synchronous upstream OpenWeatherMap call.
    cache_key = f"tile:{layer}:{z}:{x}:{y}"
    cached = tile_cache.get(cache_key)
    if cached:
        tile_bytes, content_type = cached
    else:
        try:
            tile_bytes, content_type = weather_api.get_map_tile(layer, z, x, y)
        except ValueError as e:
            logger.warning(f"Map tile error: {str(e)}")
            return jsonify({'error': str(e)}), 502
        tile_cache.set(cache_key, (tile_bytes, content_type))

    response = app.response_class(tile_bytes, mimetype=content_type)
    response.headers['Cache-Control'] = 'public, max-age=600'
    return response

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

        if not (-90 <= lat_float <= 90) or not (-180 <= lon_float <= 180):
            return jsonify({'error': 'Latitude must be between -90/90 and longitude between -180/180'}), 400

        # Cache air quality data briefly (30 minutes)
        cache_key = f"aqi:{lat},{lon}"
        cached_data = aqi_cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache hit for air quality: {lat},{lon}")
            return jsonify(cached_data)

        logger.info(f"Cache miss for air quality: {lat},{lon}")

        # Fetch air quality data
        data = weather_api.get_air_pollution(lat_float, lon_float)

        # Cache the results for 30 minutes
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
    
    # The Werkzeug debugger (enabled by debug=True) allows arbitrary code
    # execution from anyone who can reach it - fine for this documented
    # local-dev entry point, but made explicitly overridable via env var
    # rather than unconditionally hardcoded, since this script binds to all
    # interfaces (0.0.0.0). Production deployments use gunicorn (Procfile/
    # .replit), which never runs this __main__ block at all.
    debug_mode = os.environ.get('FLASK_DEBUG', 'true').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=5000, debug=debug_mode)
