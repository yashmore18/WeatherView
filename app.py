import os
from dotenv import load_dotenv
load_dotenv()  # this loads values from .env into os.environment
import secrets
import webbrowser
import threading
import logging
import requests
from flask import Flask, render_template, jsonify, request, send_from_directory, g, abort
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_limiter.util import get_remote_address
from services.weather_api import WeatherAPI
from services.cache import Cache
from services.rate_limiter import RateLimiter
from services import push_service


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
# user target. Backed by a shared SQLite counter (services/rate_limiter.py,
# same file-sharing pattern as Cache) rather than flask-limiter's default
# per-process memory storage - each gunicorn worker used to count
# independently, so a single IP could get roughly workers x limit through
# before ANY one worker's own count tripped, since requests round-robin
# across them. A shared counter enforces the real, intended ceiling
# regardless of which worker happens to handle each request.
rate_limiter = RateLimiter()
_DEFAULT_RATE_LIMIT = int(os.environ.get('RATE_LIMIT_DEFAULT', 120))  # per minute, per IP
_TILE_RATE_LIMIT = int(os.environ.get('RATE_LIMIT_TILES', 600))  # per minute, per IP - map tiles fire dozens per pan/zoom
# Static assets and the service worker never touch OpenWeatherMap - rate
# limiting them protects nothing and would instead punish a normal user's
# single pageload (which alone requests 15-20 static files).
_RATE_LIMIT_EXEMPT_ENDPOINTS = {'healthz', 'static', 'service_worker'}
_ENDPOINT_RATE_LIMITS = {'map_tile': _TILE_RATE_LIMIT, 'basemap_tile': _TILE_RATE_LIMIT}


@app.before_request
def _enforce_rate_limit():
    if request.endpoint in _RATE_LIMIT_EXEMPT_ENDPOINTS or request.endpoint is None:
        return None
    limit = _ENDPOINT_RATE_LIMITS.get(request.endpoint, _DEFAULT_RATE_LIMIT)
    identifier = get_remote_address()
    if not rate_limiter.allow(identifier, limit, window_seconds=60):
        return jsonify({'error': 'Rate limit exceeded, please try again later'}), 429

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
    # Font Awesome, Chart.js, Leaflet, and Inter are self-hosted under
    # static/vendor/, and both the weather-overlay and basemap map tiles are
    # proxied through our own /api/map/* routes - no page ever needs to load
    # an image directly from a third-party origin, so img-src doesn't need
    # any external host.
    response.headers['Content-Security-Policy'] = (
        f"default-src 'self'; "
        f"script-src 'self' 'nonce-{_get_csp_nonce()}'; "
        f"style-src 'self' 'unsafe-inline'; "
        f"font-src 'self'; "
        f"img-src 'self' data:; "
        f"connect-src 'self'; "
        f"object-src 'none'; "
        f"base-uri 'self'; "
        f"form-action 'self'; "
        f"frame-ancestors 'none'"
    )
    return response


@app.route('/healthz')
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

@app.route('/ai-summary')
def ai_summary_page():
    """Render the AI Summary page - an algorithm-generated narrative
    synthesizing current conditions, forecast trend, air quality, and
    active alerts into one readable summary (see static/js/ai-summary-engine.js;
    it's our own rule-based algorithm over live data, not a third-party
    AI/LLM call - no new API dependency or cost)."""
    logger.info("Serving AI Summary page")
    return render_template('ai_summary.html', active_page='ai-summary')

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

# Today page's Humidity/Wind/Pressure/Visibility hero tiles each link to one
# of these instead of only expanding in place - metric is validated against
# an allowlist (not passed straight to the template as free text) since it
# also selects which icon/copy block renders.
HIGHLIGHT_METRICS = {
    'humidity': {'title': 'Humidity', 'icon': 'fa-tint'},
    'wind': {'title': 'Wind', 'icon': 'fa-wind'},
    'pressure': {'title': 'Pressure', 'icon': 'fa-compress-arrows-alt'},
    'visibility': {'title': 'Visibility', 'icon': 'fa-eye'},
}

@app.route('/highlight/<metric>')
def highlight_page(metric):
    """Render the detail page for one Today-page highlight tile."""
    if metric not in HIGHLIGHT_METRICS:
        abort(404)
    logger.info("Serving Highlight detail page: %s", metric)
    return render_template(
        'highlight.html',
        active_page='today',
        metric=metric,
        metric_title=HIGHLIGHT_METRICS[metric]['title'],
        metric_icon=HIGHLIGHT_METRICS[metric]['icon'],
    )

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
# A single map pageload/pan fires dozens of tile requests at once (each of
# the 4 weather layers, times however many tiles are visible) - the global
# default limit is sized for normal API calls, not this, and blocking tiles
# with 429s just makes the map look broken. Tiles are cheap (cached
# server-side, bounded upstream cost), so they get their own generous ceiling
# (see _ENDPOINT_RATE_LIMITS above).
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

ALLOWED_BASEMAP_STYLES = {
    'World_Light_Gray_Base', 'World_Dark_Gray_Base',
    # Esri's matching "Reference" tiles for each Canvas base - transparent
    # PNGs with place labels/roads/borders, meant to be layered on top of the
    # (deliberately label-free) Base tiles above rather than used alone.
    'World_Light_Gray_Reference', 'World_Dark_Gray_Reference',
}
# Pooled session for the same reason weather_api.py has one - the basemap
# proxy can fire a couple dozen requests per initial map load/pan/zoom.
_basemap_session = requests.Session()
_basemap_adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
_basemap_session.mount('https://', _basemap_adapter)

@app.route('/api/map/basemap/<style>/<int:z>/<int:x>/<int:y>')
# Same reasoning as map_tile above - now doubled further since each basemap
# style pairs a Base layer with a Reference (labels) layer, both proxied here.
def basemap_tile(style, z, x, y):
    """Proxy Esri's keyless ArcGIS Online basemap tiles server-side.

    Browsers loading these tiles directly from server.arcgisonline.com were
    unreliable in production (some clients see the whole layer fail to load,
    independent of anything wrong with the tile data itself - the same class
    of problem the OpenWeatherMap overlay tiles above avoid by never being
    fetched directly by the browser). Routing through our own domain, same
    as the overlay tiles, removes that as a variable entirely.
    """
    if style not in ALLOWED_BASEMAP_STYLES:
        return jsonify({'error': 'Unknown basemap style'}), 400
    # This basemap's own tiles only go up to z16 (see maxNativeZoom in
    # map.js) - reject anything Leaflet shouldn't be requesting at all.
    if not (0 <= z <= 16) or not (0 <= x < 2 ** z) or not (0 <= y < 2 ** z):
        return jsonify({'error': 'Tile coordinates out of range'}), 400

    cache_key = f"basemap:{style}:{z}:{x}:{y}"
    cached = tile_cache.get(cache_key)
    if cached:
        tile_bytes, content_type = cached
    else:
        try:
            upstream = _basemap_session.get(
                f"https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/{style}/MapServer/tile/{z}/{y}/{x}",
                timeout=10,
            )
            upstream.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f"Basemap tile fetch failed: {str(e)}")
            return jsonify({'error': 'Basemap tile unavailable'}), 502
        tile_bytes = upstream.content
        content_type = upstream.headers.get('Content-Type', 'image/png')
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

@app.route('/api/push/vapid-public-key')
def push_vapid_public_key():
    """The browser needs this to call pushManager.subscribe() - it's public
    by design (identifies our server to push services), unlike the private
    key which never leaves this process."""
    return jsonify({'publicKey': push_service.VAPID_PUBLIC_KEY})

@app.route('/api/push/subscribe', methods=['POST'])
def push_subscribe():
    """Stores a browser's push subscription plus the location to watch for
    abrupt weather changes. No account/auth - the subscription's own
    endpoint+keys are the only credential, same trust model as any other
    Web Push integration."""
    try:
        data = request.get_json(silent=True) or {}
        subscription = data.get('subscription')
        lat = data.get('lat')
        lon = data.get('lon')
        city = data.get('city')
        units = data.get('units', 'metric')

        if not subscription or not subscription.get('endpoint') or lat is None or lon is None:
            return jsonify({'error': 'subscription and lat/lon are required'}), 400
        if units not in ALLOWED_UNITS:
            return jsonify({'error': "units must be 'metric' or 'imperial'"}), 400

        try:
            lat_f, lon_f = float(lat), float(lon)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid latitude or longitude'}), 400
        if not (-90 <= lat_f <= 90) or not (-180 <= lon_f <= 180):
            return jsonify({'error': 'Invalid latitude or longitude'}), 400

        push_service.save_subscription(subscription, city, lat_f, lon_f, units)
        return jsonify({'status': 'ok'})
    except Exception as e:
        logger.error(f"Error saving push subscription: {str(e)}")
        return jsonify({'error': 'Failed to save subscription'}), 500

@app.route('/api/push/unsubscribe', methods=['POST'])
def push_unsubscribe():
    """Removes a subscription - called when the user turns the toggle off,
    or the browser reports the old subscription is no longer valid."""
    try:
        data = request.get_json(silent=True) or {}
        endpoint = data.get('endpoint')
        if not endpoint:
            return jsonify({'error': 'endpoint is required'}), 400
        push_service.remove_subscription(endpoint)
        return jsonify({'status': 'ok'})
    except Exception as e:
        logger.error(f"Error removing push subscription: {str(e)}")
        return jsonify({'error': 'Failed to remove subscription'}), 500

@app.route('/api/push/check')
def push_check():
    """Not a persistent background worker - Render's free tier has no long-
    running process to host one - this is instead meant to be hit every
    10-15 minutes by the same external scheduler (cron-job.org/UptimeRobot)
    already pinging /healthz to keep the app awake. Gated by a shared-secret
    token so it can't be triggered by arbitrary traffic that discovers the
    URL (see services/push_service.py for how the token is provisioned)."""
    token = request.args.get('token')
    if token != push_service.CHECK_TOKEN:
        abort(404)
    notified = push_service.check_all_subscriptions(weather_api)
    return jsonify({'status': 'ok', 'notified': notified})

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
