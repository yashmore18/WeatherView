/**
 * WeatherView - AI Summary engine
 *
 * Pure functions, no DOM. Despite the page's name, this is our own
 * rule-based algorithm reading the same current/forecast/air-quality/alert
 * data every other page already has - not a call to a third-party AI/LLM
 * service. It synthesizes that data into a short narrative (a handful of
 * plain sentences), a few headline stats, and a short temperature-trend
 * series for a chart, instead of leaving the reader to piece all of that
 * together themselves from separate pages.
 */

// Reads the lightweight, locally-stored personalization signal (see
// getUserPrefs() below) so comfort/recommendation thresholds can shift a
// little for someone who's told us they run hot or cold, instead of
// applying one fixed threshold to everyone.
function comfortDescriptor(temp, humidity, windSpeed, units, prefs = {}) {
    let idealMin = units === 'imperial' ? 60 : 16;
    let idealMax = units === 'imperial' ? 77 : 25;
    const windCalmMax = units === 'imperial' ? 11 : 5;
    const shift = units === 'imperial' ? 5 : 3;

    if (prefs.sensitivity === 'heat') idealMax -= shift;
    if (prefs.sensitivity === 'cold') idealMin += shift;

    if (temp < idealMin - 8 || temp > idealMax + 10) return 'extreme';
    if (temp < idealMin || temp > idealMax) return 'uncomfortable';
    if (humidity >= 80 || windSpeed >= windCalmMax * 1.6) return 'a bit uncomfortable';
    return 'pleasant';
}

// The one-time (editable) personalization signal, set from a short inline
// prompt on the AI Summary page and reusable from Settings. Deliberately
// small - a sensitivity leaning and whether outdoor plans are likely - so it
// stays genuinely quick to answer instead of turning into a form.
function getUserPrefs() {
    try {
        return JSON.parse(localStorage.getItem('wv_aiPrefs') || '{}');
    } catch {
        return {};
    }
}

function buildHeadline(current, units, prefs = {}) {
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const comfort = comfortDescriptor(current.temp, current.humidity, current.wind_speed, units, prefs);
    return `${current.city} is ${current.description.toLowerCase()} at ${Math.round(current.temp)}${tempUnit} right now - conditions feel ${comfort}.`;
}

function buildParagraphs(current, forecast, airQuality, alerts, units, prefs = {}) {
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const paragraphs = [];

    // Make the personalization prompt's effect visible every time it
    // actually applies, tied to today's real numbers - otherwise there's no
    // way to tell the stored preference is doing anything at all, since it
    // only ever nudges a threshold a few degrees and often won't flip the
    // comfort word itself for any given day.
    if (prefs.sensitivity === 'heat' || prefs.sensitivity === 'cold') {
        const shift = units === 'imperial' ? 5 : 3;
        const baseMax = units === 'imperial' ? 77 : 25;
        const baseMin = units === 'imperial' ? 60 : 16;
        if (prefs.sensitivity === 'heat') {
            paragraphs.push(`Personalized: since you said you get hot easily, we're calling it uncomfortable above ${baseMax - shift}${tempUnit} today for you, instead of the usual ${baseMax}${tempUnit}.`);
        } else {
            paragraphs.push(`Personalized: since you said you get cold easily, we're calling it uncomfortable below ${baseMin + shift}${tempUnit} today for you, instead of the usual ${baseMin}${tempUnit}.`);
        }
    }

    // Comfort breakdown - the "why" behind the headline's adjective.
    const parts = [];
    if (current.humidity >= 70) parts.push(`humidity is high at ${current.humidity}%`);
    else if (current.humidity <= 30) parts.push(`the air is quite dry at ${current.humidity}% humidity`);
    const windCalmMax = units === 'imperial' ? 11 : 5;
    if (current.wind_speed >= windCalmMax * 1.6) parts.push(`wind is noticeably strong at ${current.wind_speed} ${units === 'imperial' ? 'mph' : 'm/s'}`);
    if (Math.abs(current.feels_like - current.temp) >= 3) {
        parts.push(`it feels ${current.feels_like > current.temp ? 'warmer' : 'colder'} than the thermometer suggests (${Math.round(current.feels_like)}${tempUnit} feels-like)`);
    }
    if (parts.length > 0) {
        // Proper "A, B, and C" listing rather than "A, and B, and C".
        const listed = parts.length === 1
            ? parts[0]
            : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
        paragraphs.push(`Worth knowing: ${listed}.`);
    }

    // Forecast trend, reusing forecast-insights.js's own analysis so the
    // narrative here can never contradict what the Forecast page says.
    if (forecast?.daily_forecast?.length && window.WVForecastInsights) {
        const insights = window.WVForecastInsights.computeInsights(forecast.daily_forecast, units);
        if (insights.length > 0) {
            paragraphs.push(insights.map(i => i.message).join(' '));
        }
    }

    // Air quality, only if it's actually worth mentioning either way.
    if (airQuality?.aqi) {
        const aqiLabels = { 1: 'good', 2: 'fair', 3: 'moderate', 4: 'poor', 5: 'very poor' };
        const label = aqiLabels[airQuality.aqi] || 'unknown';
        if (airQuality.aqi >= 3) {
            paragraphs.push(`Air quality is ${label} today - consider limiting prolonged outdoor exertion if you're sensitive to it.`);
        } else {
            paragraphs.push(`Air quality is ${label}, so it's a fine day to be outside on that front.`);
        }
    }

    // Active alerts - surfaced here too since this page is meant to be the
    // one-stop summary, not just a duplicate of the Today page's banners.
    if (alerts && alerts.length > 0) {
        paragraphs.push(`Active right now: ${alerts.map(a => a.title.toLowerCase()).join(', ')}.`);
    }

    // Closing recommendation - the one-line "so what should I do" takeaway.
    const comfort = comfortDescriptor(current.temp, current.humidity, current.wind_speed, units, prefs);
    const rainy = /^(09|10|11)/.test(current.icon || '');
    if (rainy) {
        paragraphs.push(`Recommendation: keep an umbrella handy and plan indoor alternatives where you can.`);
    } else if (comfort === 'pleasant') {
        paragraphs.push(prefs.outdoorPlans === false
            ? `Recommendation: a genuinely good window to be outside today, if your plans change.`
            : `Recommendation: a genuinely good window to be outside today.`);
    } else if (comfort === 'extreme') {
        paragraphs.push(`Recommendation: limit time outdoors if possible - conditions are at an extreme today.`);
    } else {
        paragraphs.push(`Recommendation: outdoor plans are fine with a bit of preparation for the conditions above.`);
    }

    return paragraphs;
}

// Concrete, visual action items (icon + short label) rather than prose -
// the "carry an umbrella" / "wear sunscreen" / "stay indoors" style
// call-outs the app should surface, tailored a little by comfort and, where
// set, the user's own sensitivity/outdoor-plans preference.
function buildRecommendations(current, forecast, airQuality, alerts, units, prefs = {}) {
    const recs = [];
    const icon = current.icon || '';
    const rainy = /^(09|10|11)/.test(icon);
    const snowy = /^13/.test(icon);
    const clearOrFewClouds = /^(01|02)d$/.test(icon);
    const comfort = comfortDescriptor(current.temp, current.humidity, current.wind_speed, units, prefs);
    const hotThreshold = units === 'imperial' ? 75 : 24;
    const coldThreshold = units === 'imperial' ? 41 : 5;
    const windyThreshold = units === 'imperial' ? 22 : 10;

    const upcomingRain = (forecast?.hourly_forecast || []).slice(0, 6).some(h => (h.pop || 0) >= 0.4);
    if (rainy || upcomingRain) {
        recs.push({ icon: 'fa-umbrella', label: 'Bring an umbrella', text: rainy ? 'It\'s raining now.' : 'Rain likely in the next few hours.' });
    }
    if (clearOrFewClouds && current.temp >= hotThreshold) {
        recs.push({ icon: 'fa-sun', label: 'Wear sunscreen', text: 'Strong, direct sun with warm temperatures.' });
    }
    if (snowy || current.temp <= coldThreshold) {
        recs.push({ icon: 'fa-mitten', label: 'Bundle up', text: snowy ? 'Snow is falling.' : 'Cold enough for a warm layer.' });
    }
    if (current.wind_speed >= windyThreshold) {
        recs.push({ icon: 'fa-wind', label: 'Secure loose items', text: 'Wind is strong enough to matter outdoors.' });
    }
    const severeAlert = (alerts || []).some(a => a.severity === 'high' || a.severity === 'severe');
    if (comfort === 'extreme' || severeAlert || (airQuality?.aqi >= 4)) {
        recs.push({ icon: 'fa-house', label: 'Best to stay indoors', text: severeAlert ? 'An active severe alert is in effect.' : (airQuality?.aqi >= 4 ? 'Air quality is poor today.' : 'Conditions are at an extreme today.') });
    } else if (airQuality?.aqi === 3) {
        recs.push({ icon: 'fa-lungs', label: 'Limit prolonged exertion outside', text: 'Air quality is moderate today.' });
    }
    if (recs.length === 0) {
        recs.push({ icon: 'fa-circle-check', label: 'No special precautions needed', text: 'Conditions look ordinary today.' });
    }
    return recs;
}

function buildStats(current, units) {
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const windUnit = units === 'imperial' ? 'mph' : 'm/s';
    return [
        { label: 'Temperature', value: `${Math.round(current.temp)}${tempUnit}` },
        { label: 'Feels Like', value: `${Math.round(current.feels_like)}${tempUnit}` },
        { label: 'Humidity', value: `${current.humidity}%` },
        { label: 'Wind', value: `${current.wind_speed} ${windUnit}` }
    ];
}

// Confidence isn't decorative - it reflects how much of the available
// forecast signal actually agrees over the next 24h (mirrors the same
// reasoning used for the rain alerts: several consistent readings in a row
// are a stronger basis for a summary than one lone data point).
function computeConfidence(forecast) {
    const hourly = forecast?.hourly_forecast || [];
    if (hourly.length < 3) return 'low';
    const pops = hourly.slice(0, 4).map(h => h.pop || 0);
    const variance = Math.max(...pops) - Math.min(...pops);
    return variance <= 0.3 ? 'high' : 'medium';
}

function buildChartSeries(forecast, units) {
    const hourly = forecast?.hourly_forecast?.slice(0, 8) || [];
    const points = window.WVHourly ? window.WVHourly.interpolateHourly(hourly) : hourly;
    return {
        labels: points.map(h => new Date(h.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })),
        temps: points.map(h => Math.round(h.temp))
    };
}

function generateSummary(current, forecast, airQuality, alerts, units = 'metric', prefs = null) {
    const userPrefs = prefs || getUserPrefs();
    return {
        headline: buildHeadline(current, units, userPrefs),
        paragraphs: buildParagraphs(current, forecast, airQuality, alerts, units, userPrefs),
        recommendations: buildRecommendations(current, forecast, airQuality, alerts, units, userPrefs),
        stats: buildStats(current, units),
        confidence: computeConfidence(forecast),
        chart: buildChartSeries(forecast, units)
    };
}

window.WVAISummary = { generateSummary, comfortDescriptor, computeConfidence, getUserPrefs, buildRecommendations };
