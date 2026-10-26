(() => {
  "use strict";
  // Approximate coordinates for Annamalai Nagar / Chidambaram.
  // Values are Open-Meteo model-based estimates, not campus weather-station observations.
  const LAT = 11.39, LON = 79.72, TZ = "Asia/Kolkata";
  const $ = (id) => document.getElementById(id);
  const fmt = (n, digits = 1) => Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : "—";
  const num = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;
  const dateTime = (value) => {
    if (!value) return "Unavailable";
    let d;
    // Open-Meteo returns local timestamps without an offset when timezone is specified.
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) d = new Date(value + ":00+05:30");
    else d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium", timeStyle: "short", timeZone: TZ
    }).format(d) + " IST";
  };
  const dateLabel = (value, options = { weekday: "short", day: "numeric" }) =>
    new Intl.DateTimeFormat("en-IN", { ...options, timeZone: TZ }).format(new Date(value + (value.length === 10 ? "T12:00:00+05:30" : "")));
  const wx = (code) => {
    if (code === 0) return ["☀️", "Clear sky"];
    if ([1,2].includes(code)) return ["🌤️", "Mainly clear / partly cloudy"];
    if (code === 3) return ["☁️", "Overcast"];
    if ([45,48].includes(code)) return ["🌫️", "Fog"];
    if ([51,53,55,56,57].includes(code)) return ["🌦️", "Drizzle"];
    if ([61,63,65,66,67,80,81,82].includes(code)) return ["🌧️", "Rain / showers"];
    if ([71,73,75,77,85,86].includes(code)) return ["🌨️", "Snow / snow showers"];
    if ([95,96,99].includes(code)) return ["⛈️", "Thunderstorm"];
    return ["🌡️", "Weather conditions"];
  };
  const windDir = (degrees) => {
    if (!Number.isFinite(Number(degrees))) return "Direction —";
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return dirs[Math.round(Number(degrees) / 22.5) % 16];
  };

  async function fetchJson(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function setStatus(text, ok = true) {
    $("load-status").textContent = text;
    $("load-status").previousElementSibling.style.background = ok ? "#3d9b65" : "#d6a83e";
  }
  function hourStartIndex(hourly, current) {
    const times = hourly.time || [];
    let exact = times.indexOf(current.time);
    if (exact >= 0) return exact;
    const currentMs = new Date(current.time + ":00+05:30").getTime();
    const idx = times.findIndex(t => new Date(t + ":00+05:30").getTime() >= currentMs);
    return idx >= 0 ? idx : 0;
  }
  function sliceHours(hourly, key, start, count) {
    return (hourly[key] || []).slice(start, start + count).map(Number).filter(Number.isFinite);
  }
  function sumHours(hourly, key, start, count) {
    return sliceHours(hourly, key, start, count).reduce((a, n) => a + n, 0);
  }
  function maxHours(hourly, key, start, count) {
    const vals = sliceHours(hourly, key, start, count);
    return vals.length ? Math.max(...vals) : NaN;
  }
  function renderForecast(data) {
    const d = data.daily;
    $("forecast-grid").innerHTML = d.time.map((day, i) => {
      const [icon, desc] = wx(d.weather_code[i]);
      return `<article class="panel forecast-card">
        <div class="forecast-day">${i === 0 ? "Today" : dateLabel(day)}</div>
        <div class="forecast-icon" title="${desc}">${icon}</div>
        <div class="forecast-temps">${fmt(d.temperature_2m_max[i],0)}° <span class="forecast-low">${fmt(d.temperature_2m_min[i],0)}°</span></div>
        <div class="forecast-rain">🌧 ${fmt(d.precipitation_sum[i],1)} mm</div>
        <div class="tiny muted">${fmt(d.precipitation_probability_max[i],0)}% chance</div>
      </article>`;
    }).join("");
  }
  function renderRain(data, start) {
    const d = data.daily, h = data.hourly;
    const next24 = sumHours(h, "precipitation", start, 24);
    const next7 = d.precipitation_sum.slice(0, 7).reduce((a, n) => a + num(n), 0);
    const maxChance = maxHours(h, "precipitation_probability", start, 24);
    $("rain-24").textContent = fmt(next24, 1);
    $("rain-7").textContent = fmt(next7, 1);
    $("rain-chance").textContent = fmt(maxChance, 0);
    const max = Math.max(1, ...d.precipitation_sum.slice(0,7).map(Number));
    $("rain-chart").innerHTML = d.time.slice(0,7).map((day,i) => {
      const mm = num(d.precipitation_sum[i]);
      const height = Math.max(mm > 0 ? 4 : 2, (mm / max) * 88);
      return `<div class="rain-day"><span class="rain-value">${fmt(mm,1)}</span><div class="rain-bar-wrap"><div class="rain-bar" style="height:${height}px"></div></div><span>${dateLabel(day)}</span></div>`;
    }).join("");
  }
  function renderAdvisories(current, data, start) {
    const h = data.hourly, d = data.daily;
    const rain6 = sumHours(h, "precipitation", start, 6);
    const rain24 = sumHours(h, "precipitation", start, 24);
    const rainChance6 = maxHours(h, "precipitation_probability", start, 6);
    const rainChance24 = maxHours(h, "precipitation_probability", start, 24);
    const windMax6 = maxHours(h, "wind_speed_10m", start, 6);
    const gustMax6 = maxHours(h, "wind_gusts_10m", start, 6);
    const tempMax24 = maxHours(h, "temperature_2m", start, 24);
    const uvMaxToday = Number(d.uv_index_max?.[0]);
    const [wxIcon, wxText] = wx(current.weather_code);
    const items = [];

    // Rain decision uses the upcoming hourly forecast window, not the first hours of the day.
    if (rain6 >= 5 || rainChance6 >= 70) {
      items.push(["🌧️","Rain watch · next 6 hours",
        `Current model condition: ${wxText}. Forecast rainfall over the next 6 hours is about ${fmt(rain6,1)} mm; maximum hourly rain probability is ${fmt(rainChance6,0)}%. Check IMD alerts and field drainage. Avoid fertilizer or pesticide application if rain/runoff risk is present.`]);
    } else if (rainChance24 >= 50 || rain24 >= 2) {
      items.push(["🌦️","Possible rain · next 24 hours",
        `The model estimates ${fmt(rain24,1)} mm over the next 24 hours, with a maximum hourly rain probability of ${fmt(rainChance24,0)}%. Recheck the forecast before field work; protect fertilizer and avoid spraying close to expected rainfall.`]);
    } else {
      items.push(["🌤️","No strong rain signal",
        `The model estimates ${fmt(rain24,1)} mm over the next 24 hours and a maximum hourly rain probability of ${fmt(rainChance24,0)}%. This is not a guarantee of dry weather. Check the latest IMD warning and local field conditions before operations.`]);
    }

    if (rain24 >= 5 || rainChance24 >= 60) {
      items.push(["💧","Irrigation · reassess before watering",
        `Rain may contribute about ${fmt(rain24,1)} mm in the next 24 hours. Check soil moisture, crop stage and field water depth before irrigating; do not irrigate automatically from a forecast alone.`]);
    } else {
      items.push(["💧","Irrigation · check field moisture",
        `No strong rainfall signal is indicated for the next 24 hours (${fmt(rain24,1)} mm model estimate). Decide irrigation from crop stage, soil moisture and field water level—not from weather data alone.`]);
    }

    const windRisk = (Number.isFinite(gustMax6) && gustMax6 >= 25) || (Number.isFinite(windMax6) && windMax6 >= 20);
    const sprayRainRisk = rainChance6 >= 50 || rain6 >= 1;
    if (windRisk || sprayRainRisk) {
      const reasons = [];
      if (Number.isFinite(windMax6)) reasons.push(`wind up to ${fmt(windMax6,0)} km/h`);
      if (Number.isFinite(gustMax6)) reasons.push(`gusts up to ${fmt(gustMax6,0)} km/h`);
      if (sprayRainRisk) reasons.push(`${fmt(rainChance6,0)}% maximum hourly rain probability`);
      items.push(["🧪","Spraying · caution",
        `Next 6-hour model outlook: ${reasons.join(", ") || "conditions may change"}. Check the pesticide label, wind at the field, drift risk and rain-free interval. Postpone if conditions exceed label or local advisory limits.`]);
    } else {
      items.push(["🧪","Spraying · verify field conditions",
        `The next 6-hour model shows wind up to ${fmt(windMax6,0)} km/h and gusts up to ${fmt(gustMax6,0)} km/h, with ${fmt(rainChance6,0)}% maximum hourly rain probability. These estimates do not confirm safe spraying; follow the product label and local advice.`]);
    }

    if (Number.isFinite(tempMax24) && tempMax24 >= 35) {
      items.push(["☀️","Heat and outdoor work",
        `Forecast temperature may reach ${fmt(tempMax24,0)}°C in the next 24 hours (today's maximum UV index: ${fmt(uvMaxToday,1)}). Schedule strenuous outdoor work for cooler hours, take water/rest breaks and follow heat-safety guidance. Consider crop stage and local agronomic advice.`]);
    } else if (Number.isFinite(uvMaxToday) && uvMaxToday >= 8) {
      items.push(["🕶️","High UV outlook",
        `Today's forecast maximum UV index is ${fmt(uvMaxToday,1)}. Consider sun protection and cooler work periods for field staff. Forecast UV is not a crop-specific stress diagnosis.`]);
    } else {
      items.push([wxIcon,"Field conditions · current outlook",
        `Current model condition is ${wxText}; forecast maximum temperature in the next 24 hours is ${fmt(tempMax24,0)}°C and today's maximum UV index is ${fmt(uvMaxToday,1)}. Match field operations to crop stage, soil and observed conditions.`]);
    }

    items.push(["📣","Official IMD warnings · verify now",
      "This dashboard does not yet ingest live IMD warning records. Open the official IMD regional page and check Cuddalore district / coastal Tamil Nadu warnings before pesticide application, fertilizer application, irrigation or outdoor work."]);
    $("advisories").innerHTML = items.map(([icon,title,body]) =>
      `<article class="panel advisory"><span class="advisory-icon">${icon}</span><div><h3>${title}</h3><p>${body}</p></div></article>`
    ).join("");
  }
  function setImdStatus() {
    $("imd-status").textContent = "Live IMD warning data is not integrated in this version. Official warnings must be checked directly on the IMD website; dashboard numerical values are Open-Meteo model estimates.";
  }
  async function loadWeather() {
    $("refresh-btn").disabled = true;
    setStatus("Fetching latest available model data…", true);
    try {
      const params = new URLSearchParams({
        latitude: LAT, longitude: LON, timezone: TZ,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m",
        hourly: "temperature_2m,precipitation,precipitation_probability,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,uv_index",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max",
        forecast_days: "7", wind_speed_unit: "kmh", precipitation_unit: "mm", temperature_unit: "celsius"
      });
      const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!data.current || !data.daily || !data.hourly) throw new Error("Weather response was incomplete.");
      const c = data.current, start = hourStartIndex(data.hourly, c);
      const [icon, description] = wx(c.weather_code);
      $("weather-icon").textContent = icon;
      $("weather-description").textContent = description;
      $("temperature").textContent = fmt(c.temperature_2m,1);
      $("feels-like").textContent = fmt(c.apparent_temperature,1);
      $("humidity").textContent = fmt(c.relative_humidity_2m,0);
      $("rain-now").textContent = fmt(c.precipitation,1);
      $("wind").textContent = fmt(c.wind_speed_10m,1);
      $("wind-direction").textContent = `Direction ${windDir(c.wind_direction_10m)} (${fmt(c.wind_direction_10m,0)}°)`;
      $("pressure").textContent = fmt(c.pressure_msl,0);
      $("uv").textContent = fmt(data.daily.uv_index_max[0],1);
      $("updated-at").textContent = `Model timestamp: ${dateTime(c.time)} · Page refreshed: ${dateTime(new Date().toISOString())}`;
      $("model-note").textContent = "Open-Meteo model-based estimate for the area; not a campus sensor reading.";
      renderForecast(data);
      renderRain(data, start);
      renderAdvisories(c, data, start);
      setStatus("Weather data loaded", true);
      setImdStatus();
    } catch (error) {
      console.error(error);
      setStatus("Weather data temporarily unavailable", false);
      $("updated-at").textContent = "Please retry when internet/API access is available.";
      $("weather-description").textContent = "Could not load current data";
      $("model-note").textContent = "No live values are being shown. Check the official IMD links below.";
      $("forecast-grid").innerHTML = '<article class="panel forecast-card">Forecast temporarily unavailable. Please refresh or check IMD.</article>';
      $("rain-chart").textContent = "Rainfall chart unavailable until weather data load.";
      $("advisories").innerHTML = '<article class="panel advisory"><span class="advisory-icon">📣</span><div><h3>Check official weather alerts</h3><p>Use the official IMD regional page for current warnings. Do not interpret missing data as dry weather.</p></div></article>';
    } finally { $("refresh-btn").disabled = false; }
  }
  function makeQr() {
    const target = window.location.href.split("#")[0];
    if (!target.startsWith("https://") || target.includes("localhost") || target.includes("127.0.0.1")) {
      $("qr-message").textContent = "Publish the site to GitHub Pages first, then open its HTTPS address and generate the QR code.";
      return;
    }
    if (typeof QRCode === "undefined") {
      $("qr-message").textContent = "QR library did not load. Check internet access and try again.";
      return;
    }
    const host = $("qrcode");
    host.innerHTML = "";
    new QRCode(host, { text: target, width: 190, height: 190, colorDark: "#111111", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
    $("download-qr").disabled = false;
    $("qr-message").textContent = `QR target: ${target}. Keep this website URL unchanged for the printed QR code to remain valid.`;
  }
  function downloadQr() {
    const host = $("qrcode"), canvas = host.querySelector("canvas"), img = host.querySelector("img");
    const data = canvas ? canvas.toDataURL("image/png") : (img ? img.src : null);
    if (!data) return;
    const a = document.createElement("a"); a.href = data; a.download = "annamalai-nagar-weather-qr.png"; a.click();
  }
  $("refresh-btn").addEventListener("click", loadWeather);
  $("make-qr").addEventListener("click", makeQr);
  $("download-qr").addEventListener("click", downloadQr);
  loadWeather();
  // Refreshing the page reloads model data; this timer does not guarantee model updates every 15 minutes.
  setInterval(loadWeather, 15 * 60 * 1000);
})();
