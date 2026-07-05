import pytest
import json
from unittest.mock import Mock, patch
from services.weather_api import WeatherAPI

class TestWeatherAPI:
    """Test suite for WeatherAPI class."""
    
    def setup_method(self):
        """Set up test fixtures."""
        with patch.dict('os.environ', {'WEATHER_API_KEY': 'test_api_key'}):
            self.weather_api = WeatherAPI()
    
    def test_init_with_api_key(self):
        """Test initialization with valid API key."""
        with patch.dict('os.environ', {'WEATHER_API_KEY': 'test_key'}):
            api = WeatherAPI()
            assert api.api_key == 'test_key'
    
    def test_init_without_api_key(self):
        """Test initialization without API key raises ValueError."""
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match="WEATHER_API_KEY environment variable is required"):
                WeatherAPI()
    
    @patch('services.weather_api.requests.Session.get')
    def test_successful_current_weather_request(self, mock_get):
        """Test successful current weather API request."""
        # Mock response data
        mock_response_data = {
            'name': 'London',
            'sys': {'country': 'GB', 'sunrise': 1642665600, 'sunset': 1642699200},
            'dt': 1642680000,
            'timezone': 0,
            'main': {
                'temp': 15.5,
                'feels_like': 14.2,
                'humidity': 65,
                'sea_level': 1015
            },
            'wind': {'speed': 3.5, 'gust': 6.2},
            'weather': [{
                'description': 'clear sky',
                'icon': '01d'
            }],
            'coord': {'lat': 51.5074, 'lon': -0.1278},
            'clouds': {'all': 40}
        }

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data

        # get_current_weather makes a second, best-effort call to the
        # Geocoding API's reverse endpoint to fill in a state/region (the
        # /weather endpoint has no such field at all).
        mock_geo_response = Mock()
        mock_geo_response.status_code = 200
        mock_geo_response.json.return_value = [{'name': 'London', 'state': 'England', 'country': 'GB'}]

        mock_get.side_effect = [mock_response, mock_geo_response]

        # Test the request
        result = self.weather_api.get_current_weather(q='London', units='metric')

        # Verify the request was made correctly
        assert mock_get.call_count == 2
        args, kwargs = mock_get.call_args_list[0]
        assert 'weather' in args[0]
        assert kwargs['params']['appid'] == 'test_api_key'
        assert kwargs['params']['q'] == 'London'
        assert kwargs['params']['units'] == 'metric'

        # Verify the response mapping
        assert result['city'] == 'London'
        assert result['state'] == 'England'
        assert result['country'] == 'GB'
        assert result['temp'] == 15.5
        assert result['temp_unit'] == '°C'
        assert result['feels_like'] == 14.2
        assert result['humidity'] == 65
        assert result['wind_speed'] == 3.5
        assert result['wind_unit'] == 'm/s'
        assert result['description'] == 'Clear Sky'
        assert result['icon'] == '01d'
        assert result['lat'] == 51.5074
        assert result['lon'] == -0.1278
        assert result['clouds'] == 40
        assert result['sunrise'] == 1642665600
        assert result['sunset'] == 1642699200
        assert result['wind_gust'] == 6.2
        assert result['sea_level'] == 1015
    
    @patch('services.weather_api.requests.Session.get')
    def test_current_weather_with_coordinates(self, mock_get):
        """Test current weather request with coordinates."""
        mock_response_data = {
            'name': 'New York',
            'sys': {'country': 'US'},
            'dt': 1642680000,
            'timezone': -18000,
            'main': {
                'temp': 68.5,
                'feels_like': 70.2,
                'humidity': 55
            },
            'wind': {'speed': 8.5},
            'weather': [{
                'description': 'partly cloudy',
                'icon': '02d'
            }],
            'coord': {'lat': 40.7128, 'lon': -74.0060}
        }
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data

        mock_geo_response = Mock()
        mock_geo_response.status_code = 200
        mock_geo_response.json.return_value = [{'name': 'New York', 'state': 'New York', 'country': 'US'}]

        mock_get.side_effect = [mock_response, mock_geo_response]

        result = self.weather_api.get_current_weather(lat=40.7128, lon=-74.0060, units='imperial')

        # Verify request parameters
        args, kwargs = mock_get.call_args_list[0]
        assert kwargs['params']['lat'] == str(40.7128)
        assert kwargs['params']['lon'] == str(-74.0060)
        assert kwargs['params']['units'] == 'imperial'
        
        # Verify imperial units in response
        assert result['temp_unit'] == '°F'
        assert result['wind_unit'] == 'mph'
    
    @patch('services.weather_api.requests.Session.get')
    def test_forecast_request(self, mock_get):
        """Test 5-day forecast API request."""
        mock_response_data = {
            'city': {
                'name': 'Paris',
                'country': 'FR',
                'timezone': 3600,
                'coord': {'lat': 48.8566, 'lon': 2.3522}
            },
            'list': [
                {
                    'dt': 1642680000,
                    'main': {'temp': 12.5, 'temp_min': 11.0, 'temp_max': 13.0, 'humidity': 70},
                    'wind': {'speed': 4.0},
                    'weather': [{'description': 'light rain', 'icon': '10d'}]
                },
                {
                    'dt': 1642690800,
                    'main': {'temp': 14.2, 'temp_min': 12.5, 'temp_max': 15.0, 'humidity': 68},
                    'wind': {'speed': 3.2},
                    'weather': [{'description': 'cloudy', 'icon': '04d'}]
                }
            ]
        }
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data
        mock_get.return_value = mock_response
        
        result = self.weather_api.get_forecast(q='Paris', units='metric')
        
        # Verify the request
        args, kwargs = mock_get.call_args
        assert 'forecast' in args[0]
        assert kwargs['params']['q'] == 'Paris'
        
        # Verify response structure
        assert result['city'] == 'Paris'
        assert result['country'] == 'FR'
        assert result['timezone_offset'] == 3600
        assert len(result['hourly_forecast']) == 2

        # Verify first forecast point
        point = result['hourly_forecast'][0]
        assert point['temp'] == 12.5
        assert point['temp_unit'] == '°C'
        assert point['description'] == 'Light Rain'
        assert point['icon'] == '10d'
        assert point['dt'] == 1642680000
        assert 'ts_iso' in point
    
    @patch('services.weather_api.requests.Session.get')
    def test_api_error_404(self, mock_get):
        """Test handling of 404 (city not found) error."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        with pytest.raises(ValueError, match="City not found"):
            self.weather_api.get_current_weather(q='NonexistentCity')
    
    @patch('services.weather_api.requests.Session.get')
    def test_api_error_401(self, mock_get):
        """Test handling of 401 (unauthorized) error."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_get.return_value = mock_response
        
        with pytest.raises(ValueError, match="Invalid or missing API key"):
            self.weather_api.get_current_weather(q='London')
    
    @patch('services.weather_api.requests.Session.get')
    def test_api_error_429(self, mock_get):
        """Test handling of 429 (rate limit) error."""
        mock_response = Mock()
        mock_response.status_code = 429
        mock_get.return_value = mock_response
        
        with pytest.raises(ValueError, match="Rate limit reached, try again later"):
            self.weather_api.get_current_weather(q='London')
    
    @patch('services.weather_api.requests.Session.get')
    def test_network_timeout(self, mock_get):
        """Test handling of network timeout."""
        mock_get.side_effect = requests.exceptions.Timeout()
        
        with pytest.raises(ValueError, match="Request timeout - please try again"):
            self.weather_api.get_current_weather(q='London')
    
    @patch('services.weather_api.requests.Session.get')
    def test_connection_error(self, mock_get):
        """Test handling of connection error."""
        mock_get.side_effect = requests.exceptions.ConnectionError()
        
        with pytest.raises(ValueError, match="Network error, please check connection"):
            self.weather_api.get_current_weather(q='London')
    
    def test_missing_parameters(self):
        """Test error when neither city nor coordinates are provided."""
        with pytest.raises(ValueError, match="Either city name .* or coordinates .* must be provided"):
            self.weather_api.get_current_weather(units='metric')
        
        with pytest.raises(ValueError, match="Either city name .* or coordinates .* must be provided"):
            self.weather_api.get_forecast(units='metric')
    
    @patch('services.weather_api.requests.Session.get')
    def test_get_map_tile_success(self, mock_get):
        """Test successful map tile fetch returns raw bytes and content type."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'\x89PNG fake tile bytes'
        mock_response.headers = {'Content-Type': 'image/png'}
        mock_get.return_value = mock_response

        tile_bytes, content_type = self.weather_api.get_map_tile('precipitation_new', 3, 4, 4)

        args, kwargs = mock_get.call_args
        assert 'precipitation_new/3/4/4' in args[0]
        assert kwargs['params']['appid'] == 'test_api_key'
        assert tile_bytes == b'\x89PNG fake tile bytes'
        assert content_type == 'image/png'

    @patch('services.weather_api.requests.Session.get')
    def test_get_map_tile_invalid_key(self, mock_get):
        """Test map tile fetch with an invalid API key."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_get.return_value = mock_response

        with pytest.raises(ValueError, match="Invalid or missing API key"):
            self.weather_api.get_map_tile('clouds_new', 1, 0, 0)

    @patch('services.weather_api.requests.Session.get')
    def test_get_map_tile_timeout(self, mock_get):
        """Test map tile fetch handling of network timeout."""
        mock_get.side_effect = requests.exceptions.Timeout()

        with pytest.raises(ValueError, match="Tile request timeout - please try again"):
            self.weather_api.get_map_tile('temp_new', 1, 0, 0)

    @patch('services.weather_api.requests.Session.get')
    def test_get_map_tile_connection_error(self, mock_get):
        """Test map tile fetch handling of connection error."""
        mock_get.side_effect = requests.exceptions.ConnectionError()

        with pytest.raises(ValueError, match="Network error, please check connection"):
            self.weather_api.get_map_tile('wind_new', 1, 0, 0)

    def test_convert_timestamp(self):
        """Test timestamp conversion with timezone offset."""
        # Test with UTC (offset 0)
        timestamp = 1642680000  # 2022-01-20 12:00:00 UTC
        iso_string = self.weather_api._convert_timestamp(timestamp, 0)
        assert '2022-01-20T12:00:00+00:00' in iso_string
        
        # Test with positive offset (1 hour)
        iso_string = self.weather_api._convert_timestamp(timestamp, 3600)
        assert '2022-01-20T13:00:00+01:00' in iso_string
        
        # Test with negative offset (-5 hours)
        iso_string = self.weather_api._convert_timestamp(timestamp, -18000)
        assert '2022-01-20T07:00:00-05:00' in iso_string

# Import requests for the timeout/connection error tests
import requests
