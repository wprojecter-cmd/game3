import React, { useEffect, useRef, useState } from "react";
import { Viewer, Cesium3DTileset, Ion, Cartesian3, Math as CesiumMath, createWorldTerrainAsync, createWorldImageryAsync, ImageryLayer, IonImageryProvider, Color, JulianDate, ClockRange, ClockStep, SceneMode, Cartographic, sampleTerrainMostDetailed, Entity, ColorMaterialProperty, PolylineGraphics } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

const API = "";
const initialSettings = { imagery: "satellite", terrain: "cesium-world-terrain", weather: "none", weatherOpacity: .65, weatherSaturation: 1, borders: true, gameTime: new Date().toISOString() };
const layers = [{id:"none",label:"Off"},{id:"temperature",label:"Temperature"},{id:"pressure",label:"Pressure"},{id:"precipitation",label:"Precipitation"},{id:"wind",label:"Wind"},{id:"clouds",label:"Clouds"}];
const imageryOptions = [{id:"satellite",label:"Satellite"},{id:"street",label:"Street map"},{id:"topographic",label:"Topographic"}];

export default function App() {
 const mapRef=useRef(null), viewerRef=useRef(null), searchMarker=useRef(null), [token,setToken]=useState(localStorage.getItem("game3_token")||"");
 const [user,setUser]=useState(null), [authMode,setAuthMode]=useState("login"), [nickname,setNickname]=useState(""), [password,setPassword]=useState(""), [authError,setAuthError]=useState("");
 const [settings,setSettings]=useState(initialSettings), [status,setStatus]=useState("Loading Earth engine…"), [query,setQuery]=useState(""), [coordinates,setCoordinates]=useState(null), [gameMode,setGameMode]=useState(false), [drone,setDrone]=useState(false), [weatherInfo,setWeatherInfo]=useState(null), [busy,setBusy]=useState(false), [gameTime,setGameTime]=useState(12);
 const [ionToken,setIonToken]=useState(import.meta.env.VITE_CESIUM_ION_TOKEN||"");
 const [panel,setPanel]=useState("earth");

 useEffect(()=>{ if(!token) return; (async()=>{try{const r=await fetch(API+"/api/profile/me",{headers:{Authorization:"Bearer "+token}});if(!r.ok)throw Error();const u=await r.json();setUser(u);setSettings({...initialSettings,...u.settings});}catch{localStorage.removeItem("game3_token");setToken("");}})();},[token]);

 useEffect(()=>{
  let disposed=false;
  async function boot(){
   if(!mapRef.current||viewerRef.current)return;
   if(!ionToken){setStatus("Add your Cesium Ion token in Render environment variables to load live global terrain.");return;}
   try{
    Ion.defaultAccessToken=ionToken;
    const terrain=await createWorldTerrainAsync({requestVertexNormals:true,requestWaterMask:true});
    if(disposed)return;
    const viewer=new Viewer(mapRef.current,{terrainProvider:terrain,animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,infoBox:false,selectionIndicator:false,fullscreenButton:false,shouldAnimate:true});
    viewerRef.current=viewer;
    viewer.scene.globe.enableLighting=true;
    viewer.scene.globe.showGroundAtmosphere=true;
    viewer.scene.skyAtmosphere.show=true;
    viewer.scene.globe.depthTestAgainstTerrain=true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance=30;
    viewer.camera.flyTo({destination:Cartesian3.fromDegrees(12,24,19000000),duration:0});
    setStatus("Earth engine ready");
    await applyImagery(viewer,settings.imagery);
    if(settings.gameTime){const d=new Date(settings.gameTime);viewer.clock.currentTime=JulianDate.fromDate(d);}
   }catch(e){console.error(e);setStatus("Cesium failed to initialize: "+e.message);}
  }
  boot();return()=>{disposed=true;};
 },[ionToken]);

 async function applyImagery(viewer,kind){
  if(!viewer||viewer.isDestroyed())return;
  try{
   const provider=kind==="street"
    ? await IonImageryProvider.fromAssetId(2)
    : await IonImageryProvider.fromAssetId(kind==="topographic"?3:2);
   viewer.imageryLayers.removeAll();
   viewer.imageryLayers.add(new ImageryLayer(provider));
  }catch(e){console.warn("Imagery provider:",e);}
 }
 async function saveSettings(next){
  setSettings(next);
  if(token)try{await fetch(API+"/api/profile/settings",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(next)});}catch(e){console.warn(e);}
 }
 async function authenticate(e){
  e.preventDefault();setAuthError("");setBusy(true);
  try{const r=await fetch(API+"/api/auth/"+(authMode==="register"?"register":"login"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname,password})});const data=await r.json();if(!r.ok)throw Error(data.error||"Unable to sign in");localStorage.setItem("game3_token",data.token);setToken(data.token);setUser(data.user);setSettings({...initialSettings,...data.user.settings});}
  catch(e){setAuthError(e.message);}finally{setBusy(false);}
 }
 async function searchPlace(e){
  e?.preventDefault();const raw=query.trim();if(!raw)return;
  let lat,lon;
  const pair=raw.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if(pair){lat=Number(pair[1]);lon=Number(pair[2]);if(Math.abs(lat)>90||Math.abs(lon)>180){setStatus("Coordinates out of range");return;}}
  else {
   try{const r=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="+encodeURIComponent(raw));const a=await r.json();if(!a.length)throw Error("Place not found");lat=Number(a[0].lat);lon=Number(a[0].lon);}catch(e){setStatus(e.message);return;}
  }
  setCoordinates({lat,lon});const v=viewerRef.current;if(v){v.camera.flyTo({destination:Cartesian3.fromDegrees(lon,lat,18000),duration:2});if(searchMarker.current)v.entities.remove(searchMarker.current);searchMarker.current=v.entities.add({position:Cartesian3.fromDegrees(lon,lat),point:{pixelSize:13,color:Color.CYAN,outlineColor:Color.WHITE,outlineWidth:2},label:{text:raw,font:"14px sans-serif",fillColor:Color.WHITE,showBackground:true,backgroundColor:Color.BLACK.withAlpha(.7),pixelOffset:new Cartesian3(0,-24,0)}});}
 }
 function startGame(){if(!coordinates){setStatus("Choose a location on Earth or search for one first.");return;}setGameMode(true);setDrone(false);const v=viewerRef.current;if(v)v.camera.flyTo({destination:Cartesian3.fromDegrees(coordinates.lon,coordinates.lat,1100),orientation:{heading:0,pitch:CesiumMath.toRadians(-18),roll:0},duration:2});}
 async function updateTime(value){setGameTime(Number(value));const v=viewerRef.current;if(v){const d=new Date();d.setHours(Number(value),0,0,0);v.clock.currentTime=JulianDate.fromDate(d);v.scene.light=undefined;v.scene.requestRender();}const next={...settings,gameTime:new Date(new Date().setHours(Number(value),0,0,0)).toISOString()};await saveSettings(next);}
 async function toggleWeather(mode){const next={...settings,weather:mode};await saveSettings(next);if(coordinates&&mode!=="none"){try{const r=await fetch(API+"/api/weather?lat="+coordinates.lat+"&lon="+coordinates.lon+"&mode="+mode);const data=await r.json();setWeatherInfo(data);if(!r.ok)setStatus(data.error||"Weather unavailable");}catch{setStatus("Weather service unavailable");}}else setWeatherInfo(null);}
 function logout(){localStorage.removeItem("game3_token");setToken("");setUser(null);setGameMode(false);}
 return <div className="app-shell">
  {!user&&<div className="auth-screen"><div className="auth-card"><div className="brand-mark">G3</div><div className="eyebrow">PLANETARY SIMULATION</div><h1>GAME<span>3</span></h1><p className="muted">Explore the real Earth. Take control.</p><form onSubmit={authenticate}><label>Nickname</label><input value={nickname} onChange={e=>setNickname(e.target.value)} minLength="3" maxLength="20" autoComplete="username" placeholder="Your callsign" required/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="8" autoComplete={authMode==="register"?"new-password":"current-password"} placeholder="At least 8 characters" required/>{authError&&<div className="error">{authError}</div>}<button className="primary full" disabled={busy}>{busy?"Please wait…":authMode==="register"?"Create account":"Sign in"}</button></form><button className="text-button" onClick={()=>setAuthMode(authMode==="register"?"login":"register")}>{authMode==="register"?"Already registered? Sign in":"New here? Create an account"}</button><div className="auth-foot">Your profile and world settings are saved securely.</div></div></div>}
  <div className="map" ref={mapRef}/>
  {user&&<><header className="topbar"><div className="brand"><span className="brand-mark small">G3</span><b>GAME3</b><span className="divider-v"/><span className="online-dot"/> EARTH EXPLORER</div><form className="search" onSubmit={searchPlace}><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a place or enter latitude, longitude"/><button>GO</button></form><div className="profile"><span className="avatar">{user.nickname?.slice(0,1).toUpperCase()}</span><span>{user.nickname}</span><button onClick={logout} title="Sign out">↪</button></div></header>
  <aside className="left-panel"><div className="panel-tabs"><button className={panel==="earth"?"active":""} onClick={()=>setPanel("earth")}>WORLD</button><button className={panel==="weather"?"active":""} onClick={()=>setPanel("weather")}>WEATHER</button><button className={panel==="modes"?"active":""} onClick={()=>setPanel("modes")}>MODES</button></div>
   {panel==="earth"&&<><div className="section-title">BASE MAP</div>{imageryOptions.map(o=><button key={o.id} className={"option "+(settings.imagery===o.id?"selected":"")} onClick={()=>{const next={...settings,imagery:o.id};saveSettings(next);applyImagery(viewerRef.current,o.id);}}><span className="radio"/>{o.label}</button>)}<div className="section-title">TERRAIN</div><div className="option selected"><span className="radio"/>Cesium World Terrain <small>3D</small></div><div className="section-title">OVERLAYS</div><label className="switch-row">Country borders <input type="checkbox" checked={settings.borders} onChange={e=>saveSettings({...settings,borders:e.target.checked})}/><span className="switch"/></label><p className="hint">Country boundary visualization will be added as a selectable vector overlay.</p></>}
   {panel==="weather"&&<><div className="section-title">OPENWEATHER LAYERS</div>{layers.map(l=><button key={l.id} className={"option "+(settings.weather===l.id?"selected":"")} onClick={()=>toggleWeather(l.id)}><span className="radio"/>{l.label}</button>)}<div className="section-title">LAYER OPACITY</div><input className="range" type="range" min="0" max="1" step=".01" value={settings.weatherOpacity} onChange={e=>saveSettings({...settings,weatherOpacity:Number(e.target.value)})}/><div className="range-label"><span>Transparent</span><b>{Math.round(settings.weatherOpacity*100)}%</b></div><div className="section-title">SATURATION</div><input className="range" type="range" min="0" max="2" step=".05" value={settings.weatherSaturation} onChange={e=>saveSettings({...settings,weatherSaturation:Number(e.target.value)})}/><div className="range-label"><span>Muted</span><b>{settings.weatherSaturation.toFixed(2)}×</b></div>{weatherInfo&&<div className="weather-card"><b>{Math.round(weatherInfo.main?.temp)}°C</b><span>{weatherInfo.weather?.[0]?.description}</span><small>Wind {weatherInfo.wind?.speed} m/s · Pressure {weatherInfo.main?.pressure} hPa</small></div>}<p className="hint">Live point weather is connected. Raster weather overlays require a compatible tile subscription/provider.</p></>}
   {panel==="modes"&&<><div className="section-title">CESIUM SCENE</div><div className="option selected">3D Globe <small>ACTIVE</small></div><div className="option">Terrain exaggeration <small>COMING</small></div><div className="option">3D Buildings <small>COMING</small></div><div className="option">Photorealistic 3D Tiles <small>ION ASSET</small></div><p className="hint">Additional Ion assets can be enabled when their asset IDs and account access are configured.</p></>}
  </aside>
  <div className="statusbar"><span className="online-dot"/>{status}<span className="coords">{coordinates?coordinates.lat.toFixed(4)+"°, "+coordinates.lon.toFixed(4)+"°":"Select a destination"}</span></div>
  <div className="map-controls"><button onClick={()=>viewerRef.current?.camera.zoomIn(8000)}>＋</button><button onClick={()=>viewerRef.current?.camera.zoomOut(8000)}>−</button><button onClick={()=>viewerRef.current?.camera.flyHome(1)}>⌂</button></div>
  {!gameMode?<div className="start-card"><div className="eyebrow">MISSION CONTROL</div><h2>Choose your destination</h2><p>Select a point on the globe or search for a place or coordinates to begin.</p><button className="primary" onClick={startGame} disabled={!coordinates}>START EXPLORING <span>→</span></button></div>:<div className="game-hud"><div className="hud-top"><span className="live-pill">● LIVE WORLD</span><span>{coordinates?.lat.toFixed(3)} / {coordinates?.lon.toFixed(3)}</span><button onClick={()=>{setGameMode(false);setDrone(false);}}>EXIT MODE</button></div><div className="hud-bottom"><div className="time-control"><span>LOCAL SIMULATION TIME</span><b>{String(Math.floor(gameTime)).padStart(2,"0")}:00</b><input type="range" min="0" max="23" value={gameTime} onChange={e=>updateTime(e.target.value)}/><div className="range-label"><span>00:00</span><span>12:00</span><span>23:00</span></div></div><div className="inventory"><span className="eyebrow">INVENTORY</span><button className={drone?"selected":""} onClick={()=>setDrone(!drone)}><span className="item-icon">◈</span><b>DRONE</b><small>{drone?"EQUIPPED":"SLOT 01"}</small></button></div></div>{drone&&<div className="drone-notice"><b>DRONE LINK READY</b><span>Flight controller prototype · click/tap a destination to command flight</span><button onClick={()=>{setDrone(false);setStatus("Drone connection lost.");}}>DISCONNECT</button></div>}</div>}
  </>}
  {!user&&<div className="map-loading">GAME3 · GLOBAL WORLD ENGINE</div>}
 </div>;
}
