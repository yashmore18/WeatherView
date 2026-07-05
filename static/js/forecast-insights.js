/**
 * WeatherView - Forecast Insights engine
 *
 * Pure functions, no DOM - turns the raw 7-day/hourly forecast arrays
 * already fetched for the Forecast page into a handful of concrete
 * takeaways, instead of the reader having to scan every row/chart point
 * themselves to notice the same things (which day is nicest, which day
 * needs an umbrella, whether it's warming up or cooling down).
 */

function comfortScore(day, units) {
    const idealMin = units === 'imperial' ? 60 : 16;
    const idealMax = units === 'imperial' ? 77 : 25;
    const mid = (idealMin + idealMax) / 2;
    const avgTemp = (day.temp_max + day.temp_min) / 2;
    const tempPenalty = Math.abs(avgTemp - mid);
    const rainPenalty = (day.pop || 0) * 40;
    return tempPenalty + rainPenalty;
}

function checkBestDay(daily, units) {
    if (!daily || daily.length < 2) return null;
    // Skip today - "today's the best day" isn't an actionable heads-up.
    const upcoming = daily.slice(1);
    if (upcoming.length === 0) return null;

    let best = upcoming[0];
    for (const day of upcoming) {
        if (comfortScore(day, units) < comfortScore(best, units)) best = day;
    }
    // Only worth surfacing if it's genuinely pleasant, not just "least bad".
    if (comfortScore(best, units) > 15) return null;

    const dayName = new Date(best.date).toLocaleDateString('en-US', { weekday: 'long' });
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    return {
        id: 'best-day',
        icon: 'fa-sun',
        title: 'Best day ahead',
        message: `${dayName} looks the most pleasant - ${Math.round(best.temp_max)}${tempUnit} with ${Math.round((best.pop || 0) * 100)}% rain chance.`
    };
}

function checkUmbrellaDay(daily) {
    if (!daily || daily.length === 0) return null;
    const rainy = daily.find(d => (d.pop || 0) >= 0.5);
    if (!rainy) return null;

    const isToday = rainy === daily[0];
    const dayName = isToday ? 'today' : new Date(rainy.date).toLocaleDateString('en-US', { weekday: 'long' });
    return {
        id: 'umbrella-day',
        icon: 'fa-umbrella',
        title: 'Pack an umbrella',
        message: `${isToday ? 'Today has' : `${dayName} has`} a ${Math.round(rainy.pop * 100)}% chance of rain - the highest this week.`
    };
}

function checkTempTrend(daily, units) {
    if (!daily || daily.length < 4) return null;

    const firstHalf = daily.slice(0, Math.ceil(daily.length / 2));
    const secondHalf = daily.slice(Math.ceil(daily.length / 2));
    const avg = (arr) => arr.reduce((sum, d) => sum + (d.temp_max + d.temp_min) / 2, 0) / arr.length;
    const diff = avg(secondHalf) - avg(firstHalf);

    const threshold = units === 'imperial' ? 5 : 3;
    if (Math.abs(diff) < threshold) return null;

    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const warming = diff > 0;
    return {
        id: 'temp-trend',
        icon: warming ? 'fa-temperature-arrow-up' : 'fa-temperature-arrow-down',
        title: warming ? 'Warming up' : 'Cooling down',
        message: `Temperatures are trending ${warming ? 'up' : 'down'} by about ${Math.round(Math.abs(diff))}${tempUnit} over the week.`
    };
}

function checkDrySpell(daily) {
    if (!daily || daily.length < 3) return null;
    const allDry = daily.every(d => (d.pop || 0) < 0.2);
    if (!allDry) return null;
    return {
        id: 'dry-spell',
        icon: 'fa-cloud-sun',
        title: 'Dry week ahead',
        message: `No meaningful rain expected over the next ${daily.length} days.`
    };
}

function computeInsights(dailyForecast, units = 'metric') {
    const insights = [];
    const dry = checkDrySpell(dailyForecast);
    if (dry) {
        insights.push(dry);
    } else {
        const umbrella = checkUmbrellaDay(dailyForecast);
        if (umbrella) insights.push(umbrella);
    }
    const best = checkBestDay(dailyForecast, units);
    if (best) insights.push(best);
    const trend = checkTempTrend(dailyForecast, units);
    if (trend) insights.push(trend);
    return insights;
}

window.WVForecastInsights = { computeInsights, checkBestDay, checkUmbrellaDay, checkTempTrend, checkDrySpell };
