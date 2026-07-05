/**
 * WeatherView - Location Compare engine
 *
 * Pure functions, no DOM - turns two cities' current-weather (+ optional air
 * quality) payloads into a dynamic, holistic comparison: not just a list of
 * independent stat deltas, but an overall verdict on which location is more
 * pleasant right now and why, plus a condition-level comparison (rain vs
 * clear, etc.), with the granular stat breakdown underneath.
 */

// Mirrors forecast-insights.js's comfortScore concept (same "ideal band"
// reasoning) but for a single current-conditions reading rather than a
// forecast day, and folds in humidity/wind penalties too so the overall
// verdict isn't temperature-only.
function comfortScore(data, units) {
    const idealMin = units === 'imperial' ? 60 : 16;
    const idealMax = units === 'imperial' ? 77 : 25;
    const mid = (idealMin + idealMax) / 2;
    const windCalmMax = units === 'imperial' ? 11 : 5;

    const tempPenalty = Math.abs(data.temp - mid);
    const humidityPenalty = Math.max(0, data.humidity - 60) * 0.3;
    const windPenalty = Math.max(0, data.wind_speed - windCalmMax) * 0.5;
    return tempPenalty + humidityPenalty + windPenalty;
}

function conditionCategory(icon) {
    const code = (icon || '').slice(0, 2);
    if (/^(09|10|11)/.test(code)) return 'rain';
    if (code === '13') return 'snow';
    if (code === '50') return 'haze';
    if (code === '01') return 'clear';
    return 'cloudy';
}

function compareLocations(a, b, aqiA, aqiB, units = 'metric') {
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const windUnit = units === 'imperial' ? 'mph' : 'm/s';
    const windThreshold = units === 'imperial' ? 4 : 2;
    const lines = [];

    // --- Overall verdict, computed first so it can lead the list ---
    const scoreA = comfortScore(a, units);
    const scoreB = comfortScore(b, units);
    const scoreDiff = Math.abs(scoreA - scoreB);
    if (scoreDiff < 3) {
        lines.push(`Overall, conditions are similarly pleasant in both ${a.city} and ${b.city} right now.`);
    } else {
        const better = scoreA < scoreB ? a : b;
        const worse = scoreA < scoreB ? b : a;
        // Name the single biggest contributor to the gap, rather than just
        // asserting "better" with no reasoning - a comfort score alone
        // isn't something a reader can sanity-check themselves.
        const tempGap = Math.abs(a.temp - b.temp);
        const humidityGap = Math.abs(a.humidity - b.humidity);
        const windGap = Math.abs(a.wind_speed - b.wind_speed);
        let reason = 'a more comfortable temperature';
        if (humidityGap * 0.3 > tempGap && humidityGap * 0.3 > windGap * 0.5) {
            reason = 'lower humidity';
        } else if (windGap * 0.5 > tempGap) {
            reason = 'calmer wind';
        }
        lines.push(`Overall, ${better.city} is more pleasant right now than ${worse.city}, mainly thanks to ${reason}.`);
    }

    // --- Condition (rain/clear/snow/etc.), not just temperature ---
    const catA = conditionCategory(a.icon);
    const catB = conditionCategory(b.icon);
    if (catA !== catB) {
        lines.push(`${a.city} is ${a.description.toLowerCase()} while ${b.city} is ${b.description.toLowerCase()}.`);
    }

    // --- Granular stat breakdown ---
    const tempDiff = a.temp - b.temp;
    if (Math.abs(tempDiff) >= 1) {
        const warmer = tempDiff > 0 ? a.city : b.city;
        lines.push(`${warmer} is ${Math.round(Math.abs(tempDiff))}${tempUnit} warmer right now.`);
    } else {
        lines.push('Temperatures are about the same right now.');
    }

    // Called out per-city rather than as an A-vs-B comparison - whether a
    // gap between feels-like and actual temperature means "worse" depends
    // on which side of the comfortable range that city is already on, so
    // asserting a winner here would be guessing. Stating the fact plainly
    // lets the reader draw their own conclusion.
    [a, b].forEach((city) => {
        if (city.feels_like == null) return;
        const gap = city.feels_like - city.temp;
        if (Math.abs(gap) >= 3) {
            lines.push(`${city.city} feels ${Math.abs(Math.round(gap))}${tempUnit} ${gap > 0 ? 'warmer' : 'colder'} than the actual temperature right now.`);
        }
    });

    const humidityDiff = a.humidity - b.humidity;
    if (Math.abs(humidityDiff) >= 15) {
        const moreHumid = humidityDiff > 0 ? a.city : b.city;
        lines.push(`${moreHumid} is noticeably more humid (${Math.round(Math.abs(humidityDiff))}% difference).`);
    }

    const windDiff = a.wind_speed - b.wind_speed;
    if (Math.abs(windDiff) >= windThreshold) {
        const windier = windDiff > 0 ? a.city : b.city;
        lines.push(`${windier} is windier (${Math.round(Math.abs(windDiff))} ${windUnit} difference).`);
    }

    if (aqiA && aqiB && aqiA.aqi && aqiB.aqi && aqiA.aqi !== aqiB.aqi) {
        const cleaner = aqiA.aqi < aqiB.aqi ? a.city : b.city;
        lines.push(`${cleaner} has better air quality right now.`);
    }

    return {
        tempDiff,
        humidityDiff,
        windDiff,
        scoreDiff: scoreA - scoreB,
        analysis: lines
    };
}

window.WVCompare = { compareLocations, comfortScore, conditionCategory };
