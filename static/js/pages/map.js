/**
 * WeatherView - Map page
 * Interactive weather radar: CartoDB base tiles + OpenWeatherMap
 * precipitation/clouds/temperature/wind overlays, proxied through
 * /api/map/tile/... so the API key never reaches the browser.
 *
 * Base tiles use CartoDB's keyless Positron/Dark Matter styles (muted,
 * near-monochrome) instead of full-color OpenStreetMap - colored weather
 * overlays are otherwise nearly invisible against OSM's own saturated
 * greens/creams, which is why the layers used to look "broken".
 */
class MapPage {
    static LEGEND_CONFIG = {
        precipitation: {
            title: 'Precipitation',
            gradient: 'linear-gradient(to right, rgba(120,180,255,0.2), #4f7cff, #2952cc, #7b2ff7)',
            min: 'Light', max: 'Heavy'
        },
        clouds: {
            title: 'Cloud Cover',
            gradient: 'linear-gradient(to right, rgba(255,255,255,0.15), #cfd8e3, #8894a6)',
            min: '0%', max: '100%'
        },
        temp: {
            title: 'Temperature',
            gradient: 'linear-gradient(to right, #2952cc, #4fd1c5, #f5d76e, #f57c4f, #c0392b)',
            min: 'Cold', max: 'Hot'
        },
        wind: {
            title: 'Wind Speed',
            gradient: 'linear-gradient(to right, rgba(255,255,255,0.2), #b39ddb, #7e57c2, #4527a0)',
            min: 'Calm', max: 'Strong'
        }
    };

    constructor(wv) {
        this.wv = wv;
        this.map = null;
        this.marker = null;
        this.activeLayer = null;
        this.baseLayer = null;
        // OpenWeatherMap's tiles already bake in their own per-pixel alpha
        // (e.g. temp_new tops out around 30% opaque) - they're designed to be
        // laid over a basemap at full opacity, not dimmed further. Multiplying
        // by an additional 0.55-0.8 here made every layer nearly invisible.
        this.overlays = {
            precipitation: L.tileLayer('/api/map/tile/precipitation_new/{z}/{x}/{y}', { opacity: 1, maxZoom: 19 }),
            clouds: L.tileLayer('/api/map/tile/clouds_new/{z}/{x}/{y}', { opacity: 1, maxZoom: 19 }),
            temp: L.tileLayer('/api/map/tile/temp_new/{z}/{x}/{y}', { opacity: 1, maxZoom: 19 }),
            wind: L.tileLayer('/api/map/tile/wind_new/{z}/{x}/{y}', { opacity: 1, maxZoom: 19 })
        };

        this.initMap();
        this.setupLayerButtons();
        this.setLayer('precipitation');
        this.loadInitialCity();

        document.addEventListener('wv:cityselected', (e) => this.handleCitySelected(e.detail));
        document.addEventListener('wv:themechange', (e) => this.setBasemap(e.detail.isDark));
    }

    initMap() {
        // Default zoomControl (topleft) sits directly under where the legend
        // has to move to on phone widths (bottom is already taken by the
        // layer-switch buttons there) - bottomright is unused by any other
        // overlay on any breakpoint, so the zoom buttons live there instead.
        this.map = L.map('wvMap', { zoomControl: false }).setView([20, 0], 2);
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        this.setBasemap(isDark);

        // iOS Safari/Chrome resize their visible viewport as the address bar
        // shows/hides on scroll, which can leave Leaflet's internally-cached
        // size stale (map looks cut off or tiles stop loading in the newly
        // revealed area) until it's told to re-measure.
        window.addEventListener('resize', () => this.map.invalidateSize());
    }

    setBasemap(isDark) {
        if (this.baseLayer) this.map.removeLayer(this.baseLayer);
        const style = isDark ? 'dark_all' : 'light_all';
        this.baseLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
            attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        });
        this.baseLayer.addTo(this.map);
        this.baseLayer.bringToBack();
    }

    setupLayerButtons() {
        document.querySelectorAll('.wv-map-layer-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setLayer(btn.dataset.layer));
        });
    }

    setLayer(name) {
        if (this.activeLayer) this.map.removeLayer(this.activeLayer);
        this.activeLayer = this.overlays[name];

        const loadingEl = document.getElementById('mapLoading');
        if (loadingEl) loadingEl.classList.add('is-active');
        this.activeLayer.once('load', () => {
            if (loadingEl) loadingEl.classList.remove('is-active');
        });
        this.activeLayer.addTo(this.map);

        document.querySelectorAll('.wv-map-layer-btn').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.layer === name);
        });

        this.renderLegend(name);
    }

    renderLegend(name) {
        const legend = document.getElementById('mapLegend');
        const config = MapPage.LEGEND_CONFIG[name];
        if (!legend || !config) return;
        legend.innerHTML = `
            <p class="wv-map-legend__title">${config.title}</p>
            <div class="wv-map-legend__bar" style="background: ${config.gradient};"></div>
            <div class="wv-map-legend__labels">
                <span>${config.min}</span>
                <span>${config.max}</span>
            </div>
        `;
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
            if (this.wv.scene) this.wv.scene.applyWeatherIcon(data.icon);
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
