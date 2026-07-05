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
            this.maybeShowPrefsPrompt();
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

        const recDelay = 300 + summary.paragraphs.length * 220;
        const recsEl = document.getElementById('aiSummaryRecommendations');
        if (recsEl) {
            recsEl.innerHTML = summary.recommendations.map((r, i) => `
                <div class="wv-ai-summary__rec" style="animation-delay: ${recDelay + i * 120}ms" title="${this.wv.escapeHtml(r.text)}">
                    <span class="wv-ai-summary__rec-icon" aria-hidden="true"><i class="fas ${r.icon}"></i></span>
                    <span class="wv-ai-summary__rec-label">${this.wv.escapeHtml(r.label)}</span>
                </div>
            `).join('');
        }

        const statsEl = document.getElementById('aiSummaryStats');
        const statsDelay = recDelay + summary.recommendations.length * 120;
        statsEl.innerHTML = summary.stats.map((s, i) => `
            <div class="wv-ai-summary__stat" style="animation-delay: ${statsDelay + i * 100}ms">
                <span class="wv-ai-summary__stat-value">${this.wv.escapeHtml(s.value)}</span>
                <span class="wv-ai-summary__stat-label">${this.wv.escapeHtml(s.label)}</span>
            </div>
        `).join('');

        this.renderChart(summary.chart, statsDelay + summary.stats.length * 100 + 200);
    }

    // A short, skippable, one-time (re-editable from Settings) prompt so the
    // summary's comfort/recommendation thresholds can reflect the reader
    // instead of one fixed baseline - the "self-learning" input the page
    // otherwise has no way to gather. Never blocks the summary itself.
    maybeShowPrefsPrompt() {
        if (localStorage.getItem('wv_aiPrefsPrompted')) return;
        const prompt = document.getElementById('aiSummaryPrefsPrompt');
        if (!prompt) return;
        prompt.style.display = 'flex';

        const save = (sensitivity) => {
            localStorage.setItem('wv_aiPrefs', JSON.stringify({ sensitivity }));
            localStorage.setItem('wv_aiPrefsPrompted', 'true');
            prompt.style.display = 'none';
            this.refresh();
            // Immediate, concrete confirmation that the answer actually did
            // something - the "Personalized:" line further down the summary
            // says the same thing, but that's easy to miss right after
            // clicking, and a shifted threshold that never flips the
            // comfort word on a given day would otherwise look like a no-op.
            if (sensitivity === 'heat') {
                this.wv.showSuccess("Got it - we'll call warm days uncomfortable a bit sooner for you.");
            } else if (sensitivity === 'cold') {
                this.wv.showSuccess("Got it - we'll call cool days uncomfortable a bit sooner for you.");
            } else {
                this.wv.showSuccess('Got it - using the default comfort thresholds.');
            }
        };
        prompt.querySelectorAll('[data-sensitivity]').forEach(btn => {
            btn.addEventListener('click', () => save(btn.dataset.sensitivity), { once: true });
        });
        const skip = prompt.querySelector('[data-skip]');
        if (skip) skip.addEventListener('click', () => {
            localStorage.setItem('wv_aiPrefsPrompted', 'true');
            prompt.style.display = 'none';
        }, { once: true });
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
        const tempUnit = this.wv.currentUnits === 'imperial' ? '°F' : '°C';

        if (this.chart) this.chart.destroy();
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: `Temperature (${tempUnit})`,
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
                plugins: {
                    legend: {
                        display: true, position: 'top', align: 'end',
                        labels: { color: textColor, font: { family: 'var(--wv-font-sans)', size: 12 }, usePointStyle: true, padding: 12 }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
                    y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, callback: (v) => `${v}${tempUnit}` } }
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
        this.chart.options.plugins.legend.labels.color = textColor;
        this.chart.update();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.aiSummaryPage = new AiSummaryPage(window.wv);
});
