/**
 * WeatherView - Smart Alerts engine
 *
 * Pure functions, no DOM - computed entirely from data the app already
 * fetches (hourly forecast, air quality, daily temps), so no new API calls
 * or backend service are needed. Each rule returns null when it doesn't
 * apply, or an alert object { id, severity, icon, title, message }.
 */

// toLocaleTimeString() renders in the *browser's* timezone, not the searched
// city's - for a city in a different zone than the viewer, that silently
// produces a wall-clock time that doesn't match the city at all (e.g. "2pm"
// shown to someone whose own local time is already 3pm). Shifting the UTC
// timestamp by the forecast's own timezone_offset before formatting, then
// rendering that shifted instant *as UTC*, yields the city's actual local
// clock time regardless of where the browser is.
function formatCityLocalTime(unixSeconds, timezoneOffsetSeconds = 0) {
    return new Date((unixSeconds + timezoneOffsetSeconds) * 1000).toLocaleTimeString('en-US', {
        hour: 'numeric', hour12: true, timeZone: 'UTC'
    });
}

// A bare clock time ("5:00 PM") with no date context reads as nonsensical
// once the target instant crosses into a different calendar day than "now"
// - e.g. "clearing around 5:00 PM" shown to someone whose city-local time is
// already 6:26 PM looks like it's in the past, when it's actually tomorrow
// afternoon. Comparing the two instants' calendar day *in the city's own
// shifted timezone* (not the browser's) decides whether to qualify the time
// with "today"/"tomorrow"/a weekday name.
function formatCityLocalMoment(unixSeconds, nowSeconds, timezoneOffsetSeconds = 0) {
    const shiftedTarget = new Date((unixSeconds + timezoneOffsetSeconds) * 1000);
    const shiftedNow = new Date((nowSeconds + timezoneOffsetSeconds) * 1000);
    const dayDiff = Math.round((Date.UTC(shiftedTarget.getUTCFullYear(), shiftedTarget.getUTCMonth(), shiftedTarget.getUTCDate())
        - Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate())) / 86400000);

    const time = formatCityLocalTime(unixSeconds, timezoneOffsetSeconds);
    if (dayDiff <= 0) return time;
    if (dayDiff === 1) return `tomorrow at ${time}`;
    const weekday = shiftedTarget.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    return `${weekday} at ${time}`;
}

// "141 minutes" reads as noise - round to the nearest 5 minutes and render
// as hours+minutes, dropping whichever unit is zero.
function formatDuration(totalMinutes) {
    const rounded = Math.max(5, Math.round(totalMinutes / 5) * 5);
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    if (hours === 0) return `${minutes} minutes`;
    if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
    return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minutes`;
}

function checkRainSoon(currentWeather, forecast) {
    const hourly = forecast?.hourly_forecast || [];
    if (hourly.length === 0) return null;

    // "Already raining" is read from current conditions' own icon (09/10 =
    // rain, 11 = thunderstorm), not by matching forecast bucket timestamps
    // against Date.now() - a few seconds of clock/network drift can shift
    // which 3-hourly bucket looks like "now", which made this check flaky.
    if (/^(09|10|11)/.test(currentWeather?.icon || '')) return null;

    const nowTs = Date.now() / 1000;
    const upcoming = hourly.filter(h => h.dt >= nowTs);
    const soonIndex = upcoming.findIndex(h => h.dt <= nowTs + 3 * 3600 && (h.pop || 0) >= 0.5);
    if (soonIndex === -1) return null;
    const soon = upcoming[soonIndex];

    // Confidence isn't a fixed label - it's read off how much of the
    // available forecast signal actually agrees. A lone bucket over
    // threshold with calmer buckets on either side is a much shakier call
    // than several consecutive buckets all pointing the same way, so the
    // wording says "possible"/"looks like" instead of a flatly confident
    // "likely" when the data itself doesn't back that certainty.
    const nextAgrees = upcoming[soonIndex + 1] ? (upcoming[soonIndex + 1].pop || 0) >= 0.5 : false;
    const confident = nextAgrees;

    const minutes = Math.max(0, Math.round((soon.dt - nowTs) / 60));
    const verb = confident ? 'likely' : 'possible';
    return {
        id: 'rain-soon',
        severity: 'info',
        icon: 'fa-cloud-rain',
        title: confident ? 'Rain likely soon' : 'Rain possible soon',
        message: minutes <= 5
            ? `Rain is ${verb} in the next few minutes.`
            : `Rain is ${verb} in about ${formatDuration(minutes)}.`
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

    // A single 3-hourly bucket dipping under 50% amid days of otherwise
    // continuous heavy rain is forecast noise, not a real end to the rain
    // event - confidently naming a "clearing" time from that one shaky
    // bucket is actively misleading (this is exactly what produced "rain
    // clearing Friday 2pm" during a multi-day monsoon spell that never
    // actually let up within the forecast window). Requiring 3 consecutive
    // buckets (9 hours) under the threshold confirms a real, sustained
    // break - 2 wasn't strict enough, since the dip that caused the bad
    // report above happened to be the *last two* buckets in the entire
    // 5-day window, "confirmed" only by there being no more data left to
    // contradict it, not by an actual multi-bucket lull.
    let clearsAtIndex = -1;
    for (let i = 0; i < upcoming.length - 2; i++) {
        if ((upcoming[i].pop || 0) < 0.5 && (upcoming[i + 1].pop || 0) < 0.5 && (upcoming[i + 2].pop || 0) < 0.5) {
            clearsAtIndex = i;
            break;
        }
    }

    if (clearsAtIndex === -1) {
        // No sustained break found anywhere in the forecast window - rain
        // is expected to persist beyond what the data can currently show,
        // which is itself useful to say plainly instead of pointing at an
        // unreliable single-bucket dip near the edge of the window.
        return {
            id: 'rain-ending',
            severity: 'warning',
            icon: 'fa-cloud-showers-heavy',
            title: 'Rain continuing',
            message: `No sustained break in the rain is showing up in the ${Math.round(hourly.length * 3 / 24)}-day forecast yet - check back as it updates.`
        };
    }

    const clearsAt = upcoming[clearsAtIndex];
    const minutes = Math.max(0, Math.round((clearsAt.dt - nowTs) / 60));
    const message = minutes <= 30
        ? 'Rain should clear up within the hour.'
        : minutes <= 150
            ? `Rain should let up in about ${formatDuration(minutes)}.`
            : `Rain is expected to continue for a while, clearing ${formatCityLocalMoment(clearsAt.dt, nowTs, forecast.timezone_offset)}.`;

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

window.WVAlerts = { computeAlerts, checkRainSoon, checkRainEnding, checkAqiSpike, checkTempSwing, checkGoodWeather, formatDuration, formatCityLocalTime, formatCityLocalMoment };
