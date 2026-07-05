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
        this.setupProfileName();
        this.setupPushToggle();
        this.setupClearCache();
    }

    setupClearCache() {
        const btn = document.getElementById('clearCacheBtn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            const confirmed = window.confirm(
                "This resets units, favorites, dark mode, your name, alert preferences, and push " +
                "notifications back to defaults, and clears the offline cache. This can't be undone " +
                "- only continue if you're actually running into an issue.\n\nClear cache and reset now?"
            );
            if (!confirmed) return;

            btn.disabled = true;
            try {
                // Best-effort: an active push subscription left behind after
                // localStorage is wiped would still receive pushes with no
                // way for the (now blank) UI to turn it back off.
                if (window.WVPush) {
                    await window.WVPush.unsubscribe().catch(() => {});
                }

                localStorage.clear();
                sessionStorage.clear();

                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(key => caches.delete(key)));
                }
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map(r => r.unregister()));
                }
            } finally {
                // Reload regardless of whether every cleanup step above
                // succeeded - a partial clear plus a fresh load is still
                // better than leaving the button in a disabled dead-end state.
                window.location.href = '/';
            }
        });
    }

    async setupPushToggle() {
        const toggle = document.getElementById('pushToggle');
        const hint = document.getElementById('pushHint');
        if (!toggle) return;

        if (!window.WVPush || !window.WVPush.isSupported()) {
            toggle.disabled = true;
            if (hint) hint.textContent = 'Push notifications are not supported in this browser.';
            return;
        }

        try {
            const existing = await window.WVPush.getCurrentSubscription();
            toggle.checked = !!existing;
        } catch {
            toggle.checked = false;
        }

        toggle.addEventListener('change', async (e) => {
            const wantsOn = e.target.checked;
            toggle.disabled = true;
            try {
                if (wantsOn) {
                    const resolved = this.wv.getResolvedCity();
                    if (!resolved) {
                        throw new Error('Search a city first, then turn this on to watch it for abrupt changes.');
                    }
                    // Push subscriptions are watched by lat/lon server-side,
                    // so a plain city name needs resolving to coordinates
                    // (and its canonical display name) first.
                    const params = resolved.city
                        ? { city: resolved.city, units: this.wv.currentUnits }
                        : { lat: resolved.lat, lon: resolved.lon, units: this.wv.currentUnits };
                    const data = await this.wv.fetchCurrentWeather(params);
                    await window.WVPush.subscribe({ city: data.city, lat: data.lat, lon: data.lon }, this.wv.currentUnits);
                    this.wv.showSuccess(`Watching ${data.city} for abrupt weather changes`);
                } else {
                    await window.WVPush.unsubscribe();
                    this.wv.showSuccess('Push notifications turned off');
                }
            } catch (error) {
                toggle.checked = !wantsOn;
                this.wv.showError(error.message);
            } finally {
                toggle.disabled = false;
            }
        });
    }

    setupProfileName() {
        const form = document.getElementById('profileNameForm');
        const input = document.getElementById('profileNameInput');
        const clearBtn = document.getElementById('profileNameClear');
        if (!form || !input || !clearBtn) return;

        input.value = this.wv.getUserName() || '';

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.wv.setUserName(input.value);
            this.wv.showSuccess(input.value.trim() ? 'Name saved' : 'Name cleared');
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            this.wv.setUserName(null);
            this.wv.showSuccess('Name cleared');
        });
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
