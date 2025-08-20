import os
import requests
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class WeatherAPI:
    """Open-Meteo API client with response mapping to internal contract."""
    
    BASE_URL = "https://api.open-meteo.com/v1"
    GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1"
    
    def __init__(self):
        # Open-Meteo doesn't require an API key for free usage
        pass
    
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
            'wind_speed': round(data['wind']['speed'], 1),
            'wind_unit': wind_unit,
            'description': data['weather'][0]['description'].title(),
            'icon': data['weather'][0]['icon']
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
        for item in data['list']:
            points.append({
                'ts_iso': self._convert_timestamp(item['dt'], timezone_offset),
                'temp': round(item['main']['temp'], 1),
                'temp_unit': temp_unit,
                'icon': item['weather'][0]['icon'],
                'description': item['weather'][0]['description'].title()
            })
        
        return {
            'city': data['city']['name'],
            'country': data['city']['country'],
            'timezone_offset': timezone_offset,
            'points': points
        }
