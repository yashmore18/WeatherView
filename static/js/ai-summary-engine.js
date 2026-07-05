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

function comfortDescriptor(temp, humidity, windSpeed, units) {
    const idealMin = units === 'imperial' ? 60 : 16;
    const idealMax = units === 'imperial' ? 77 : 25;
    const windCalmMax = units === 'imperial' ? 11 : 5;

    if (temp < idealMin - 8 || temp > idealMax + 10) return 'extreme';
    if (temp < idealMin || temp > idealMax) return 'uncomfortable';
    if (humidity >= 80 || windSpeed >= windCalmMax * 1.6) return 'a bit uncomfortable';
    return 'pleasant';
}

function buildHeadline(current, units) {
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const comfort = comfortDescriptor(current.temp, current.humidity, current.wind_speed, units);
    return `${current.city} is ${current.description.toLowerCase()} at ${Math.round(current.temp)}${tempUnit} right now - conditions feel ${comfort}.`;
}

function buildParagraphs(current, forecast, airQuality, alerts, units) {
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const paragraphs = [];

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
    const comfort = comfortDescriptor(current.temp, current.humidity, current.wind_speed, units);
    const rainy = /^(09|10|11)/.test(current.icon || '');
    if (rainy) {
        paragraphs.push(`Recommendation: keep an umbrella handy and plan indoor alternatives where you can.`);
    } else if (comfort === 'pleasant') {
        paragraphs.push(`Recommendation: a genuinely good window to be outside today.`);
    } else if (comfort === 'extreme') {
        paragraphs.push(`Recommendation: limit time outdoors if possible - conditions are at an extreme today.`);
    } else {
        paragraphs.push(`Recommendation: outdoor plans are fine with a bit of preparation for the conditions above.`);
    }

    return paragraphs;
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

function generateSummary(current, forecast, airQuality, alerts, units = 'metric') {
    return {
        headline: buildHeadline(current, units),
        paragraphs: buildParagraphs(current, forecast, airQuality, alerts, units),
        stats: buildStats(current, units),
        confidence: computeConfidence(forecast),
        chart: buildChartSeries(forecast, units)
    };
}

window.WVAISummary = { generateSummary, comfortDescriptor, computeConfidence };
