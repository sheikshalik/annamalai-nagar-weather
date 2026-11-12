(() => {
  'use strict';

  const LAT=11.3893, LON=79.7158, TZ='Asia/Kolkata';
  const $=id=>document.getElementById(id);
  const fmt=(v,d=1)=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?'—':Number(v).toFixed(d);
  const num=v=>v===null||v===undefined||!Number.isFinite(Number(v))?NaN:Number(v);

  const dateTime=v=>{
    if(!v)return 'Unavailable';
    let d;
    if(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v))d=new Date(v+':00+05:30');
    else d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:TZ}).format(d)+' IST';
  };

  const dateLabel=v=>new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',timeZone:TZ}).format(new Date(v+'T12:00:00+05:30'));

  const wx=code=>{
    if(code===0)return['☀️','Clear sky'];
    if([1,2].includes(code))return['🌤️','Mainly clear / partly cloudy'];
    if(code===3)return['☁️','Overcast'];
    if([45,48].includes(code))return['🌫️','Fog'];
    if([51,53,55,56,57].includes(code))return['🌦️','Drizzle'];
    if([61,63,65,66,67,80,81,82].includes(code))return['🌧️','Rain / showers'];
    if([71,73,75,77,85,86].includes(code))return['🌨️','Snow / snow showers'];
    if([95,96,99].includes(code))return['⛈️','Thunderstorm'];
    return['🌡️','Weather conditions'];
  };

  const windDir=d=>{
    if(!Number.isFinite(Number(d)))return'Direction —';
    const a=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return a[Math.round(Number(d)/22.5)%16];
  };

  async function fetchJson(url){
    const delays=[700,1500];
    let lastError;

    for(let attempt=0;attempt<3;attempt++){
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),12000);

      try{
        const r=await fetch(url,{signal:ctl.signal,cache:'no-store'});
        if(!r.ok)throw Error('HTTP '+r.status);
        const data=await r.json();
        if(data.error)throw Error(data.reason||'Weather provider error');
        return data;
      }catch(error){
        lastError=error;
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
      }finally{
        clearTimeout(timer);
      }
    }

    throw lastError||Error('Weather request failed');
  }

  const CACHE_KEY='annamalai-weather-last-success-v1';
  let loadInProgress=false;

  function readWeatherCache(){
    try{
      const saved=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      return saved&&saved.data&&saved.data.current&&saved.data.hourly&&saved.data.daily&&Number.isFinite(saved.savedAt)?saved:null;
    }catch(_){return null}
  }

  function saveWeatherCache(data){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(_){}
  }

  function status(t,ok=true){
    $('load-status').textContent=t;
    const dot=document.querySelector('.live-state i');

    if(dot){
      dot.style.background=ok?'#70f0b4':'#ffd27a';
      dot.style.boxShadow=ok?'0 0 14px #70f0b4':'0 0 12px #ffd27a';
    }
  }

  function indexAt(hours,currentTime){
    const times=hours.time||[];
    let idx=times.indexOf(currentTime);
    if(idx>=0)return idx;

    const target=new Date(currentTime+':00+05:30').getTime();
    idx=times.findIndex(t=>new Date(t+':00+05:30').getTime()>=target);
    return idx<0?0:idx;
  }

  function vals(obj,key,start,count){
    return (obj[key]||[]).slice(start,start+count).map(num);
  }

  function sum(obj,key,start,count){
    return vals(obj,key,start,count).filter(Number.isFinite).reduce((a,v)=>a+v,0);
  }

  function max(obj,key,start,count){
    const a=vals(obj,key,start,count).filter(Number.isFinite);
    return a.length?Math.max(...a):NaN;
  }

  function past24(hours,currentTime){
    const ix=(hours.time||[]).findIndex(t=>t===currentTime);
    const end=ix>=0?ix:(hours.time||[]).findIndex(t=>t>=currentTime);
    const stop=end<0?hours.time.length:end;
    const start=Math.max(0,stop-24);
    const a=(hours.precipitation||[]).slice(start,stop).map(num).filter(Number.isFinite);
    return {total:a.reduce((x,y)=>x+y,0),count:a.length};
  }

  function renderForecast(data,today){
    const d=data.daily;
    const days=d.time.map((day,i)=>({day,i})).filter(x=>x.day>=today).slice(0,7);

    $('forecast-grid').innerHTML=days.map(({day,i},n)=>{
      const [icon,desc]=wx(d.weather_code[i]);

      return `<article class="forecast-card">
        <div class="forecast-day">${n===0?'TODAY':dateLabel(day).toUpperCase()}</div>
        <div class="forecast-icon" title="${desc}">${icon}</div>
        <div class="forecast-temps">${fmt(d.temperature_2m_max[i],0)}° <span class="forecast-low">${fmt(d.temperature_2m_min[i],0)}°</span></div>
        <div class="forecast-rain">☂ ${fmt(d.precipitation_sum[i],1)} mm</div>
        <div class="forecast-prob">${fmt(d.precipitation_probability_max[i],0)}% rain chance</div>
      </article>`;
    }).join('');
  }

  function renderRain(data,start,prev,today){
    const h=data.hourly,d=data.daily;
    const days=d.time.map((day,i)=>({day,i})).filter(x=>x.day>=today).slice(0,7);

    $('rain-past-24').textContent=prev.count>=20?fmt(prev.total,1):'—';
    $('rain-7').textContent=fmt(days.reduce((a,x)=>a+(Number(d.precipitation_sum[x.i])||0),0),1);
    $('rain-chance').textContent=fmt(max(h,'precipitation_probability',start,24),0);
    $('rain-next-24').textContent=fmt(sum(h,'precipitation',start,24),1);

    const mx=Math.max(1,...days.map(x=>Number(d.precipitation_sum[x.i])||0));

    $('rain-chart').innerHTML=days.map(({day,i})=>{
      const mm=Number(d.precipitation_sum[i])||0;

      return `<div class="rain-day">
        <span class="rain-value">${fmt(mm,1)}</span>
        <div class="rain-bar-wrap"><div class="rain-bar" style="height:${Math.max(mm>0?4:2,mm/mx*88)}px"></div></div>
        <span>${dateLabel(day)}</span>
      </div>`;
    }).join('');
  }

  // The Agro-Meteorology display was intentionally removed from index.html.
  // Keep this legacy renderer harmless so its absence cannot interrupt dashboard updates.
  function renderAgro(data,start){
    const h=data.hourly;
    const set=(id,v,d=1)=>{
      const el=$(id);
      if(el)el.textContent=fmt(v,d);
    };

    set('et0',h.et0_fao_evapotranspiration?.[start]);
    set('vpd',h.vapour_pressure_deficit?.[start],2);
    set('solar',h.shortwave_radiation?.[start],0);
    set('soil-temp',h.soil_temperature_0_to_7cm?.[start]);
    set('soil-moisture',h.soil_moisture_0_to_7cm?.[start],3);
  }

  // Official alert feed.
  // Expected file: data/official-alerts.json

  // Example format:
  // {
  //   "status":"ok",
  //   "district":"Cuddalore",
  //   "source":"IMD / authorised government source",
  //   "updatedAt":"2026-11-03T08:30:00+05:30",
  //   "alerts":[
  //     {
  //       "severity":"yellow",
  //       "title":"Heavy rainfall warning",
  //       "description":"Official warning details",
  //       "issuedAt":"2026-11-03T08:00:00+05:30",
  //       "validUntil":"2026-11-04T08:00:00+05:30",
  //       "areas":["Cuddalore"],
  //       "sourceUrl":"https://official-source.gov.in/"
  //     }
  //   ]
  // }

  async function fetchOfficialAlerts(){
    const url='./data/official-alerts.json?ts='+Date.now();

    try{
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),8000);

      try{
        const response=await fetch(url,{signal:ctl.signal,cache:'no-store'});
        if(!response.ok)throw Error('HTTP '+response.status);

        const feed=await response.json();

        if(feed.status!=='ok'||!Array.isArray(feed.alerts)){
          throw Error('Official alert feed has an unsupported format');
        }

        return feed;
      }finally{
        clearTimeout(timer);
      }
    }catch(error){
      console.info('Official alert feed is not available:',error.message);
      return null;
    }
  }

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[ch]));
  }

  function alertSeverity(value){
    const s=String(value||'').toLowerCase();

    if(s==='red')return{label:'RED ALERT',icon:'🚨'};
    if(s==='orange')return{label:'ORANGE ALERT',icon:'⚠️'};
    if(s==='yellow')return{label:'YELLOW ALERT',icon:'⚠️'};
    if(s==='green')return{label:'GREEN',icon:'🟢'};

    return{label:'OFFICIAL UPDATE',icon:'📣'};
  }

  // Interactive local weather-awareness guidance.
  // Uses only the weather data already loaded by this dashboard.
  // General guidance for residents, visitors and farmers; no crop-stage selector.
  let advisoryFilter='all';
  let advisoryLastContext=null;

  function advisoryCard(item){
    const levelClass=item.level==='high'?'high':item.level==='caution'?'caution':'normal';
    const levelLabel=item.level==='high'?'HIGH ATTENTION':item.level==='caution'?'CAUTION':'GENERAL AWARENESS';
    return `
      <article class="awi-card ${levelClass}" data-category="${escapeHtml(item.category)}">
        <div class="awi-card-top">
          <span class="awi-icon" aria-hidden="true">${item.icon}</span>
          <span class="awi-level">${levelLabel}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="awi-summary">${escapeHtml(item.summary)}</p>
        <div class="awi-period">${escapeHtml(item.period||'Based on the latest available forecast')}</div>
        <details class="awi-details">
          <summary>Do’s, don’ts & guidance <span aria-hidden="true">＋</span></summary>
          <div class="awi-detail-body">${item.details}</div>
        </details>
      </article>`;
  }

  function renderAdvisories(c,data,start,officialFeed){
    const host=$('advisories');
    if(!host)return;

    advisoryLastContext={c,data,start,officialFeed};
    const h=data.hourly||{};
    const rain6=sum(h,'precipitation',start,6);
    const chance6=max(h,'precipitation_probability',start,6);
    const rain24=sum(h,'precipitation',start,24);
    const chance24=max(h,'precipitation_probability',start,24);
    const wind6=max(h,'wind_speed_10m',start,6);
    const gust6=max(h,'wind_gusts_10m',start,6);
    const temp24=max(h,'temperature_2m',start,24);
    const uvNow=num(c.uv_index);
    const humidity=num(c.relative_humidity_2m);
    const currentTemp=num(c.temperature_2m);
    const currentWind=num(c.wind_speed_10m);
    const currentCode=num(c.weather_code);
    const items=[];

    const activeAlerts=officialFeed&&Array.isArray(officialFeed.alerts)
      ?officialFeed.alerts.filter(a=>a&&a.title)
      :[];

    // Official warnings are shown only when a valid feed is actually connected.
    if(activeAlerts.length){
      activeAlerts.slice(0,3).forEach(a=>{
        const sev=alertSeverity(a.severity);
        const severity=String(a.severity||'').toLowerCase();
        const level=severity==='red'||severity==='orange'?'high':severity==='yellow'?'caution':'normal';
        const district=escapeHtml(officialFeed.district||'Cuddalore district');
        const source=escapeHtml(officialFeed.source||'Official source');
        const issued=a.issuedAt?`<br><b>Issued:</b> ${escapeHtml(dateTime(a.issuedAt))}`:'';
        const valid=a.validUntil?`<br><b>Valid until:</b> ${escapeHtml(dateTime(a.validUntil))}`:'';
        const areas=Array.isArray(a.areas)&&a.areas.length
          ?`<br><b>Affected areas:</b> ${escapeHtml(a.areas.join(', '))}`:'';
        const link=a.sourceUrl&&/^https:\/\//i.test(a.sourceUrl)
          ?`<p><a href="${escapeHtml(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">Read official bulletin ↗</a></p>`:'';

        items.push({
          category:'official',icon:sev.icon,level,
          title:`${sev.label} · ${a.title}`,
          summary:a.description||'An official weather update is available for this region. Read the bulletin and follow instructions from the district administration.',
          period:'Official bulletin · '+district,
          details:`<p><b>Do:</b> Read the full official bulletin, note its validity period and follow instructions from local authorities.</p><p><b>Don’t:</b> Rely only on this dashboard or circulate unverified warning messages.</p><p><b>District:</b> ${district}<br><b>Source:</b> ${source}${issued}${valid}${areas}</p>${link}`
        });
      });
    }else{
      items.push({
        category:'official',icon:'📣',level:'caution',
        title:'Official warning check',
        summary:'A verified live government warning feed is not connected to this dashboard. This does not mean that no official warning is in force.',
        period:'Check official updates before travel or outdoor activities',
        details:'<p><b>Do:</b> Check the latest Cuddalore district and coastal Tamil Nadu warnings before travel, fishing, boating, outdoor events or other weather-sensitive activities.</p><p><b>Don’t:</b> Treat model forecasts or this reminder as an official warning.</p><p><a href="https://mausam.imd.gov.in/" target="_blank" rel="noopener noreferrer">IMD Mausam ↗</a> &nbsp; <a href="https://cuddalore.nic.in/" target="_blank" rel="noopener noreferrer">Cuddalore District Administration ↗</a></p>'
      });
    }

    // Rain outlook: always displayed, with advice changing according to forecast.
    const rainHigh=(Number.isFinite(rain6)&&rain6>=5)||(Number.isFinite(chance6)&&chance6>=70);
    const rainCaution=!rainHigh&&((Number.isFinite(rain24)&&rain24>=1)||(Number.isFinite(chance24)&&chance24>=40));
    const rainLevel=rainHigh?'high':rainCaution?'caution':'normal';
    const rainTitle=rainHigh?'Rain watch · next 6 hours':rainCaution?'Rain possibility · next 24 hours':'Rain outlook · next 24 hours';
    const rainSummary=`Forecast rainfall: ${fmt(rain24,1)} mm over 24 hours; maximum hourly rain probability: ${fmt(chance24,0)}%.`;
    items.push({
      category:'rain',icon:rainHigh?'🌧️':'🌦️',level:rainLevel,
      title:rainTitle,summary:rainSummary,
      period:'Next 6–24 hours · weather-model estimate',
      details:rainHigh
        ?'<p><b>Do:</b> Carry rain protection, allow extra travel time, check local waterlogging and keep drains and water outlets clear where needed.</p><p><b>For farmers:</b> Check field drainage and postpone spraying or applying inputs when rain may wash them away.</p><p><b>Don’t:</b> Walk or drive through flowing or floodwater, stand under isolated trees during thunderstorms, or assume the forecast rainfall amount will occur exactly as shown.</p>'
        :rainCaution
          ?'<p><b>Do:</b> Keep an eye on changing skies, carry an umbrella if going out and recheck the forecast before outdoor plans.</p><p><b>For farmers:</b> Consider the rain probability before irrigation, spraying and field operations.</p><p><b>Don’t:</b> Treat a forecast probability as a guarantee that rain will or will not occur.</p>'
          :'<p><b>Do:</b> Continue normal outdoor planning while checking local sky and ground conditions.</p><p><b>For farmers:</b> Use actual soil moisture and field conditions when deciding irrigation requirements.</p><p><b>Don’t:</b> Interpret a low forecast rainfall value as proof that no local shower can occur.</p>'
    });

    // Wind and gust awareness.
    const windHigh=(Number.isFinite(gust6)&&gust6>=40)||(Number.isFinite(wind6)&&wind6>=30);
    const windCaution=!windHigh&&((Number.isFinite(gust6)&&gust6>=25)||(Number.isFinite(wind6)&&wind6>=20));
    items.push({
      category:'wind',icon:'💨',level:windHigh?'high':windCaution?'caution':'normal',
      title:windHigh?'Strong wind watch · next 6 hours':windCaution?'Wind caution · next 6 hours':'Wind conditions · next 6 hours',
      summary:`Forecast wind up to ${fmt(wind6,0)} km/h; gusts up to ${fmt(gust6,0)} km/h.`,
      period:'Next 6 hours · weather-model estimate',
      details:windHigh
        ?'<p><b>Do:</b> Secure loose outdoor objects, exercise care around trees and temporary structures, and postpone exposed outdoor work when conditions are unsafe.</p><p><b>For farmers and drone users:</b> Check actual wind and gusts at the site and follow equipment, aviation and pesticide-label limits.</p><p><b>Don’t:</b> Fly drones, spray chemicals, climb exposed structures or work near unstable trees when conditions exceed applicable safety limits.</p>'
        :windCaution
          ?'<p><b>Do:</b> Secure lightweight objects and check wind conditions before cycling, outdoor events, spraying or operating equipment.</p><p><b>For drone users:</b> Verify actual wind and gusts against the aircraft and operator limits before take-off.</p><p><b>Don’t:</b> Assume the model wind value is the exact wind at your location.</p>'
          :'<p><b>Do:</b> Continue routine outdoor activities while remaining aware of local gusts and changing conditions.</p><p><b>For farmers and drone users:</b> Check wind at the work site before spraying or flying.</p><p><b>Don’t:</b> Use this forecast alone as clearance for any safety-sensitive operation.</p>'
    });

    // Heat, UV and hydration awareness.
    const heatValue=Math.max(Number.isFinite(temp24)?temp24:-Infinity,Number.isFinite(currentTemp)?currentTemp:-Infinity);
    const heatHigh=heatValue>=38||uvNow>=8;
    const heatCaution=!heatHigh&&(heatValue>=35||uvNow>=6);
    items.push({
      category:'heat',icon:heatHigh?'🥵':'☀️',level:heatHigh?'high':heatCaution?'caution':'normal',
      title:heatHigh?'Heat and sun protection · high attention':heatCaution?'Sun and heat awareness':'Outdoor comfort · heat and UV',
      summary:`Current temperature ${fmt(currentTemp,0)}°C; forecast maximum in the next 24 hours ${fmt(temp24,0)}°C; current UV index ${fmt(uvNow,1)}.`,
      period:'Current conditions and next 24 hours',
      details:heatHigh||heatCaution
        ?'<p><b>Do:</b> Drink water regularly, use shade and suitable sun protection, and schedule strenuous outdoor work during cooler hours where possible. Take rest breaks.</p><p><b>Don’t:</b> Ignore dizziness, weakness, headache or other signs of heat illness, or leave children, older adults or pets in parked vehicles.</p><p>Follow local health and heat-safety advice. UV and temperature values are model/provider estimates.</p>'
        :'<p><b>Do:</b> Maintain normal hydration and use sun protection during prolonged exposure.</p><p><b>Don’t:</b> Assume comfortable air temperature means UV exposure is absent. Check the UV index again before extended outdoor activity.</p>'
    });

    // General local conditions and a practical daily checklist.
    const thunderNow=[95,96,99].includes(currentCode);
    const fogNow=[45,48].includes(currentCode);
    const wetNow=[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(currentCode);
    let dailyLevel='normal';
    let dailyIcon='🧭';
    let dailyTitle='Plan your day · check local conditions';
    let dailySummary='Use the latest local forecast as a planning guide and confirm conditions at the place where you are going.';
    let dailyDetails='<p><b>Do:</b> Check the forecast before travelling or arranging outdoor work, keep drinking water available and allow flexibility in your plans.</p><p><b>Don’t:</b> Treat a forecast as a guarantee. Conditions can vary across Annamalai Nagar, Chidambaram and nearby coastal areas.</p>';

    if(thunderNow){
      dailyLevel='high';dailyIcon='⛈️';dailyTitle='Thunderstorm awareness · take shelter';
      dailySummary='The current weather code indicates thunderstorm conditions. Conditions may vary locally.';
      dailyDetails='<p><b>Do:</b> Move indoors or into a fully enclosed vehicle, and follow official local updates.</p><p><b>Don’t:</b> Remain in open fields, near water, under isolated trees or on exposed rooftops during thunder and lightning. Avoid using wired electrical equipment.</p>';
    }else if(fogNow){
      dailyLevel='caution';dailyIcon='🌫️';dailyTitle='Visibility awareness · travel carefully';
      dailySummary='The current weather code indicates fog or reduced-visibility conditions.';
      dailyDetails='<p><b>Do:</b> Reduce speed, increase following distance and use appropriate vehicle lights while travelling.</p><p><b>Don’t:</b> Rush, overtake unnecessarily or assume visibility is uniform along the route.</p>';
    }else if(wetNow||rainHigh){
      dailyLevel='caution';dailyIcon='🌧️';dailyTitle='Wet-weather awareness · plan ahead';
      dailySummary='Current or forecast conditions indicate rain or showers in the available weather data.';
      dailyDetails='<p><b>Do:</b> Use rain protection, watch for slippery roads and check drainage around buildings and fields.</p><p><b>Don’t:</b> Touch fallen electrical wires or cross flooded roads and water channels.</p>';
    }else if(windHigh){
      dailyLevel='high';dailyIcon='💨';dailyTitle='Outdoor safety · strong winds possible';
      dailySummary='The forecast indicates stronger winds or gusts during the next six hours.';
      dailyDetails='<p><b>Do:</b> Secure loose objects and postpone exposed work if on-site conditions are unsafe.</p><p><b>Don’t:</b> Stand near unstable trees, loose hoardings or temporary structures.</p>';
    }

    items.push({
      category:'daily',icon:dailyIcon,level:dailyLevel,
      title:dailyTitle,summary:dailySummary,
      period:'Annamalai Nagar · current conditions and forecast',
      details:dailyDetails
    });

    const snapshot=dateTime(c.time);
    const conditions=[
      `Temperature ${fmt(currentTemp,0)}°C`,
      `Humidity ${fmt(humidity,0)}%`,
      `Wind ${fmt(currentWind,0)} km/h`,
      `Rain chance ${fmt(chance24,0)}%`
    ];
    const cardMarkup=items.map(advisoryCard).join('');

    host.innerHTML=`
      <style>
        #advisories{display:block}
        #advisories .awi-shell{width:100%;display:block}
        #advisories .awi-head{padding:18px 20px;border:1px solid rgba(112,240,180,.24);border-radius:18px;background:linear-gradient(125deg,rgba(8,55,39,.94),rgba(7,26,43,.96));box-shadow:0 12px 30px rgba(0,0,0,.16);margin-bottom:14px}
        #advisories .awi-headline{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        #advisories .awi-kicker{font-size:10px;letter-spacing:1.7px;font-weight:800;color:#9ed9c0;text-transform:uppercase}
        #advisories .awi-title{font-size:18px;font-weight:800;color:#f4f7ef;margin:5px 0}
        #advisories .awi-sub{font-size:12px;color:#a9bdc9;line-height:1.55;margin:5px 0 0}
        #advisories .awi-count{border:1px solid rgba(112,240,180,.3);border-radius:999px;padding:7px 11px;color:#a9f0cc;font-size:11px;font-weight:700}
        #advisories .awi-conditions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}
        #advisories .awi-condition{border:1px solid rgba(164,194,185,.18);border-radius:999px;padding:6px 9px;background:rgba(4,20,31,.38);color:#c4d8d5;font-size:10px}
        #advisories .awi-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0}
        #advisories .awi-filter{border:1px solid rgba(164,194,185,.25);border-radius:999px;padding:8px 12px;background:rgba(7,26,43,.78);color:#c5d6d3;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
        #advisories .awi-filter[aria-pressed="true"]{background:rgba(44,125,91,.42);border-color:#70f0b4;color:#eafff3}
        #advisories .awi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        #advisories .awi-card{min-width:0;border:1px solid rgba(164,194,185,.2);border-radius:16px;padding:16px;background:linear-gradient(145deg,rgba(9,43,35,.94),rgba(7,26,43,.96));box-shadow:0 8px 22px rgba(0,0,0,.13);color:#edf5ef}
        #advisories .awi-card.high{border-color:rgba(255,120,100,.55);background:linear-gradient(145deg,rgba(74,35,31,.88),rgba(7,26,43,.97))}
        #advisories .awi-card.caution{border-color:rgba(255,202,112,.4)}
        #advisories .awi-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
        #advisories .awi-icon{font-size:23px}
        #advisories .awi-level{font-size:9px;letter-spacing:1px;font-weight:800;color:#a9d9c4;border:1px solid rgba(169,217,196,.25);border-radius:999px;padding:5px 8px}
        #advisories .awi-card.high .awi-level{color:#ffc0ad;border-color:rgba(255,150,125,.4)}
        #advisories .awi-card.caution .awi-level{color:#ffda9a;border-color:rgba(255,218,154,.35)}
        #advisories .awi-card h3{font-size:14px;line-height:1.4;margin:0 0 7px;color:#f5f7ef}
        #advisories .awi-summary{font-size:12px;line-height:1.6;color:#c0d0d4;margin:0}
        #advisories .awi-period{font-size:10px;color:#8fb5b6;margin-top:10px}
        #advisories .awi-details{border-top:1px solid rgba(164,194,185,.16);margin-top:12px;padding-top:10px}
        #advisories .awi-details summary{font-size:11px;font-weight:700;color:#8ed9e8;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px}
        #advisories .awi-details summary::-webkit-details-marker{display:none}
        #advisories .awi-detail-body{font-size:11px;line-height:1.65;color:#c4d2d5;padding-top:9px}
        #advisories .awi-detail-body p{margin:0 0 8px}
        #advisories .awi-detail-body a{color:#8ed9e8;text-decoration:none;font-weight:700}
        #advisories .awi-foot{font-size:10px;line-height:1.55;color:#8fa9b2;margin:12px 2px 0}
        @media(max-width:650px){#advisories .awi-grid{grid-template-columns:1fr}#advisories .awi-head{padding:15px}}
      </style>
      <div class="awi-shell">
        <div class="awi-head">
          <div class="awi-headline">
            <div>
              <div class="awi-kicker">LOCAL WEATHER INTELLIGENCE · ANNAMALAI NAGAR</div>
              <div class="awi-title">What to do today · What to watch out for</div>
              <p class="awi-sub">Practical, general weather-awareness guidance for residents, visitors, commuters and farmers, generated from the weather data already displayed on this website.</p>
            </div>
            <span class="awi-count">${items.length} live guidance cards</span>
          </div>
          <div class="awi-conditions">${conditions.map(x=>`<span class="awi-condition">${escapeHtml(x)}</span>`).join('')}</div>
        </div>
        <div class="awi-controls" aria-label="Filter local weather guidance">
          <button type="button" class="awi-filter" data-filter="all" aria-pressed="${advisoryFilter==='all'}">All guidance</button>
          <button type="button" class="awi-filter" data-filter="official" aria-pressed="${advisoryFilter==='official'}">Official alerts</button>
          <button type="button" class="awi-filter" data-filter="rain" aria-pressed="${advisoryFilter==='rain'}">Rain</button>
          <button type="button" class="awi-filter" data-filter="wind" aria-pressed="${advisoryFilter==='wind'}">Wind</button>
          <button type="button" class="awi-filter" data-filter="heat" aria-pressed="${advisoryFilter==='heat'}">Heat & UV</button>
          <button type="button" class="awi-filter" data-filter="daily" aria-pressed="${advisoryFilter==='daily'}">Daily awareness</button>
        </div>
        <div class="awi-grid">${cardMarkup}</div>
        <p class="awi-foot">Based on the latest weather data fetched for 11.3893° N, 79.7158° E. Forecasts are model estimates, not guaranteed local observations or official warnings. Guidance refreshes whenever the dashboard refreshes. Forecast timestamp: ${escapeHtml(snapshot)}.</p>
      </div>`;

    host.querySelectorAll('.awi-filter').forEach(button=>{
      button.addEventListener('click',()=>{
        advisoryFilter=button.dataset.filter||'all';
        host.querySelectorAll('.awi-filter').forEach(b=>{
          b.setAttribute('aria-pressed',String((b.dataset.filter||'all')===advisoryFilter));
        });
        host.querySelectorAll('.awi-card').forEach(card=>{
          card.style.display=advisoryFilter==='all'||card.dataset.category===advisoryFilter?'':'none';
        });
      });
    });

    host.querySelectorAll('.awi-card').forEach(card=>{
      const details=card.querySelector('.awi-details');
      if(details){
        details.addEventListener('toggle',()=>{
          const mark=details.querySelector('summary span');
          if(mark)mark.textContent=details.open?'−':'＋';
        });
      }
    });

    host.querySelectorAll('.awi-card').forEach(card=>{
      card.style.display=advisoryFilter==='all'||card.dataset.category===advisoryFilter?'':'none';
    });
    host.querySelectorAll('.awi-filter').forEach(button=>{
      button.setAttribute('aria-pressed',String((button.dataset.filter||'all')===advisoryFilter));
    });
  }

  // Convert weather descriptions from the backup service into WMO-style codes.
  function wttrCode(desc){
    const s=String(desc||'').toLowerCase();

    if(s.includes('thunder'))return 95;
    if(s.includes('snow')||s.includes('sleet')||s.includes('ice'))return 71;
    if(s.includes('fog')||s.includes('mist'))return 45;
    if(s.includes('drizzle'))return 51;
    if(s.includes('rain')||s.includes('shower'))return 61;
    if(s.includes('overcast'))return 3;
    if(s.includes('cloud'))return 2;
    if(s.includes('sun')||s.includes('clear'))return 0;

    return 1;
  }

  // Normalize backup data so the existing dashboard renderers can use it.
  function normalizeWttr(raw){
    if(!raw||!raw.current_condition?.[0]||!Array.isArray(raw.weather)||!raw.weather.length){
      throw Error('Backup provider returned incomplete data');
    }

    const cc=raw.current_condition[0];
    const days=raw.weather;
    const now=new Date();

    const localNow=new Intl.DateTimeFormat('en-CA',{
      timeZone:TZ,
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).format(now);

    const hourNow=Number(new Intl.DateTimeFormat('en-GB',{
      timeZone:TZ,
      hour:'2-digit',
      hourCycle:'h23'
    }).format(now));

    const currentTime=`${localNow}T${String(hourNow).padStart(2,'0')}:00`;
    const currentDesc=cc.weatherDesc?.[0]?.value||'Weather conditions';
    const currentCode=wttrCode(currentDesc);

    const hourly={
      time:[],
      temperature_2m:[],
      apparent_temperature:[],
      relative_humidity_2m:[],
      dew_point_2m:[],
      wet_bulb_temperature_2m:[],
      wind_speed_10m:[],
      wind_gusts_10m:[],
      wind_direction_10m:[],
      pressure_msl:[],
      uv_index:[],
      cloud_cover:[],
      precipitation:[],
      precipitation_probability:[],
      weather_code:[],
      et0_fao_evapotranspiration:[],
      vapour_pressure_deficit:[],
      shortwave_radiation:[],
      soil_temperature_0_to_7cm:[],
      soil_moisture_0_to_7cm:[]
    };

    const daily={
      time:[],
      weather_code:[],
      temperature_2m_max:[],
      temperature_2m_min:[],
      precipitation_sum:[],
      precipitation_probability_max:[],
      uv_index_max:[],
      sunrise:[],
      sunset:[],
      wind_speed_10m_max:[],
      wind_gusts_10m_max:[],
      sunshine_duration:[]
    };

    const keys=Object.keys(hourly).filter(k=>k!=='time');

    days.forEach(day=>{
      const date=day.date;
      const hrs=day.hourly||[];
      const desc=hrs[0]?.weatherDesc?.[0]?.value||'';
      const codes=hrs.map(x=>wttrCode(x.weatherDesc?.[0]?.value||desc));
      const rainTotal=hrs.reduce((a,x)=>a+(Number(x.precipMM)||0),0);

      daily.time.push(date);
      daily.weather_code.push(wttrCode(hrs[4]?.weatherDesc?.[0]?.value||desc));
      daily.temperature_2m_max.push(Number(day.maxtempC));
      daily.temperature_2m_min.push(Number(day.mintempC));
      daily.precipitation_sum.push(rainTotal);
      daily.precipitation_probability_max.push(Math.max(0,...hrs.map(x=>Number(x.chanceofrain)||0)));
      daily.uv_index_max.push(Number(day.uvIndex)||0);
      daily.sunrise.push(day.astronomy?.[0]?.sunrise||'');
      daily.sunset.push(day.astronomy?.[0]?.sunset||'');
      daily.wind_speed_10m_max.push(Math.max(0,...hrs.map(x=>Number(x.windspeedKmph)||0)));
      daily.wind_gusts_10m_max.push(Math.max(0,...hrs.map(x=>Number(x.windspeedKmph)||0)));
      daily.sunshine_duration.push(null);

      hrs.forEach((x,i)=>{
        const baseHour=Math.floor(Number(x.time||0)/100);

        for(let k=0;k<3;k++){
          const hour=(baseHour+k)%24;
          const iso=`${date}T${String(hour).padStart(2,'0')}:00`;
          hourly.time.push(iso);

          const map={
            temperature_2m:Number(x.tempC),
            apparent_temperature:Number(x.FeelsLikeC),
            relative_humidity_2m:Number(x.humidity),
            dew_point_2m:NaN,
            wet_bulb_temperature_2m:NaN,
            wind_speed_10m:Number(x.windspeedKmph),
            wind_gusts_10m:Number(x.windspeedKmph),
            wind_direction_10m:Number(x.winddirDegree),
            pressure_msl:Number(x.pressure),
            uv_index:Number(x.uvIndex),
            cloud_cover:Number(x.cloudcover),
            precipitation:(Number(x.precipMM)||0)/3,
            precipitation_probability:Number(x.chanceofrain),
            weather_code:codes[i]??currentCode,
            et0_fao_evapotranspiration:NaN,
            vapour_pressure_deficit:NaN,
            shortwave_radiation:NaN,
            soil_temperature_0_to_7cm:NaN,
            soil_moisture_0_to_7cm:NaN
          };

          keys.forEach(key=>hourly[key].push(map[key]??NaN));
        }
      });
    });

    const current={
      time:currentTime,
      temperature_2m:Number(cc.temp_C),
      apparent_temperature:Number(cc.FeelsLikeC),
      relative_humidity_2m:Number(cc.humidity),
      is_day:(hourNow>=6&&hourNow<18)?1:0,
      precipitation:Number(cc.precipMM)||0,
      weather_code:currentCode,
      pressure_msl:Number(cc.pressure),
      wind_speed_10m:Number(cc.windspeedKmph),
      wind_direction_10m:Number(cc.winddirDegree),
      wind_gusts_10m:Number(cc.windspeedKmph),
      cloud_cover:Number(cc.cloudcover),
      dew_point_2m:NaN,
      wet_bulb_temperature_2m:NaN,
      uv_index:Number(cc.uvIndex)
    };

    if(!hourly.time.includes(currentTime)){
      hourly.time.unshift(currentTime);

      keys.forEach(key=>{
        const value={
          temperature_2m:current.temperature_2m,
          apparent_temperature:current.apparent_temperature,
          relative_humidity_2m:current.relative_humidity_2m,
          wind_speed_10m:current.wind_speed_10m,
          wind_direction_10m:current.wind_direction_10m,
          pressure_msl:current.pressure_msl,
          cloud_cover:current.cloud_cover,
          uv_index:current.uv_index,
          weather_code:current.weather_code,
          precipitation:current.precipitation
        };

        hourly[key].unshift(Object.prototype.hasOwnProperty.call(value,key)?value[key]:NaN);
      });
    }

    const order=hourly.time.map((t,i)=>({t,i})).sort((a,b)=>a.t.localeCompare(b.t));
    hourly.time=order.map(x=>x.t);
    keys.forEach(key=>{hourly[key]=order.map(x=>hourly[key][x.i])});

    return {current,hourly,daily};
  }

  async function fetchWeatherWithFallback(primaryUrl){
    try{
      const data=await fetchJson(primaryUrl);

      if(!data.current||!data.hourly||!data.daily){
        throw Error('Primary provider returned incomplete data');
      }

      return {data,provider:'Open-Meteo'};
    }catch(primaryError){
      console.warn('Open-Meteo unavailable; trying backup provider.',primaryError);
      const backup=await fetchJson('https://wttr.in/Annamalai%20Nagar?format=j1');

      return {data:normalizeWttr(backup),provider:'wttr.in (backup)'};
    }
  }

  async function loadWeather(){
    if(loadInProgress)return;
    loadInProgress=true;

    const btn=$('refresh-btn');
    btn.disabled=true;
    btn.innerHTML='<span>↻</span> Updating…';
    status('Fetching latest available data…');

    let fromCache=false,cachedRecord=null;

    try{
      const p=new URLSearchParams({
        latitude:LAT,
        longitude:LON,
        timezone:TZ,
        past_days:'2',
        forecast_days:'7',
        wind_speed_unit:'kmh',
        precipitation_unit:'mm',
        temperature_unit:'celsius',
        current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,dew_point_2m,wet_bulb_temperature_2m,uv_index',
        hourly:'temperature_2m,precipitation,precipitation_probability,relative_humidity_2m,dew_point_2m,wet_bulb_temperature_2m,wind_speed_10m,wind_gusts_10m,uv_index,et0_fao_evapotranspiration,vapour_pressure_deficit,shortwave_radiation,soil_temperature_0_to_7cm,soil_moisture_0_to_7cm',
        daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,sunrise,sunset,wind_speed_10m_max,wind_gusts_10m_max,sunshine_duration'
      });

      let data,provider='Open-Meteo';

      try{
        const result=await fetchWeatherWithFallback('https://api.open-meteo.com/v1/forecast?'+p);
        data=result.data;
        provider=result.provider;
        saveWeatherCache(data);

        try{
          localStorage.setItem('annamalai-weather-provider-v1',provider);
        }catch(_){}
      }catch(networkError){
        cachedRecord=readWeatherCache();

        if(!cachedRecord)throw networkError;

        data=cachedRecord.data;
        fromCache=true;

        try{
          provider=localStorage.getItem('annamalai-weather-provider-v1')||'previously saved provider';
        }catch(_){
          provider='previously saved provider';
        }
      }

      const c=data.current,h=data.hourly,d=data.daily;
      const ix=indexAt(h,c.time);
      const start=Math.min(ix+1,h.time.length-1);
      const prev=past24(h,c.time);
      const today=c.time.slice(0,10);
      const [icon,desc]=wx(c.weather_code);

      $('weather-icon').textContent=icon;
      $('weather-description').textContent=desc;
      $('temperature').textContent=fmt(c.temperature_2m,1);
      $('feels-like').textContent=fmt(c.apparent_temperature,1);
      $('humidity').textContent=fmt(c.relative_humidity_2m,0);
      $('humidity-meter').style.width=Math.max(0,Math.min(100,Number(c.relative_humidity_2m)||0))+'%';
      $('dew-point').textContent=fmt(c.dew_point_2m,1);
      $('wind').textContent=fmt(c.wind_speed_10m,1);
      $('wind-direction').textContent=`${windDir(c.wind_direction_10m)} (${fmt(c.wind_direction_10m,0)}°)`;
      $('gust-next-6').textContent=fmt(max(h,'wind_gusts_10m',start,6),1);
      $('gust-current').textContent=fmt(c.wind_gusts_10m,1);
      $('pressure').textContent=fmt(c.pressure_msl,0);
      $('uv').textContent=fmt(c.uv_index,1);
      $('uv-note').textContent=Number(c.uv_index)>=8?'Very high · use protection':Number(c.uv_index)>=6?'High · sun protection advised':'Current model estimate';
      $('uv-meter').style.width=Math.min(100,Math.max(0,(Number(c.uv_index)||0)/11*100))+'%';
      $('cloud-cover').textContent=fmt(c.cloud_cover,0);
      $('wet-bulb').textContent=fmt(c.wet_bulb_temperature_2m,1);
      $('day-night').textContent=Number(c.is_day)===1?'DAYTIME CONDITIONS':'NIGHT-TIME CONDITIONS';
      $('model-time').textContent=dateTime(c.time);

      const fetched=fromCache?new Date(cachedRecord.savedAt):new Date();
      $('updated-at').textContent=dateTime(fetched.toISOString());

      $('freshness').textContent=fromCache?'SAVED DATA · last successful update':'Fetched just now';

      renderForecast(data,today);
      renderRain(data,start,prev,today);
      renderAgro(data,start);

      // Render weather-based reminders immediately; update the official-alert
      // card when the optional feed request finishes.
      renderAdvisories(c,data,start,null);
      const officialFeed=await fetchOfficialAlerts();
      renderAdvisories(c,data,start,officialFeed);

      $('imd-status').textContent=`Weather estimates supplied by ${provider}. Live IMD station observations/warnings are not integrated; check official links above.`;

      if(fromCache){
        status('Connection unavailable · showing saved data',false);
        $('freshness').textContent='SAVED DATA · last successful update';
        $('imd-status').textContent=`A fresh update could not be retrieved. Values shown are saved from the last successful ${provider} update, not live readings. Check the timestamp above.`;
      }else{
        status(provider==='Open-Meteo'?'Latest data loaded · Open-Meteo':'Backup data loaded · wttr.in',true);
        $('freshness').textContent=`Fetched just now · ${provider}`;
      }

    }catch(e){
      console.error(e);
      status('Weather connection unavailable',false);
      $('freshness').textContent='No new update · previous display retained';
      $('imd-status').textContent='A fresh update could not be retrieved after automatic retries. Previously displayed values have been retained with their original timestamp. Check your connection and try Refresh now.';

      if(!$('temperature').textContent||$('temperature').textContent==='—'){
        $('weather-description').textContent='Weather data temporarily unavailable';
      }
    }finally{
      loadInProgress=false;
      btn.disabled=false;
      btn.innerHTML='<span>↻</span> Refresh now';
    }
  }

  function makeQr(){
    const host=$('qrcode');
    if(!host)return;

    const target='https://sheikshalik.github.io/annamalai-nagar-weather/';

    if(typeof QRCode==='undefined'){
      $('qr-message').textContent='QR service did not load. The dashboard address is fixed in the QR generator.';
      return;
    }

    host.innerHTML='';

    new QRCode(host,{
      text:target,
      width:120,
      height:120,
      colorDark:'#081a2b',
      colorLight:'#ffffff',
      correctLevel:QRCode.CorrectLevel.H
    });

    $('qr-message').textContent='Scan to open the live dashboard.';
  }

  $('refresh-btn').addEventListener('click',loadWeather);
  loadWeather();
  makeQr();

  setInterval(()=>{
    if(!document.hidden)loadWeather();
  },10*60*1000);

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)loadWeather();
  });

})();
