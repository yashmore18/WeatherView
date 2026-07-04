/**
 * WeatherView - Smart Alerts engine
 *
 * Pure functions, no DOM - computed entirely from data the app already
 * fetches (hourly forecast, air quality, daily temps), so no new API calls
 * or backend service are needed. Each rule returns null when it doesn't
 * apply, or an alert object { id, severity, icon, title, message }.
 */

function checkRainSoon(currentWeather, forecast) {
    const hourly = forecast?.hourly_forecast || [];
    if (hourly.length === 0) return null;

    // "Already raining" is read from current conditions' own icon (09/10 =
    // rain, 11 = thunderstorm), not by matching forecast bucket timestamps
    // against Date.now() - a few seconds of clock/network drift can shift
    // which 3-hourly bucket looks like "now", which made this check flaky.
    if (/^(09|10|11)/.test(currentWeather?.icon || '')) return null;

    const nowTs = Date.now() / 1000;
    const soon = hourly.find(h => h.dt >= nowTs && h.dt <= nowTs + 3 * 3600 && (h.pop || 0) >= 0.5);
    if (!soon) return null;

    const minutes = Math.max(0, Math.round((soon.dt - nowTs) / 60));
    return {
        id: 'rain-soon',
        severity: 'info',
        icon: 'fa-cloud-rain',
        title: 'Rain likely soon',
        message: minutes <= 5
            ? 'Rain is likely in the next few minutes.'
            : `Rain is likely in about ${minutes} minutes.`
    };
}

function checkRainEnding(currentWeather, forecast) {
    const hourly = forecast?.hourly_forecast || [];
    if (hourly.length === 0) return null;

    // Mirrors checkRainSoon's use of the current-conditions icon (rather than
    // matching a forecast bucket to "now") to decide if it's raining right now.
    if (!/^(09|10|11)/.test(currentWeather?.icon || '')) return null;

    const nowTs = Date.now() / 1000;
    const upcoming = hourly.filter(h => h.dt >= nowTs);
    const clearsAt = upcoming.find(h => (h.pop || 0) < 0.5);
    if (!clearsAt) return null;

    const minutes = Math.max(0, Math.round((clearsAt.dt - nowTs) / 60));
    const message = minutes <= 30
        ? 'Rain should clear up within the hour.'
        : minutes <= 90
            ? `Rain should let up in about ${Math.round(minutes / 60 * 2) / 2} hours.`
            : `Rain is expected to continue for a few more hours, clearing around ${new Date(clearsAt.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })}.`;

    return {
        id: 'rain-ending',
        severity: 'info',
        icon: 'fa-cloud-sun-rain',
        title: 'Rain letting up',
        message
    };
}

function checkGoodWeather(currentWeather, forecast, airQuality, units) {
    if (!currentWeather) return null;

    const isClear = /^(01|02)/.test(currentWeather.icon || '');
    if (!isClear) return null;

    // Already covered by more specific/urgent alerts - a "great day" banner
    // shouldn't show alongside an active rain or AQI warning.
    if (checkRainSoon(currentWeather, forecast)) return null;
    if (airQuality && airQuality.aqi >= 3) return null;

    const comfyMin = units === 'imperial' ? 55 : 13;
    const comfyMax = units === 'imperial' ? 82 : 28;
    if (currentWeather.temp < comfyMin || currentWeather.temp > comfyMax) return null;

    return {
        id: 'good-weather',
        severity: 'info',
        icon: 'fa-sun',
        title: 'Great day to be outside',
        message: `Clear skies and a comfortable ${Math.round(currentWeather.temp)}°${units === 'imperial' ? 'F' : 'C'} right now.`
    };
}

function checkAqiSpike(airQuality) {
    if (!airQuality || !airQuality.aqi) return null;
    const aqi = airQuality.aqi;
    if (aqi < 4) return null;
    return {
        id: 'aqi-spike',
        severity: aqi === 5 ? 'error' : 'warning',
        icon: 'fa-lungs',
        title: 'Air quality alert',
        message: `Air quality is ${airQuality.aqi_description || 'poor'} today - consider limiting outdoor activity.`
    };
}

function checkTempSwing(forecast, units) {
    const daily = forecast?.daily_forecast || [];
    if (daily.length < 2) return null;

    const frostThreshold = units === 'imperial' ? 32 : 0;
    const swingThreshold = units === 'imperial' ? 14 : 8;

    const frostDay = daily.slice(0, 2).find(d => d.temp_min <= frostThreshold);
    if (frostDay) {
        return {
            id: 'frost-warning',
            severity: 'warning',
            icon: 'fa-snowflake',
            title: 'Frost warning',
            message: `Temperatures may drop to freezing (${Math.round(frostDay.temp_min)}°${units === 'imperial' ? 'F' : 'C'}) soon.`
        };
    }

    const drop = daily[0].temp_min - daily[1].temp_min;
    if (drop >= swingThreshold) {
        return {
            id: 'frost-warning',
            severity: 'warning',
            icon: 'fa-temperature-low',
            title: 'Big temperature swing',
            message: `Tomorrow's low is about ${Math.round(drop)}° colder than today's.`
        };
    }

    return null;
}

/**
 * @param {object|null} currentWeather
 * @param {object|null} forecast
 * @param {object|null} airQuality
 * @param {object} [prefs] - { rain, aqi, frost } booleans, default true
 * @param {string} [units] - 'metric' | 'imperial'
 */
function computeAlerts(currentWeather, forecast, airQuality, prefs = {}, units = 'metric') {
    const alerts = [];
    if (prefs.rain !== false) {
        const a = checkRainSoon(currentWeather, forecast);
        if (a) alerts.push(a);
        const b = checkRainEnding(currentWeather, forecast);
        if (b) alerts.push(b);
    }
    if (prefs.aqi !== false) {
        const a = checkAqiSpike(airQuality);
        if (a) alerts.push(a);
    }
    if (prefs.frost !== false) {
        const a = checkTempSwing(forecast, units);
        if (a) alerts.push(a);
    }
    if (prefs.goodWeather !== false) {
        const a = checkGoodWeather(currentWeather, forecast, airQuality, units);
        if (a) alerts.push(a);
    }
    return alerts;
}

window.WVAlerts = { computeAlerts, checkRainSoon, checkRainEnding, checkAqiSpike, checkTempSwing, checkGoodWeather };
