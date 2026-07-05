/**
 * WeatherView - Locations page
 * Favorite cities list and a live comparison grid of their current conditions.
 */
class LocationsPage {
    constructor(wv) {
        this.wv = wv;
        this.lastCompare = null;
        this.setupEventListeners();
        this.renderFavorites();
        this.prefillCompareForm();

        document.addEventListener('wv:favoriteschange', () => this.renderFavorites());
        document.addEventListener('wv:unitschange', () => {
            if (this.lastCompare) this.runCompare(this.lastCompare.cityA, this.lastCompare.cityB);
        });
        // Searching from this page still adds the searched city to favorites
        // in place - it doesn't navigate away, since favorites/comparison are
        // this page's whole purpose.
        document.addEventListener('wv:cityselected', (e) => this.handleCitySearched(e.detail));
    }

    setupEventListeners() {
        const manageFavorites = document.getElementById('manageFavorites');
        if (manageFavorites) {
            manageFavorites.addEventListener('click', () => {
                const cities = this.wv.favorites.join('\n') || 'None';
                alert(`Favorite Cities:\n${cities}\n\nClick the × on any chip to remove.`);
            });
        }

        const compareForm = document.getElementById('compareForm');
        if (compareForm) {
            compareForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const cityA = document.getElementById('compareCityA').value.trim();
                const cityB = document.getElementById('compareCityB').value.trim();
                if (cityA && cityB) this.runCompare(cityA, cityB);
            });
        }
    }

    // If the user already has favorites, comparing the first two of them
    // needs zero typing - the tool starts useful immediately instead of
    // staring at an empty form.
    prefillCompareForm() {
        if (this.wv.favorites.length < 2) return;
        const inputA = document.getElementById('compareCityA');
        const inputB = document.getElementById('compareCityB');
        if (!inputA || !inputB) return;
        inputA.value = this.wv.favorites[0];
        inputB.value = this.wv.favorites[1];
        this.runCompare(this.wv.favorites[0], this.wv.favorites[1]);
    }

    async handleCitySearched(detail) {
        const cityName = detail.city || detail.name;
        if (!cityName) return;
        if (this.wv.favorites.includes(cityName)) return;
        this.wv.toggleFavorite(cityName);
        this.wv.showSuccess(`${cityName} added to favorites`);
    }

    renderFavorites() {
        const favoritesList = document.getElementById('favoritesList');
        if (!favoritesList) return;

        if (this.wv.favorites.length === 0) {
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

        favoritesList.innerHTML = this.wv.favorites.map(city => `
            <button class="wv-favorite-chip"
                    type="button"
                    data-city="${this.wv.escapeHtml(city)}"
                    aria-label="${this.wv.escapeHtml(city)} - tap to view weather">
                <span>${this.wv.escapeHtml(city)}</span>
                <button class="wv-favorite-chip__remove"
                        type="button"
                        data-remove-city="${this.wv.escapeHtml(city)}"
                        aria-label="Remove ${this.wv.escapeHtml(city)} from favorites">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </button>
        `).join('');

        favoritesList.querySelectorAll('.wv-favorite-chip__remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.wv.removeFavorite(btn.dataset.removeCity);
            });
        });
        favoritesList.querySelectorAll('.wv-favorite-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                window.location.href = `/?city=${encodeURIComponent(chip.dataset.city)}`;
            });
        });
    }

    async runCompare(cityA, cityB) {
        const result = document.getElementById('compareResult');
        const submitBtn = document.getElementById('compareSubmit');
        if (!result) return;

        this.lastCompare = { cityA, cityB };
        if (submitBtn) submitBtn.disabled = true;
        result.innerHTML = `
            <div class="wv-compare-columns">
                <div class="wv-comparison-card glass-card">
                    <div class="wv-skeleton wv-skeleton--text" style="width: 60%;"></div>
                    <div class="wv-skeleton wv-skeleton--block" style="height: 40px; margin-top: var(--wv-space-2);"></div>
                </div>
                <div class="wv-comparison-card glass-card">
                    <div class="wv-skeleton wv-skeleton--text" style="width: 60%;"></div>
                    <div class="wv-skeleton wv-skeleton--block" style="height: 40px; margin-top: var(--wv-space-2);"></div>
                </div>
            </div>
        `;

        try {
            const units = this.wv.currentUnits;
            const [dataA, dataB] = await Promise.all([
                this.wv.fetchCurrentWeather({ city: cityA, units }),
                this.wv.fetchCurrentWeather({ city: cityB, units })
            ]);
            const [aqiA, aqiB] = await Promise.all([
                this.wv.fetchAirQuality(dataA.lat, dataA.lon).catch(() => null),
                this.wv.fetchAirQuality(dataB.lat, dataB.lon).catch(() => null)
            ]);

            this.renderCompareResult(dataA, dataB, aqiA, aqiB);
        } catch (error) {
            result.innerHTML = `<p class="wv-comparison-empty">${this.wv.escapeHtml(error.message)}</p>`;
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    renderCompareResult(dataA, dataB, aqiA, aqiB) {
        const result = document.getElementById('compareResult');
        if (!result || !window.WVCompare) return;

        const units = this.wv.currentUnits;
        const tempUnit = units === 'imperial' ? '°F' : '°C';
        const windUnit = units === 'imperial' ? 'mph' : 'm/s';
        const aqiLabels = { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very Poor' };

        const column = (data, aqi) => `
            <div class="wv-comparison-card glass-card">
                <p class="wv-comparison-card__city">${this.wv.escapeHtml(data.city)}</p>
                <div class="wv-comparison-card__temp">
                    <i class="fas ${this.wv.getWeatherIconClass(data.icon)}" aria-hidden="true"></i>
                    ${Math.round(data.temp)}${tempUnit}
                </div>
                <p class="wv-comparison-card__desc">${this.wv.escapeHtml(data.description)}</p>
                <ul class="wv-compare-stats">
                    <li><span>Humidity</span><strong>${data.humidity}%</strong></li>
                    <li><span>Wind</span><strong>${data.wind_speed} ${windUnit}</strong></li>
                    <li><span>Air Quality</span><strong>${aqi && aqi.aqi ? aqiLabels[aqi.aqi] || 'Unknown' : 'N/A'}</strong></li>
                </ul>
            </div>
        `;

        const { analysis } = window.WVCompare.compareLocations(dataA, dataB, aqiA, aqiB, units);

        result.innerHTML = `
            <div class="wv-compare-columns">
                ${column(dataA, aqiA)}
                ${column(dataB, aqiB)}
            </div>
            <ul class="wv-compare-analysis">
                ${analysis.map(line => `<li><i class="fas fa-circle-info" aria-hidden="true"></i>${this.wv.escapeHtml(line)}</li>`).join('')}
            </ul>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.locationsPage = new LocationsPage(window.wv);
});
