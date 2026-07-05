/**
 * WeatherView - Highlight detail page
 * Full-detail view for one Today-page hero tile (humidity/wind/pressure/
 * visibility), reached by tapping that tile instead of only expanding it
 * in place.
 */
class HighlightPage {
    static EXPLAINERS = {
        humidity: 'Humidity is the amount of water vapor in the air. High humidity makes warm temperatures feel warmer, since sweat evaporates more slowly.',
        wind: 'Wind speed and direction affect how cold or warm the air feels, and how quickly weather systems move through your area.',
        pressure: 'Atmospheric pressure trends are one of the earliest signals of changing weather - falling pressure often precedes storms, while rising pressure usually means clearer skies ahead.',
        visibility: 'Visibility is the maximum distance you can clearly see. It drops in fog, heavy rain, snow, or haze.',
    };

    constructor(wv) {
        this.wv = wv;
        this.metric = document.querySelector('.wv-highlight-page').dataset.metric;

        document.getElementById('highlightExplainer').textContent = HighlightPage.EXPLAINERS[this.metric] || '';

        this.loadInitialCity();

        document.addEventListener('wv:cityselected', (e) => this.handleCitySelected(e.detail));
        document.addEventListener('wv:unitschange', () => this.refresh());
    }

    loadInitialCity() {
        const resolved = this.wv.getResolvedCity();
        if (resolved) this.handleCitySelected(resolved);
    }

    refresh() {
        const resolved = this.wv.getResolvedCity();
        if (resolved) this.handleCitySelected(resolved);
    }

    async handleCitySelected(detail) {
        try {
            this.setSkeletonVisible(true);
            const params = detail.city
                ? { city: detail.city, units: this.wv.currentUnits }
                : { lat: detail.lat, lon: detail.lon, units: this.wv.currentUnits };
            const data = await this.wv.fetchCurrentWeather(params);
            this.wv.setLastCity(data.city);
            this.wv.applySceneIcon(data.icon);
            this.display(data);
        } catch (error) {
            this.wv.showError(error.message);
        } finally {
            this.setSkeletonVisible(false);
        }
    }

    setSkeletonVisible(loading) {
        const skeleton = document.getElementById('highlightSkeleton');
        const body = document.getElementById('highlightBody');
        if (skeleton) skeleton.style.display = loading ? 'block' : 'none';
        if (body) body.style.display = loading ? 'none' : 'block';
    }

    display(data) {
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
        const windUnit = this.wv.currentUnits === 'imperial' ? 'mph' : 'm/s';
        const valueEl = document.getElementById('highlightValue');
        const subtitleEl = document.getElementById('highlightSubtitle');
        const compassWrap = document.getElementById('highlightCompassWrap');
        const barWrap = document.getElementById('highlightBarWrap');
        const barFill = document.getElementById('highlightBarFill');
        const extra = document.getElementById('highlightExtra');

        compassWrap.style.display = 'none';
        barWrap.style.display = 'none';
        extra.innerHTML = '';

        const extraItem = (label, value) => `
            <div class="wv-detail-card__extra-item">
                <span class="wv-detail-card__extra-label">${label}</span>
                <span class="wv-detail-card__extra-value">${value}</span>
            </div>
        `;

        if (this.metric === 'humidity') {
            const dewPoint = data.dew_point || Math.round(data.temp - ((100 - data.humidity) / 5));
            valueEl.textContent = `${data.humidity}%`;
            subtitleEl.textContent = data.humidity >= 70 ? 'Humid' : data.humidity >= 40 ? 'Comfortable' : 'Dry';
            barWrap.style.display = 'block';
            barFill.style.width = `${data.humidity}%`;
            extra.innerHTML = extraItem('Dew point', `${dewPoint}${tempUnit}`);
        } else if (this.metric === 'wind') {
            const windGust = data.wind_gust || Math.round(data.wind_speed * 1.5);
            valueEl.textContent = `${data.wind_speed} ${windUnit}`;
            subtitleEl.textContent = `${data.wind_deg || 0}° ${this.wv.getWindDirection(data.wind_deg || 0)}`;
            compassWrap.style.display = 'flex';
            document.getElementById('highlightCompassNeedle').style.transform = `rotate(${data.wind_deg || 0}deg)`;
            extra.innerHTML = extraItem('Gusts', `${windGust} ${windUnit}`);
        } else if (this.metric === 'pressure') {
            const seaLevel = data.sea_level || data.pressure;
            valueEl.textContent = `${data.pressure} hPa`;
            subtitleEl.textContent = data.pressure >= 1013 ? 'High pressure' : 'Low pressure';
            extra.innerHTML = extraItem('Sea level', `${seaLevel} hPa`);
        } else if (this.metric === 'visibility') {
            const pct = Math.min(100, Math.round((data.visibility / 10) * 100));
            valueEl.textContent = `${data.visibility} km`;
            subtitleEl.textContent = data.visibility >= 8 ? 'Clear' : data.visibility >= 4 ? 'Moderate' : 'Poor';
            barWrap.style.display = 'block';
            barFill.style.width = `${pct}%`;
            extra.innerHTML = extraItem('Cloud cover', `${data.clouds ?? '--'}%`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.highlightPage = new HighlightPage(window.wv);
});
