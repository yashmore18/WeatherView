/**
 * WeatherView - Settings page
 * Units/theme mirror the header controls (single source of truth in wv-shared's
 * localStorage keys); alert preferences are read by pages/today.js's alert engine.
 */
class SettingsPage {
    constructor(wv) {
        this.wv = wv;
        this.setupUnitsToggle();
        this.setupThemeToggle();
        this.setupAlertPrefs();
    }

    setupUnitsToggle() {
        const toggle = document.getElementById('settingsUnitsToggle');
        if (!toggle) return;
        toggle.checked = this.wv.currentUnits === 'imperial';
        toggle.addEventListener('change', (e) => {
            this.wv.toggleUnits(e.target.checked);
            const headerToggle = document.getElementById('unitsToggle');
            if (headerToggle) headerToggle.checked = e.target.checked;
        });
    }

    setupThemeToggle() {
        const toggle = document.getElementById('settingsThemeToggle');
        if (!toggle) return;
        toggle.checked = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        toggle.addEventListener('change', (e) => this.wv.applyDarkMode(e.target.checked));
    }

    setupAlertPrefs() {
        const prefs = this.getAlertPrefs();
        const map = { rain: 'alertPrefRain', aqi: 'alertPrefAqi', frost: 'alertPrefFrost', goodWeather: 'alertPrefGoodWeather' };
        Object.entries(map).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.checked = prefs[key] !== false;
            el.addEventListener('change', () => {
                const updated = this.getAlertPrefs();
                updated[key] = el.checked;
                localStorage.setItem('wv_alertPrefs', JSON.stringify(updated));
            });
        });
    }

    getAlertPrefs() {
        try {
            return JSON.parse(localStorage.getItem('wv_alertPrefs') || '{}');
        } catch {
            return {};
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.settingsPage = new SettingsPage(window.wv);
});
