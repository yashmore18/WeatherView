/**
 * WeatherView - Map page
 * Interactive weather radar: OpenStreetMap base tiles + OpenWeatherMap
 * precipitation/clouds/temperature/wind overlays, proxied through
 * /api/map/tile/... so the API key never reaches the browser.
 */
class MapPage {
    constructor(wv) {
        this.wv = wv;
        this.map = null;
        this.marker = null;
        this.activeLayer = null;
        this.overlays = {
            precipitation: L.tileLayer('/api/map/tile/precipitation_new/{z}/{x}/{y}', { opacity: 0.65, maxZoom: 19 }),
            clouds: L.tileLayer('/api/map/tile/clouds_new/{z}/{x}/{y}', { opacity: 0.65, maxZoom: 19 }),
            temp: L.tileLayer('/api/map/tile/temp_new/{z}/{x}/{y}', { opacity: 0.65, maxZoom: 19 }),
            wind: L.tileLayer('/api/map/tile/wind_new/{z}/{x}/{y}', { opacity: 0.65, maxZoom: 19 })
        };

        this.initMap();
        this.setupLayerButtons();
        this.setLayer('precipitation');
        this.loadInitialCity();

        document.addEventListener('wv:cityselected', (e) => this.handleCitySelected(e.detail));
    }

    initMap() {
        this.map = L.map('wvMap', { zoomControl: true }).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
    }

    setupLayerButtons() {
        document.querySelectorAll('.wv-map-layer-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setLayer(btn.dataset.layer));
        });
    }

    setLayer(name) {
        if (this.activeLayer) this.map.removeLayer(this.activeLayer);
        this.activeLayer = this.overlays[name];
        this.activeLayer.addTo(this.map);

        document.querySelectorAll('.wv-map-layer-btn').forEach(btn => {
            const isActive = btn.dataset.layer === name;
            btn.setAttribute('aria-pressed', isActive);
        });
    }

    loadInitialCity() {
        const resolved = this.wv.getResolvedCity();
        if (resolved) this.handleCitySelected(resolved);
    }

    async handleCitySelected(detail) {
        try {
            const params = detail.city
                ? { city: detail.city, units: this.wv.currentUnits }
                : { lat: detail.lat, lon: detail.lon, units: this.wv.currentUnits };
            const data = await this.wv.fetchCurrentWeather(params);
            this.wv.setLastCity(data.city);
            this.centerOn(data.lat, data.lon, data.city);
        } catch (error) {
            this.wv.showError(error.message);
        }
    }

    centerOn(lat, lon, city) {
        this.map.setView([lat, lon], 8);
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = L.marker([lat, lon]).addTo(this.map);
        if (city) this.marker.bindPopup(city).openPopup();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mapPage = new MapPage(window.wv);
});
