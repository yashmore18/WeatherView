/**
 * WeatherView - AI Summary page
 * Fetches the same current/forecast/air-quality data every other page
 * uses, runs it through static/js/ai-summary-engine.js, and reveals the
 * result as a staggered fade-in narrative instead of dumping it all in at
 * once - the point is a moment of "reading it think", not just another
 * instant data table.
 */
class AiSummaryPage {
    constructor(wv) {
        this.wv = wv;
        this.chart = null;
        this.loadInitialCity();

        document.addEventListener('wv:cityselected', (e) => this.handleCitySelected(e.detail));
        document.addEventListener('wv:unitschange', () => this.refresh());
        document.addEventListener('wv:themechange', () => { if (this.chart) this.updateChartTheme(); });
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
        const skeleton = document.getElementById('aiSummarySkeleton');
        const card = document.getElementById('aiSummaryCard');
        const emptyState = document.getElementById('aiSummaryEmptyState');
        if (emptyState) emptyState.style.display = 'none';
        if (card) card.style.display = 'none';
        if (skeleton) skeleton.style.display = 'flex';

        try {
            const params = detail.city
                ? { city: detail.city, units: this.wv.currentUnits }
                : { lat: detail.lat, lon: detail.lon, units: this.wv.currentUnits };

            const [current, forecast] = await Promise.all([
                this.wv.fetchCurrentWeather(params),
                this.wv.fetchForecast(params)
            ]);
            this.wv.setLastCity(current.city);
            this.wv.applySceneIcon(current.icon);

            const airQuality = (current.lat && current.lon)
                ? await this.wv.fetchAirQuality(current.lat, current.lon).catch(() => null)
                : null;

            const prefs = this.getAlertPrefs();
            const alerts = window.WVAlerts
                ? window.WVAlerts.computeAlerts(current, forecast, airQuality, prefs, this.wv.currentUnits)
                : [];

            const summary = window.WVAISummary.generateSummary(current, forecast, airQuality, alerts, this.wv.currentUnits);
            this.render(summary);
        } catch (error) {
            this.wv.showError(error.message);
            if (emptyState) emptyState.style.display = 'flex';
        } finally {
            if (skeleton) skeleton.style.display = 'none';
        }
    }

    getAlertPrefs() {
        try {
            return JSON.parse(localStorage.getItem('wv_alertPrefs') || '{}');
        } catch {
            return {};
        }
    }

    render(summary) {
        const card = document.getElementById('aiSummaryCard');
        if (!card) return;
        card.style.display = 'block';

        const confidenceEl = document.getElementById('aiSummaryConfidence');
        const confidenceLabels = { high: 'High confidence', medium: 'Medium confidence', low: 'Building confidence' };
        confidenceEl.textContent = confidenceLabels[summary.confidence] || '';
        confidenceEl.className = `wv-ai-summary__confidence wv-ai-summary__confidence--${summary.confidence}`;

        const headlineEl = document.getElementById('aiSummaryHeadline');
        headlineEl.textContent = summary.headline;
        headlineEl.classList.remove('wv-ai-fade-in');
        // Force reflow so re-triggering the animation on a repeat search
        // actually restarts it instead of silently no-op'ing.
        void headlineEl.offsetWidth;
        headlineEl.classList.add('wv-ai-fade-in');

        const paragraphsEl = document.getElementById('aiSummaryParagraphs');
        paragraphsEl.innerHTML = summary.paragraphs.map((p, i) => `
            <p class="wv-ai-summary__paragraph" style="animation-delay: ${300 + i * 220}ms">${this.wv.escapeHtml(p)}</p>
        `).join('');

        const statsEl = document.getElementById('aiSummaryStats');
        const statsDelay = 300 + summary.paragraphs.length * 220;
        statsEl.innerHTML = summary.stats.map((s, i) => `
            <div class="wv-ai-summary__stat" style="animation-delay: ${statsDelay + i * 100}ms">
                <span class="wv-ai-summary__stat-value">${this.wv.escapeHtml(s.value)}</span>
                <span class="wv-ai-summary__stat-label">${this.wv.escapeHtml(s.label)}</span>
            </div>
        `).join('');

        this.renderChart(summary.chart, statsDelay + summary.stats.length * 100 + 200);
    }

    renderChart(chartData, revealDelayMs) {
        const wrap = document.querySelector('.wv-ai-summary__chart-wrap');
        const ctx = document.getElementById('aiSummaryChart');
        if (!ctx || typeof Chart === 'undefined') return;

        if (wrap) {
            wrap.style.opacity = '0';
            setTimeout(() => { wrap.style.transition = 'opacity 500ms ease'; wrap.style.opacity = '1'; }, revealDelayMs);
        }

        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#171717';
        const gridColor = isDark ? '#404040' : '#a3a3a3';
        const styles = getComputedStyle(document.documentElement);
        const accentColor = styles.getPropertyValue('--wv-color-accent').trim();

        if (this.chart) this.chart.destroy();
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    data: chartData.temps,
                    borderColor: accentColor,
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: accentColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
                }
            }
        });
    }

    updateChartTheme() {
        if (!this.chart) return;
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#171717';
        const gridColor = isDark ? '#404040' : '#a3a3a3';
        this.chart.options.scales.x.ticks.color = textColor;
        this.chart.options.scales.y.ticks.color = textColor;
        this.chart.options.scales.y.grid.color = gridColor;
        this.chart.update();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.aiSummaryPage = new AiSummaryPage(window.wv);
});
