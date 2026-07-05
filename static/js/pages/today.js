/**
 * WeatherView - Today page
 * Hero card, empty state, favorite/share buttons, smart alerts.
 */
class TodayPage {
    constructor(wv) {
        this.wv = wv;
        this.currentCity = null;
        this.currentData = null;
        this.lastUpdatedAt = null;

        this.setupEventListeners();
        this.setupPullToRefresh();
        this.loadInitialCity();
        if (!this.wv.getResolvedCity()) this.loadPopularCities();

        document.addEventListener('wv:cityselected', (e) => this.handleCitySelected(e.detail));
        document.addEventListener('wv:unitschange', () => this.refresh());

        setInterval(() => this.refreshUpdatedLabel(), 60000);
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
            return this.handleCitySelected({ city: this.currentCity });
        }
        return Promise.resolve();
    }

    // Swipe-down-from-top gesture, mirroring the native pull-to-refresh
    // pattern in Apple Weather/most mobile apps - only touch devices get the
    // listener at all, and it only arms when already scrolled to the top so
    // it can't hijack normal scrolling further down the page.
    setupPullToRefresh() {
        const indicator = document.getElementById('pullToRefresh');
        if (!indicator || !('ontouchstart' in window)) return;

        const threshold = 70;
        const maxPull = 100;
        let startY = null;
        let dist = 0;
        let pulling = false;

        window.addEventListener('touchstart', (e) => {
            if (window.scrollY > 0 || this.wv.isLoading || !this.currentCity) {
                startY = null;
                return;
            }
            startY = e.touches[0].clientY;
            pulling = false;
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (startY === null) return;
            const delta = e.touches[0].clientY - startY;
            if (delta <= 0 || window.scrollY > 0) {
                startY = null;
                return;
            }
            pulling = true;
            e.preventDefault();
            dist = Math.min(delta * 0.5, maxPull);
            indicator.style.transform = `translateY(${dist - 60}px)`;
            indicator.style.opacity = String(Math.min(dist / threshold, 1));
            indicator.classList.toggle('wv-pull-refresh--ready', dist >= threshold);
        }, { passive: false });

        window.addEventListener('touchend', async () => {
            if (!pulling) {
                startY = null;
                return;
            }
            pulling = false;
            const shouldRefresh = dist >= threshold;
            indicator.style.transition = 'transform 200ms ease';

            if (shouldRefresh) {
                indicator.style.transform = 'translateY(20px)';
                indicator.classList.remove('wv-pull-refresh--ready');
                indicator.classList.add('wv-pull-refresh--loading');
                this.wv.announceToScreenReader('Refreshing weather…');
                try {
                    await this.refresh();
                } finally {
                    indicator.classList.remove('wv-pull-refresh--loading');
                    indicator.style.transform = '';
                    indicator.style.opacity = '';
                }
            } else {
                indicator.classList.remove('wv-pull-refresh--ready');
                indicator.style.transform = '';
                indicator.style.opacity = '';
            }

            setTimeout(() => { indicator.style.transition = ''; }, 220);
            startY = null;
            dist = 0;
        });
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
            this.loadExtras(params, data.lat, data.lon);
        } catch (error) {
            this.wv.showError(error.message);
        } finally {
            this.wv.setLoading(false);
            this.setSkeletonVisible(false);
        }
    }

    // Fetches forecast + air quality once and fans the result out to the
    // hourly preview strip, the highlights grid, and smart alerts, rather
    // than each of those making their own redundant requests.
    async loadExtras(params, lat, lon) {
        this.setExtrasSkeletonVisible(true);
        try {
            const [forecast, airQuality] = await Promise.all([
                this.wv.fetchForecast(params),
                (lat && lon) ? this.wv.fetchAirQuality(lat, lon).catch(() => null) : Promise.resolve(null)
            ]);
            this.displayHourlyPreview(forecast);
            this.displayHighlights(this.currentData, airQuality);

            const prefs = this.getAlertPrefs();
            const alerts = window.WVAlerts.computeAlerts(this.currentData, forecast, airQuality, prefs, this.wv.currentUnits);
            this.renderAlerts(alerts);
        } catch (error) {
            console.warn('Smart alerts/highlights unavailable:', error);
        } finally {
            this.setExtrasSkeletonVisible(false);
        }
    }

    setExtrasSkeletonVisible(loading) {
        const sections = ['todayHourlySection', 'todayHighlightsSection', 'todayQuicklinks'];
        const skeletons = { todayHourlySkeleton: 'flex', todayHighlightsSkeleton: 'grid' };

        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
        Object.entries(skeletons).forEach(([id, display]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = loading ? display : 'none';
        });
    }

    displayHourlyPreview(data) {
        const scroll = document.getElementById('todayHourlyScroll');
        if (!scroll) return;
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
        const hourlyData = data.hourly_forecast?.slice(0, 8) || [];

        if (hourlyData.length === 0) {
            scroll.innerHTML = '<p class="wv-empty-text" style="padding: var(--wv-space-4); color: var(--wv-color-text-tertiary);">No hourly data available</p>';
            return;
        }

        scroll.innerHTML = hourlyData.map(hour => {
            const date = new Date(hour.dt * 1000);
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
            const precip = hour.pop ? Math.round(hour.pop * 100) : 0;
            return `
                <div class="wv-hourly-item" role="listitem">
                    <span class="wv-hourly-item__time">${timeStr}</span>
                    <i class="wv-hourly-item__icon fas ${this.wv.getWeatherIconClass(hour.icon)}" aria-hidden="true"></i>
                    <span class="wv-hourly-item__temp">${Math.round(hour.temp)}${tempUnit}</span>
                    ${precip > 0 ? `<span class="wv-hourly-item__precip"><i class="fas fa-tint" aria-hidden="true"></i>${precip}%</span>` : ''}
                </div>
            `;
        }).join('');
    }

    displayHighlights(data, airData) {
        const grid = document.getElementById('todayHighlightsGrid');
        if (!grid || !data) return;
        const windUnit = this.wv.currentUnits === 'imperial' ? 'mph' : 'm/s';

        const sunrise = data.sunrise ? new Date(data.sunrise * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--';
        const sunset = data.sunset ? new Date(data.sunset * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--';
        let daylightPct = 0;
        if (data.sunrise && data.sunset) {
            const now = Date.now() / 1000;
            daylightPct = Math.max(0, Math.min(1, (now - data.sunrise) / (data.sunset - data.sunrise))) * 100;
        }

        grid.innerHTML = `
            <article class="wv-detail-card wv-detail-card--aqi" role="listitem">
                <header class="wv-detail-card__header">
                    <div class="wv-detail-card__icon" aria-hidden="true"><i class="fas fa-lungs"></i></div>
                    <h3 class="wv-detail-card__title">Air Quality</h3>
                </header>
                <div class="wv-detail-card__body">
                    <div class="wv-detail-card__value" id="todayAqiValue">--</div>
                    <p class="wv-detail-card__subtitle" id="todayAqiSubtitle">Loading…</p>
                </div>
                <div class="wv-aqi-bar"><div class="wv-aqi-bar__fill" id="todayAqiBarFill"></div></div>
            </article>

            <article class="wv-detail-card" role="listitem">
                <header class="wv-detail-card__header">
                    <div class="wv-detail-card__icon" aria-hidden="true"><i class="fas fa-sun"></i></div>
                    <h3 class="wv-detail-card__title">Daylight</h3>
                </header>
                <div class="wv-daylight-track">
                    <div class="wv-daylight-track__fill" style="width: ${daylightPct}%;"></div>
                    <div class="wv-daylight-sun" style="left: ${daylightPct}%;"><i class="fas fa-sun" aria-hidden="true"></i></div>
                </div>
                <div class="wv-daylight-times">
                    <span><i class="fas fa-arrow-up" aria-hidden="true"></i>${sunrise}</span>
                    <span><i class="fas fa-arrow-down" aria-hidden="true"></i>${sunset}</span>
                </div>
            </article>

            <article class="wv-detail-card" role="listitem">
                <header class="wv-detail-card__header">
                    <div class="wv-detail-card__icon" aria-hidden="true"><i class="fas fa-wind"></i></div>
                    <h3 class="wv-detail-card__title">Wind</h3>
                </header>
                <div class="wv-wind-card__body">
                    <div class="wv-compass">
                        <div class="wv-compass__needle" style="transform: rotate(${data.wind_deg || 0}deg);"><i class="fas fa-location-arrow" aria-hidden="true"></i></div>
                        <span class="wv-compass__label wv-compass__label--n">N</span>
                        <span class="wv-compass__label wv-compass__label--e">E</span>
                        <span class="wv-compass__label wv-compass__label--s">S</span>
                        <span class="wv-compass__label wv-compass__label--w">W</span>
                    </div>
                    <div class="wv-detail-card__body">
                        <div class="wv-detail-card__value">${data.wind_speed} ${windUnit}</div>
                        <p class="wv-detail-card__subtitle">${data.wind_deg || 0}° ${this.wv.getWindDirection(data.wind_deg || 0)}</p>
                    </div>
                </div>
            </article>

            <article class="wv-detail-card" role="listitem">
                <header class="wv-detail-card__header">
                    <div class="wv-detail-card__icon" aria-hidden="true"><i class="fas fa-cloud"></i></div>
                    <h3 class="wv-detail-card__title">Cloud Cover</h3>
                </header>
                <div class="wv-detail-card__body">
                    <div class="wv-detail-card__value">${data.clouds || 0}%</div>
                    <p class="wv-detail-card__subtitle">${data.clouds >= 70 ? 'Mostly cloudy' : data.clouds >= 30 ? 'Partly cloudy' : 'Mostly clear'}</p>
                </div>
                <div class="wv-aqi-bar"><div class="wv-aqi-bar__fill" style="width: ${data.clouds || 0}%; background: var(--wv-color-accent);"></div></div>
            </article>
        `;

        this.displayAirQuality(airData);
    }

    displayAirQuality(airData) {
        const aqiValueEl = document.getElementById('todayAqiValue');
        const aqiSubtitleEl = document.getElementById('todayAqiSubtitle');
        const aqiBarFill = document.getElementById('todayAqiBarFill');
        if (!aqiValueEl || !aqiSubtitleEl) return;

        if (!airData) {
            aqiValueEl.textContent = 'N/A';
            aqiSubtitleEl.textContent = 'Not available';
            aqiValueEl.style.color = 'var(--wv-color-text-primary)';
            return;
        }

        const aqi = airData.aqi || 1;
        const aqiLabels = { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very Poor' };
        const aqiColors = {
            1: 'var(--wv-color-success)', 2: 'var(--wv-color-warning)', 3: 'var(--wv-color-warning)',
            4: 'var(--wv-color-error)', 5: 'var(--wv-color-error)'
        };

        aqiValueEl.textContent = aqi;
        aqiSubtitleEl.textContent = aqiLabels[aqi] || 'Unknown';
        aqiValueEl.style.color = aqiColors[aqi] || 'var(--wv-color-text-primary)';
        if (aqiBarFill) {
            aqiBarFill.style.width = `${(aqi / 5) * 100}%`;
            aqiBarFill.style.background = aqiColors[aqi] || 'var(--wv-color-accent)';
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

        this.setupSwipeToDismiss(container);
        this.setBadgeCount(visible.length);
    }

    // Swipe an alert banner left/right past a threshold to dismiss it,
    // same rule as the close button - just a touch-native shortcut for it.
    setupSwipeToDismiss(container) {
        if (!('ontouchstart' in window)) return;

        container.querySelectorAll('.wv-alert-banner').forEach(banner => {
            let startX = null;
            let dx = 0;

            banner.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                dx = 0;
                banner.style.transition = 'none';
            }, { passive: true });

            banner.addEventListener('touchmove', (e) => {
                if (startX === null) return;
                dx = e.touches[0].clientX - startX;
                banner.style.transform = `translateX(${dx}px)`;
                banner.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / 200));
            }, { passive: true });

            banner.addEventListener('touchend', () => {
                if (startX === null) return;
                banner.style.transition = 'transform 200ms ease, opacity 200ms ease';
                if (Math.abs(dx) > 80) {
                    banner.style.transform = `translateX(${dx > 0 ? 500 : -500}px)`;
                    banner.style.opacity = '0';
                    const id = banner.dataset.alertId;
                    setTimeout(() => {
                        this.dismissAlert(id);
                        banner.remove();
                        this.updateBadge();
                    }, 200);
                } else {
                    banner.style.transform = '';
                    banner.style.opacity = '';
                }
                startX = null;
            });
        });
    }

    updateBadge() {
        const container = document.getElementById('alertsContainer');
        if (!container) return;
        this.setBadgeCount(container.querySelectorAll('.wv-alert-banner').length);
    }

    setBadgeCount(count) {
        // Persisted so wv-shared.js can show the same count on other pages
        // (the sidebar's and tab bar's Today badges) without those pages
        // computing alerts themselves.
        localStorage.setItem('wv_alertCount', String(count));
        [document.getElementById('alertsBadge'), document.getElementById('alertsBadgeMobile')].forEach(badge => {
            if (!badge) return;
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        });
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

        document.getElementById('heroTitle').textContent = data.city;
        this.animateTemperature(document.getElementById('heroTemp'), Math.round(data.temp));
        document.getElementById('heroTempUnit').textContent = tempUnit;
        document.getElementById('heroDescription').textContent = data.description;
        document.getElementById('heroFeelsLike').textContent = `${Math.round(data.feels_like)}${tempUnit}`;
        document.getElementById('heroHumidity').textContent = `${data.humidity}%`;
        document.getElementById('heroWind').textContent = `${data.wind_speed} ${windUnit}`;
        document.getElementById('heroPressure').textContent = `${data.pressure} hPa`;
        document.getElementById('heroVisibility').textContent = `${data.visibility} km`;

        this.lastUpdatedAt = Date.now();
        this.refreshUpdatedLabel();

        const iconEl = document.getElementById('heroIcon');
        iconEl.className = `wv-hero-card__icon fas ${this.wv.getWeatherIconClass(data.icon)}`;

        // Background scene's day/night state tracks the searched location's
        // actual sun position (from the icon suffix), independent of the
        // manual dark-mode toggle - see custom.css's text-scrim tokens for
        // how contrast stays intact regardless of the two being in sync.
        this.wv.applySceneIcon(data.icon);

        const regionEl = document.querySelector('.wv-hero-card__region');
        if (regionEl) regionEl.textContent = `${data.country}${data.state ? ', ' + data.state : ''}`;
    }

    refreshUpdatedLabel() {
        const el = document.getElementById('heroUpdated');
        if (!el || !this.lastUpdatedAt) return;
        const diffMin = Math.floor((Date.now() - this.lastUpdatedAt) / 60000);
        if (diffMin < 1) {
            el.textContent = 'Updated just now';
        } else if (diffMin < 60) {
            el.textContent = `Updated ${diffMin}m ago`;
        } else if (this.currentData) {
            el.textContent = `Updated ${new Date(this.currentData.local_time_iso).toLocaleString()}`;
        }
    }

    animateTemperature(el, target) {
        if (!el) return;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            el.textContent = target;
            return;
        }
        const duration = 500;
        const startTime = performance.now();
        const step = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(target * eased);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    async loadPopularCities() {
        const container = document.getElementById('popularCitiesPreview');
        if (!container) return;

        const cities = ['London', 'New York', 'Tokyo', 'Sydney'];
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';

        container.innerHTML = cities.map(() => `
            <div class="wv-comparison-card glass-card">
                <div class="wv-skeleton wv-skeleton--text" style="width: 60%;"></div>
                <div class="wv-skeleton wv-skeleton--block" style="height: 32px; margin-top: var(--wv-space-2);"></div>
            </div>
        `).join('');

        const results = await Promise.allSettled(
            cities.map(city => this.wv.fetchCurrentWeather({ city, units: this.wv.currentUnits }))
        );

        container.innerHTML = results.map((result, i) => {
            if (result.status !== 'fulfilled') return '';
            const data = result.value;
            return `
                <button type="button" class="wv-comparison-card glass-card" data-city="${this.wv.escapeHtml(data.city)}">
                    <p class="wv-comparison-card__city">${this.wv.escapeHtml(data.city)}</p>
                    <div class="wv-comparison-card__temp">
                        <i class="fas ${this.wv.getWeatherIconClass(data.icon)}" aria-hidden="true"></i>
                        ${Math.round(data.temp)}${tempUnit}
                    </div>
                    <p class="wv-comparison-card__desc">${data.description}</p>
                </button>
            `;
        }).join('');

        container.querySelectorAll('[data-city]').forEach(card => {
            card.addEventListener('click', () => this.wv.dispatchCitySelected({ city: card.dataset.city }));
        });
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
