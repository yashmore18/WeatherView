import pytest
from unittest.mock import Mock, patch
from app import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestPageRoutes:
    """Each page route should render its own template with the correct
    sidebar nav item marked active, per the multi-page routing rework."""

    @pytest.mark.parametrize("path,nav_label", [
        ('/', 'Today'),
        ('/ai-summary', 'AI Summary'),
        ('/forecast', 'Forecast'),
        ('/map', 'Map'),
        ('/locations', 'Locations'),
        ('/settings', 'Settings'),
    ])
    def test_page_returns_200_with_active_nav(self, client, path, nav_label):
        response = client.get(path)
        assert response.status_code == 200
        body = response.get_data(as_text=True)
        assert 'wv-nav-item--active' in body
        # The active nav item's own markup should contain this page's label.
        active_start = body.index('wv-nav-item--active')
        # Look at a window around the active class for the label text, since
        # the label lives in a sibling <span> within the same <a> element.
        window = body[active_start:active_start + 400]
        assert nav_label in window

    def test_sw_js_served_with_scope_header(self, client):
        response = client.get('/sw.js')
        assert response.status_code == 200
        assert response.headers.get('Service-Worker-Allowed') == '/'

    def test_unknown_route_returns_json_404(self, client):
        response = client.get('/does-not-exist')
        assert response.status_code == 404
        assert response.get_json() == {'error': 'Endpoint not found'}


class TestMapTileRoute:
    """Tile proxy keeps the OpenWeatherMap API key server-side."""

    def test_invalid_layer_rejected(self, client):
        response = client.get('/api/map/tile/bogus/1/2/3')
        assert response.status_code == 400
        assert response.get_json() == {'error': 'Unknown map layer'}

    @patch('app.weather_api.get_map_tile')
    def test_valid_layer_success(self, mock_get_map_tile, client):
        mock_get_map_tile.return_value = (b'fake-png-bytes', 'image/png')

        response = client.get('/api/map/tile/precipitation_new/3/4/4')

        assert response.status_code == 200
        assert response.content_type == 'image/png'
        assert response.data == b'fake-png-bytes'
        assert 'Cache-Control' in response.headers
        mock_get_map_tile.assert_called_once_with('precipitation_new', 3, 4, 4)

    @patch('app.weather_api.get_map_tile')
    def test_upstream_failure_returns_502(self, mock_get_map_tile, client):
        mock_get_map_tile.side_effect = ValueError("Tile API error: 500")

        response = client.get('/api/map/tile/clouds_new/1/0/0')

        assert response.status_code == 502
        assert response.get_json() == {'error': 'Tile API error: 500'}
