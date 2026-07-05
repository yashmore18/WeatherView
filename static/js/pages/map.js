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
        this.referenceLayer = null;
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

        // Custom pane (between Leaflet's default overlayPane z400 and
        // markerPane z600) so the label/reference layer always renders above
        // both the basemap and the weather overlay - which share tilePane
        // and stack purely by DOM order - regardless of which weather layer
        // is active or how many times layers get swapped.
        const referencePane = this.map.createPane('wvReferencePane');
        referencePane.style.zIndex = 450;
        referencePane.style.pointerEvents = 'none';
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        this.setBasemap(isDark);

        // iOS Safari/Chrome resize their visible viewport as the address bar
        // shows/hides on scroll, which can leave Leaflet's internally-cached
        // size stale (map looks cut off or tiles stop loading in the newly
        // revealed area) until it's told to re-measure.
        window.addEventListener('resize', () => this.map.invalidateSize());
    }

    setBasemap(isDark) {
        // Routed through our own /api/map/basemap proxy (same reasoning as
        // the weather overlay tiles below) rather than pointing the browser
        // straight at server.arcgisonline.com - direct third-party tile
        // requests turned out to be unreliable for some clients, and a
        // server-side fetch from our own backend sidesteps that entirely.
        // Esri's "Canvas" styles give the muted, near-monochrome basemap
        // needed so colored weather overlays stay legible on top of it.
        if (this.baseLayer) this.map.removeLayer(this.baseLayer);
        if (this.referenceLayer) this.map.removeLayer(this.referenceLayer);
        const style = isDark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base';
        const referenceStyle = isDark ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference';
        this.baseLayer = L.tileLayer(`/api/map/basemap/${style}/{z}/{x}/{y}`, {
            attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
            // This basemap's own tiles stop at z16 - maxNativeZoom lets the
            // map (and the OpenWeatherMap overlays, which go to 19) keep
            // zooming past that by upscaling the last available basemap tile
            // instead of the layer just disappearing above z16.
            maxNativeZoom: 16,
            maxZoom: 19
        });
        // Esri's own pairing for these Canvas basemaps: the Base tiles are
        // deliberately label-free (so weather-overlay colors read clearly),
        // and the matching Reference tiles add place names/roads/borders as
        // a separate transparent layer meant to sit above everything else -
        // including the weather overlay - so labels stay legible no matter
        // which layer is active.
        this.referenceLayer = L.tileLayer(`/api/map/basemap/${referenceStyle}/{z}/{x}/{y}`, {
            maxNativeZoom: 16,
            maxZoom: 19,
            pane: 'wvReferencePane'
        });
        this.baseLayer.addTo(this.map);
        this.baseLayer.bringToBack();
        this.referenceLayer.addTo(this.map);
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
        // International/cold-start lookups can take several seconds - without
        // this, the map just sits at its previous view with no feedback,
        // which reads as "broken" rather than "still loading".
        const loadingEl = document.getElementById('mapLoading');
        if (loadingEl) loadingEl.classList.add('is-active');
        try {
            const params = detail.city
                ? { city: detail.city, units: this.wv.currentUnits }
                : { lat: detail.lat, lon: detail.lon, units: this.wv.currentUnits };
            const data = await this.wv.fetchCurrentWeather(params);
            this.wv.setLastCity(data.city);
            this.wv.applySceneIcon(data.icon);
            this.centerOn(data.lat, data.lon, data.city);
        } catch (error) {
            this.wv.showError(error.message);
        } finally {
            if (loadingEl) loadingEl.classList.remove('is-active');
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
