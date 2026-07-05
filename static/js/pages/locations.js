/**
 * WeatherView - Locations page
 * Favorite cities list and a live comparison grid of their current conditions.
 */
class LocationsPage {
    constructor(wv) {
        this.wv = wv;
        this.lastCompare = null;
        // Set only when the user picks a specific suggestion from the
        // dropdown (lat/lon), not just typed text - lets the compare fetch
        // that exact place instead of re-searching by name, which matters
        // most for small/local towns where a plain name is ambiguous.
        this.selectionA = null;
        this.selectionB = null;
        this.setupEventListeners();
        this.renderFavorites();
        this.setupCompareAutocomplete('compareCityA', 'compareDropdownA', 'A');
        this.setupCompareAutocomplete('compareCityB', 'compareDropdownB', 'B');
        this.prefillCompareForm();

        document.addEventListener('wv:favoriteschange', () => this.renderFavorites());
        document.addEventListener('wv:unitschange', () => {
            if (this.lastCompare) this.runCompare(this.lastCompare.locA, this.lastCompare.locB);
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
                const inputA = document.getElementById('compareCityA').value.trim();
                const inputB = document.getElementById('compareCityB').value.trim();
                const locA = this.selectionA || inputA;
                const locB = this.selectionB || inputB;
                if (inputA && inputB) this.runCompare(locA, locB);
            });
        }
    }

    // Small, self-contained autocomplete (debounced search -> dropdown ->
    // pick) wired to one compare input at a time - mirrors the header
    // search's behavior/API (/api/locations/search) without depending on
    // its fixed element IDs, since this page needs two independent instances.
    setupCompareAutocomplete(inputId, dropdownId, slot) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        if (!input || !dropdown) return;
        let debounceTimer = null;

        input.addEventListener('input', () => {
            this[`selection${slot}`] = null;
            clearTimeout(debounceTimer);
            const query = input.value.trim();
            if (query.length < 2) {
                dropdown.classList.remove('show');
                dropdown.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(async () => {
                try {
                    const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);
                    if (!response.ok) throw new Error('Search failed');
                    const locations = await response.json();
                    this.renderCompareDropdown(dropdown, locations, slot);
                } catch (error) {
                    dropdown.classList.remove('show');
                }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${dropdownId}`)) {
                dropdown.classList.remove('show');
            }
        });
    }

    renderCompareDropdown(dropdown, locations, slot) {
        if (!locations || locations.length === 0) {
            dropdown.innerHTML = `<div class="wv-search__no-results"><i class="fas fa-map-marker-alt" aria-hidden="true"></i><span>No locations found</span></div>`;
            dropdown.classList.add('show');
            return;
        }
        dropdown.innerHTML = locations.map((loc, i) => `
            <button class="dropdown-item" type="button" data-index="${i}">
                <div>
                    <div class="fw-semibold">${this.wv.escapeHtml(loc.name)}</div>
                    <small>${this.wv.escapeHtml(loc.state)} ${this.wv.escapeHtml(loc.country)}</small>
                </div>
                <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
            </button>
        `).join('');
        dropdown.classList.add('show');

        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const loc = locations[parseInt(item.dataset.index, 10)];
                const inputId = slot === 'A' ? 'compareCityA' : 'compareCityB';
                document.getElementById(inputId).value = loc.display_name;
                this[`selection${slot}`] = { lat: loc.lat, lon: loc.lon, name: loc.display_name };
                dropdown.classList.remove('show');
            });
        });
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

    // locA/locB accept either a plain city name (string, typed with no
    // suggestion picked) or a { lat, lon, name } object (a specific
    // suggestion was picked) - the latter fetches that exact place instead
    // of re-searching by name, which matters for disambiguating small/local
    // towns that share a name with somewhere bigger.
    async runCompare(locA, locB) {
        const result = document.getElementById('compareResult');
        const submitBtn = document.getElementById('compareSubmit');
        if (!result) return;

        this.lastCompare = { locA, locB };
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
            const toParams = (loc) => typeof loc === 'string'
                ? { city: loc, units }
                : { lat: loc.lat, lon: loc.lon, units };
            const [dataA, dataB] = await Promise.all([
                this.wv.fetchCurrentWeather(toParams(locA)),
                this.wv.fetchCurrentWeather(toParams(locB))
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
