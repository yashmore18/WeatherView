/**
 * WeatherView - Shared core
 *
 * Loaded on every page. Owns the app shell (header search/units/dark-mode,
 * sidebar drawer, toasts, favorites data, dynamic sky scene) and the fetch
 * helpers every page module builds on. Cross-page communication happens via
 * CustomEvents on `document` (wv:cityselected, wv:geolocation, wv:unitschange,
 * wv:themechange, wv:loadingchange) rather than direct callbacks, since pages
 * are independent full-page loads, not an SPA.
 */
class WVShared {
    constructor() {
        this.currentUnits = localStorage.getItem('weatherUnits') || 'metric';
        this.favorites = JSON.parse(localStorage.getItem('weatherFavorites') || '[]');
        this.searchTimeout = null;
        this.isLoading = false;
        this.scene = document.getElementById('wvScene') ? new WeatherScene(document.getElementById('wvScene')) : null;
        // Settings and Locations never fetch a "current" weather condition of
        // their own (Settings has none; Locations shows several cities at
        // once with no single "here") - without this they're permanently
        // stuck on the scene's default bright/cloudy daytime look, regardless
        // of what's actually happening outside or whether dark mode is on.
        // Re-applying whatever the last page that did fetch weather saw
        // keeps the mood consistent everywhere.
        if (this.scene) {
            const lastIcon = localStorage.getItem('wv_lastWeatherIcon');
            if (lastIcon) this.scene.applyWeatherIcon(lastIcon);
        }

        this.init();
    }

    /** Applies a weather icon to the sky scene and remembers it so pages
     * with no weather fetch of their own (Settings, Locations) can still
     * open in a matching mood instead of a static default. */
    applySceneIcon(icon) {
        if (!icon) return;
        localStorage.setItem('wv_lastWeatherIcon', icon);
        if (this.scene) this.scene.applyWeatherIcon(icon);
    }

    init() {
        this.setupSearch();
        this.setupUnitsToggle();
        this.setupDarkMode();
        this.setupNavDrawer();
        this.setupLocationButton();
        this.initAlertsBadge();
        this.setupInstallPrompt();
        this.autoGeolocateIfPermitted();
    }

    // Previously the user had to click "My Location" every single visit,
    // even with location access already granted - this checks the
    // Permissions API and silently re-fetches the current position instead,
    // so a returning user with location on just sees it update on its own.
    // Resolves asynchronously (geolocation is never instant), which is fine:
    // every page module registers its 'wv:cityselected' listener
    // synchronously during its own constructor, all of which run before
    // this can possibly resolve.
    async autoGeolocateIfPermitted() {
        // Never override an explicit choice already in play (a ?city=/
        // ?lat=&lon= URL param, or a previously-searched city) - silently
        // jumping to the device's current position would be surprising if
        // the user came here to check a specific place.
        if (this.getResolvedCity()) return;
        if (!navigator.permissions || !navigator.geolocation) return;
        try {
            const status = await navigator.permissions.query({ name: 'geolocation' });
            if (status.state === 'granted') {
                this.getLocationWeather();
            }
        } catch (error) {
            // Permissions API doesn't support querying 'geolocation' in
            // every browser (notably Safari) - nothing to auto-trigger
            // there, the manual "My Location" button still works.
        }
    }

    // ---- PWA install prompt ----

    isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    setupInstallPrompt() {
        const banner = document.getElementById('pwaInstallPrompt');
        const acceptBtn = document.getElementById('pwaInstallAccept');
        const dismissBtn = document.getElementById('pwaInstallDismiss');
        if (!banner || !acceptBtn || !dismissBtn) return;

        this.deferredInstallPrompt = null;

        // Already running as the installed app - never show, regardless of
        // dismissal history (isStandalone() alone doesn't cover the moment
        // right after install but before this tab's relaunched standalone,
        // which is what wv_installed is for).
        if (this.isStandalone() || localStorage.getItem('wv_installed') === 'true') {
            return;
        }

        // A dismissal snoozes the prompt for 2 days rather than suppressing
        // it forever - someone who says "not now" on day 1 may still want
        // the reminder once they've used the app a bit more, but someone who
        // dismisses it repeatedly won't be nagged every single reload either.
        const dismissedAt = parseInt(localStorage.getItem('wv_installPromptDismissedAt') || '0', 10);
        const snoozeMs = 2 * 24 * 60 * 60 * 1000;
        if (dismissedAt && Date.now() - dismissedAt < snoozeMs) {
            return;
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            banner.style.display = 'flex';
        });

        acceptBtn.addEventListener('click', async () => {
            if (!this.deferredInstallPrompt) {
                banner.style.display = 'none';
                return;
            }
            this.deferredInstallPrompt.prompt();
            const { outcome } = await this.deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                localStorage.setItem('wv_installed', 'true');
            } else {
                localStorage.setItem('wv_installPromptDismissedAt', Date.now().toString());
            }
            this.deferredInstallPrompt = null;
            banner.style.display = 'none';
        });

        dismissBtn.addEventListener('click', () => {
            localStorage.setItem('wv_installPromptDismissedAt', Date.now().toString());
            banner.style.display = 'none';
        });

        window.addEventListener('appinstalled', () => {
            localStorage.setItem('wv_installed', 'true');
            banner.style.display = 'none';
        });
    }

    // Shows the last-computed alert count (persisted by pages/today.js) on
    // the sidebar's Today link, so it's visible even on other pages - this
    // page doesn't recompute alerts itself, only reads the cached count.
    initAlertsBadge() {
        if (document.body.dataset.page === 'today') return;
        const count = parseInt(localStorage.getItem('wv_alertCount') || '0', 10);
        if (count <= 0) return;
        [document.getElementById('alertsBadge'), document.getElementById('alertsBadgeMobile')].forEach(badge => {
            if (!badge) return;
            badge.textContent = count;
            badge.style.display = 'flex';
        });
    }

    // ---- City resolution (shared across all page modules) ----

    getResolvedCity() {
        const params = new URLSearchParams(window.location.search);
        const city = params.get('city');
        const lat = params.get('lat');
        const lon = params.get('lon');
        if (city) return { city };
        if (lat && lon) return { lat: parseFloat(lat), lon: parseFloat(lon) };
        const lastCity = localStorage.getItem('lastWeatherCity');
        return lastCity ? { city: lastCity } : null;
    }

    setLastCity(city) {
        localStorage.setItem('lastWeatherCity', city);
    }

    // ---- Search + autocomplete (header, shared chrome) ----

    setupSearch() {
        const searchInput = document.getElementById('citySearch');
        const clearButton = document.getElementById('clearSearch');
        if (!searchInput || !clearButton) return;

        searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
            this.toggleClearButton(e.target.value);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.hideSearchDropdown();
                this.dispatchCitySelected({ city: e.target.value });
            }
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length >= 2) {
                this.handleSearchInput(searchInput.value);
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            const dropdown = document.getElementById('searchDropdown');
            if (!dropdown.classList.contains('show')) return;
            const items = dropdown.querySelectorAll('.dropdown-item');
            const activeItem = dropdown.querySelector('.dropdown-item:focus');
            let index = Array.from(items).indexOf(activeItem);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                index = Math.min(index + 1, items.length - 1);
                items[index]?.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                index = Math.max(index - 1, 0);
                items[index]?.focus();
            } else if (e.key === 'Escape') {
                this.hideSearchDropdown();
                searchInput.focus();
            }
        });

        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            this.hideSearchDropdown();
            this.toggleClearButton('');
            searchInput.focus();
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.wv-search')) {
                this.hideSearchDropdown();
            }
        });

        // Pre-fill the search box with whatever city is currently resolved.
        const resolved = this.getResolvedCity();
        if (resolved && resolved.city) {
            searchInput.value = resolved.city;
            this.toggleClearButton(resolved.city);
        }
    }

    toggleClearButton(value) {
        const clearButton = document.getElementById('clearSearch');
        if (clearButton) clearButton.style.display = value.trim() ? 'flex' : 'none';
    }

    handleSearchInput(query) {
        clearTimeout(this.searchTimeout);
        if (query.trim().length >= 2) {
            this.searchTimeout = setTimeout(() => this.searchLocations(query.trim()), 300);
        } else if (query.trim().length === 0) {
            this.hideSearchDropdown();
        }
    }

    async searchLocations(query) {
        try {
            const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Failed to search locations');
            const locations = await response.json();
            this.showSearchDropdown(locations, query);
        } catch (error) {
            console.error('Error searching locations:', error);
            this.hideSearchDropdown();
        }
    }

    showSearchDropdown(locations, query = '') {
        const dropdown = document.getElementById('searchDropdown');
        if (!locations || locations.length === 0) {
            dropdown.innerHTML = `
                <div class="wv-search__no-results">
                    <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
                    <span>No locations found${query ? ` for "${this.escapeHtml(query)}"` : ''}</span>
                </div>
            `;
            dropdown.classList.add('show');
            return;
        }

        dropdown.innerHTML = locations.map((location, index) => `
            <button class="dropdown-item"
                    type="button"
                    role="option"
                    id="search-option-${index}"
                    data-lat="${location.lat}"
                    data-lon="${location.lon}"
                    data-name="${this.escapeHtml(location.display_name)}"
                    tabindex="-1">
                <div>
                    <div class="fw-semibold">${this.escapeHtml(location.name)}</div>
                    <small>${this.escapeHtml(location.state)} ${this.escapeHtml(location.country)}</small>
                </div>
                <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
            </button>
        `).join('');

        dropdown.classList.add('show');

        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const lat = parseFloat(e.currentTarget.dataset.lat);
                const lon = parseFloat(e.currentTarget.dataset.lon);
                const name = e.currentTarget.dataset.name;

                document.getElementById('citySearch').value = name;
                this.hideSearchDropdown();
                this.toggleClearButton(name);
                this.dispatchCitySelected({ lat, lon, name });
            });
        });
    }

    hideSearchDropdown() {
        const dropdown = document.getElementById('searchDropdown');
        if (!dropdown) return;
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
    }

    /**
     * Fires 'wv:cityselected' with { city } or { lat, lon, name }. On
     * /forecast, /map, /locations the page module re-renders in place; on
     * /settings there's no weather content, so it redirects to Today.
     */
    dispatchCitySelected(detail) {
        const page = document.body.dataset.page;
        if (detail.city) this.setLastCity(detail.city);
        if (detail.name) this.setLastCity(detail.name);

        if (page === 'settings') {
            const cityParam = detail.city || detail.name;
            window.location.href = cityParam
                ? `/?city=${encodeURIComponent(cityParam)}`
                : `/?lat=${detail.lat}&lon=${detail.lon}`;
            return;
        }

        document.dispatchEvent(new CustomEvent('wv:cityselected', { detail }));
    }

    // ---- Geolocation (header, shared chrome) ----

    setupLocationButton() {
        const locationButton = document.getElementById('useLocationButton');
        if (!locationButton) return;
        locationButton.addEventListener('click', () => this.getLocationWeather());
    }

    async getLocationWeather() {
        if (!navigator.geolocation) {
            this.showError('Geolocation is not supported by this browser');
            return;
        }
        try {
            this.setLoading(true);
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    // enableHighAccuracy forces a GPS fix - laptops/desktops
                    // with no GPS chip fall back to slow (or failing)
                    // OS-level positioning, which is exactly what was
                    // throwing the timeout error. A weather app only needs
                    // city-level accuracy, which network/Wi-Fi-based
                    // positioning gives almost instantly, so there's no
                    // reason to demand GPS precision here at all.
                    timeout: 15000,
                    enableHighAccuracy: false,
                    // Accept a fix up to 5 minutes old instead of always
                    // forcing a brand new one - most browsers/OSes already
                    // cache a recent position, so this turns "wait for a
                    // fresh fix every single time" into "usually instant".
                    maximumAge: 5 * 60 * 1000
                });
            });
            const { latitude, longitude } = position.coords;
            // Reset the loading flag before dispatching: page modules'
            // 'wv:cityselected' listeners (e.g. today.js's handleCitySelected)
            // bail out early whenever wv.isLoading is still true, to avoid
            // overlapping fetches from rapid searches. dispatchEvent runs
            // listeners synchronously, so if this flag were still true here
            // (it's set at the top of this method), the listener would see
            // isLoading=true and silently no-op - geolocation would resolve
            // successfully but never actually fetch or render anything.
            this.setLoading(false);
            document.dispatchEvent(new CustomEvent('wv:cityselected', {
                detail: { lat: latitude, lon: longitude, isGeolocation: true }
            }));
        } catch (error) {
            if (error.code === 1) {
                this.showError('Location access denied. Please search for a city manually.');
            } else if (error.code === 2) {
                this.showError('Location information unavailable. Please search for a city manually.');
            } else if (error.code === 3) {
                this.showError('Location request timeout. Please search for a city manually.');
            } else {
                this.showError(error.message || 'Failed to get location');
            }
        } finally {
            this.setLoading(false);
        }
    }

    // ---- Units toggle (header, shared chrome) ----

    setupUnitsToggle() {
        const unitsToggle = document.getElementById('unitsToggle');
        if (!unitsToggle) return;
        unitsToggle.checked = this.currentUnits === 'imperial';
        unitsToggle.addEventListener('change', (e) => this.toggleUnits(e.target.checked));
    }

    toggleUnits(isImperial) {
        this.currentUnits = isImperial ? 'imperial' : 'metric';
        localStorage.setItem('weatherUnits', this.currentUnits);
        const unitsToggle = document.getElementById('unitsToggle');
        if (unitsToggle) unitsToggle.checked = isImperial;
        document.dispatchEvent(new CustomEvent('wv:unitschange', { detail: { units: this.currentUnits } }));
    }

    // ---- Dark mode (header, shared chrome) ----

    setupDarkMode() {
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (!darkModeToggle) return;

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedDarkMode = localStorage.getItem('darkMode');
        const isDarkMode = savedDarkMode ? savedDarkMode === 'true' : prefersDark;

        this.applyDarkMode(isDarkMode, { persist: false, silent: true });

        darkModeToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const currentPressed = darkModeToggle.getAttribute('aria-pressed') === 'true';
            this.applyDarkMode(!currentPressed);
        });
    }

    applyDarkMode(isDark, { persist = true, silent = false } = {}) {
        const htmlElement = document.documentElement;
        const theme = isDark ? 'dark' : 'light';
        htmlElement.setAttribute('data-bs-theme', theme);
        if (persist) localStorage.setItem('darkMode', isDark.toString());

        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.setAttribute('aria-pressed', isDark);
            darkModeToggle.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }

        if (!silent) {
            document.dispatchEvent(new CustomEvent('wv:themechange', { detail: { isDark } }));
        }
    }

    // ---- Mobile nav drawer ----

    setupNavDrawer() {
        const navToggle = document.getElementById('navToggle');
        const sidebar = document.getElementById('wvSidebar');
        const backdrop = document.getElementById('wvSidebarBackdrop');
        if (!navToggle || !sidebar || !backdrop) return;

        const closeDrawer = (returnFocus = false) => {
            sidebar.classList.remove('open');
            backdrop.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
            if (returnFocus) navToggle.focus();
        };
        const openDrawer = () => {
            sidebar.classList.add('open');
            backdrop.classList.add('open');
            navToggle.setAttribute('aria-expanded', 'true');
            sidebar.querySelector('.wv-nav-item')?.focus();
        };

        navToggle.addEventListener('click', () => {
            sidebar.classList.contains('open') ? closeDrawer() : openDrawer();
        });
        backdrop.addEventListener('click', () => closeDrawer());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) closeDrawer(true);
        });
        sidebar.querySelectorAll('.wv-nav-item').forEach(a => {
            a.addEventListener('click', () => closeDrawer());
        });

        // The drawer is hidden entirely below 767px (the tab bar takes over),
        // but if a user resizes the window down while it's open (rather than
        // reloading at a new width), force it closed rather than leaving an
        // invisible-but-open drawer state behind.
        window.matchMedia('(max-width: 767px)').addEventListener('change', (e) => {
            if (e.matches) closeDrawer();
        });
    }

    // ---- Favorites (data + mutation; rendering is page-specific) ----

    isFavorite(cityName) {
        return this.favorites.includes(cityName);
    }

    toggleFavorite(cityName) {
        const index = this.favorites.indexOf(cityName);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            if (this.favorites.length >= 5) this.favorites.shift();
            this.favorites.push(cityName);
        }
        localStorage.setItem('weatherFavorites', JSON.stringify(this.favorites));
        document.dispatchEvent(new CustomEvent('wv:favoriteschange', { detail: { favorites: this.favorites } }));
    }

    removeFavorite(cityName) {
        const index = this.favorites.indexOf(cityName);
        if (index > -1) {
            this.favorites.splice(index, 1);
            localStorage.setItem('weatherFavorites', JSON.stringify(this.favorites));
            document.dispatchEvent(new CustomEvent('wv:favoriteschange', { detail: { favorites: this.favorites } }));
        }
    }

    // ---- Shared loading state (header controls; page skeletons are per-page) ----

    setLoading(loading) {
        this.isLoading = loading;
        const searchInput = document.getElementById('citySearch');
        const locationButton = document.getElementById('useLocationButton');
        const clearButton = document.getElementById('clearSearch');

        if (loading) {
            if (searchInput) searchInput.disabled = true;
            if (locationButton) {
                locationButton.disabled = true;
                locationButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
            }
            if (clearButton) clearButton.style.display = 'none';
            this.announceToScreenReader('Loading weather data…');
        } else {
            if (searchInput) searchInput.disabled = false;
            if (locationButton) {
                locationButton.disabled = false;
                locationButton.innerHTML = '<i class="fas fa-location-arrow" aria-hidden="true"></i><span>My Location</span>';
            }
            if (searchInput) this.toggleClearButton(searchInput.value);
        }
        document.dispatchEvent(new CustomEvent('wv:loadingchange', { detail: { loading } }));
    }

    // ---- Fetch helpers (reused by today/forecast/map page modules) ----

    async fetchCurrentWeather(params) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`/api/weather/current?${queryString}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch weather data');
        }
        return response.json();
    }

    async fetchForecast(params) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`/api/weather/forecast?${queryString}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch forecast data');
        }
        return response.json();
    }

    async fetchAirQuality(lat, lon) {
        const response = await fetch(`/api/air-quality?lat=${lat}&lon=${lon}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch air quality data');
        }
        return response.json();
    }

    // ---- Toasts ----

    showError(message) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'wv-toast wv-toast--error';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.innerHTML = `
            <div class="wv-toast__icon" aria-hidden="true"><i class="fas fa-exclamation-circle"></i></div>
            <div class="wv-toast__content">
                <div class="wv-toast__title">Error</div>
                <div class="wv-toast__message">${this.escapeHtml(message)}</div>
            </div>
            <button class="wv-toast__close" aria-label="Dismiss error"><i class="fas fa-times" aria-hidden="true"></i></button>
        `;
        toast.querySelector('.wv-toast__close').addEventListener('click', () => this.removeToast(toast));
        setTimeout(() => this.removeToast(toast), 5000);
        toastContainer.appendChild(toast);
        this.announceToScreenReader(`Error: ${message}`);
    }

    showSuccess(message) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'wv-toast wv-toast--success';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = `
            <div class="wv-toast__icon" aria-hidden="true"><i class="fas fa-check-circle"></i></div>
            <div class="wv-toast__content">
                <div class="wv-toast__title">Success</div>
                <div class="wv-toast__message">${this.escapeHtml(message)}</div>
            </div>
            <button class="wv-toast__close" aria-label="Dismiss"><i class="fas fa-times" aria-hidden="true"></i></button>
        `;
        toast.querySelector('.wv-toast__close').addEventListener('click', () => this.removeToast(toast));
        setTimeout(() => this.removeToast(toast), 3000);
        toastContainer.appendChild(toast);
    }

    removeToast(toast) {
        if (!toast.parentNode) return;
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        });
    }

    announceToScreenReader(message) {
        const announcement = document.getElementById('srAnnouncements');
        if (announcement) announcement.textContent = message;
    }

    // ---- Utilities ----

    getWeatherIconClass(iconCode) {
        const iconMap = {
            '01d': 'fa-sun', '01n': 'fa-moon',
            '02d': 'fa-cloud-sun', '02n': 'fa-cloud-moon',
            '03d': 'fa-cloud', '03n': 'fa-cloud',
            '04d': 'fa-cloud', '04n': 'fa-cloud',
            '09d': 'fa-cloud-rain', '09n': 'fa-cloud-rain',
            '10d': 'fa-cloud-sun-rain', '10n': 'fa-cloud-moon-rain',
            '11d': 'fa-bolt', '11n': 'fa-bolt',
            '13d': 'fa-snowflake', '13n': 'fa-snowflake',
            '50d': 'fa-smog', '50n': 'fa-smog'
        };
        return iconMap[iconCode] || 'fa-cloud';
    }

    getUVDescription(uvi) {
        if (!uvi) return 'Unknown';
        if (uvi <= 2) return 'Low';
        if (uvi <= 5) return 'Moderate';
        if (uvi <= 7) return 'High';
        if (uvi <= 10) return 'Very High';
        return 'Extreme';
    }

    getWindDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.wv = new WVShared();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    // Without this, a tab left open across a deploy can end up running HTML
    // fetched fresh from the network (navigations are network-first) against
    // JS/CSS still being served by the *old* service worker's cache-first
    // static-asset handling, until that old worker finishes updating on its
    // own schedule - any element the new HTML removed or renamed then reads
    // as null to the stale JS. Reloading once when the new worker actually
    // takes control (which only happens after it's fully installed) puts
    // both HTML and assets back on the same version immediately.
    // controllerchange also fires the very first time any service worker
    // claims an already-loaded page (clients.claim() in sw.js) - on a
    // genuinely first-ever visit there's no stale cache to fix, so without
    // this guard every new visitor's page silently reloaded itself once for
    // no reason. Only reload when a *different* worker was already in
    // control (a real update), not when there was none before.
    let refreshingForNewWorker = false;
    const hadExistingController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadExistingController || refreshingForNewWorker) return;
        refreshingForNewWorker = true;
        window.location.reload();
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(registration => console.log('SW registered: ', registration))
            .catch(registrationError => console.log('SW registration failed: ', registrationError));
    });
}
