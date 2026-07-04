/**
 * WeatherView - Locations page
 * Favorite cities list and a live comparison grid of their current conditions.
 */
class LocationsPage {
    constructor(wv) {
        this.wv = wv;
        this.setupEventListeners();
        this.renderFavorites();
        this.renderComparison();

        document.addEventListener('wv:favoriteschange', () => {
            this.renderFavorites();
            this.renderComparison();
        });
        document.addEventListener('wv:unitschange', () => this.renderComparison());
        // Searching from this page re-fetches the comparison grid in place -
        // it doesn't navigate away, since favorites/comparison are this
        // page's whole purpose.
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

    async renderComparison() {
        const grid = document.getElementById('comparisonGrid');
        if (!grid) return;

        if (this.wv.favorites.length === 0) {
            grid.innerHTML = '<p class="wv-comparison-empty">Add favorite cities above to compare their conditions here.</p>';
            return;
        }

        grid.innerHTML = this.wv.favorites.map(() => `
            <div class="wv-comparison-card glass-card">
                <div class="wv-skeleton wv-skeleton--text" style="width: 60%;"></div>
                <div class="wv-skeleton wv-skeleton--block" style="height: 40px; margin-top: var(--wv-space-2);"></div>
            </div>
        `).join('');

        const results = await Promise.allSettled(
            this.wv.favorites.map(city => this.wv.fetchCurrentWeather({ city, units: this.wv.currentUnits }))
        );

        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';
        grid.innerHTML = results.map((result, i) => {
            const city = this.wv.favorites[i];
            if (result.status !== 'fulfilled') {
                return `
                    <div class="wv-comparison-card glass-card">
                        <p class="wv-comparison-card__city">${this.wv.escapeHtml(city)}</p>
                        <p class="wv-comparison-card__desc">Unable to load</p>
                    </div>
                `;
            }
            const data = result.value;
            return `
                <div class="wv-comparison-card glass-card">
                    <p class="wv-comparison-card__city">${this.wv.escapeHtml(data.city)}</p>
                    <div class="wv-comparison-card__temp">
                        <i class="fas ${this.wv.getWeatherIconClass(data.icon)}" aria-hidden="true"></i>
                        ${Math.round(data.temp)}${tempUnit}
                    </div>
                    <p class="wv-comparison-card__desc">${data.description}</p>
                </div>
            `;
        }).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.locationsPage = new LocationsPage(window.wv);
});
