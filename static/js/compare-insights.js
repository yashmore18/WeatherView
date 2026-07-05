/**
 * WeatherView - Location Compare engine
 *
 * Pure functions, no DOM - turns two cities' current-weather (+ optional air
 * quality) payloads into a short list of concrete, human-readable takeaways,
 * rather than leaving the reader to eyeball two side-by-side stat blocks
 * themselves.
 */

function compareLocations(a, b, aqiA, aqiB, units = 'metric') {
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const windUnit = units === 'imperial' ? 'mph' : 'm/s';
    const windThreshold = units === 'imperial' ? 4 : 2;
    const lines = [];

    const tempDiff = a.temp - b.temp;
    if (Math.abs(tempDiff) >= 1) {
        const warmer = tempDiff > 0 ? a.city : b.city;
        lines.push(`${warmer} is ${Math.round(Math.abs(tempDiff))}${tempUnit} warmer right now.`);
    } else {
        lines.push('Temperatures are about the same right now.');
    }

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
        analysis: lines
    };
}

window.WVCompare = { compareLocations };
