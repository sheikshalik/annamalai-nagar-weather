
  // INTERACTIVE LOCAL WEATHER AWARENESS
  // Uses only the weather data already fetched by the dashboard.
  // Does not change weather APIs, calculations, Windy, rainfall,
  // QR generation, refresh scheduling, or other dashboard sections.

  let advisoryFilter = 'all';

  function renderAdvisories(c, data, start, officialFeed) {
    const host = $('advisories');
    if (!host) return;

    const h = data.hourly || {};
    const currentTemp = num(c.temperature_2m);
    const feelsLike = num(c.apparent_temperature);
    const humidity = num(c.relative_humidity_2m);
    const currentWind = num(c.wind_speed_10m);
    const currentGust = num(c.wind_gusts_10m);
    const currentRain = num(c.precipitation);
    const uv = num(c.uv_index);
    const code = Number(c.weather_code);

    const rain6 = sum(h, 'precipitation', start, 6);
    const rain24 = sum(h, 'precipitation', start, 24);
    const chance6 = max(h, 'precipitation_probability', start, 6);
    const chance24 = max(h, 'precipitation_probability', start, 24);
    const wind6 = max(h, 'wind_speed_10m', start, 6);
    const gust6 = max(h, 'wind_gusts_10m', start, 6);
    const temp6 = max(h, 'temperature_2m', start, 6);
    const temp24 = max(h, 'temperature_2m', start, 24);
    const uv6 = max(h, 'uv_index', start, 6);

    const items = [];

    const isThunder = [95, 96, 99].includes(code) ||
      (h.weather_code || []).slice(start, start + 6)
        .some(v => [95, 96, 99].includes(Number(v)));

    const isRainNow = currentRain >= 0.2 ||
      [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);

    const hasRainRisk = (Number.isFinite(rain6) && rain6 >= 1) ||
      (Number.isFinite(chance6) && chance6 >= 60);

    const hasWindRisk = (Number.isFinite(gust6) && gust6 >= 35) ||
      (Number.isFinite(wind6) && wind6 >= 25) ||
      (Number.isFinite(currentGust) && currentGust >= 35);

    const hasHeatRisk = (Number.isFinite(temp6) && temp6 >= 36) ||
      (Number.isFinite(currentTemp) && currentTemp >= 36) ||
      (Number.isFinite(feelsLike) && feelsLike >= 38);

    const hasHighUV = (Number.isFinite(uv) && uv >= 8) ||
      (Number.isFinite(uv6) && uv6 >= 8);

    const hasHumidHeat = Number.isFinite(currentTemp) &&
      currentTemp >= 32 &&
      Number.isFinite(humidity) &&
      humidity >= 75;

    const currentCondition = (() => {
      if (isThunder) return 'Thunderstorm conditions indicated';
      if (isRainNow) return 'Rain or showers indicated';
      if (code === 0) return 'Clear sky';
      if ([1, 2].includes(code)) return 'Partly cloudy';
      if (code === 3) return 'Cloudy';
      if ([45, 48].includes(code)) return 'Fog or reduced visibility indicated';
      return 'Current weather conditions';
    })();

    const currentSummary =
      `${currentCondition}. Temperature ${fmt(currentTemp, 1)}°C, ` +
      `humidity ${fmt(humidity, 0)}%, wind ${fmt(currentWind, 0)} km/h.`;

    // 1. Official warnings are displayed separately from model guidance.
    const activeAlerts = officialFeed && Array.isArray(officialFeed.alerts)
      ? officialFeed.alerts.filter(a => a && a.title)
      : [];

    if (activeAlerts.length) {
      activeAlerts.slice(0, 3).forEach(a => {
        const sev = alertSeverity(a.severity);
        const severity = String(a.severity || '').toLowerCase();
        const level = ['red', 'orange'].includes(severity) ? 'high' : 'caution';

        const issued = a.issuedAt
          ? `<br><b>Issued:</b> ${escapeHtml(dateTime(a.issuedAt))}`
          : '';

        const valid = a.validUntil
          ? `<br><b>Valid until:</b> ${escapeHtml(dateTime(a.validUntil))}`
          : '';

        const areas = Array.isArray(a.areas) && a.areas.length
          ? `<br><b>Areas:</b> ${escapeHtml(a.areas.join(', '))}`
          : '';

        const link = a.sourceUrl && /^https:\/\//i.test(a.sourceUrl)
          ? `<p><a href="${escapeHtml(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">View official bulletin ↗</a></p>`
          : '';

        items.push({
          category: 'official',
          icon: sev.icon,
          level,
          title: `Official warning · ${a.title}`,
          summary: a.description || 'An official weather warning is available. Follow the instructions in the original bulletin.',
          period: 'Official update · ' + escapeHtml(officialFeed.district || 'Cuddalore region'),
          details: `
            <p>${escapeHtml(a.description || 'Please consult the original official warning.')}</p>
            <p><b>Source:</b> ${escapeHtml(officialFeed.source || 'Official source')}${issued}${valid}${areas}</p>
            ${link}
          `
        });
      });
    } else if (officialFeed) {
      items.push({
        category: 'official',
        icon: '✅',
        level: 'normal',
        title: 'Official alert feed checked',
        summary: 'No active warnings were listed in the connected feed at the time it was checked.',
        period: 'Feed update · ' + escapeHtml(dateTime(officialFeed.updatedAt)),
        details: `
          <p>This result applies only to the connected feed and its update time. Continue checking official bulletins for later updates.</p>
          <p><b>Source:</b> ${escapeHtml(officialFeed.source || 'Official source')}</p>
        `
      });
    } else {
      items.push({
        category: 'official',
        icon: '📣',
        level: 'caution',
        title: 'Official weather warnings · check before action',
        summary: 'A verified live government warning feed is not connected. No conclusion about the presence or absence of official warnings can be made.',
        period: 'External verification recommended',
        details: `
          <p>Check official warnings for Cuddalore and coastal Tamil Nadu before making weather-sensitive decisions.</p>
          <p>
            <a href="https://mausam.imd.gov.in/" target="_blank" rel="noopener noreferrer">IMD Mausam ↗</a>
            &nbsp;·&nbsp;
            <a href="https://mausam.imd.gov.in/responsive/wxRealized.php" target="_blank" rel="noopener noreferrer">IMD weather ↗</a>
          </p>
        `
      });
    }

    // 2. Thunderstorm and lightning awareness.
    if (isThunder) {
      items.push({
        category: 'safety',
        icon: '⛈️',
        level: 'high',
        title: 'Thunderstorm awareness · take shelter',
        summary: 'Thunderstorm conditions are indicated in the current or near-term forecast.',
        period: 'Current / next 6 hours',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Move indoors or into a substantial enclosed building.</li>
              <li>Stay away from isolated trees, open fields, rooftops and exposed locations.</li>
              <li>Protect electrical equipment and unplug sensitive devices where safe.</li>
              <li>Wait at least 30 minutes after the last thunder before returning outdoors.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Do not remain in open areas during lightning.</li>
              <li>Do not conduct drone flights, spraying or outdoor machinery work during thunderstorms.</li>
              <li>Do not shelter under isolated trees.</li>
            </ul>
          </div>
          <p>Follow local emergency and official weather instructions.</p>
        `
      });
    }

    // 3. Rainfall awareness.
    if (isRainNow || hasRainRisk) {
      items.push({
        category: 'rain',
        icon: '🌧️',
        level: rain6 >= 10 || chance6 >= 85 ? 'high' : 'caution',
        title: 'Rainfall watch · plan the next few hours',
        summary: `Forecast rainfall: ${fmt(rain6, 1)} mm in 6 hours and ${fmt(rain24, 1)} mm in 24 hours. Maximum hourly rain probability: ${fmt(chance6, 0)}%.`,
        period: 'Next 6–24 hours · model forecast',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Carry an umbrella or rain protection when travelling.</li>
              <li>Check local road conditions and avoid waterlogged routes.</li>
              <li>Keep outdoor equipment, electrical items and stored materials protected.</li>
              <li>For farms, inspect field drains and outlets and check soil moisture before irrigation.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Do not irrigate automatically without checking actual field moisture and rainfall.</li>
              <li>Avoid pesticide or fertilizer application immediately before rain where runoff or wash-off is likely.</li>
              <li>Do not walk or drive through flooded areas.</li>
            </ul>
          </div>
          <p>Forecast rainfall is a model estimate, not a measured rain-gauge total.</p>
        `
      });
    } else {
      items.push({
        category: 'rain',
        icon: '🌤️',
        level: 'normal',
        title: 'Rainfall outlook · currently lower forecast risk',
        summary: `Forecast rainfall is ${fmt(rain6, 1)} mm over 6 hours and ${fmt(rain24, 1)} mm over 24 hours. Maximum hourly probability: ${fmt(chance24, 0)}%.`,
        period: 'Next 6–24 hours · model forecast',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Use the forecast to plan outdoor activities and field visits.</li>
              <li>Check actual soil moisture before deciding on irrigation.</li>
              <li>Keep checking updated forecasts during changing weather.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Do not interpret a low forecast rainfall value as proof that no local rain will occur.</li>
              <li>Do not make irrigation or travel decisions using the forecast alone.</li>
            </ul>
          </div>
        `
      });
    }

    // 4. Wind and outdoor-operation awareness.
    if (hasWindRisk) {
      items.push({
        category: 'wind',
        icon: '💨',
        level: 'high',
        title: 'Strong wind watch · secure outdoor items',
        summary: `Forecast wind may reach ${fmt(wind6, 0)} km/h, with gusts up to ${fmt(gust6, 0)} km/h in the next 6 hours.`,
        period: 'Next 6 hours · model forecast',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Secure loose outdoor objects, temporary structures and lightweight materials.</li>
              <li>Take care near trees, signboards and exposed structures.</li>
              <li>Check wind conditions at the site before operating equipment.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Do not fly drones or conduct spraying when wind exceeds the applicable operating limits.</li>
              <li>Avoid working at height or handling large exposed sheets in strong gusts.</li>
              <li>Do not assume the forecast represents the exact wind at your location.</li>
            </ul>
          </div>
          <p>Use an on-site wind measurement and follow equipment, aviation and product-label safety limits.</p>
        `
      });
    } else {
      items.push({
        category: 'wind',
        icon: '🍃',
        level: 'normal',
        title: 'Wind conditions · routine checks',
        summary: `Current wind is ${fmt(currentWind, 0)} km/h. Forecast gusts in the next 6 hours are up to ${fmt(gust6, 0)} km/h.`,
        period: 'Current conditions and next 6 hours',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Check actual wind before outdoor work, spraying or drone operations.</li>
              <li>Secure equipment and materials as a routine precaution.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Do not treat a model forecast as clearance for aviation or pesticide application.</li>
            </ul>
          </div>
        `
      });
    }

    // 5. Heat and personal comfort.
    if (hasHeatRisk || hasHumidHeat) {
      items.push({
        category: 'heat',
        icon: '🌡️',
        level: 'high',
        title: 'Heat and thermal comfort · take precautions',
        summary: `Current temperature is ${fmt(currentTemp, 1)}°C, feels like ${fmt(feelsLike, 1)}°C, with forecast maximum temperature of ${fmt(temp24, 1)}°C in 24 hours.`,
        period: 'Current conditions and next 24 hours',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Drink water regularly and take rest breaks.</li>
              <li>Use shade and plan strenuous outdoor work during cooler hours.</li>
              <li>Wear light, breathable clothing and check on children and older adults.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Do not ignore dizziness, weakness, headache or signs of heat illness.</li>
              <li>Avoid prolonged strenuous activity in hot and humid conditions.</li>
            </ul>
          </div>
          <p>Seek medical help if serious heat-illness symptoms occur.</p>
        `
      });
    } else {
      items.push({
        category: 'heat',
        icon: '🌡️',
        level: 'normal',
        title: 'Temperature and comfort',
        summary: `Current temperature is ${fmt(currentTemp, 1)}°C, feels like ${fmt(feelsLike, 1)}°C.`,
        period: 'Current conditions',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Stay hydrated during outdoor activities.</li>
              <li>Check the afternoon temperature before planning strenuous work.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Do not assume morning conditions will remain the same throughout the day.</li>
            </ul>
          </div>
        `
      });
    }

    // 6. UV awareness.
    if (hasHighUV) {
      items.push({
        category: 'sun', icon: '☀️', level: 'caution',
        title: 'High UV exposure · protect yourself',
        summary: `UV index is ${fmt(uv, 1)} currently, with a forecast value up to ${fmt(uv6, 1)} in the next 6 hours.`,
        period: 'Current / next 6 hours',
        details: `
          <div class="awi-do">
            <b>DO</b>
            <ul>
              <li>Use shade, a hat, sunglasses and suitable sun protection.</li>
              <li>Plan long outdoor activities outside peak sunlight where possible.</li>
            </ul>
          </div>
          <div class="awi-dont">
            <b>DON'T</b>
            <ul>
              <li>Avoid prolonged unprotected exposure during strong sunlight.</li>
            </ul>
          </div>
        `
      });
    }

    // 7. General daily awareness, always included.
    items.push({
      category: 'general',
      icon: '📍',
      level: 'normal',
      title: 'Local daily planning · Annamalai Nagar',
      summary: currentSummary,
      period: 'Current weather conditions · ' + escapeHtml(dateTime(c.time)),
      details: `
        <div class="awi-do">
          <b>GOOD PRACTICES TODAY</b>
          <ul>
            <li>Check the latest forecast before travel, outdoor work or field activities.</li>
            <li>Carry drinking water and suitable weather protection.</li>
            <li>Keep mobile devices charged and follow local weather updates.</li>
            <li>For farming, assess actual field conditions before irrigation, spraying or other operations.</li>
          </ul>
        </div>
        <div class="awi-dont">
          <b>AVOID</b>
          <ul>
            <li>Do not rely on a forecast alone for emergency, travel or field-safety decisions.</li>
            <li>Do not treat model estimates as direct observations.</li>
          </ul>
        </div>
      `
    });

    const nowLabel = dateTime(c.time);
    const riskCount = items.filter(x => x.level === 'high').length;
    const cautionCount = items.filter(x => x.level === 'caution').length;

    const overall = riskCount
      ? 'Some weather conditions need extra attention today.'
      : cautionCount
        ? 'A few weather-related precautions are recommended.'
        : 'No high-risk trigger was identified in the available forecast.';

    const cardMarkup = items.map(item => {
      const levelClass = item.level === 'high' ? 'high' :
        item.level === 'caution' ? 'caution' : 'normal';

      const levelLabel = item.level === 'high' ? 'HIGH ATTENTION' :
        item.level === 'caution' ? 'TAKE CARE' : 'GENERAL GUIDANCE';

      return `
        <article class="awi-card ${levelClass}" data-category="${escapeHtml(item.category)}">
          <div class="awi-card-top">
            <span class="awi-icon">${item.icon}</span>
            <span class="awi-level">${levelLabel}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="awi-summary">${escapeHtml(item.summary)}</p>
          <div class="awi-period">${escapeHtml(item.period || 'Weather-based guidance')}</div>
          <details class="awi-details">
            <summary>What to do and what to avoid <span>＋</span></summary>
            <div class="awi-detail-body">${item.details}</div>
          </details>
        </article>`;
    }).join('');

    host.innerHTML = `
      <style>
        #advisories{display:block}
        #advisories .awi-shell{width:100%}
        #advisories .awi-head{
          padding:19px 20px;
          border:1px solid rgba(112,240,180,.25);
          border-radius:18px;
          background:linear-gradient(125deg,rgba(8,55,39,.96),rgba(7,26,43,.97));
          margin-bottom:14px;
          box-shadow:0 12px 30px rgba(0,0,0,.16)
        }
        #advisories .awi-headline{
          display:flex;align-items:center;justify-content:space-between;
          gap:12px;flex-wrap:wrap
        }
        #advisories .awi-kicker{
          font-size:10px;letter-spacing:1.7px;font-weight:800;
          color:#9ed9c0;text-transform:uppercase
        }
        #advisories .awi-title{
          font-size:19px;font-weight:800;color:#f4f7ef;margin:6px 0
        }
        #advisories .awi-sub{
          font-size:12px;color:#b7cbd0;line-height:1.6;margin:5px 0 0
        }
        #advisories .awi-status{
          margin-top:13px;padding:11px 13px;border-radius:11px;
          background:rgba(4,20,30,.45);
          border:1px solid rgba(164,194,185,.17);
          color:#dcebe4;font-size:12px;line-height:1.55
        }
        #advisories .awi-count{
          border:1px solid rgba(112,240,180,.3);
          border-radius:999px;padding:7px 11px;
          color:#a9f0cc;font-size:10px;font-weight:800
        }
        #advisories .awi-controls{
          display:flex;gap:8px;align-items:center;
          flex-wrap:wrap;margin:14px 0
        }
        #advisories .awi-filter{
          border:1px solid rgba(164,194,185,.25);
          border-radius:999px;padding:8px 12px;
          background:rgba(7,26,43,.82);color:#c5d6d3;
          font:inherit;font-size:11px;font-weight:600;cursor:pointer
        }
        #advisories .awi-filter[aria-pressed="true"]{
          background:rgba(44,125,91,.42);
          border-color:#70f0b4;color:#eafff3
        }
        #advisories .awi-grid{
          display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px
        }
        #advisories .awi-card{
          min-width:0;border:1px solid rgba(164,194,185,.2);
          border-radius:16px;padding:16px;
          background:linear-gradient(145deg,rgba(9,43,35,.95),rgba(7,26,43,.97));
          box-shadow:0 8px 22px rgba(0,0,0,.13);color:#edf5ef
        }
        #advisories .awi-card.high{
          border-color:rgba(255,120,100,.55);
          background:linear-gradient(145deg,rgba(74,35,31,.9),rgba(7,26,43,.97))
        }
        #advisories .awi-card.caution{border-color:rgba(255,202,112,.4)}
        #advisories .awi-card-top{
          display:flex;justify-content:space-between;
          align-items:center;gap:8px;margin-bottom:10px
        }
        #advisories .awi-icon{font-size:23px}
        #advisories .awi-level{
          font-size:9px;letter-spacing:1px;font-weight:800;
          color:#a9d9c4;border:1px solid rgba(169,217,196,.25);
          border-radius:999px;padding:5px 8px
        }
        #advisories .awi-card.high .awi-level{
          color:#ffc0ad;border-color:rgba(255,150,125,.4)
        }
        #advisories .awi-card.caution .awi-level{
          color:#ffda9a;border-color:rgba(255,218,154,.35)
        }
        #advisories .awi-card h3{
          font-size:14px;line-height:1.45;margin:0 0 7px;color:#f5f7ef
        }
        #advisories .awi-summary{
          font-size:12px;line-height:1.65;color:#c0d0d4;margin:0
        }
        #advisories .awi-period{
          font-size:10px;color:#8fb5b6;margin-top:10px
        }
        #advisories .awi-details{
          border-top:1px solid rgba(164,194,185,.16);
          margin-top:12px;padding-top:10px
        }
        #advisories .awi-details summary{
          font-size:11px;font-weight:700;color:#8ed9e8;
          cursor:pointer;list-style:none;
          display:flex;justify-content:space-between;gap:8px
        }
        #advisories .awi-details summary::-webkit-details-marker{display:none}
        #advisories .awi-detail-body{
          font-size:11px;line-height:1.7;color:#c4d2d5;padding-top:10px
        }
        #advisories .awi-detail-body p{margin:0 0 9px}
        #advisories .awi-detail-body ul{margin:6px 0 12px;padding-left:18px}
        #advisories .awi-detail-body li{margin:5px 0}
        #advisories .awi-detail-body a{color:#8ed9e8;text-decoration:none;font-weight:700}
        #advisories .awi-do{
          padding:10px 11px;margin-bottom:9px;border-radius:10px;
          background:rgba(37,112,76,.15);
          border-left:3px solid #70c99b
        }
        #advisories .awi-do>b{color:#9de2b9;font-size:10px;letter-spacing:1px}
        #advisories .awi-dont{
          padding:10px 11px;border-radius:10px;
          background:rgba(135,67,52,.13);
          border-left:3px solid #dc927c
        }
        #advisories .awi-dont>b{color:#f0b09e;font-size:10px;letter-spacing:1px}
        #advisories .awi-foot{
          font-size:10px;line-height:1.6;color:#8fa9b2;margin:12px 2px 0
        }
        @media(max-width:650px){
          #advisories .awi-grid{grid-template-columns:1fr}
          #advisories .awi-head{padding:15px}
        }
      </style>

      <div class="awi-shell">
        <div class="awi-head">
          <div class="awi-headline">
            <div>
              <div class="awi-kicker">ANNAMALAI NAGAR · LIVE WEATHER AWARENESS</div>
              <div class="awi-title">What to do today. What to avoid.</div>
              <p class="awi-sub">
                Practical local guidance for everyday activities, travel,
                outdoor work and agriculture, based on the latest available forecast.
              </p>
            </div>
            <span class="awi-count">${items.length} live guidance cards</span>
          </div>

          <div class="awi-status">
            <b>Today's weather awareness:</b> ${escapeHtml(overall)}
            <br>${escapeHtml(currentSummary)}
          </div>
        </div>

        <div class="awi-controls" aria-label="Filter local weather guidance">
          <button type="button" class="awi-filter" data-filter="all" aria-pressed="true">All guidance</button>
          <button type="button" class="awi-filter" data-filter="official" aria-pressed="false">Official alerts</button>
          <button type="button" class="awi-filter" data-filter="rain" aria-pressed="false">Rain</button>
          <button type="button" class="awi-filter" data-filter="wind" aria-pressed="false">Wind</button>
          <button type="button" class="awi-filter" data-filter="heat" aria-pressed="false">Heat & UV</button>
          <button type="button" class="awi-filter" data-filter="safety" aria-pressed="false">Safety</button>
          <button type="button" class="awi-filter" data-filter="general" aria-pressed="false">Daily tips</button>
        </div>

        <div class="awi-grid">${cardMarkup}</div>

        <p class="awi-foot">
          Weather source: ${escapeHtml($('load-status')?.textContent || 'Dashboard weather provider')}.
          Forecast timestamp: ${escapeHtml(nowLabel)}.
          Guidance is automatically generated from available weather-model data.
          It is general awareness, not an official warning or a substitute for local observations.
        </p>
      </div>
    `;

    host.querySelectorAll('.awi-filter').forEach(button => {
      button.addEventListener('click', () => {
        advisoryFilter = button.dataset.filter || 'all';

        host.querySelectorAll('.awi-filter').forEach(b => {
          b.setAttribute(
            'aria-pressed',
            String((b.dataset.filter || 'all') === advisoryFilter)
          );
        });

        host.querySelectorAll('.awi-card').forEach(card => {
          card.style.display =
            advisoryFilter === 'all' ||
            card.dataset.category === advisoryFilter
              ? ''
              : 'none';
        });
      });
    });

    host.querySelectorAll('.awi-details').forEach(details => {
      details.addEventListener('toggle', () => {
        const mark = details.querySelector('summary span');
        if (mark) mark.textContent = details.open ? '−' : '＋';
      });
    });
  }
