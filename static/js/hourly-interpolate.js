/**
 * WeatherView - Hourly interpolation
 *
 * OpenWeatherMap's free forecast endpoint only returns 3-hourly buckets -
 * showing "5 PM, 8 PM, 11 PM..." with real gaps isn't what "hourly forecast"
 * promises. This linearly interpolates the numeric fields (temp, feels_like,
 * pop, wind, humidity, pressure) between each pair of real buckets to
 * produce one entry per hour. Interpolated hours are flagged `estimated:
 * true` (vs. `false` for the real data points either side of them) so the
 * UI can be honest about which numbers are real OpenWeatherMap readings and
 * which are a straight-line estimate between two real ones - icon/
 * description are categorical, not numeric, so they can't be interpolated
 * and instead just carry forward from whichever real bucket the estimated
 * hour is closer to in time.
 */
function interpolateHourly(points) {
    if (!points || points.length === 0) return [];
    if (points.length === 1) return [{ ...points[0], estimated: false }];

    const lerp = (a, b, t) => a + (b - a) * t;
    const result = [];

    for (let i = 0; i < points.length - 1; i++) {
        const cur = points[i];
        const next = points[i + 1];
        result.push({ ...cur, estimated: false });

        const hourGap = Math.round((next.dt - cur.dt) / 3600);
        for (let h = 1; h < hourGap; h++) {
            const t = h / hourGap;
            result.push({
                dt: cur.dt + h * 3600,
                temp: lerp(cur.temp, next.temp, t),
                feels_like: lerp(cur.feels_like, next.feels_like, t),
                temp_unit: cur.temp_unit,
                pop: lerp(cur.pop || 0, next.pop || 0, t),
                wind_speed: lerp(cur.wind_speed || 0, next.wind_speed || 0, t),
                humidity: Math.round(lerp(cur.humidity || 0, next.humidity || 0, t)),
                pressure: Math.round(lerp(cur.pressure || 0, next.pressure || 0, t)),
                visibility: lerp(cur.visibility || 0, next.visibility || 0, t),
                icon: t < 0.5 ? cur.icon : next.icon,
                description: t < 0.5 ? cur.description : next.description,
                estimated: true
            });
        }
    }
    result.push({ ...points[points.length - 1], estimated: false });
    return result;
}

window.WVHourly = { interpolateHourly };
