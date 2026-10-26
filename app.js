(() => {
  "use strict";
  // Approximate coordinates for Annamalai Nagar / Chidambaram area.
  // Forecast is grid/model data, not a measurement from a campus instrument.
  const LAT = 11.39;
  const LON = 79.72;
  const TZ = "Asia/Kolkata";
  const $ = (id) => document.getElementById(id);
  const fmt = (n, digits = 1) => Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : "—";
  const dateTime = (value) => {
    if (!value) return "Unavailable";
    const d = new Date(value);
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

  async function fetchJson(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function setStatus(text, ok = true) {
    $("load-status").textContent = text;
    $("load-status").previousElementSibling.style.background = ok ? "#3d9b65" : "#d6a83e";
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

  function renderRain(data) {
    const d = data.daily;
    const next24 = data.hourly.precipitation.slice(0, 24).reduce((a, n) => a + (Number(n) || 0), 0);
    const next7 = d.precipitation_sum.slice(0, 7).reduce((a, n) => a + (Number(n) || 0), 0);
    const maxChance = Math.max(0, ...data.hourly.precipitation_probability.slice(0,24).map(Number).filter(Number.isFinite));
    $("rain-24").textContent = fmt(next24, 1);
    $("rain-7").textContent = fmt(next7, 1);
    $("rain-chance").textContent = fmt(maxChance, 0);
    const max = Math.max(1, ...d.precipitation_sum.slice(0,7).map(Number));
    $("rain-chart").innerHTML = d.time.slice(0,7).map((day,i) => {
      const mm = Number(d.precipitation_sum[i]) || 0;
      const height = Math.max(mm > 0 ? 4 : 2, (mm / max) * 88);
      return `<div class="rain-day"><span class="rain-value">${fmt(mm,1)}</span><div class="rain-bar-wrap"><div class="rain-bar" style="height:${height}px"></div></div><span>${dateLabel(day)}</span></div>`;
    }).join("");
  }

  function renderAdvisories(current, daily) {
    const rain24 = daily.precipitation_sum.slice(0,2).reduce((a,n)=>a+(Number(n)||0),0);
    const maxRainChance = Math.max(0, ...daily.precipitation_probability_max.slice(0,2).map(Number).filter(Number.isFinite));
    const maxTemp = Math.max(...daily.temperature_2m_max.slice(0,2).map(Number).filter(Number.isFinite));
    const wind = Number(current.wind_speed_10m);
    const items = [];
    if (rain24 >= 10 || maxRainChance >= 70) {
      items.push(["🌧️","Rain likely","Check the latest IMD warning before irrigation, fertilizer application or pesticide spraying. Avoid field operations when rainfall or strong winds may cause runoff or drift."]);
    } else {
      items.push(["🌱","Field operations","No strong rain signal in the model’s next 24–48 hours. Confirm soil moisture and the latest local forecast before scheduling irrigation or field operations."]);
    }
    if (maxTemp >= 35) {
      items.push(["☀️","Heat awareness","Forecast maximum temperature is high. Consider crop-stage-appropriate irrigation timing and protect workers from heat; use local agricultural guidance."]);
    } else {
      items.push(["💧","Irrigation planning","Use crop stage, soil moisture and field water level to decide irrigation. A weather forecast alone should not determine irrigation timing."]);
    }
    if (wind >= 20) {
      items.push(["💨","Wind caution","Wind speed is elevated in the model. Check label restrictions and local conditions before any spray operation; avoid spraying in unsuitable wind."]);
    } else {
      items.push(["🧪","Spray decisions","Before spraying, check the product label, wind gusts, rainfall window and official local advice. Do not spray solely on the basis of this dashboard."]);
    }
    items.push(["📣","Official warnings","Check IMD warnings for Cuddalore district and coastal Tamil Nadu, especially during heavy rain, thunderstorms or cyclone conditions."]);
    $("advisories").innerHTML = items.map(([icon,title,body]) => `<article class="panel advisory"><span class="advisory-icon">${icon}</span><div><h3>${title}</h3><p>${body}</p></div></article>`).join("");
  }

  function setImdStatus() {
    $("imd-status").textContent = "Official IMD live API data is not connected to this version. Use the official IMD links above for published forecasts and warnings; dashboard numeric values are Open-Meteo model estimates.";
  }

  async function loadWeather() {
    $("refresh-btn").disabled = true;
    setStatus("Fetching latest available model data…", true);
    try {
      const params = new URLSearchParams({
        latitude: LAT, longitude: LON, timezone: TZ,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m",
        hourly: "temperature_2m,precipitation,precipitation_probability,relative_humidity_2m",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max",
        forecast_days: "7", wind_speed_unit: "kmh", precipitation_unit: "mm", temperature_unit: "celsius"
      });
      const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!data.current || !data.daily || !data.hourly) throw new Error("Weather response was incomplete.");
      const c = data.current;
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
      renderRain(data);
      renderAdvisories(c, data.daily);
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
      $("advisories").innerHTML = '<article class="panel advisory"><span class="advisory-icon">📣</span><div><h3>Check official weather alerts</h3><p>Use the IMD Mausam link below for current warnings. Do not interpret missing data as dry weather.</p></div></article>';
    } finally {
      $("refresh-btn").disabled = false;
    }
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
    const host = $("qrcode");
    const canvas = host.querySelector("canvas");
    const img = host.querySelector("img");
    const data = canvas ? canvas.toDataURL("image/png") : (img ? img.src : null);
    if (!data) return;
    const a = document.createElement("a");
    a.href = data; a.download = "annamalai-nagar-weather-qr.png"; a.click();
  }
  $("refresh-btn").addEventListener("click", loadWeather);
  $("make-qr").addEventListener("click", makeQr);
  $("download-qr").addEventListener("click", downloadQr);
  loadWeather();
  // Refresh periodically while the page is open; this does not mean the underlying model updates every 15 minutes.
  setInterval(loadWeather, 15 * 60 * 1000);
})();