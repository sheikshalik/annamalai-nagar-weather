
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

  function renderAgro(data,start){
    const h=data.hourly;
    const set=(id,v,d=1)=>$(id).textContent=fmt(v,d);

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

  // UPDATED WEATHER-AWARE REMINDERS
  function renderAdvisories(c,data,start,officialFeed){
    const h=data.hourly;

    const rain6=sum(h,'precipitation',start,6);
    const chance6=max(h,'precipitation_probability',start,6);
    const rain24=sum(h,'precipitation',start,24);
    const chance24=max(h,'precipitation_probability',start,24);
    const wind6=max(h,'wind_speed_10m',start,6);
    const gust6=max(h,'wind_gusts_10m',start,6);
    const temp24=max(h,'temperature_2m',start,24);

    const items=[];

    // 1. Verified official government alerts.
    if(officialFeed){
      const active=(officialFeed.alerts||[]).filter(a=>a&&a.title);
      const district=escapeHtml(officialFeed.district||'Cuddalore district');
      const source=escapeHtml(officialFeed.source||'Official source');

      if(active.length){
        const a=active[0];
        const sev=alertSeverity(a.severity);

        const issued=a.issuedAt
          ?` Issued: ${escapeHtml(dateTime(a.issuedAt))}.`
          :'';

        const valid=a.validUntil
          ?` Valid until: ${escapeHtml(dateTime(a.validUntil))}.`
          :'';

        const areas=Array.isArray(a.areas)&&a.areas.length
          ?` Affected areas: ${escapeHtml(a.areas.join(', '))}.`
          :'';

        const link=a.sourceUrl&&/^https:\/\//i.test(a.sourceUrl)
          ?` <a href="${escapeHtml(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">View official bulletin ↗</a>`
          :'';

        items.push([
          sev.icon,
          `${sev.label} · ${escapeHtml(a.title)}`,
          `${escapeHtml(a.description||'Please read the official bulletin and follow district administration instructions.')} ${issued}${valid}${areas} District: ${district}. Source: ${source}.${link}`
        ]);
      }else{
        items.push([
          '✅',
          'Official alerts · feed checked',
          `${district}: the connected official feed reports no active alerts. Last checked: ${escapeHtml(dateTime(officialFeed.updatedAt))}. Source: ${source}.`
        ]);
      }
    }else{
      items.push([
        '📣',
        'Official alerts · verification required',
        'No verified live government alert feed is connected yet. This does not mean that no warning exists. Check the official IMD and Tamil Nadu government bulletins before weather-sensitive field operations.'
      ]);
    }

    // 2. TNAU district agricultural weather advisory.
    items.push([
      '🌾',
      'TNAU · District agricultural advisory',
      'Consult the latest Tamil Nadu district-wise Agro-Met Advisory Bulletin for crop-specific recommendations, rainfall outlook and field operations. Check the bulletin issue date, district and forecast validity before applying its advice. <a href="https://agritech.tnau.ac.in/agrometeorologicaladvisory/agro_meteorological_advisory_tnau_district.html" target="_blank" rel="noopener noreferrer">Open TNAU district advisory portal ↗</a>'
    ]);

    // 3. Rainfall and drainage guidance from the weather model.
    if(rain6>=5||chance6>=70){
      items.push([
        '🌧️',
        'Rain watch · next 6 hours',
        `The weather model forecasts approximately ${fmt(rain6,1)} mm of rainfall over the next 6 hours, with a maximum hourly rain probability of ${fmt(chance6,0)}%. Inspect field drains, outlets and low-lying plots. Avoid spraying or fertilizer application when rainfall may cause runoff or losses.`
      ]);
    }else{
      items.push([
        '🌦️',
        'Rain outlook · next 24 hours',
        `The weather model forecasts ${fmt(rain24,1)} mm of rainfall over the next 24 hours, with a maximum hourly probability of ${fmt(chance24,0)}%. Use this forecast for planning and verify actual field conditions.`
      ]);
    }

    // 4. Weather-sensitive farm operations.
    if((Number.isFinite(gust6)&&gust6>=25)||(Number.isFinite(wind6)&&wind6>=20)){
      items.push([
        '💨',
        'Wind · spraying and drone operations',
        `Forecast wind may reach ${fmt(wind6,0)} km/h, with gusts up to ${fmt(gust6,0)} km/h. Check wind at crop height and follow pesticide-label and drone operating limits. Postpone operations when conditions are unsuitable.`
      ]);
    }else if(Number.isFinite(temp24)&&temp24>=35){
      items.push([
        '☀️',
        'Heat · protect field workers',
        `Forecast temperature may reach ${fmt(temp24,0)}°C in the next 24 hours. Schedule strenuous outdoor work during cooler periods, provide drinking water and follow local heat-safety guidance.`
      ]);
    }else{
      items.push([
        '💧',
        'Irrigation · field inspection',
        'Assess crop stage, soil moisture, field water depth and recent rainfall before irrigation. Avoid unnecessary pumping when adequate water is available. Modelled evapotranspiration is an estimate, not a direct measurement of crop water use.'
      ]);
    }

    $('advisories').innerHTML=items.map(([icon,title,body])=>
      `<article class="advisory-card"><span class="advisory-icon">${icon}</span><div><h3>${title}</h3><p>${body}</p></div></article>`
    ).join('');
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
