'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Crosshair,Layers,MapPin,Maximize,Minimize,Search} from 'lucide-react';
import type * as Leaflet from 'leaflet';
import {category,coordinates,type Bounds,type Business,type Destination,type Settings} from '../lib/model';
import {categoryIcon} from './Icons';

const osm='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const streetUrl='https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const streetAttribution='Tiles © Esri, HERE, Garmin, FAO, NOAA, USGS, '+osm+', and the GIS User Community';
const bases={
  Street:{url:streetUrl,attribution:streetAttribution,native:17,max:17},
  Dark:{url:streetUrl,attribution:streetAttribution,native:17,max:17},
  Satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attribution:'Tiles © Esri, Maxar, Earthstar Geographics, GIS User Community',native:17,max:19},
  Terrain:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',attribution:osm+' · SRTM · <a href="https://opentopomap.org/about">OpenTopoMap</a> (CC BY-SA)',native:17,max:17},
};
type Mode=keyof typeof bases;
type Props={rows:Business[];destination:Destination;settings:Settings;selected:Business|null;onSelect:(b:Business)=>void;onArea:(b:Bounds)=>void;areaActive:boolean;onClearArea:()=>void;privatePreview:boolean;expanded:boolean;onExpand:()=>void};

export default function MapView({rows,destination,settings,selected,onSelect,onArea,areaActive,onClearArea,privatePreview,expanded,onExpand}:Props) {
  const element=useRef<HTMLDivElement>(null);
  const map=useRef<Leaflet.Map|null>(null);
  const engine=useRef<typeof Leaflet|null>(null);
  const markers=useRef<Leaflet.MarkerClusterGroup|null>(null);
  const location=useRef<Leaflet.LayerGroup|null>(null);
  const active=useRef<Leaflet.LayerGroup|null>(null);
  const selectRef=useRef(onSelect);
  selectRef.current=onSelect;
  const [engineVersion,setEngineVersion]=useState(0);
  const [mapZoom,setMapZoom]=useState(destination.center[2]);
  const [pinsReady,setPinsReady]=useState(false);
  const [mode,setMode]=useState<Mode>('Street');
  const [tileState,setTileState]=useState({loaded:0,failed:0});
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [showLayers,setShowLayers]=useState(false);
  const [locating,setLocating]=useState(false);
  const pins=useMemo(()=>rows.flatMap(b=>{const p=coordinates(b);return p?[{b,p}]:[]}),[rows]);

  useEffect(()=>{
    let cancelled=false;
    let observer:ResizeObserver|undefined;
    (async()=>{
      try {
        const L=(await import('leaflet')).default;
        await import('leaflet.markercluster');
        if (cancelled||!element.current) return;
        engine.current=L;
        const m=L.map(element.current,{zoomControl:false,minZoom:4,maxZoom:19,scrollWheelZoom:false,preferCanvas:true,tapHold:false,zoomAnimation:false,fadeAnimation:false});
        map.current=m;
        m.attributionControl.setPrefix(false);
        m.on('zoomend',()=>setMapZoom(m.getZoom()));
        L.control.zoom({position:'topright'}).addTo(m);
        markers.current=L.markerClusterGroup({animate:false,maxClusterRadius:39,showCoverageOnHover:false,disableClusteringAtZoom:17}).addTo(m);
        location.current=L.layerGroup().addTo(m);
        active.current=L.layerGroup().addTo(m);
        observer=new ResizeObserver(([entry])=>{
          if(entry.contentRect.width&&entry.contentRect.height)m.invalidateSize({pan:true,animate:false});
        });
        observer.observe(element.current);
        setEngineVersion(v=>v+1);
      } catch { if (!cancelled) setError('The map engine could not start.'); }
    })();
    return ()=>{cancelled=true;observer?.disconnect();map.current?.remove();map.current=null;};
  },[]);

  const [lat,lon,zoom]=destination.center;
  const boundsKey=destination.bounds?.join(',')||'';
  useEffect(()=>{
    const m=map.current,L=engine.current;
    if(!engineVersion||!m||!L) return;
    if (boundsKey) {
      const [south,west,north,east]=boundsKey.split(',').map(Number);
      m.setMaxBounds(L.latLngBounds([south,west],[north,east]));
    } else m.setMaxBounds(L.latLngBounds([]));
    m.setView([lat,lon],zoom,{animate:false});
  },[destination.slug,lat,lon,zoom,boundsKey,engineVersion]);

  const url=settings.tiles[mode==='Dark'?'Street':mode]||bases[mode].url;
  useEffect(()=>{
    const m=map.current,L=engine.current;
    if (!engineVersion||!m||!L) return;
    const base=bases[mode],layer=L.tileLayer(url,{attribution:base.attribution,maxNativeZoom:base.native,maxZoom:base.max,subdomains:'abc',keepBuffer:2,referrerPolicy:'strict-origin-when-cross-origin'});
    let loaded=0,failed=0;
    setTileState({loaded,failed});
    m.getPane('tilePane')?.classList.toggle('dark-tiles',mode==='Dark');
    m.setMaxZoom(base.max);
    layer.on('tileload',()=>{loaded++;setTileState({loaded,failed});});
    layer.on('tileerror',()=>{failed++;setTileState({loaded,failed});});
    layer.addTo(m);
    return ()=>{layer.remove();layer.off();};
  },[engineVersion,mode,url,attempt]);

  const icons=useMemo(()=>{
    const html=new Map<string,string>();
    for (const c of settings.categories) {
      const Icon=categoryIcon(c.id,c.icon);
      const color=/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#124F3A';
      html.set(c.id,renderToStaticMarkup(<span style={{background:color}}><Icon size={16} strokeWidth={2.15}/></span>));
    }
    return html;
  },[settings.categories]);

  useEffect(()=>{
    const m=map.current,L=engine.current,g=markers.current;
    if (!engineVersion||!m||!L||!g) return;
    setPinsReady(false);
    g.clearLayers();
    const cached=new Map<string,Leaflet.DivIcon>();
    const layers=pins.map(({b,p})=>{
      const kind=category(b);
      let icon=cached.get(kind);
      if (!icon) {
        icon=L.divIcon({className:'place-marker',html:icons.get(kind)||'<span>•</span>',iconSize:[30,34],iconAnchor:[15,33]});
        cached.set(kind,icon);
      }
      return L.marker(p,{icon,title:b.name,alt:b.name}).on('click',()=>selectRef.current(b));
    });
    let offset=0,frame=0;
    const addBatch=()=>{
      g.addLayers(layers.slice(offset,offset+180));
      offset+=180;
      if(offset<layers.length)frame=requestAnimationFrame(addBatch);
      else setPinsReady(true);
    };
    frame=requestAnimationFrame(addBatch);
    return ()=>cancelAnimationFrame(frame);
  },[pins,icons,engineVersion]);

  useEffect(()=>{
    const m=map.current,L=engine.current,g=active.current;
    if (!engineVersion||!m||!L||!g) return;
    g.clearLayers();
    const p=selected&&coordinates(selected);
    if (!p||!selected) return;
    const icon=L.divIcon({className:'place-marker marker-selected',html:icons.get(category(selected))||'<span>•</span>',iconSize:[35,39],iconAnchor:[17,39]});
    L.marker(p,{icon,title:selected.name,zIndexOffset:1500}).on('click',()=>selectRef.current(selected)).addTo(g);
    m.panTo(p,{animate:false});
  },[selected,engineVersion,icons]);

  function locate() {
    setMessage('');
    if (!navigator.geolocation) {setMessage('Location is unavailable in this browser.');return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(result=>{
      setLocating(false);
      const m=map.current,L=engine.current,g=location.current;
      if (!m||!L||!g) return;
      const p:[number,number]=[result.coords.latitude,result.coords.longitude];
      g.clearLayers();
      L.circle(p,{radius:result.coords.accuracy,color:'#2082be',fillOpacity:.16}).addTo(g);
      L.circleMarker(p,{radius:7,fillColor:'#2082be',color:'#fff',weight:3,fillOpacity:1}).addTo(g);
      m.setView(p,Math.min(m.getMaxZoom(),15));
      setMessage(`Your location · ±${Math.round(result.coords.accuracy)} m`);
    },()=>{setLocating(false);setMessage('Location unavailable. You can still pan or search the map.');},{enableHighAccuracy:true,timeout:10000});
  }

  return <section className="map-shell" aria-label="Interactive map" aria-busy={!pinsReady} data-basemap={mode} data-zoom={mapZoom} data-tiles-loaded={tileState.loaded} data-tiles-failed={tileState.failed}>
    <div ref={element} className="map-canvas"/>
    <div className="map-toolbar">
      <button type="button" className="map-button" onClick={()=>setShowLayers(v=>!v)} aria-expanded={showLayers}><Layers size={17}/><span>{mode}</span></button>
      {showLayers&&<div className="layer-menu" aria-label="Map layers">{(Object.keys(bases) as Mode[]).map(layer=><button type="button" aria-pressed={layer===mode} key={layer} onClick={()=>{setMode(layer);setShowLayers(false);}}>{layer}</button>)}</div>}
    </div>
    <div className="map-side">
      <button type="button" className="map-button square" title="Find my location" aria-label="Find my location" onClick={locate} disabled={locating}><Crosshair size={19}/></button>
      <button type="button" className="map-button square" title={expanded?'Restore map layout':'Expand map'} aria-label={expanded?'Restore map layout':'Expand map'} onClick={onExpand}>{expanded?<Minimize size={18}/>:<Maximize size={18}/>}</button>
    </div>
    <button type="button" className="map-button area-button" onClick={()=>{if(areaActive){onClearArea();return;}const b=map.current?.getBounds();if(b)onArea([b.getSouth(),b.getWest(),b.getNorth(),b.getEast()]);}}><Search size={15}/> {areaActive?'Clear map area':'Search this area'}</button>
    <div className="mapped-count"><MapPin size={13}/>{pins.length.toLocaleString()} mapped{privatePreview&&<span className="map-private"> · Private preview</span>}</div>
    {(error||message||!tileState.loaded)&&<div className="map-notice" role="status">{error||message||(tileState.failed?'Map tiles are temporarily unavailable. The OpenStreetMap server may be rate-limiting this connection; wait a moment, then retry.':'Loading map tiles…')}{message&&<button aria-label="Dismiss map message" onClick={()=>setMessage('')}>×</button>}{!message&&!!tileState.failed&&!tileState.loaded&&<button onClick={()=>setAttempt(x=>x+1)}>Retry</button>}</div>}
  </section>;
}
