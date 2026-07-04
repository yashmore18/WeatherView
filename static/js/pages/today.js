/**
 * WeatherView - Today page
 * Hero card, empty state, favorite/share buttons, smart alerts.
 */
class TodayPage {
    constructor(wv) {
        this.wv = wv;
        this.currentCity = null;
        this.currentData = null;

        this.setupEventListeners();
        this.loadInitialCity();

        document.addEventListener('wv:cityselected', (e) => this.handleCitySelected(e.detail));
        document.addEventListener('wv:unitschange', () => this.refresh());
    }

    setupEventListeners() {
        const favoriteToggle = document.getElementById('favoriteToggle');
        if (favoriteToggle) {
            favoriteToggle.addEventListener('click', () => {
                if (this.currentCity) {
                    this.wv.toggleFavorite(this.currentCity);
                    this.updateFavoriteButton();
                }
            });
        }

        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.shareWeather());
        }
    }

    loadInitialCity() {
        const resolved = this.wv.getResolvedCity();
        if (resolved) this.handleCitySelected(resolved);
    }

    refresh() {
        if (this.currentCity) {
            this.handleCitySelected({ city: this.currentCity });
        }
    }

    async handleCitySelected(detail) {
        if (this.wv.isLoading) return;
        try {
            this.wv.setLoading(true);
            this.setSkeletonVisible(true);

            const params = detail.city
                ? { city: detail.city, units: this.wv.currentUnits }
                : { lat: detail.lat, lon: detail.lon, units: this.wv.currentUnits };

            const data = await this.wv.fetchCurrentWeather(params);
            this.currentCity = data.city;
            this.currentData = data;
            this.wv.setLastCity(data.city);

            const searchInput = document.getElementById('citySearch');
            if (searchInput && detail.isGeolocation) {
                searchInput.value = data.city;
                this.wv.toggleClearButton(data.city);
            }

            this.displayHeroCard(data);
            this.showHero();
            this.updateFavoriteButton();
            this.loadAlerts(params, data.lat, data.lon);
        } catch (error) {
            this.wv.showError(error.message);
        } finally {
            this.wv.setLoading(false);
            this.setSkeletonVisible(false);
        }
    }

    async loadAlerts(params, lat, lon) {
        try {
            const [forecast, airQuality] = await Promise.all([
                this.wv.fetchForecast(params),
                (lat && lon) ? this.wv.fetchAirQuality(lat, lon).catch(() => null) : Promise.resolve(null)
            ]);
            const prefs = this.getAlertPrefs();
            const alerts = window.WVAlerts.computeAlerts(this.currentData, forecast, airQuality, prefs, this.wv.currentUnits);
            this.renderAlerts(alerts);
        } catch (error) {
            console.warn('Smart alerts unavailable:', error);
        }
    }

    getAlertPrefs() {
        try {
            return JSON.parse(localStorage.getItem('wv_alertPrefs') || '{}');
        } catch {
            return {};
        }
    }

    getDismissedAlerts() {
        try {
            return JSON.parse(localStorage.getItem('wv_dismissedAlerts') || '{}');
        } catch {
            return {};
        }
    }

    dismissAlert(id) {
        const dismissed = this.getDismissedAlerts();
        dismissed[id] = Date.now();
        localStorage.setItem('wv_dismissedAlerts', JSON.stringify(dismissed));
    }

    renderAlerts(alerts) {
        const container = document.getElementById('alertsContainer');
        const badge = document.getElementById('alertsBadge');
        if (!container) return;

        const dismissed = this.getDismissedAlerts();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        const visible = alerts.filter(a => {
            const dismissedAt = dismissed[a.id];
            return !dismissedAt || (Date.now() - dismissedAt) > twelveHoursMs;
        });

        container.innerHTML = visible.map(a => `
            <div class="wv-alert-banner wv-alert-banner--${a.severity === 'info' ? 'info' : a.severity}" role="alert" data-alert-id="${a.id}">
                <i class="wv-alert-banner__icon fas ${a.icon}" aria-hidden="true"></i>
                <div class="wv-alert-banner__content">
                    <p class="wv-alert-banner__title">${this.wv.escapeHtml(a.title)}</p>
                    <p class="wv-alert-banner__message">${this.wv.escapeHtml(a.message)}</p>
                </div>
                <button type="button" class="wv-alert-banner__close" aria-label="Dismiss alert" data-dismiss="${a.id}">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </div>
        `).join('');

        container.querySelectorAll('[data-dismiss]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.dismissAlert(btn.dataset.dismiss);
                btn.closest('.wv-alert-banner')?.remove();
                this.updateBadge();
            });
        });

        this.setBadgeCount(badge, visible.length);
    }

    updateBadge() {
        const badge = document.getElementById('alertsBadge');
        const container = document.getElementById('alertsContainer');
        if (!container) return;
        this.setBadgeCount(badge, container.querySelectorAll('.wv-alert-banner').length);
    }

    setBadgeCount(badge, count) {
        // Persisted so wv-shared.js can show the same count on other pages
        // (the sidebar's Today badge) without those pages computing alerts.
        localStorage.setItem('wv_alertCount', String(count));
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    showHero() {
        const heroCard = document.getElementById('heroCard');
        const emptyState = document.getElementById('emptyState');
        if (heroCard) heroCard.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';
    }

    setSkeletonVisible(loading) {
        const heroCard = document.getElementById('heroCard');
        const heroSkeleton = document.getElementById('heroSkeleton');
        if (loading) {
            if (heroCard) heroCard.style.display = 'block';
            if (heroSkeleton) heroSkeleton.style.display = 'flex';
        } else {
            if (heroSkeleton) heroSkeleton.style.display = 'none';
            if (!this.currentData && heroCard) heroCard.style.display = 'none';
        }
    }

    displayHeroCard(data) {
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
        const windUnit = this.wv.currentUnits === 'imperial' ? 'mph' : 'm/s';
        const localTime = new Date(data.local_time_iso).toLocaleString();

        document.getElementById('heroTitle').textContent = data.city;
        document.getElementById('heroTemp').textContent = Math.round(data.temp);
        document.getElementById('heroTempUnit').textContent = tempUnit;
        document.getElementById('heroDescription').textContent = data.description;
        document.getElementById('heroFeelsLike').textContent = `${Math.round(data.feels_like)}${tempUnit}`;
        document.getElementById('heroHumidity').textContent = `${data.humidity}%`;
        document.getElementById('heroWind').textContent = `${data.wind_speed} ${windUnit}`;
        document.getElementById('heroPressure').textContent = `${data.pressure} hPa`;
        document.getElementById('heroVisibility').textContent = `${data.visibility} km`;
        document.getElementById('heroUpdated').textContent = `Updated ${localTime}`;

        const iconEl = document.getElementById('heroIcon');
        iconEl.className = `wv-hero-card__icon fas ${this.wv.getWeatherIconClass(data.icon)}`;

        // Background scene's day/night state tracks the searched location's
        // actual sun position (from the icon suffix), independent of the
        // manual dark-mode toggle - see custom.css's text-scrim tokens for
        // how contrast stays intact regardless of the two being in sync.
        if (this.wv.scene) this.wv.scene.applyWeatherIcon(data.icon);

        const regionEl = document.querySelector('.wv-hero-card__region');
        if (regionEl) regionEl.textContent = `${data.country}${data.state ? ', ' + data.state : ''}`;
    }

    updateFavoriteButton() {
        const favoriteToggle = document.getElementById('favoriteToggle');
        if (favoriteToggle && this.currentCity) {
            const isFav = this.wv.isFavorite(this.currentCity);
            favoriteToggle.setAttribute('aria-pressed', isFav);
            favoriteToggle.querySelector('i').className = isFav ? 'fas fa-star' : 'far fa-star';
        }
    }

    async shareWeather() {
        if (!this.currentData) return;
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
        const text = `${this.currentData.city}: ${Math.round(this.currentData.temp)}${tempUnit}, ${this.currentData.description}`;
        const shareData = { title: 'WeatherView', text, url: window.location.href };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                if (error.name !== 'AbortError') console.warn('Share failed:', error);
            }
            return;
        }
        if (navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(`${text} - ${window.location.href}`);
                this.wv.showSuccess('Weather info copied to clipboard');
            } catch (error) {
                this.wv.showError('Unable to share weather info');
            }
            return;
        }
        this.wv.showError('Sharing is not supported on this browser');
    }
}

// wv-shared.js's script tag loads before this one, and its DOMContentLoaded
// listener is registered first, so window.wv is guaranteed to exist here.
document.addEventListener('DOMContentLoaded', () => {
    window.todayPage = new TodayPage(window.wv);
});
