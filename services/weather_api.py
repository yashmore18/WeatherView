import os
import requests
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class WeatherAPI:
    """OpenWeatherMap API client with response mapping to internal contract."""
    
    BASE_URL = "https://api.openweathermap.org/data/2.5"
    GEO_URL = "https://api.openweathermap.org/geo/1.0"
    
    def __init__(self):
        self.api_key = os.environ.get('WEATHER_API_KEY')
        if not self.api_key:
            raise ValueError("WEATHER_API_KEY environment variable is required")
    
    def _make_request(self, endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make a request to the OpenWeatherMap API with error handling."""
        params['appid'] = self.api_key
        url = f"{self.BASE_URL}/{endpoint}"
        
        try:
            logger.info(f"Making API request to {endpoint} with params: {params}")
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 401:
                raise ValueError("Invalid or missing API key")
            elif response.status_code == 404:
                raise ValueError("City not found")
            elif response.status_code == 429:
                raise ValueError("Rate limit reached, try again later")
            elif response.status_code != 200:
                raise ValueError(f"API error: {response.status_code}")
            
            return response.json()
            
        except requests.exceptions.Timeout:
            raise ValueError("Request timeout - please try again")
        except requests.exceptions.ConnectionError:
            raise ValueError("Network error, please check connection")
        except requests.exceptions.RequestException as e:
            raise ValueError(f"Network error: {str(e)}")
    
    def search_locations(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for locations using OpenWeatherMap's geocoding API."""
        params = {
            'q': query,
            'limit': limit,
            'appid': self.api_key
        }
        
        try:
            url = f"{self.GEO_URL}/direct"
            logger.info(f"Making geocoding request with params: {params}")
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 401:
                raise ValueError("Invalid or missing API key")
            elif response.status_code != 200:
                raise ValueError(f"Geocoding API error: {response.status_code}")
            
            data = response.json()
            
            # Format the results for frontend consumption
            locations = []
            for item in data:
                location = {
                    'name': item['name'],
                    'country': item['country'],
                    'state': item.get('state', ''),
                    'lat': item['lat'],
                    'lon': item['lon'],
                    'display_name': f"{item['name']}, {item.get('state', '')} {item['country']}".strip(', ')
                }
                locations.append(location)
            
            return locations
            
        except requests.exceptions.Timeout:
            raise ValueError("Search timeout - please try again")
        except requests.exceptions.ConnectionError:
            raise ValueError("Network error, please check connection")
        except requests.exceptions.RequestException as e:
            raise ValueError(f"Network error: {str(e)}")
    
    def get_air_pollution(self, lat: float, lon: float) -> Dict[str, Any]:
        """Get air pollution data for given coordinates."""
        try:
            url = f"{self.BASE_URL}/air_pollution"
            params = {
                'lat': str(lat),
                'lon': str(lon),
                'appid': self.api_key
            }
            
            logger.info(f"Making air pollution request with params: {params}")
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 401:
                raise ValueError("Invalid or missing API key")
            elif response.status_code != 200:
                raise ValueError(f"Air pollution API error: {response.status_code}")
            
            data = response.json()
            
            # Map AQI values to descriptions
            aqi_descriptions = {
                1: "Good",
                2: "Fair", 
                3: "Moderate",
                4: "Poor",
                5: "Very Poor"
            }
            
            aqi_value = data['list'][0]['main']['aqi']
            components = data['list'][0]['components']
            
            return {
                'aqi': aqi_value,
                'aqi_description': aqi_descriptions.get(aqi_value, "Unknown"),
                'pm2_5': components.get('pm2_5', 0),
                'pm10': components.get('pm10', 0),
                'no2': components.get('no2', 0),
                'o3': components.get('o3', 0),
                'co': components.get('co', 0),
                'so2': components.get('so2', 0)
            }
            
        except requests.exceptions.Timeout:
            raise ValueError("Air pollution data timeout - please try again")
        except requests.exceptions.ConnectionError:
            raise ValueError("Network error, please check connection")
        except requests.exceptions.RequestException as e:
            raise ValueError(f"Network error: {str(e)}")
    
    def _convert_timestamp(self, timestamp: int, timezone_offset: int) -> str:
        """Convert Unix timestamp to ISO string adjusted for timezone."""
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        # Apply timezone offset (in seconds)
        local_dt = dt.replace(tzinfo=timezone.utc).astimezone(
            timezone(timedelta(seconds=timezone_offset))
        )
        return local_dt.isoformat()
    
    def get_current_weather(self, q: Optional[str] = None, lat: Optional[float] = None, 
                          lon: Optional[float] = None, units: str = 'metric') -> Dict[str, Any]:
        """Get current weather data and map to internal contract."""
        params = {'units': units}
        
        if q:
            params['q'] = q
        elif lat is not None and lon is not None:
            params['lat'] = str(lat)
            params['lon'] = str(lon)
        else:
            raise ValueError("Either city name (q) or coordinates (lat, lon) must be provided")
        
        data = self._make_request('weather', params)
        
        # Map to internal contract
        timezone_offset = data.get('timezone', 0)
        current_time = self._convert_timestamp(data['dt'], timezone_offset)
        
        # Determine unit symbols
        temp_unit = '°C' if units == 'metric' else '°F'
        wind_unit = 'm/s' if units == 'metric' else 'mph'
        
        return {
            'city': data['name'],
            'country': data['sys']['country'],
            'local_time_iso': current_time,
            'timezone_offset': timezone_offset,
            'temp': round(data['main']['temp'], 1),
            'temp_unit': temp_unit,
            'feels_like': round(data['main']['feels_like'], 1),
            'humidity': data['main']['humidity'],
            'pressure': data['main'].get('pressure', 0),
            'wind_speed': round(data['wind']['speed'], 1),
            'wind_unit': wind_unit,
            'wind_deg': data['wind'].get('deg', 0),
            'visibility': data.get('visibility', 0) // 1000 if data.get('visibility') else 0,  # Convert to km
            'description': data['weather'][0]['description'].title(),
            'icon': data['weather'][0]['icon'],
            'lat': data['coord']['lat'],
            'lon': data['coord']['lon']
        }
    
    def get_forecast(self, q: Optional[str] = None, lat: Optional[float] = None, 
                    lon: Optional[float] = None, units: str = 'metric') -> Dict[str, Any]:
        """Get 5-day forecast data and map to internal contract."""
        params = {'units': units}
        
        if q:
            params['q'] = q
        elif lat is not None and lon is not None:
            params['lat'] = str(lat)
            params['lon'] = str(lon)
        else:
            raise ValueError("Either city name (q) or coordinates (lat, lon) must be provided")
        
        data = self._make_request('forecast', params)
        
        # Map to internal contract
        timezone_offset = data['city']['timezone']
        temp_unit = '°C' if units == 'metric' else '°F'
        
        points = []
        daily_data = {}
        
        for item in data['list']:
            ts_iso = self._convert_timestamp(item['dt'], timezone_offset)
            date_key = ts_iso.split('T')[0]  # Get just the date part
            
            point_data = {
                'ts_iso': ts_iso,
                'temp': round(item['main']['temp'], 1),
                'temp_min': round(item['main']['temp_min'], 1),
                'temp_max': round(item['main']['temp_max'], 1),
                'temp_unit': temp_unit,
                'icon': item['weather'][0]['icon'],
                'description': item['weather'][0]['description'].title(),
                'humidity': item['main']['humidity'],
                'pressure': item['main'].get('pressure', 0),
                'wind_speed': round(item['wind']['speed'], 1),
                'visibility': item.get('visibility', 10000) // 1000  # Convert to km
            }
            points.append(point_data)
            
            # Aggregate daily data for high/low temps
            if date_key not in daily_data:
                daily_data[date_key] = {
                    'date': date_key,
                    'temp_min': point_data['temp_min'],
                    'temp_max': point_data['temp_max'],
                    'icon': point_data['icon'],
                    'description': point_data['description'],
                    'temp_unit': temp_unit
                }
            else:
                daily_data[date_key]['temp_min'] = min(daily_data[date_key]['temp_min'], point_data['temp_min'])
                daily_data[date_key]['temp_max'] = max(daily_data[date_key]['temp_max'], point_data['temp_max'])
        
        # Convert daily data to list and limit to 7 days
        daily_forecast = list(daily_data.values())[:7]
        
        return {
            'city': data['city']['name'],
            'country': data['city']['country'],
            'timezone_offset': timezone_offset,
            'lat': data['city']['coord']['lat'],
            'lon': data['city']['coord']['lon'],
            'points': points,
            'daily_forecast': daily_forecast
        }
