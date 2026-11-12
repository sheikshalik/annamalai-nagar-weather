
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

  // Interactive weather-aware reminders.
  // This module uses the weather data already fetched by the dashboard.
  // It does not make additional weather requests or change other dashboard modules.
  let advisoryCropStage='general';
  let advisoryFilter='all';
  let advisoryLastContext=null;

  function riceStageGuidance(stage){
    const guidance={
      nursery:{
        title:'Rice nursery',
        text:'Check nursery-bed moisture and drainage. Avoid input applications immediately before forecast rain, and follow the locally recommended nursery water and nutrient schedule.'
      },
      transplanting:{
        title:'Transplanting',
        text:'Use the rainfall outlook to plan field preparation and transplanting. Check field water depth and drainage, and avoid scheduling field operations during heavy rain or unsuitable wind.'
      },
      tillering:{
        title:'Active tillering',
        text:'Inspect crop stand, field water and weed pressure. Time fertilizer operations according to the recommended split schedule and avoid application when rainfall may cause runoff or nutrient loss.'
      },
      panicle:{
        title:'Panicle initiation',
        text:'Monitor crop water status and field conditions closely. Avoid water stress and plan nutrient or crop-protection operations around forecast rain and wind, following local recommendations.'
      },
      flowering:{
        title:'Flowering',
        text:'Pay close attention to field water status and weather conditions during flowering. Avoid unnecessary field disturbance and postpone spraying during rain, strong wind or unsuitable conditions.'
      },
      grain:{
        title:'Grain filling',
        text:'Monitor crop maturity, field water and lodging risk. Use the wind and rainfall outlook to plan field visits and protect the crop from avoidable weather-related losses.'
      },
      harvest:{
        title:'Harvest',
        text:'Check crop maturity and the forecast dry window before harvest. Plan cutting, threshing and grain drying to reduce exposure to rain; arrange safe storage for harvested produce.'
      }
    };
    return guidance[stage]||null;
  }

  function advisoryCard(item,index){
    const levelClass=item.level==='high'?'high':item.level==='caution'?'caution':'normal';
    const levelLabel=item.level==='high'?'HIGH ATTENTION':item.level==='caution'?'CAUTION':'PLANNING NOTE';
    return `
      <article class="awi-card ${levelClass}" data-category="${escapeHtml(item.category)}">
        <div class="awi-card-top">
          <span class="awi-icon" aria-hidden="true">${item.icon}</span>
          <span class="awi-level">${levelLabel}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="awi-summary">${escapeHtml(item.summary)}</p>
        <div class="awi-period">${escapeHtml(item.period||'Forecast-based guidance')}</div>
        <details class="awi-details">
          <summary>View recommendation <span aria-hidden="true">＋</span></summary>
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

    const items=[];
    const activeAlerts=officialFeed&&Array.isArray(officialFeed.alerts)
      ?officialFeed.alerts.filter(a=>a&&a.title)
      :[];

    // Official alerts are kept separate from model-generated guidance.
    if(activeAlerts.length){
      activeAlerts.slice(0,3).forEach(a=>{
        const sev=alertSeverity(a.severity);
        const level=String(a.severity||'').toLowerCase()==='red'||
          String(a.severity||'').toLowerCase()==='orange'?'high':'caution';
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
          summary:a.description||'An official weather update is available. Read the bulletin and follow instructions from the district administration.',
          period:'Official bulletin · '+district,
          details:`<p>${escapeHtml(a.description||'Please read the official bulletin and follow district administration instructions.')}</p><p><b>District:</b> ${district}<br><b>Source:</b> ${source}${issued}${valid}${areas}</p>${link}`
        });
      });
    }else if(officialFeed){
      items.push({
        category:'official',icon:'✅',level:'normal',
        title:'Official alert feed checked',
        summary:'The connected feed reports no active alerts at the time it was checked.',
        period:'Feed update · '+dateTime(officialFeed.updatedAt),
        details:`<p>${escapeHtml(officialFeed.district||'Cuddalore district')}: no active alerts were listed in the connected feed. This result applies only to that feed and its update time.</p><p><b>Source:</b> ${escapeHtml(officialFeed.source||'Official source')}</p>`
      });
    }else{
      items.push({
        category:'official',icon:'📣',level:'caution',
        title:'Official warnings · verification needed',
        summary:'A verified live government warning feed is not connected. The absence of a feed must not be interpreted as an absence of warnings.',
        period:'Check before weather-sensitive operations',
        details:'<p>Check the latest official IMD and Tamil Nadu government bulletins for Cuddalore district before making weather-sensitive field decisions.</p><p><a href="https://mausam.imd.gov.in/" target="_blank" rel="noopener noreferrer">IMD Mausam ↗</a> &nbsp; <a href="https://agritech.tnau.ac.in/agrometeorologicaladvisory/agro_meteorological_advisory_tnau_district.html" target="_blank" rel="noopener noreferrer">TNAU district advisories ↗</a></p>'
      });
    }

    // Rainfall guidance based on the forecast already loaded by the website.
    if(Number.isFinite(rain6)&&Number.isFinite(chance6)&&(rain6>=5||chance6>=70)){
      items.push({
        category:'rain',icon:'🌧️',level:'caution',
        title:'Rain watch · next 6 hours',
        summary:`Forecast rainfall is ${fmt(rain6,1)} mm over 6 hours; maximum hourly rain probability is ${fmt(chance6,0)}%.`,
        period:'Next 6 hours · model forecast',
        details:'<p>Inspect field drains, outlets and low-lying plots. Avoid spraying or fertilizer application when rainfall may cause runoff or reduce input effectiveness. Recheck the forecast and actual field conditions before acting.</p><p><b>Data type:</b> Numerical weather-model estimate, not a rain-gauge observation.</p>'
      });
    }else{
      items.push({
        category:'rain',icon:'🌦️',level:'normal',
        title:'Rainfall outlook · next 24 hours',
        summary:`Forecast rainfall is ${fmt(rain24,1)} mm over 24 hours; maximum hourly rain probability is ${fmt(chance24,0)}%.`,
        period:'Next 24 hours · model forecast',
        details:'<p>Use the rainfall outlook for planning field access, irrigation and input applications. Confirm actual rainfall and field moisture locally; forecast values may change as the model updates.</p><p><b>Data type:</b> Numerical weather-model estimate, not a rain-gauge observation.</p>'
      });
    }

    // Wind, gust and heat guidance.
    if((Number.isFinite(gust6)&&gust6>=25)||(Number.isFinite(wind6)&&wind6>=20)){
      items.push({
        category:'operations',icon:'💨',level:'high',
        title:'Wind watch · spraying and drone operations',
        summary:`Forecast wind is up to ${fmt(wind6,0)} km/h, with gusts up to ${fmt(gust6,0)} km/h in the next 6 hours.`,
        period:'Next 6 hours · model forecast',
        details:'<p>Check wind speed and direction at the field before any operation. Follow pesticide-label restrictions, local safety requirements and the drone manufacturer/operator limits. Postpone spraying or flights when conditions exceed the applicable limits.</p><p><b>Note:</b> The forecast is not a substitute for an on-site wind measurement.</p>'
      });
    }else if(Number.isFinite(temp24)&&temp24>=35){
      items.push({
        category:'operations',icon:'☀️',level:'caution',
        title:'Heat watch · outdoor field work',
        summary:`Forecast temperature may reach ${fmt(temp24,0)}°C during the next 24 hours.`,
        period:'Next 24 hours · model forecast',
        details:'<p>Where practical, schedule strenuous outdoor work during cooler periods. Provide drinking water, rest breaks and shade, and follow local heat-safety guidance.</p>'
      });
    }else{
      items.push({
        category:'operations',icon:'🧭',level:'normal',
        title:'Field operations · check local conditions',
        summary:'No high-wind or high-temperature trigger was identified in the available forecast window.',
        period:'Next 6–24 hours · model forecast',
        details:'<p>This is not a guarantee of safe operating conditions. Check actual wind, rainfall, field trafficability and product-label requirements before spraying, drone operations or machinery use.</p>'
      });
    }

    // Optional rice growth-stage guidance selected by the visitor.
    const stage=riceStageGuidance(advisoryCropStage);
    if(stage){
      items.push({
        category:'rice',icon:'🌾',level:'normal',
        title:`Rice guidance · ${stage.title}`,
        summary:'Stage-specific planning note. Adjust all operations to the crop condition and local agricultural recommendations.',
        period:'User-selected rice growth stage',
        details:`<p>${escapeHtml(stage.text)}</p><p><a href="https://agritech.tnau.ac.in/agrometeorologicaladvisory/agro_meteorological_advisory_tnau_district.html" target="_blank" rel="noopener noreferrer">Consult TNAU district Agro-Met advisories ↗</a></p>`
      });
    }else{
      items.push({
        category:'rice',icon:'🌾',level:'normal',
        title:'Crop-stage guidance',
        summary:'Select a rice growth stage to display more relevant weather-aware planning notes.',
        period:'Optional personalisation',
        details:'<p>Choose the closest crop stage from the selector above. The guidance is general decision support; follow the locally recommended crop production practices and current field conditions.</p>'
      });
    }

    // TNAU advisory portal remains a source reference, not a claimed live feed.
    items.push({
      category:'source',icon:'📚',level:'normal',
      title:'TNAU · District agricultural weather advisory',
      summary:'Find Tamil Nadu district-wise Agro-Met Advisory Bulletins for crop-specific recommendations.',
      period:'External agricultural reference',
      details:'<p>Check the bulletin issue date, district, crop and forecast validity before applying its recommendations.</p><p><a href="https://agritech.tnau.ac.in/agrometeorologicaladvisory/agro_meteorological_advisory_tnau_district.html" target="_blank" rel="noopener noreferrer">Open TNAU district advisory portal ↗</a></p>'
    });

    const snapshot=dateTime(c.time);
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
        #advisories .awi-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0}
        #advisories .awi-filter{border:1px solid rgba(164,194,185,.25);border-radius:999px;padding:8px 12px;background:rgba(7,26,43,.78);color:#c5d6d3;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
        #advisories .awi-filter[aria-pressed="true"]{background:rgba(44,125,91,.42);border-color:#70f0b4;color:#eafff3}
        #advisories .awi-stage{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-left:auto;color:#a9bdc9;font-size:11px}
        #advisories .awi-stage select{max-width:220px;border:1px solid rgba(164,194,185,.3);border-radius:10px;padding:9px 11px;background:#0b2635;color:#edf5ef;font:inherit}
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
        #advisories .awi-empty{color:#b7c8cc;padding:18px;border:1px dashed rgba(164,194,185,.25);border-radius:12px}
        @media(max-width:650px){#advisories .awi-grid{grid-template-columns:1fr}#advisories .awi-head{padding:15px}#advisories .awi-stage{margin-left:0;width:100%}#advisories .awi-stage select{flex:1;max-width:none}}
      </style>
      <div class="awi-shell">
        <div class="awi-head">
          <div class="awi-headline">
            <div>
              <div class="awi-kicker">LOCAL AGRICULTURAL WEATHER INTELLIGENCE</div>
              <div class="awi-title">Field decisions, guided by the forecast</div>
              <p class="awi-sub">Weather-based planning notes for Annamalai Nagar and the surrounding Cuddalore region. Always verify field conditions before acting.</p>
            </div>
            <span class="awi-count">${items.length} advisory cards</span>
          </div>
        </div>
        <div class="awi-controls" aria-label="Filter agricultural weather reminders">
          <button type="button" class="awi-filter" data-filter="all" aria-pressed="${advisoryFilter==='all'}">All</button>
          <button type="button" class="awi-filter" data-filter="official" aria-pressed="${advisoryFilter==='official'}">Official</button>
          <button type="button" class="awi-filter" data-filter="rain" aria-pressed="${advisoryFilter==='rain'}">Rain</button>
          <button type="button" class="awi-filter" data-filter="operations" aria-pressed="${advisoryFilter==='operations'}">Field operations</button>
          <button type="button" class="awi-filter" data-filter="rice" aria-pressed="${advisoryFilter==='rice'}">Rice</button>
          <label class="awi-stage">
            Rice growth stage
            <select id="awi-rice-stage" aria-label="Select rice growth stage">
              <option value="general" ${advisoryCropStage==='general'?'selected':''}>General / not selected</option>
              <option value="nursery" ${advisoryCropStage==='nursery'?'selected':''}>Nursery</option>
              <option value="transplanting" ${advisoryCropStage==='transplanting'?'selected':''}>Transplanting</option>
              <option value="tillering" ${advisoryCropStage==='tillering'?'selected':''}>Tillering</option>
              <option value="panicle" ${advisoryCropStage==='panicle'?'selected':''}>Panicle initiation</option>
              <option value="flowering" ${advisoryCropStage==='flowering'?'selected':''}>Flowering</option>
              <option value="grain" ${advisoryCropStage==='grain'?'selected':''}>Grain filling</option>
              <option value="harvest" ${advisoryCropStage==='harvest'?'selected':''}>Harvest</option>
            </select>
          </label>
        </div>
        <div class="awi-grid">${cardMarkup}</div>
        <p class="awi-foot">Forecast source: the weather provider already loaded by this dashboard. Model estimates are not observations or official warnings. Official alerts appear only when a valid authorised feed is available. Forecast timestamp: ${escapeHtml(snapshot)}.</p>
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

    const stageSelect=host.querySelector('#awi-rice-stage');
    if(stageSelect){
      stageSelect.addEventListener('change',()=>{
        advisoryCropStage=stageSelect.value;
        const ctx=advisoryLastContext;
        if(ctx)renderAdvisories(ctx.c,ctx.data,ctx.start,ctx.officialFeed);
      });
    }

    host.querySelectorAll('.awi-card').forEach(card=>{
      const summary=card.querySelector('.awi-details summary');
      const details=card.querySelector('.awi-details');
      if(summary&&details){
        details.addEventListener('toggle',()=>{
          const mark=summary.querySelector('span');
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
