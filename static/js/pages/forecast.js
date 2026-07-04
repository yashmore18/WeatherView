/**
 * WeatherView - Forecast page
 * Hourly strip, 7-day list, weather details grid (incl. AQI), temperature chart.
 */
class ForecastPage {
    constructor(wv) {
        this.wv = wv;
        this.chart = null;
        this.hasData = false;

        this.setupEventListeners();
        this.loadInitialCity();

        document.addEventListener('wv:cityselected', (e) => this.handleCitySelected(e.detail));
        document.addEventListener('wv:unitschange', () => this.refresh());
        document.addEventListener('wv:themechange', (e) => this.updateChartTheme(e.detail.isDark));
    }

    setupEventListeners() {
        const hourlyPrev = document.getElementById('hourlyPrev');
        const hourlyNext = document.getElementById('hourlyNext');
        const hourlyScroll = document.getElementById('hourlyScroll');
        if (hourlyPrev && hourlyScroll) {
            hourlyPrev.addEventListener('click', () => hourlyScroll.scrollBy({ left: -260, behavior: 'smooth' }));
        }
        if (hourlyNext && hourlyScroll) {
            hourlyNext.addEventListener('click', () => hourlyScroll.scrollBy({ left: 260, behavior: 'smooth' }));
        }
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
        if (this.wv.isLoading) return;
        try {
            this.wv.setLoading(true);
            this.setSkeletonsVisible(true);

            const params = detail.city
                ? { city: detail.city, units: this.wv.currentUnits }
                : { lat: detail.lat, lon: detail.lon, units: this.wv.currentUnits };

            const [currentData, forecastData] = await Promise.all([
                this.wv.fetchCurrentWeather(params),
                this.wv.fetchForecast(params)
            ]);

            this.wv.setLastCity(currentData.city);
            this.hasData = true;
            this.showSections();
            this.displayHourlyForecast(forecastData);
            this.displayDailyForecast(forecastData);
            this.displayDetails(currentData);
            this.createChart(forecastData);

            if (currentData.lat && currentData.lon) {
                try {
                    const airQualityData = await this.wv.fetchAirQuality(currentData.lat, currentData.lon);
                    this.displayAirQuality(airQualityData);
                } catch (error) {
                    console.warn('Air quality data unavailable:', error);
                    this.displayAirQualityUnavailable();
                }
            } else {
                this.displayAirQualityUnavailable();
            }
        } catch (error) {
            this.wv.showError(error.message);
        } finally {
            this.wv.setLoading(false);
            this.setSkeletonsVisible(false);
        }
    }

    showSections() {
        const emptyState = document.getElementById('forecastEmptyState');
        if (emptyState) emptyState.style.display = 'none';
        ['hourlySection', 'dailySection', 'detailsSection', 'chartSection'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
    }

    setSkeletonsVisible(loading) {
        const skeletons = { heroSkeleton: 'flex', hourlySkeleton: 'flex', dailySkeleton: 'flex', detailsSkeleton: 'grid' };
        const sectionIds = ['hourlySection', 'dailySection', 'detailsSection'];

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
            if (!this.hasData) {
                sectionIds.forEach(id => {
                    const section = document.getElementById(id);
                    if (section) section.style.display = 'none';
                });
                const emptyState = document.getElementById('forecastEmptyState');
                if (emptyState) emptyState.style.display = 'flex';
            }
        }
    }

    displayHourlyForecast(data) {
        const hourlyScroll = document.getElementById('hourlyScroll');
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
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
                    <i class="wv-hourly-item__icon fas ${this.wv.getWeatherIconClass(hour.icon)}" aria-hidden="true"></i>
                    <span class="wv-hourly-item__temp">${Math.round(hour.temp)}${tempUnit}</span>
                    ${precip > 0 ? `<span class="wv-hourly-item__precip"><i class="fas fa-tint" aria-hidden="true"></i>${precip}%</span>` : ''}
                </div>
            `;
        }).join('');
    }

    displayDailyForecast(data) {
        const dailyForecast = document.getElementById('dailyForecast');
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
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
            return `
                <div class="wv-daily-item" role="listitem">
                    <div class="wv-daily-item__day ${isToday ? 'text-primary' : ''}">${dayName}</div>
                    <div class="wv-daily-item__icon"><i class="fas ${this.wv.getWeatherIconClass(day.icon)}" aria-hidden="true"></i></div>
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
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
        const windUnit = this.wv.currentUnits === 'imperial' ? 'mph' : 'm/s';
        const dewPoint = data.dew_point || Math.round(data.temp - ((100 - data.humidity) / 5));
        const windGust = data.wind_gust || Math.round(data.wind_speed * 1.5);
        const seaLevel = data.sea_level || data.pressure;

        const details = [
            { id: 'aqi', icon: 'fa-lungs', title: 'Air Quality', value: '--', subtitle: 'Loading...', extra: [], className: 'wv-detail-card--aqi' },
            { id: 'humidity', icon: 'fa-tint', title: 'Humidity', value: `${data.humidity}%`, subtitle: data.humidity > 70 ? 'High' : data.humidity > 40 ? 'Moderate' : 'Low', extra: [{ label: 'Dew Point', value: `${dewPoint}${tempUnit}` }] },
            { id: 'uv', icon: 'fa-sun', title: 'UV Index', value: data.uvi ? data.uvi.toFixed(1) : 'N/A', subtitle: data.uvi ? this.wv.getUVDescription(data.uvi) : 'Not available', extra: data.uvi ? [{ label: 'Risk Level', value: this.wv.getUVDescription(data.uvi) }] : [] },
            { id: 'wind', icon: 'fa-wind', title: 'Wind', value: `${data.wind_speed} ${windUnit}`, subtitle: `${data.wind_deg}° ${this.wv.getWindDirection(data.wind_deg)}`, extra: [{ label: 'Gusts', value: `${windGust} ${windUnit}` }] },
            { id: 'pressure', icon: 'fa-compress-arrows-alt', title: 'Pressure', value: `${data.pressure} hPa`, subtitle: data.pressure > 1013 ? 'High' : data.pressure < 1013 ? 'Low' : 'Normal', extra: [{ label: 'Sea Level', value: `${seaLevel} hPa` }] },
            { id: 'visibility', icon: 'fa-eye', title: 'Visibility', value: `${data.visibility} km`, subtitle: data.visibility >= 10 ? 'Excellent' : data.visibility >= 5 ? 'Good' : 'Reduced', extra: [{ label: 'Cloud Cover', value: `${data.clouds}%` }] },
            { id: 'sunrise', icon: 'fa-sun', title: 'Sunrise', value: data.sunrise ? new Date(data.sunrise * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--', subtitle: 'Today', extra: [] },
            { id: 'sunset', icon: 'fa-moon', title: 'Sunset', value: data.sunset ? new Date(data.sunset * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--', subtitle: 'Today', extra: [] }
        ];

        detailsGrid.innerHTML = details.map(detail => `
            <article class="wv-detail-card ${detail.className || ''}" role="listitem">
                <header class="wv-detail-card__header">
                    <div class="wv-detail-card__icon" aria-hidden="true"><i class="fas ${detail.icon}"></i></div>
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

    displayAirQuality(airData) {
        const aqiValueEl = document.getElementById('detail-aqi-value');
        const aqiSubtitleEl = document.getElementById('detail-aqi-subtitle');
        const aqiBarFill = document.getElementById('aqi-bar-fill');
        if (!aqiValueEl || !aqiSubtitleEl) return;

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

        const styles = getComputedStyle(document.documentElement);
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#666666';
        const gridColor = isDark ? '#404040' : '#e0e0e0';
        // Chart.js/canvas can't resolve CSS custom properties, so these must
        // be read as computed values, not passed through as literal
        // 'var(--...)' strings (which canvas silently fails to render).
        const accentColor = styles.getPropertyValue('--wv-color-accent').trim();
        const warningColor = styles.getPropertyValue('--wv-color-warning').trim();
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';

        const hourlyData = data.hourly_forecast?.slice(0, 48) || [];
        const labels = hourlyData.map(h => new Date(h.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }));
        const temps = hourlyData.map(h => Math.round(h.temp));
        const feelsLike = hourlyData.map(h => Math.round(h.feels_like));

        if (this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: `Temperature (${tempUnit})`,
                        data: temps,
                        borderColor: accentColor,
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointBackgroundColor: accentColor,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: `Feels Like (${tempUnit})`,
                        data: feelsLike,
                        borderColor: warningColor,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [8, 4],
                        fill: false,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointBackgroundColor: warningColor,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        display: true, position: 'top', align: 'end',
                        labels: { color: textColor, font: { family: 'var(--wv-font-sans)', size: 12 }, usePointStyle: true, padding: 20 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)', titleColor: '#fff', bodyColor: '#fff',
                        borderColor: gridColor, borderWidth: 1, padding: 12, displayColors: true,
                        callbacks: { label: (context) => `${context.dataset.label}: ${context.raw}${tempUnit}` }
                    }
                },
                scales: {
                    x: { grid: { color: gridColor, drawBorder: false }, ticks: { color: textColor, font: { family: 'var(--wv-font-sans)', size: 11 }, maxTicksLimit: 8 } },
                    y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: textColor, font: { family: 'var(--wv-font-sans)', size: 11 }, callback: (value) => `${value}${tempUnit}` } }
                }
            }
        });
    }

    updateChartTheme(isDark) {
        if (!this.chart) return;
        const styles = getComputedStyle(document.documentElement);
        const textColor = isDark ? '#ffffff' : '#666666';
        const gridColor = isDark ? '#404040' : '#e0e0e0';
        const accentColor = styles.getPropertyValue('--wv-color-accent').trim();
        const warningColor = styles.getPropertyValue('--wv-color-warning').trim();

        this.chart.options.scales.x.ticks.color = textColor;
        this.chart.options.scales.y.ticks.color = textColor;
        this.chart.options.scales.x.grid.color = gridColor;
        this.chart.options.scales.y.grid.color = gridColor;
        this.chart.options.plugins.legend.labels.color = textColor;
        this.chart.data.datasets[0].borderColor = accentColor;
        this.chart.data.datasets[0].pointBackgroundColor = accentColor;
        this.chart.data.datasets[1].borderColor = warningColor;
        this.chart.data.datasets[1].pointBackgroundColor = warningColor;
        this.chart.update();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.forecastPage = new ForecastPage(window.wv);
});
