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
    
    @patch('services.weather_api.requests.get')
    def test_successful_current_weather_request(self, mock_get):
        """Test successful current weather API request."""
        # Mock response data
        mock_response_data = {
            'name': 'London',
            'sys': {'country': 'GB'},
            'dt': 1642680000,
            'timezone': 0,
            'main': {
                'temp': 15.5,
                'feels_like': 14.2,
                'humidity': 65
            },
            'wind': {'speed': 3.5},
            'weather': [{
                'description': 'clear sky',
                'icon': '01d'
            }]
        }
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data
        mock_get.return_value = mock_response
        
        # Test the request
        result = self.weather_api.get_current_weather(q='London', units='metric')
        
        # Verify the request was made correctly
        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        assert 'weather' in args[0]
        assert kwargs['params']['appid'] == 'test_api_key'
        assert kwargs['params']['q'] == 'London'
        assert kwargs['params']['units'] == 'metric'
        
        # Verify the response mapping
        assert result['city'] == 'London'
        assert result['country'] == 'GB'
        assert result['temp'] == 15.5
        assert result['temp_unit'] == '°C'
        assert result['feels_like'] == 14.2
        assert result['humidity'] == 65
        assert result['wind_speed'] == 3.5
        assert result['wind_unit'] == 'm/s'
        assert result['description'] == 'Clear Sky'
        assert result['icon'] == '01d'
    
    @patch('services.weather_api.requests.get')
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
            }]
        }
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_response_data
        mock_get.return_value = mock_response
        
        result = self.weather_api.get_current_weather(lat=40.7128, lon=-74.0060, units='imperial')
        
        # Verify request parameters
        args, kwargs = mock_get.call_args
        assert kwargs['params']['lat'] == 40.7128
        assert kwargs['params']['lon'] == -74.0060
        assert kwargs['params']['units'] == 'imperial'
        
        # Verify imperial units in response
        assert result['temp_unit'] == '°F'
        assert result['wind_unit'] == 'mph'
    
    @patch('services.weather_api.requests.get')
    def test_forecast_request(self, mock_get):
        """Test 5-day forecast API request."""
        mock_response_data = {
            'city': {
                'name': 'Paris',
                'country': 'FR',
                'timezone': 3600
            },
            'list': [
                {
                    'dt': 1642680000,
                    'main': {'temp': 12.5},
                    'weather': [{'description': 'light rain', 'icon': '10d'}]
                },
                {
                    'dt': 1642690800,
                    'main': {'temp': 14.2},
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
        assert len(result['points']) == 2
        
        # Verify first forecast point
        point = result['points'][0]
        assert point['temp'] == 12.5
        assert point['temp_unit'] == '°C'
        assert point['description'] == 'Light Rain'
        assert point['icon'] == '10d'
        assert 'ts_iso' in point
    
    @patch('services.weather_api.requests.get')
    def test_api_error_404(self, mock_get):
        """Test handling of 404 (city not found) error."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response
        
        with pytest.raises(ValueError, match="City not found"):
            self.weather_api.get_current_weather(q='NonexistentCity')
    
    @patch('services.weather_api.requests.get')
    def test_api_error_401(self, mock_get):
        """Test handling of 401 (unauthorized) error."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_get.return_value = mock_response
        
        with pytest.raises(ValueError, match="Invalid or missing API key"):
            self.weather_api.get_current_weather(q='London')
    
    @patch('services.weather_api.requests.get')
    def test_api_error_429(self, mock_get):
        """Test handling of 429 (rate limit) error."""
        mock_response = Mock()
        mock_response.status_code = 429
        mock_get.return_value = mock_response
        
        with pytest.raises(ValueError, match="Rate limit reached, try again later"):
            self.weather_api.get_current_weather(q='London')
    
    @patch('services.weather_api.requests.get')
    def test_network_timeout(self, mock_get):
        """Test handling of network timeout."""
        mock_get.side_effect = requests.exceptions.Timeout()
        
        with pytest.raises(ValueError, match="Request timeout - please try again"):
            self.weather_api.get_current_weather(q='London')
    
    @patch('services.weather_api.requests.get')
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
