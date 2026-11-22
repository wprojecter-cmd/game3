import React, { useEffect, useRef, useState } from "react";
import { Viewer, Ion, Cesium3DTileset, SceneMode, WebMercatorTilingScheme, Cartesian2, Cartesian3, Math as CesiumMath, createWorldTerrainAsync, createDefaultImageryProviderViewModels, createDefaultTerrainProviderViewModels, UrlTemplateImageryProvider, Color, JulianDate, Cartographic, sampleTerrainMostDetailed, ConstantPositionProperty, ScreenSpaceEventHandler, ScreenSpaceEventType, HeadingPitchRoll, Transforms, ParticleSystem, ParticleBurst, CircleEmitter } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { spawnExplosionVfx } from "./effects/ExplosionVfx.js";

const API = "";
const initialSettings = { imagery: "satellite", terrain: "cesium-world-terrain", weather: "none", weatherOpacity: .65, weatherSaturation: 1, borders: true, gameTime: new Date().toISOString() };
const layers = [{id:"none",label:"Off"},{id:"temperature",label:"Temperature"},{id:"pressure",label:"Pressure"},{id:"precipitation",label:"Precipitation"},{id:"wind",label:"Wind"},{id:"clouds",label:"Clouds"}];
const imageryOptions = [{id:"satellite",label:"Bing Aerial"},{id:"labels",label:"Aerial with labels"},{id:"street",label:"OpenStreetMap"},{id:"roads",label:"Bing Roads"},{id:"sentinel",label:"Sentinel-2"}];
const weatherTileLayers = {temperature:"temp_new",pressure:"pressure_new",precipitation:"precipitation_new",wind:"wind_new",clouds:"clouds_new"};
const PLAYER_MODEL = "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumMan/Cesium_Man.glb";
const DRONE_MODEL = "https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumDrone/CesiumDrone.glb";

export default function App() {
 const mapRef=useRef(null), viewerRef=useRef(null), searchMarker=useRef(null), playerEntity=useRef(null), droneEntity=useRef(null), droneFlightRef=useRef({target:null,lastTime:0}), droneInputRef=useRef({forward:0,back:0,left:0,right:0,up:0,down:0}), weatherLayerRef=useRef(null), clickHandlerRef=useRef(null), coordinatesRef=useRef(null), droneRef=useRef(false), gameModeRef=useRef(false), [token,setToken]=useState(localStorage.getItem("game3_token")||"");
 const [user,setUser]=useState(null), [authMode,setAuthMode]=useState("login"), [nickname,setNickname]=useState(""), [password,setPassword]=useState(""), [authError,setAuthError]=useState("");
 const [settings,setSettings]=useState(initialSettings), [status,setStatus]=useState("Loading Earth engine…"), [query,setQuery]=useState(""), [coordinates,setCoordinates]=useState(null), [gameMode,setGameMode]=useState(false), [drone,setDrone]=useState(false), [weatherInfo,setWeatherInfo]=useState(null), [busy,setBusy]=useState(false), [gameTime,setGameTime]=useState(12);
 coordinatesRef.current=coordinates;droneRef.current=drone;gameModeRef.current=gameMode;
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
    const imageryProviderViewModels=createDefaultImageryProviderViewModels();
    const terrainProviderViewModels=createDefaultTerrainProviderViewModels();
    const defaultTerrainModel=terrainProviderViewModels.find(model=>model.name.toLowerCase().includes("cesium world terrain"))||terrainProviderViewModels[0];
    const viewer=new Viewer(mapRef.current,{terrainProvider:terrain,animation:false,timeline:false,baseLayerPicker:true,imageryProviderViewModels,terrainProviderViewModels,selectedImageryProviderViewModel:imageryProviderViewModels[0],selectedTerrainProviderViewModel:defaultTerrainModel,geocoder:false,homeButton:false,sceneModePicker:true,navigationHelpButton:false,infoBox:false,selectionIndicator:false,fullscreenButton:false,shouldAnimate:true});
    viewerRef.current=viewer;
    const globeClickHandler=new ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandlerRef.current=globeClickHandler;
    globeClickHandler.setInputAction((click)=>{
      const ray=viewer.camera.getPickRay(click.position);
      const hit=ray&&viewer.scene.globe.pick(ray,viewer.scene);
      if(!hit)return;
      const cart=Cartographic.fromCartesian(hit);
      if(droneRef.current&&droneEntity.current){
        droneFlightRef.current.target={longitude:cart.longitude,latitude:cart.latitude,height:Math.max(12,cart.height+12)};
        setStatus("Drone waypoint selected · flying to clicked location.");
        return;
      }
      if(gameModeRef.current)return;
      const lat=CesiumMath.toDegrees(cart.latitude),lon=CesiumMath.toDegrees(cart.longitude);
      setCoordinates({lat,lon});
      if(searchMarker.current)viewer.entities.remove(searchMarker.current);
      searchMarker.current=viewer.entities.add({position:hit,point:{pixelSize:13,color:Color.CYAN,outlineColor:Color.WHITE,outlineWidth:2},label:{text:lat.toFixed(4)+", "+lon.toFixed(4),font:"13px sans-serif",fillColor:Color.WHITE,showBackground:true,backgroundColor:Color.BLACK.withAlpha(.75),pixelOffset:new Cartesian2(0,-24)}});
      setStatus("Destination selected on globe · press START EXPLORING.");
    },ScreenSpaceEventType.LEFT_CLICK);
    viewer.scene.globe.enableLighting=true;
    viewer.scene.globe.showGroundAtmosphere=true;
    viewer.scene.skyAtmosphere.show=true;
    viewer.scene.globe.depthTestAgainstTerrain=true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance=30;
    viewer.camera.flyTo({destination:Cartesian3.fromDegrees(12,24,19000000),duration:0});
    setStatus("Earth engine ready");
    if(settings.gameTime){const d=new Date(settings.gameTime);viewer.clock.currentTime=JulianDate.fromDate(d);} if(settings.weather!=="none"){applyWeatherLayer(settings.weather,settings.weatherOpacity,settings.weatherSaturation).catch(console.warn);}
   }catch(e){console.error(e);setStatus("Cesium failed to initialize: "+e.message);}
  }
  boot();return()=>{disposed=true;};
 },[ionToken]);

 async function applyImagery(viewer,kind){
  if(!viewer||viewer.isDestroyed())return;
  try{
   const providers = {
    satellite:()=>IonImageryProvider.fromAssetId(2),
    labels:()=>IonImageryProvider.fromAssetId(3),
    street:()=>new OpenStreetMapImageryProvider({url:"https://tile.openstreetmap.org/"}),
    roads:()=>IonImageryProvider.fromAssetId(4),
    sentinel:()=>IonImageryProvider.fromAssetId(3954)
   };
   const provider=await (providers[kind]||providers.satellite)();
   viewer.imageryLayers.remove(viewer.imageryLayers.get(0),false);
   viewer.imageryLayers.addImageryProvider(provider,0);
  }catch(e){console.warn("Imagery provider:",e);setStatus("Map imagery unavailable: "+e.message);}
 }
 async function applyWeatherLayer(mode,opacity=settings.weatherOpacity,saturation=settings.weatherSaturation){
  const viewer=viewerRef.current;
  if(!viewer||viewer.isDestroyed())return;
  if(weatherLayerRef.current){viewer.imageryLayers.remove(weatherLayerRef.current,false);weatherLayerRef.current=null;}
  if(mode==="none")return;
  const tileLayer=weatherTileLayers[mode];
  if(!tileLayer)return;
  const provider=new UrlTemplateImageryProvider({
   tilingScheme:new WebMercatorTilingScheme(),
   url:`/api/weather/tiles/${tileLayer}/{z}/{x}/{y}.png`,
   maximumLevel:19,
   credit:"Weather tiles © OpenWeather"
  });
  provider.errorEvent.addEventListener((error)=>{console.warn("OpenWeather tile error:",error);setStatus("OpenWeather tiles unavailable. Check that the API key is active and Weather Maps 1.0 is enabled.");});
  const layer=viewer.imageryLayers.addImageryProvider(provider);
  layer.alpha=Number(opacity);
  layer.saturation=Number(saturation);
  weatherLayerRef.current=layer;
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
 async function startGame(){
  if(!coordinates){setStatus("Choose a location on Earth or search for one first.");return;}
  const v=viewerRef.current;if(!v)return;
  setGameMode(true);setDrone(false);
  try{
   const point=Cartographic.fromDegrees(coordinates.lon,coordinates.lat);
   const sampled=await sampleTerrainMostDetailed(v.terrainProvider,[point]);
   const groundHeight=Number.isFinite(sampled[0]?.height)?sampled[0].height:0;
   const position=Cartesian3.fromRadians(point.longitude,point.latitude,groundHeight+0.5);
   if(playerEntity.current)v.entities.remove(playerEntity.current);
   playerEntity.current=v.entities.add({
    name:"GAME3 Player",
    position,
    model:{uri:PLAYER_MODEL,scale:1,minimumPixelSize:72,maximumScale:160,runAnimations:true},
    orientation:Transforms.headingPitchRollQuaternion(position,new HeadingPitchRoll(0,0,0))
   });
   v.camera.flyTo({destination:Cartesian3.fromRadians(point.longitude,point.latitude,groundHeight+5),orientation:{heading:0,pitch:CesiumMath.toRadians(-18),roll:0},duration:2});
   setStatus("Player model placed on sampled terrain · select DRONE to deploy.");
  }catch(error){console.error("Player terrain/model setup:",error);setStatus("Could not place player on terrain: "+error.message);}
 }
 function deployDrone(){
  const v=viewerRef.current;if(!v||!coordinates)return;
  const playerPosition=playerEntity.current?.position?.getValue(v.clock.currentTime);
  const origin=playerPosition||Cartesian3.fromDegrees(coordinates.lon,coordinates.lat,20);
  const cart=Cartographic.fromCartesian(origin);
  const dronePosition=Cartesian3.fromRadians(cart.longitude,cart.latitude,cart.height+8);
  if(droneEntity.current)v.entities.remove(droneEntity.current);
  droneEntity.current=v.entities.add({
   name:"GAME3 FPV Drone",
   position:new ConstantPositionProperty(dronePosition),
   model:{uri:DRONE_MODEL,scale:1,minimumPixelSize:52,maximumScale:120,runAnimations:true},
   orientation:Transforms.headingPitchRollQuaternion(dronePosition,new HeadingPitchRoll(0,0,0)),
   path:{show:true,leadTime:0,trailTime:15,width:2,material:Color.CYAN}
  });
  droneFlightRef.current={target:null,lastTime:Date.now()};
  droneInputRef.current={forward:0,back:0,left:0,right:0,up:0,down:0};
  v.trackedEntity=droneEntity.current;
  setDrone(true);
  setStatus("FPV connected · click the terrain to fly to a waypoint, or use WASD / arrow keys.");
 }
 function createCrashExplosion(viewer,position){
  try {
   spawnExplosionVfx(viewer,position);
  } catch(error) {
   console.error("Cinematic explosion failed:",error);
   setStatus("Explosion effect failed: "+error.message);
  }
 }
 function disconnectDrone(){
  const v=viewerRef.current;
  if(v){v.trackedEntity=undefined;if(droneEntity.current)v.entities.remove(droneEntity.current);}
  droneEntity.current=null;droneFlightRef.current={target:null,lastTime:0};
  droneInputRef.current={forward:0,back:0,left:0,right:0,up:0,down:0};
  setDrone(false);setStatus("Drone link disconnected.");
 }
 async function updateTime(value){setGameTime(Number(value));const v=viewerRef.current;if(v){const d=new Date();d.setHours(Number(value),0,0,0);v.clock.currentTime=JulianDate.fromDate(d);v.scene.light=undefined;v.scene.requestRender();}const next={...settings,gameTime:new Date(new Date().setHours(Number(value),0,0,0)).toISOString()};await saveSettings(next);}
 async function toggleWeather(mode){const next={...settings,weather:mode};await saveSettings(next);setWeatherInfo(null);await applyWeatherLayer(mode,next.weatherOpacity,next.weatherSaturation);if(coordinates&&mode!=="none"){try{const r=await fetch(API+"/api/weather?lat="+coordinates.lat+"&lon="+coordinates.lon+"&mode="+mode);const data=await r.json();setWeatherInfo(data);if(!r.ok)setStatus(data.error||"Weather unavailable");}catch{setStatus("Weather service unavailable");}}}
 useEffect(()=>{
  const v=viewerRef.current;if(!v||!drone||!droneEntity.current)return;
  let previous=Date.now();
  const tick=()=>{
   const now=Date.now();const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;
   const entity=droneEntity.current;if(!entity)return;
   const p=entity.position.getValue(v.clock.currentTime);if(!p)return;
   const current=Cartographic.fromCartesian(p);const input=droneInputRef.current;const target=droneFlightRef.current.target;
   let north=(input.forward||0)-(input.back||0),east=(input.right||0)-(input.left||0),vertical=(input.up||0)-(input.down||0);
   if(target){
    const dLat=target.latitude-current.latitude;
    const dLon=(target.longitude-current.longitude)*Math.cos(current.latitude);
    const distance=Math.hypot(dLat,dLon)*6371000;
    if(distance<2){droneFlightRef.current.target=null;setStatus("Waypoint reached · FPV link stable.");}
    else {north+=dLat/Math.max(1e-8,Math.hypot(dLat,dLon));east+=dLon/Math.max(1e-8,Math.hypot(dLat,dLon));vertical+=(target.height-current.height)/Math.max(1,distance)*.45;}
   }
   const magnitude=Math.hypot(north,east);if(magnitude>1){north/=magnitude;east/=magnitude;}
   const speed=droneInputRef.current.boost?32:18;
   const latitude=current.latitude+(north*speed*dt)/6378137;
   const cosine=Math.max(.08,Math.cos(current.latitude));
   const longitude=current.longitude+(east*speed*dt)/(6378137*cosine);
   const height=Math.max(0,current.height+vertical*speed*dt);
   const next=Cartesian3.fromRadians(longitude,latitude,height);
   const ground=v.scene.globe.getHeight(new Cartographic(longitude,latitude,0));
   if(Number.isFinite(ground)&&height<=ground+1.8){
    entity.position.setValue(Cartesian3.fromRadians(longitude,latitude,ground+0.5));
    createCrashExplosion(v,entity.position.getValue(v.clock.currentTime));
    disconnectDrone();
    setStatus("DRONE CRASH · impact detected · explosion triggered · signal lost.");
    return;
   }
   entity.position.setValue(next);
   if(magnitude>.01)entity.orientation=Transforms.headingPitchRollQuaternion(next,new HeadingPitchRoll(Math.atan2(east,north),0,0));
  };
  v.clock.onTick.addEventListener(tick);
  const onKeyDown=(event)=>{
   if(["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;
   const key=event.key.toLowerCase();const map={w:"forward",arrowup:"forward",s:"back",arrowdown:"back",a:"left",arrowleft:"left",d:"right",arrowright:"right",q:"down",e:"up",shift:"boost"};
   const control=map[key];if(control){event.preventDefault();droneInputRef.current[control]=control==="boost"?1:1;}
  };
  const onKeyUp=(event)=>{const key=event.key.toLowerCase();const map={w:"forward",arrowup:"forward",s:"back",arrowdown:"back",a:"left",arrowleft:"left",d:"right",arrowright:"right",q:"down",e:"up",shift:"boost"};const control=map[key];if(control)droneInputRef.current[control]=0;};
  window.addEventListener("keydown",onKeyDown);window.addEventListener("keyup",onKeyUp);
  return()=>{v.clock.onTick.removeEventListener(tick);window.removeEventListener("keydown",onKeyDown);window.removeEventListener("keyup",onKeyUp);};
 },[drone]);
 function logout(){localStorage.removeItem("game3_token");setToken("");setUser(null);setGameMode(false);}
 return <div className="app-shell">
  {!user&&<div className="auth-screen"><div className="auth-card"><div className="brand-mark">G3</div><div className="eyebrow">PLANETARY SIMULATION</div><h1>GAME<span>3</span></h1><p className="muted">Explore the real Earth. Take control.</p><form onSubmit={authenticate}><label>Nickname</label><input value={nickname} onChange={e=>setNickname(e.target.value)} minLength="3" maxLength="20" autoComplete="username" placeholder="Your callsign" required/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="8" autoComplete={authMode==="register"?"new-password":"current-password"} placeholder="At least 8 characters" required/>{authError&&<div className="error">{authError}</div>}<button className="primary full" disabled={busy}>{busy?"Please wait…":authMode==="register"?"Create account":"Sign in"}</button></form><button className="text-button" onClick={()=>setAuthMode(authMode==="register"?"login":"register")}>{authMode==="register"?"Already registered? Sign in":"New here? Create an account"}</button><div className="auth-foot">Your profile and world settings are saved securely.</div></div></div>}
  <div className="map" ref={mapRef}/>
  {user&&<><header className="topbar"><div className="brand"><span className="brand-mark small">G3</span><b>GAME3</b><span className="divider-v"/><span className="online-dot"/> EARTH EXPLORER</div><form className="search" onSubmit={searchPlace}><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a place or enter latitude, longitude"/><button>GO</button></form><div className="profile"><span className="avatar">{user.nickname?.slice(0,1).toUpperCase()}</span><span>{user.nickname}</span><button onClick={logout} title="Sign out">↪</button></div></header>
  <aside className="left-panel"><div className="panel-tabs"><button className={panel==="earth"?"active":""} onClick={()=>setPanel("earth")}>WORLD</button><button className={panel==="weather"?"active":""} onClick={()=>setPanel("weather")}>WEATHER</button><button className={panel==="modes"?"active":""} onClick={()=>setPanel("modes")}>MODES</button></div>
   {panel==="earth"&&<><div className="section-title">CESIUM MAP CATALOG</div><p className="hint">Open the native Cesium map selector in the upper-right corner to browse the complete imagery catalog available in this Cesium build, including its supported providers. Use the terrain selector there to switch terrain providers.</p><div className="option selected"><span className="radio"/>Cesium World Terrain <small>3D</small></div><div className="section-title">OVERLAYS</div><label className="switch-row">Country borders <input type="checkbox" checked={settings.borders} onChange={e=>saveSettings({...settings,borders:e.target.checked})}/><span className="switch"/></label><p className="hint">Country boundary visualization will be added as a selectable vector overlay.</p></>}
   {panel==="weather"&&<><div className="section-title">OPENWEATHER LAYERS</div>{layers.map(l=><button key={l.id} className={"option "+(settings.weather===l.id?"selected":"")} onClick={()=>toggleWeather(l.id)}><span className="radio"/>{l.label}</button>)}<div className="section-title">LAYER OPACITY</div><input className="range" type="range" min="0" max="1" step=".01" value={settings.weatherOpacity} onChange={e=>{const value=Number(e.target.value);const next={...settings,weatherOpacity:value};saveSettings(next);if(weatherLayerRef.current)weatherLayerRef.current.alpha=value;}}/><div className="range-label"><span>Transparent</span><b>{Math.round(settings.weatherOpacity*100)}%</b></div><div className="section-title">SATURATION</div><input className="range" type="range" min="0" max="2" step=".05" value={settings.weatherSaturation} onChange={e=>{const value=Number(e.target.value);const next={...settings,weatherSaturation:value};saveSettings(next);if(weatherLayerRef.current)weatherLayerRef.current.saturation=value;}}/><div className="range-label"><span>Muted</span><b>{settings.weatherSaturation.toFixed(2)}×</b></div>{weatherInfo&&<div className="weather-card"><b>{Math.round(weatherInfo.main?.temp)}°C</b><span>{weatherInfo.weather?.[0]?.description}</span><small>Wind {weatherInfo.wind?.speed} m/s · Pressure {weatherInfo.main?.pressure} hPa</small></div>}<p className="hint">Live point weather is connected. Raster weather overlays require a compatible tile subscription/provider.</p></>}
   {panel==="modes"&&<><div className="section-title">CESIUM SCENE MODES</div><button className="option selected" onClick={()=>{const v=viewerRef.current;if(v)v.scene.morphTo3D(1);}}>3D Globe <small>ACTIVE</small></button><button className="option" onClick={()=>{const v=viewerRef.current;if(v)v.scene.morphTo2D(1);}}>2D Map</button><button className="option" onClick={()=>{const v=viewerRef.current;if(v)v.scene.morphToColumbusView(1);}}>2.5D Columbus</button><div className="section-title">TERRAIN & 3D</div><button className="option" onClick={async()=>{const v=viewerRef.current;if(v){try{v.scene.globe.terrainExaggeration=2;setStatus("Terrain exaggeration: 2×");}catch(e){setStatus(e.message);}}}}>Terrain exaggeration 2×</button><button className="option" onClick={async()=>{const v=viewerRef.current;if(v){try{const tiles=await Cesium3DTileset.fromIonAssetId(96188);v.scene.primitives.add(tiles);setStatus("3D buildings layer loaded.");}catch(e){setStatus("3D buildings asset unavailable: "+e.message);}}}}>3D Buildings <small>ION</small></button><p className="hint">The Cesium base-layer picker in the upper-right corner provides the native imagery choices available to this Cesium account.</p></>}
  </aside>
  <div className="statusbar"><span className="online-dot"/>{status}<span className="coords">{coordinates?coordinates.lat.toFixed(4)+"°, "+coordinates.lon.toFixed(4)+"°":"Select a destination"}</span></div>
  <div className="map-controls"><button onClick={()=>viewerRef.current?.camera.zoomIn(8000)}>＋</button><button onClick={()=>viewerRef.current?.camera.zoomOut(8000)}>−</button><button onClick={()=>viewerRef.current?.camera.flyHome(1)}>⌂</button></div>
  {!gameMode?<div className="start-card"><div className="eyebrow">MISSION CONTROL</div><h2>Choose your destination</h2><p>Select a point on the globe or search for a place or coordinates to begin.</p><button className="primary" onClick={startGame} disabled={!coordinates}>START EXPLORING <span>→</span></button></div>:<div className="game-hud"><div className="hud-top"><span className="live-pill">● LIVE WORLD</span><span>{coordinates?.lat.toFixed(3)} / {coordinates?.lon.toFixed(3)}</span><button onClick={()=>{setGameMode(false);setDrone(false);}}>EXIT MODE</button></div><div className="hud-bottom"><div className="time-control"><span>LOCAL SIMULATION TIME</span><b>{String(Math.floor(gameTime)).padStart(2,"0")}:00</b><input type="range" min="0" max="23" value={gameTime} onChange={e=>updateTime(e.target.value)}/><div className="range-label"><span>00:00</span><span>12:00</span><span>23:00</span></div></div><div className="inventory"><span className="eyebrow">INVENTORY</span><button className={drone?"selected":""} onClick={()=>drone?disconnectDrone():deployDrone()}><span className="item-icon">◈</span><b>DRONE</b><small>{drone?"FPV ACTIVE":"DEPLOY"}</small></button></div></div>{drone&&<div className="drone-notice"><b>FPV DRONE</b><span>WASD / arrows · Q/E altitude · Shift boost · tap map for waypoint</span><div className="drone-pad"><button onPointerDown={()=>droneInputRef.current.forward=1} onPointerUp={()=>droneInputRef.current.forward=0} onPointerLeave={()=>droneInputRef.current.forward=0}>▲</button><div><button onPointerDown={()=>droneInputRef.current.left=1} onPointerUp={()=>droneInputRef.current.left=0} onPointerLeave={()=>droneInputRef.current.left=0}>◀</button><button onPointerDown={()=>droneInputRef.current.back=1} onPointerUp={()=>droneInputRef.current.back=0} onPointerLeave={()=>droneInputRef.current.back=0}>▼</button><button onPointerDown={()=>droneInputRef.current.right=1} onPointerUp={()=>droneInputRef.current.right=0} onPointerLeave={()=>droneInputRef.current.right=0}>▶</button></div></div><button onClick={disconnectDrone}>DISCONNECT</button></div>}</div>}
  </>}
  {!user&&<div className="map-loading">GAME3 · GLOBAL WORLD ENGINE</div>}
 </div>;
}
