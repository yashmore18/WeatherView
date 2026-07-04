/**
 * WeatherView 2.0 - Frontend JavaScript
 * Apple-inspired weather application
 */

class WeatherApp {
    constructor() {
        this.chart = null;
        this.currentUnits = localStorage.getItem('weatherUnits') || 'metric';
        this.favorites = JSON.parse(localStorage.getItem('weatherFavorites') || '[]');
        this.searchTimeout = null;
        this.isLoading = false;
        this.currentCity = null;
        this.currentData = null;
        this.scene = new WeatherScene(document.getElementById('wvScene'));

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateUnitsToggle();
        this.renderFavorites();

        // Load last searched city from localStorage if available
        const lastCity = localStorage.getItem('lastWeatherCity');
        if (lastCity) {
            this.searchWeather(lastCity);
        }
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('citySearch');
        const clearButton = document.getElementById('clearSearch');

        searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
            this.toggleClearButton(e.target.value);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.hideSearchDropdown();
                this.searchWeather(e.target.value);
            }
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length >= 2) {
                this.handleSearchInput(searchInput.value);
            }
        });

        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            this.hideSearchDropdown();
            this.toggleClearButton('');
            searchInput.focus();
        });

        // Geolocation
        const locationButton = document.getElementById('useLocationButton');
        locationButton.addEventListener('click', () => {
            this.getLocationWeather();
        });

        // Units toggle
        const unitsToggle = document.getElementById('unitsToggle');
        unitsToggle.addEventListener('change', (e) => {
            this.toggleUnits(e.target.checked);
        });

        // Dark mode toggle
        const darkModeToggle = document.getElementById('darkModeToggle');
        darkModeToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const currentPressed = darkModeToggle.getAttribute('aria-pressed') === 'true';
            this.toggleDarkMode(!currentPressed);
        });

        // Initialize dark mode
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedDarkMode = localStorage.getItem('darkMode');
        const isDarkMode = savedDarkMode ? savedDarkMode === 'true' : prefersDark;

        darkModeToggle.setAttribute('aria-pressed', isDarkMode);
        darkModeToggle.querySelector('i').className = isDarkMode ? 'fas fa-sun' : 'fas fa-moon';
        this.toggleDarkMode(isDarkMode);

        // Favorite toggle
        const favoriteToggle = document.getElementById('favoriteToggle');
        if (favoriteToggle) {
            favoriteToggle.addEventListener('click', () => {
                if (this.currentCity) {
                    this.toggleFavorite(this.currentCity);
                }
            });
        }

        // Share weather
        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                this.shareWeather();
            });
        }

        // Hourly scroll navigation
        const hourlyPrev = document.getElementById('hourlyPrev');
        const hourlyNext = document.getElementById('hourlyNext');
        const hourlyScroll = document.getElementById('hourlyScroll');

        if (hourlyPrev && hourlyScroll) {
            hourlyPrev.addEventListener('click', () => {
                hourlyScroll.scrollBy({ left: -260, behavior: 'smooth' });
            });
        }
        if (hourlyNext && hourlyScroll) {
            hourlyNext.addEventListener('click', () => {
                hourlyScroll.scrollBy({ left: 260, behavior: 'smooth' });
            });
        }

        // Manage favorites
        const manageFavorites = document.getElementById('manageFavorites');
        if (manageFavorites) {
            manageFavorites.addEventListener('click', () => {
                this.showFavoritesManager();
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.wv-search')) {
                this.hideSearchDropdown();
            }
        });

        // Sidebar navigation - scrolls to the relevant section instead of
        // navigating away, since this is a single-page app with no other routes.
        document.querySelectorAll('.wv-nav-item').forEach(navItem => {
            navItem.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = navItem.dataset.target;
                const target = targetId ? document.getElementById(targetId) : null;

                document.querySelectorAll('.wv-nav-item').forEach(item => {
                    item.classList.remove('wv-nav-item--active');
                    item.removeAttribute('aria-current');
                });
                navItem.classList.add('wv-nav-item--active');
                navItem.setAttribute('aria-current', 'page');

                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                if (targetId === 'wvHeader') {
                    document.getElementById('citySearch')?.focus();
                }
            });
        });

        // Keyboard navigation for dropdown
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
    }

    toggleClearButton(value) {
        const clearButton = document.getElementById('clearSearch');
        clearButton.style.display = value.trim() ? 'flex' : 'none';
    }

    handleSearchInput(query) {
        clearTimeout(this.searchTimeout);

        if (query.trim().length >= 2) {
            this.searchTimeout = setTimeout(() => {
                this.searchLocations(query.trim());
            }, 300);
        } else if (query.trim().length === 0) {
            this.hideSearchDropdown();
        }
    }

    async searchLocations(query) {
        try {
            const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);

            if (!response.ok) {
                throw new Error('Failed to search locations');
            }

            const locations = await response.json();
            this.showSearchDropdown(locations);

        } catch (error) {
            console.error('Error searching locations:', error);
            this.hideSearchDropdown();
        }
    }

    showSearchDropdown(locations) {
        const dropdown = document.getElementById('searchDropdown');

        if (!locations || locations.length === 0) {
            this.hideSearchDropdown();
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

        // Add click handlers for dropdown items
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const lat = e.currentTarget.dataset.lat;
                const lon = e.currentTarget.dataset.lon;
                const name = e.currentTarget.dataset.name;

                document.getElementById('citySearch').value = name;
                this.hideSearchDropdown();
                this.toggleClearButton(name);
                this.searchWeatherByCoords(parseFloat(lat), parseFloat(lon));
            });
        });
    }

    hideSearchDropdown() {
        const dropdown = document.getElementById('searchDropdown');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
    }

    async searchWeatherByCoords(lat, lon) {
        if (this.isLoading) return;

        try {
            this.setLoading(true);
            this.clearError();

            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrentWeather({ lat, lon, units: this.currentUnits }),
                this.fetchForecast({ lat, lon, units: this.currentUnits })
            ]);

            this.displayAllWeather(currentData, forecastData);

            // Fetch air quality data
            try {
                const airQualityData = await this.fetchAirQuality(lat, lon);
                this.displayAirQuality(airQualityData, currentData.visibility, currentData.lat, currentData.lon);
            } catch (error) {
                console.warn('Air quality data unavailable:', error);
                this.displayAirQualityUnavailable();
            }

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    async searchWeather(city) {
        if (!city || city.trim().length === 0) {
            this.showError('Please enter a city name');
            return;
        }

        if (this.isLoading) return;

        try {
            this.setLoading(true);
            this.clearError();

            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrentWeather({ city: city.trim(), units: this.currentUnits }),
                this.fetchForecast({ city: city.trim(), units: this.currentUnits })
            ]);

            this.displayAllWeather(currentData, forecastData);

            // Fetch air quality data if coordinates are available
            if (currentData.lat && currentData.lon) {
                try {
                    const airQualityData = await this.fetchAirQuality(currentData.lat, currentData.lon);
                    this.displayAirQuality(airQualityData, currentData.visibility, currentData.lat, currentData.lon);
                } catch (error) {
                    console.warn('Air quality data unavailable:', error);
                    this.displayAirQualityUnavailable();
                }
            } else {
                this.displayAirQualityUnavailable();
            }

            // Save last searched city
            localStorage.setItem('lastWeatherCity', city.trim());

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    async getLocationWeather() {
        if (!navigator.geolocation) {
            this.showError('Geolocation is not supported by this browser');
            return;
        }

        if (this.isLoading) return;

        try {
            this.setLoading(true);
            this.clearError();

            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    enableHighAccuracy: true
                });
            });

            const { latitude, longitude } = position.coords;

            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrentWeather({ lat: latitude, lon: longitude, units: this.currentUnits }),
                this.fetchForecast({ lat: latitude, lon: longitude, units: this.currentUnits })
            ]);

            this.displayAllWeather(currentData, forecastData);

            try {
                const airQualityData = await this.fetchAirQuality(latitude, longitude);
                this.displayAirQuality(airQualityData, currentData.visibility, latitude, longitude);
            } catch (error) {
                console.warn('Air quality data unavailable:', error);
                this.displayAirQualityUnavailable();
            }

            // Update search input with city name
            document.getElementById('citySearch').value = currentData.city;
            this.toggleClearButton(currentData.city);

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

    async fetchCurrentWeather(params) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`/api/weather/current?${queryString}`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch weather data');
        }

        return await response.json();
    }

    async fetchForecast(params) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`/api/weather/forecast?${queryString}`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch forecast data');
        }

        return await response.json();
    }

    async fetchAirQuality(lat, lon) {
        const response = await fetch(`/api/air-quality?lat=${lat}&lon=${lon}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch air quality data');
        }

        return response.json();
    }

    displayAllWeather(currentData, forecastData) {
        this.currentCity = currentData.city;
        this.currentData = currentData;

        // Show all sections
        this.showSections();

        // Display components
        this.displayHeroCard(currentData);
        this.displayHourlyForecast(forecastData);
        this.displayDailyForecast(forecastData);
        this.displayDetails(currentData);
        this.createChart(forecastData);
        this.updateFavoriteButton();
    }

    showSections() {
        const sections = ['heroCard', 'hourlySection', 'dailySection', 'detailsSection', 'chartSection', 'favoritesSection'];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });

        // Hide empty state
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.style.display = 'none';
    }

    displayHeroCard(data) {
        const tempUnit = this.currentUnits === 'imperial' ? '°F' : '°C';
        const windUnit = this.currentUnits === 'imperial' ? 'mph' : 'm/s';
        const localTime = new Date(data.local_time_iso).toLocaleString();

        // Update hero card elements
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

        // Weather icon
        const iconEl = document.getElementById('heroIcon');
        iconEl.className = `wv-hero-card__icon fas ${this.getWeatherIconClass(data.icon)}`;

        // Dynamic background scene - day/night here tracks the searched location's actual
        // sun state (from the icon suffix), independent of the user's manual dark-mode toggle.
        if (this.scene) {
            this.scene.applyWeatherIcon(data.icon);
        }

        // Region
        const regionEl = document.querySelector('.wv-hero-card__region');
        if (regionEl) {
            regionEl.textContent = `${data.country}${data.state ? ', ' + data.state : ''}`;
        }
    }

    displayHourlyForecast(data) {
        const hourlyScroll = document.getElementById('hourlyScroll');
        const tempUnit = this.currentUnits === 'imperial' ? '°F' : '°C';

        // Get hourly data from forecast (first 24 hours)
        const hourlyData = data.hourly_forecast?.slice(0, 24) || [];

        if (hourlyData.length === 0) {
            hourlyScroll.innerHTML = '<p class="wv-empty-text" style="padding: var(--wv-space-4); color: var(--wv-color-text-tertiary);">No hourly data available</p>';
            return;
        }

        hourlyScroll.innerHTML = hourlyData.map(hour => {
            const date = new Date(hour.dt * 1000);
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
            const precip = hour.pop ? Math.round(hour.pop * 100) : 0;

            return `
                <div class="wv-hourly-item" role="listitem">
                    <span class="wv-hourly-item__time">${timeStr}</span>
                    <i class="wv-hourly-item__icon fas ${this.getWeatherIconClass(hour.icon)}" aria-hidden="true"></i>
                    <span class="wv-hourly-item__temp">${Math.round(hour.temp)}${tempUnit}</span>
                    ${precip > 0 ? `<span class="wv-hourly-item__precip"><i class="fas fa-tint" aria-hidden="true"></i>${precip}%</span>` : ''}
                </div>
            `;
        }).join('');
    }

    displayDailyForecast(data) {
        const dailyForecast = document.getElementById('dailyForecast');
        const tempUnit = this.currentUnits === 'imperial' ? '°F' : '°C';
        const today = new Date().toISOString().split('T')[0];

        const dailyData = data.daily_forecast || [];

        if (dailyData.length === 0) {
            dailyForecast.innerHTML = '<p class="wv-empty-text" style="padding: var(--wv-space-4); color: var(--wv-color-text-tertiary);">No daily data available</p>';
            return;
        }

        dailyForecast.innerHTML = dailyData.map(day => {
            const date = new Date(day.date);
            const isToday = day.date === today;
            const dayName = isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'long' });
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return `
                <div class="wv-daily-item" role="listitem">
                    <div class="wv-daily-item__day ${isToday ? 'text-primary' : ''}">${dayName}</div>
                    <div class="wv-daily-item__icon">
                        <i class="fas ${this.getWeatherIconClass(day.icon)}" aria-hidden="true"></i>
                    </div>
                    <div class="wv-daily-item__desc">${day.description}</div>
                    <div class="wv-daily-item__temps">
                        <span class="wv-daily-item__high">${Math.round(day.temp_max)}${tempUnit}</span>
                        <span class="wv-daily-item__low">${Math.round(day.temp_min)}${tempUnit}</span>
                    </div>
                    <div class="wv-daily-item__precip">
                        <i class="fas fa-tint" aria-hidden="true"></i>
                        <span>${day.pop ? Math.round(day.pop * 100) : 0}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayDetails(data) {
        const detailsGrid = document.getElementById('detailsGrid');
        const tempUnit = this.currentUnits === 'imperial' ? '°F' : '°C';
        const windUnit = this.currentUnits === 'imperial' ? 'mph' : 'm/s';

        const dewPoint = data.dew_point || Math.round(data.temp - ((100 - data.humidity) / 5));
        const windGust = data.wind_gust || Math.round(data.wind_speed * 1.5);
        const seaLevel = data.sea_level || data.pressure;

        const details = [
            {
                id: 'aqi',
                icon: 'fa-lungs',
                title: 'Air Quality',
                value: '--',
                subtitle: 'Loading...',
                extra: [],
                className: 'wv-detail-card--aqi'
            },
            {
                id: 'humidity',
                icon: 'fa-tint',
                title: 'Humidity',
                value: `${data.humidity}%`,
                subtitle: data.humidity > 70 ? 'High' : data.humidity > 40 ? 'Moderate' : 'Low',
                extra: [
                    { label: 'Dew Point', value: `${dewPoint}${tempUnit}` }
                ]
            },
            {
                id: 'uv',
                icon: 'fa-sun',
                title: 'UV Index',
                value: data.uvi ? data.uvi.toFixed(1) : 'N/A',
                subtitle: data.uvi ? this.getUVDescription(data.uvi) : 'Not available',
                extra: data.uvi ? [
                    { label: 'Risk Level', value: this.getUVDescription(data.uvi) }
                ] : []
            },
            {
                id: 'wind',
                icon: 'fa-wind',
                title: 'Wind',
                value: `${data.wind_speed} ${windUnit}`,
                subtitle: `${data.wind_deg}° ${this.getWindDirection(data.wind_deg)}`,
                extra: [
                    { label: 'Gusts', value: `${windGust} ${windUnit}` }
                ]
            },
            {
                id: 'pressure',
                icon: 'fa-compress-arrows-alt',
                title: 'Pressure',
                value: `${data.pressure} hPa`,
                subtitle: data.pressure > 1013 ? 'High' : data.pressure < 1013 ? 'Low' : 'Normal',
                extra: [
                    { label: 'Sea Level', value: `${seaLevel} hPa` }
                ]
            },
            {
                id: 'visibility',
                icon: 'fa-eye',
                title: 'Visibility',
                value: `${data.visibility} km`,
                subtitle: data.visibility >= 10 ? 'Excellent' : data.visibility >= 5 ? 'Good' : 'Reduced',
                extra: [
                    { label: 'Cloud Cover', value: `${data.clouds}%` }
                ]
            },
            {
                id: 'sunrise',
                icon: 'fa-sun',
                title: 'Sunrise',
                value: data.sunrise ? new Date(data.sunrise * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--',
                subtitle: 'Today',
                extra: []
            },
            {
                id: 'sunset',
                icon: 'fa-moon',
                title: 'Sunset',
                value: data.sunset ? new Date(data.sunset * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--',
                subtitle: 'Today',
                extra: []
            }
        ];

        detailsGrid.innerHTML = details.map(detail => `
            <article class="wv-detail-card ${detail.className || ''}" role="listitem">
                <header class="wv-detail-card__header">
                    <div class="wv-detail-card__icon" aria-hidden="true">
                        <i class="fas ${detail.icon}"></i>
                    </div>
                    <h3 class="wv-detail-card__title">${detail.title}</h3>
                </header>
                <div class="wv-detail-card__body">
                    <div class="wv-detail-card__value" id="detail-${detail.id}-value">${detail.value}</div>
                    <p class="wv-detail-card__subtitle" id="detail-${detail.id}-subtitle">${detail.subtitle}</p>
                    ${detail.extra.length > 0 ? `
                        <div class="wv-detail-card__extra">
                            ${detail.extra.map(item => `
                                <div class="wv-detail-card__extra-item">
                                    <span class="wv-detail-card__extra-label">${item.label}</span>
                                    <span class="wv-detail-card__extra-value">${item.value}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                ${detail.id === 'aqi' ? '<div class="wv-aqi-bar" id="aqi-bar"><div class="wv-aqi-bar__fill" id="aqi-bar-fill"></div></div>' : ''}
            </article>
        `).join('');
    }

    displayAirQuality(airData, visibility, lat, lon) {
        // Update AQI in details grid
        const aqiValueEl = document.getElementById('detail-aqi-value');
        const aqiSubtitleEl = document.getElementById('detail-aqi-subtitle');
        const aqiBarFill = document.getElementById('aqi-bar-fill');

        if (aqiValueEl && aqiSubtitleEl) {
            const aqi = airData.aqi || 1;
            const aqiLabels = { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very Poor' };
            const aqiColors = {
                1: 'var(--wv-color-success)',
                2: 'var(--wv-color-warning)',
                3: 'var(--wv-color-warning)',
                4: 'var(--wv-color-error)',
                5: 'var(--wv-color-error)'
            };

            aqiValueEl.textContent = aqi;
            aqiSubtitleEl.textContent = aqiLabels[aqi] || 'Unknown';
            aqiValueEl.style.color = aqiColors[aqi] || 'var(--wv-color-text-primary)';

            if (aqiBarFill) {
                const width = (aqi / 5) * 100;
                aqiBarFill.style.width = `${width}%`;
                aqiBarFill.style.background = aqiColors[aqi] || 'var(--wv-color-accent)';
            }
        }
    }

    displayAirQualityUnavailable() {
        const aqiValueEl = document.getElementById('detail-aqi-value');
        const aqiSubtitleEl = document.getElementById('detail-aqi-subtitle');
        if (aqiValueEl && aqiSubtitleEl) {
            aqiValueEl.textContent = 'N/A';
            aqiSubtitleEl.textContent = 'Not available';
            aqiValueEl.style.color = 'var(--wv-color-text-primary)';
        }
    }

    createChart(data) {
        const ctx = document.getElementById('temperatureChart');
        if (!ctx) return;

        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#666666';
        const gridColor = isDark ? '#404040' : '#e0e0e0';
        const tempUnit = this.currentUnits === 'imperial' ? '°F' : '°C';

        // Prepare chart data from hourly forecast
        const hourlyData = data.hourly_forecast?.slice(0, 48) || [];
        const labels = hourlyData.map(h => {
            const date = new Date(h.dt * 1000);
            return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        });
        const temps = hourlyData.map(h => Math.round(h.temp));
        const feelsLike = hourlyData.map(h => Math.round(h.feels_like));

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: `Temperature (${tempUnit})`,
                        data: temps,
                        borderColor: 'var(--wv-color-accent)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointBackgroundColor: 'var(--wv-color-accent)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: `Feels Like (${tempUnit})`,
                        data: feelsLike,
                        borderColor: 'var(--wv-color-warning)',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [8, 4],
                        fill: false,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointBackgroundColor: 'var(--wv-color-warning)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: textColor,
                            font: {
                                family: 'var(--wv-font-sans)',
                                size: 12
                            },
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: gridColor,
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.raw}${tempUnit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: textColor,
                            font: { family: 'var(--wv-font-sans)', size: 11 },
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: textColor,
                            font: { family: 'var(--wv-font-sans)', size: 11 },
                            callback: (value) => `${value}${tempUnit}`
                        }
                    }
                }
            }
        });
    }

    renderFavorites() {
        const favoritesList = document.getElementById('favoritesList');
        const favoritesSection = document.getElementById('favoritesSection');

        if (!favoritesList) return;

        if (this.favorites.length === 0) {
            favoritesList.innerHTML = `
                <div class="wv-favorites-empty" role="status">
                    <i class="fas fa-star" aria-hidden="true"></i>
                    <p>No favorite cities yet</p>
                    <button class="wv-btn wv-btn--primary wv-btn--sm" onclick="document.getElementById('citySearch').focus()">
                        <i class="fas fa-plus" aria-hidden="true"></i>
                        <span>Add a City</span>
                    </button>
                </div>
            `;
            return;
        }

        favoritesList.innerHTML = this.favorites.map(city => `
            <button class="wv-favorite-chip" 
                    type="button"
                    onclick="app.searchWeather('${this.escapeHtml(city)}')"
                    aria-label="${this.escapeHtml(city)} - tap to view weather">
                <span>${this.escapeHtml(city)}</span>
                <button class="wv-favorite-chip__remove" 
                        type="button"
                        onclick="event.stopPropagation(); app.removeFavorite('${this.escapeHtml(city)}')"
                        aria-label="Remove ${this.escapeHtml(city)} from favorites">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </button>
        `).join('');

        // Show favorites section
        if (favoritesSection) {
            favoritesSection.style.display = 'block';
        }
    }

    removeFavorite(city) {
        const index = this.favorites.indexOf(city);
        if (index > -1) {
            this.favorites.splice(index, 1);
            localStorage.setItem('weatherFavorites', JSON.stringify(this.favorites));
            this.renderFavorites();
        }
    }

    toggleFavorite(cityName) {
        const index = this.favorites.indexOf(cityName);

        if (index > -1) {
            // Remove from favorites
            this.favorites.splice(index, 1);
        } else {
            // Add to favorites (max 5)
            if (this.favorites.length >= 5) {
                this.favorites.shift(); // Remove oldest
            }
            this.favorites.push(cityName);
        }

        localStorage.setItem('weatherFavorites', JSON.stringify(this.favorites));
        this.renderFavorites();
        this.updateFavoriteButton();
    }

    isFavorite(cityName) {
        return this.favorites.includes(cityName);
    }

    updateFavoriteButton() {
        const favoriteToggle = document.getElementById('favoriteToggle');
        if (favoriteToggle && this.currentCity) {
            const isFav = this.isFavorite(this.currentCity);
            favoriteToggle.setAttribute('aria-pressed', isFav);
            favoriteToggle.querySelector('i').className = isFav ? 'fas fa-star' : 'far fa-star';
        }
    }

    showFavoritesManager() {
        // Simple alert for now - could be enhanced with a modal
        const cities = this.favorites.join('\n') || 'None';
        alert(`Favorite Cities:\n${cities}\n\nClick the × on any chip to remove.`);
    }

    async shareWeather() {
        if (!this.currentData) return;

        const tempUnit = this.currentUnits === 'imperial' ? '°F' : '°C';
        const text = `${this.currentData.city}: ${Math.round(this.currentData.temp)}${tempUnit}, ${this.currentData.description}`;
        const shareData = { title: 'WeatherView', text, url: window.location.href };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.warn('Share failed:', error);
                }
            }
            return;
        }

        if (navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(`${text} - ${window.location.href}`);
                this.showSuccess('Weather info copied to clipboard');
            } catch (error) {
                this.showError('Unable to share weather info');
            }
            return;
        }

        this.showError('Sharing is not supported on this browser');
    }

    toggleUnits(isImperial) {
        this.currentUnits = isImperial ? 'imperial' : 'metric';
        localStorage.setItem('weatherUnits', this.currentUnits);

        // Refresh current weather data if displayed
        const currentCity = document.getElementById('citySearch').value;
        if (currentCity) {
            this.searchWeather(currentCity);
        }
    }

    updateUnitsToggle() {
        const unitsToggle = document.getElementById('unitsToggle');
        unitsToggle.checked = this.currentUnits === 'imperial';
    }

    toggleDarkMode(isDark) {
        // Only affects UI chrome tokens (data-bs-theme). Deliberately does not touch
        // #wvScene - the background scene's day/night state tracks real sun position
        // at the searched location, not this manual toggle.
        const htmlElement = document.documentElement;
        const theme = isDark ? 'dark' : 'light';

        htmlElement.setAttribute('data-bs-theme', theme);
        localStorage.setItem('darkMode', isDark.toString());

        // Update toggle button
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.setAttribute('aria-pressed', isDark);
            darkModeToggle.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }

        // Force update chart colors if chart exists
        if (this.chart) {
            this.updateChartTheme(isDark);
        }
    }

    updateChartTheme(isDark) {
        if (!this.chart) return;

        const textColor = isDark ? '#ffffff' : '#666666';
        const gridColor = isDark ? '#404040' : '#e0e0e0';

        this.chart.options.scales.x.ticks.color = textColor;
        this.chart.options.scales.y.ticks.color = textColor;
        this.chart.options.scales.x.grid.color = gridColor;
        this.chart.options.scales.y.grid.color = gridColor;
        this.chart.options.plugins.legend.labels.color = textColor;

        this.chart.update();
    }

    setLoading(loading) {
        this.isLoading = loading;
        const searchInput = document.getElementById('citySearch');
        const locationButton = document.getElementById('useLocationButton');
        const clearButton = document.getElementById('clearSearch');

        if (loading) {
            searchInput.disabled = true;
            locationButton.disabled = true;
            locationButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
            clearButton.style.display = 'none';
            this.announceToScreenReader('Loading weather data…');
        } else {
            searchInput.disabled = false;
            locationButton.disabled = false;
            locationButton.innerHTML = '<i class="fas fa-location-arrow" aria-hidden="true"></i><span>My Location</span>';
            this.toggleClearButton(searchInput.value);
        }

        this.setSkeletonsVisible(loading);
    }

    setSkeletonsVisible(loading) {
        const skeletons = {
            heroSkeleton: 'flex',
            hourlySkeleton: 'flex',
            dailySkeleton: 'flex',
            detailsSkeleton: 'grid'
        };
        const sectionIds = ['heroCard', 'hourlySection', 'dailySection', 'detailsSection'];

        if (loading) {
            sectionIds.forEach(id => {
                const section = document.getElementById(id);
                if (section) section.style.display = 'block';
            });
            Object.entries(skeletons).forEach(([id, display]) => {
                const el = document.getElementById(id);
                if (el) el.style.display = display;
            });
        } else {
            Object.keys(skeletons).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            // Only collapse sections back if this was the very first load and it
            // failed - if we already have data (a prior success, or this refresh
            // just succeeded), leave the real content showing.
            if (!this.currentData) {
                sectionIds.forEach(id => {
                    const section = document.getElementById(id);
                    if (section) section.style.display = 'none';
                });
            }
        }
    }

    showError(message) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = 'wv-toast wv-toast--error';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.innerHTML = `
            <div class="wv-toast__icon" aria-hidden="true">
                <i class="fas fa-exclamation-circle"></i>
            </div>
            <div class="wv-toast__content">
                <div class="wv-toast__title">Error</div>
                <div class="wv-toast__message">${this.escapeHtml(message)}</div>
            </div>
            <button class="wv-toast__close" aria-label="Dismiss error">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>
        `;

        // Add close handler
        toast.querySelector('.wv-toast__close').addEventListener('click', () => {
            this.removeToast(toast);
        });

        // Auto-remove after 5 seconds
        setTimeout(() => this.removeToast(toast), 5000);

        toastContainer.appendChild(toast);

        // Also announce for screen readers
        this.announceToScreenReader(`Error: ${message}`);
    }

    removeToast(toast) {
        if (!toast.parentNode) return;
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }

    showSuccess(message) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = 'wv-toast wv-toast--success';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = `
            <div class="wv-toast__icon" aria-hidden="true">
                <i class="fas fa-check-circle"></i>
            </div>
            <div class="wv-toast__content">
                <div class="wv-toast__title">Success</div>
                <div class="wv-toast__message">${this.escapeHtml(message)}</div>
            </div>
            <button class="wv-toast__close" aria-label="Dismiss">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>
        `;

        toast.querySelector('.wv-toast__close').addEventListener('click', () => {
            this.removeToast(toast);
        });

        setTimeout(() => this.removeToast(toast), 3000);
        toastContainer.appendChild(toast);
    }

    clearError() {
        // Errors are now shown as toasts, nothing to clear in container
    }

    announceToScreenReader(message) {
        const announcement = document.getElementById('srAnnouncements');
        if (announcement) {
            announcement.textContent = message;
        }
    }

    // Utility functions
    getWeatherIconClass(iconCode) {
        const iconMap = {
            '01d': 'fa-sun',
            '01n': 'fa-moon',
            '02d': 'fa-cloud-sun',
            '02n': 'fa-cloud-moon',
            '03d': 'fa-cloud',
            '03n': 'fa-cloud',
            '04d': 'fa-cloud',
            '04n': 'fa-cloud',
            '09d': 'fa-cloud-rain',
            '09n': 'fa-cloud-rain',
            '10d': 'fa-cloud-sun-rain',
            '10n': 'fa-cloud-moon-rain',
            '11d': 'fa-bolt',
            '11n': 'fa-bolt',
            '13d': 'fa-snowflake',
            '13n': 'fa-snowflake',
            '50d': 'fa-smog',
            '50n': 'fa-smog'
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WeatherApp();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
