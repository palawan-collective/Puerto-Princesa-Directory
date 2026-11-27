'use client';

import dynamic from 'next/dynamic';
import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowLeft,ArrowUpRight,ChevronDown,ChevronLeft,ChevronRight,Compass,Heart,Home,LayoutList,Map as MapIcon,MapPin,Menu,Search,SlidersHorizontal,X} from 'lucide-react';
import {businessPath,category,categoryInfo,coordinates,defaultSettings,directoryCategory,inDestination,str,type Bounds,type Business,type Media,type Settings} from '../lib/model';
import {categoryIcon,IslandMark} from './Icons';
import {coverOf,Photo,PlaceCard,PlaceDetail} from './PlaceCard';

const MapView=dynamic(()=>import('./Map'),{ssr:false,loading:()=> <div className="map-shell map-loading" role="status">Loading map…</div>});
const tabs=['Home','Explore','Discover','Guides','Directory','Saved','About'] as const;
export type Section=typeof tabs[number];
type View='map'|'list';
type Stage='preview'|'summary'|'full';
const destinationPath=(slug:string,section:Section)=>section==='Saved'?'/saved':section==='Explore'?'/'+slug:'/'+slug+'/'+section.toLowerCase();
const destinationDefault=defaultSettings.destinations[0];
const isMobile=()=>matchMedia('(max-width: 767px)').matches;

export default function Directory({initialSlug='puerto-princesa',initialSection='Explore',initialPlace}:{initialSlug?:string;initialSection?:Section;initialPlace?:string}) {
  const [rows,setRows]=useState<Business[]>([]),[media,setMedia]=useState<Media[]>([]);
  const [settings,setSettings]=useState(defaultSettings),[slug,setSlug]=useState(initialSlug);
  const [section,setSection]=useState(initialSection),[selection,setSelection]=useState(initialPlace||'');
  const [stage,setStage]=useState<Stage>(initialPlace?'full':'preview');
  const [profileOpen,setProfileOpen]=useState(!!initialPlace);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[preview,setPreview]=useState(false);
  const [query,setQuery]=useState(''),[search,setSearch]=useState('');
  const [cat,setCat]=useState('All'),[filter,setFilter]=useState<'all'|'featured'>('all');
  const [mappedOnly,setMappedOnly]=useState(false),[sort,setSort]=useState('curated');
  const [bounds,setBounds]=useState<Bounds|null>(null);
  const [limit,setLimit]=useState(32),[saved,setSaved]=useState<string[]>([]);
  const [view,setView]=useState<View>(initialSection==='Directory'?'list':'map'),[expanded,setExpanded]=useState(false);
  const [navigation,setNavigation]=useState(false),[more,setMore]=useState(false),[filterOpen,setFilterOpen]=useState(false);
  const [reload,setReload]=useState(0);
  const [theme,setTheme]=useState('light');
  const results=useRef<HTMLDivElement>(null);
  const closeFocus=useRef<HTMLElement|null>(null);
  const filterDialog=useRef<HTMLDialogElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const pointer=useRef<{x:number;y:number}|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');
    async function fetchPage(offset:number) {
      const r=await fetch(`/api/businesses?${section==='Saved'?'all=1':`destination=${encodeURIComponent(slug)}`}&offset=${offset}`,{signal:controller.signal});
      if(!r.ok) throw Error('The directory could not load.');
      return r.json() as Promise<{businesses:Business[];media:Media[];settings:Settings;preview:boolean;total:number}>;
    }
    async function loadCatalog() {
      try {
        const page=await fetchPage(0);
        const offsets=Array.from({length:Math.ceil(page.total/500)-1},(_,i)=>(i+1)*500);
        const pages=await Promise.all(offsets.map(fetchPage));
        if(controller.signal.aborted)return;
        setRows([page,...pages].flatMap(x=>x.businesses));setMedia([page,...pages].flatMap(x=>x.media));setSettings(page.settings);setPreview(page.preview);
      } catch(e) { if(!controller.signal.aborted)setError((e as Error).message); }
      finally { if(!controller.signal.aborted)setLoading(false); }
    }
    void loadCatalog();
    return ()=>controller.abort();
  },[slug,reload,section==='Saved']);

  useEffect(()=>{
    try {setSaved(JSON.parse(localStorage.getItem('islavista-saved')||localStorage.getItem('palawan-saved')||'[]'));setTheme(localStorage.getItem('islavista-theme')||'light');}catch{}
    const pop=(event:PopStateEvent)=>{
      const [,destination,sectionName,place]=location.pathname.split('/');
      setProfileOpen(sectionName==='place');
      if(destination==='saved'){setSection('Saved');setSelection(event.state?.selected||'');return;}
      if(destination)setSlug(destination);
      setSection(tabs.find(x=>x.toLowerCase()===sectionName)||'Explore');
      setView(sectionName==='directory'||sectionName==='saved'?'list':'map');
      setSelection(sectionName==='place'?place?.split('--').at(-1)||'':event.state?.selected||'');
      if(sectionName==='place')setStage('full');
    };
    window.addEventListener('popstate',pop);
    return()=>window.removeEventListener('popstate',pop);
  },[]);

  const destination=settings.destinations.find(d=>d.slug===slug)||destinationDefault;
  const placeSelected=rows.find(b=>b.business_id===selection)||null;
  const byId=useMemo(()=>{
    const index=new Map<string,Media[]>();
    for(const value of media) {
      const items=index.get(value.business_id)||[];
      items.push(value);index.set(value.business_id,items);
    }
    return index;
  },[media]);
  const available=useMemo(()=>settings.categories.filter(c=>{
    if(!c.visible)return false;
    if(section==='Saved')return true;
    if(c.tourism!==(section!=='Directory'))return false;
    // Only offer Directory categories that actually have matching businesses.
    return section!=='Directory'||loading||!rows.length||rows.some(b=>directoryCategory(b,settings.categories)===c.id);
  }),[settings.categories,section,rows,loading]);
  const placeCategory=(b:Business)=>section==='Directory'?directoryCategory(b,settings.categories):category(b);
  const matching=useMemo(()=>{
    const key=search.trim().toLowerCase();
    const results=rows.filter(b=>{
      if(section==='Saved'?!saved.includes(b.business_id):section==='Directory'?!directoryCategory(b,settings.categories):categoryInfo(b,settings)?.tourism!==true)return false;
      if(cat!=='All'&&placeCategory(b)!==cat)return false;
      if(key&&![b.name,b.category,b.subcategory,b.address,b.barangay,b.services,b.description].some(value=>str(value).toLowerCase().includes(key)))return false;
      const p=coordinates(b);
      return (!mappedOnly||!!p)&&(!bounds||!!p&&p[0]>=bounds[0]&&p[1]>=bounds[1]&&p[0]<=bounds[2]&&p[1]<=bounds[3]);
    });
    return sort==='name'?results.sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})):results;
  },[rows,section,saved,cat,search,settings,mappedOnly,bounds,sort]);

  const filtered=useMemo(()=>filter==='featured'?matching.filter(b=>b.featured===true):matching,[filter,matching]);
  const visiblePlaces=useMemo(()=>{
    const page=filtered.slice(0,limit);
    if(selection&&!page.some(b=>b.business_id===selection)){const selected=filtered.find(b=>b.business_id===selection);if(selected)page.unshift(selected);}
    return page;
  },[filtered,limit,selection]);
  useEffect(()=>{if(selection&&stage==='preview')results.current?.querySelector(`[data-place-id="${CSS.escape(selection)}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});},[selection,stage,visiblePlaces]);
  const listSection=section==='Explore'||section==='Directory'||section==='Saved';
  const fullProfile=profileOpen&&!!placeSelected;
  const profileSlug=placeSelected&&!inDestination(placeSelected,destination)?settings.destinations.find(d=>inDestination(placeSelected,d))?.slug||slug:slug;
  const mappedRows=listSection?filtered:rows;
  function scrollToTop(){setLimit(32);results.current?.scrollTo({top:0});}
  function resetFilters(){setCat('All');setQuery('');setSearch('');setFilter('all');setBounds(null);setMappedOnly(false);scrollToTop();}
  function go(next:Section,nextSlug=slug){
    if(next!==section||nextSlug!==slug){resetFilters();setSelection('');setExpanded(false);setView(next==='Directory'||next==='Saved'?'list':'map');}
    setProfileOpen(false);setNavigation(false);setMore(false);setSlug(nextSlug);setSection(next);
    const url=destinationPath(nextSlug,next);
    if(location.pathname!==url)history.pushState({},'',url);
  }
  function toggle(id:string){
    setSaved(list=>{const next=list.includes(id)?list.filter(x=>x!==id):[...list,id];localStorage.setItem('islavista-saved',JSON.stringify(next));return next;});
  }
  const closeDetail=useCallback(()=>{
    if(profileOpen&&history.state?.fromDirectory){history.back();return;}
    setProfileOpen(false);setSelection('');
    if(location.pathname.includes('/place/'))history.replaceState({},'',destinationPath(slug,section));
    requestAnimationFrame(()=>closeFocus.current?.focus({preventScroll:true}));
  },[slug,section,profileOpen]);
  const select=useCallback((b:Business,next:Stage='preview')=>{
    closeFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setSelection(b.business_id);
    setStage(next);
  },[]);
  const showStage=useCallback((next:Stage)=>{setStage(next);if(next!=='preview')setExpanded(false);},[]);
  const changeTheme=()=>{const next=theme==='dark'?'light':'dark';setTheme(next);localStorage.setItem('islavista-theme',next);};
  useEffect(()=>{
    if(filterOpen&&!filterDialog.current?.open)filterDialog.current?.showModal();
    if(!filterOpen&&filterDialog.current?.open)filterDialog.current.close();
  },[filterOpen]);
  useEffect(()=>{
    if(!selection&&!expanded)return;
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
      if(selection)closeDetail();
      else setExpanded(false);
    };
    window.addEventListener('keydown',key);
    if(stage==='full'||stage==='summary')requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>('.detail-close')?.focus({preventScroll:true}));
    return()=>window.removeEventListener('keydown',key);
  },[selection,stage,closeDetail,expanded]);
  function stepResult(delta:number){
    if(!filtered.length)return;
    const index=filtered.findIndex(b=>b.business_id===selection);
    setSelection(filtered[(index+delta+filtered.length)%filtered.length].business_id);
  }
  function swipe(event:ReactPointerEvent) {
    if(!pointer.current)return;
    const dx=event.clientX-pointer.current.x,dy=event.clientY-pointer.current.y;
    pointer.current=null;
    if(Math.abs(dy)>45&&Math.abs(dy)>Math.abs(dx)){
      if(dy<0)showStage(stage==='preview'?'summary':'full');
      else if(stage==='full')showStage('summary');
      else if(stage==='summary')showStage('preview');
      else closeDetail();
    } else if(stage==='preview'&&Math.abs(dx)>48)stepResult(dx<0?1:-1);
  }
  function locationFromCard() {
    setView('map');setStage('preview');
  }
  function openProfile() {
    if(!placeSelected)return;
    history.replaceState({...history.state,selected:placeSelected.business_id},'',location.href);
    window.scrollTo(0,0);
    history.pushState({fromDirectory:true},'',businessPath(placeSelected,profileSlug));
    setProfileOpen(true);
  }
  const filteredCount=filtered.length.toLocaleString();
  const sectionTitle=section==='Directory'?'Find local businesses.':section==='Saved'?'Saved places':section==='Explore'?`Explore ${destination.name}`:destination.name;
  const cover=destination.hero||'';
  const brand=settings.branding;
  const branding={
    '--forest':brand.forest,'--ivory':brand.ivory,'--sand':brand.sand,'--heading':`"${brand.heading}", Georgia, serif`,'--font':`"${brand.font}", Arial, sans-serif`,
  } as CSSProperties;
  const core=section==='Explore'?['Stay','Drink','Eat','Explore','Wellness','Shop','Essentials']:available.slice(0,7).map(c=>c.id);
  const initialChips=available.filter(c=>core.includes(c.id));
  const extraChips=available.filter(c=>!core.includes(c.id));
  const navLinks=['Explore','Discover','Guides','Directory','About'] as const;
  const editorial=settings[section==='Guides'?'guides':'collections'].filter(x=>x.destination===slug);
  return <main className={`shell ${theme==='dark'?'dark':''} ${placeSelected&&stage==='full'?'show-detail':''}`} style={branding}>
    <header className="site-header">
      <a className="site-brand" href={destinationPath(slug,'Home')} onClick={e=>{e.preventDefault();go('Home');}} aria-label={`${destination.name} Directory home`}>
        {brand.logo?<img src={brand.logo} alt=""/>:<IslandMark/>}<span>{brand.name||destination.name}<br/>{!brand.name&&'Directory'}</span>
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">{navLinks.map(item=><a key={item} href={destinationPath(slug,item)} aria-current={section===item?'page':undefined} onClick={e=>{e.preventDefault();go(item);}}>{item==='About'?`About ${destination.name}`:item}</a>)}</nav>
      <div className="header-actions">
        <a aria-label="Saved places" className="icon-button" href="/saved" aria-current={section==='Saved'?'page':undefined} onClick={e=>{e.preventDefault();go('Saved');}}><Heart size={23} fill={section==='Saved'?'currentColor':'none'}/></a>
        <button type="button" className="icon-button" aria-label={navigation?'Close navigation':'Open navigation'} aria-expanded={navigation} onClick={()=>setNavigation(v=>!v)}>{navigation?<X size={23}/>:<Menu size={23}/>}</button>
      </div>
      {navigation&&<nav className="nav-popup" aria-label="All pages">{tabs.map(item=><a key={item} href={destinationPath(slug,item)} onClick={e=>{e.preventDefault();go(item);}}>{item==='About'?`About ${destination.name}`:item}</a>)}<a href="/admin">Administration</a><button type="button" onClick={changeTheme}>{theme==='dark'?'Light appearance':'Dark appearance'}</button></nav>}
    </header>

    {fullProfile&&<div className="profile-page">
      <a className="profile-back" href={destinationPath(slug,'Explore')} onClick={e=>{if(history.state?.fromDirectory){e.preventDefault();history.back();}}}><ArrowLeft size={17}/> Back to {section==='Saved'?'saved places':'the map'}</a>
      <PlaceDetail key={placeSelected.business_id} business={placeSelected} media={byId.get(placeSelected.business_id)||[]} settings={settings} destination={profileSlug} saved={saved.includes(placeSelected.business_id)} toggle={()=>toggle(placeSelected.business_id)}/>
    </div>}
    {listSection?<div hidden={fullProfile} className={`discovery ${section==='Directory'?'business-directory':''} view-${view} ${expanded?'map-expanded':''} ${placeSelected&&stage!=='preview'?'has-panel':''}`}>
      <section className="intro" aria-label="Destination search" style={cover?{backgroundImage:`linear-gradient(90deg,var(--surface) 10%,transparent 80%),url("${cover}")`}:undefined}>
        <div className="intro-inner">
          <div className="intro-copy"><p className="eyebrow"><MapPin size={14}/> {section==='Directory'?'PALAWAN · BUSINESS DIRECTORY':section==='Saved'?'PALAWAN · SAVED':'PALAWAN · MAP'}</p><h1>{sectionTitle}</h1>
          <p className="intro-description">{section==='Directory'?`Search local shops, services, suppliers and professionals in ${destination.name}.`:section==='Saved'?'Keep the places you want to come back to.':'Discover places around the city and find them on the interactive map.'}</p></div>
          <form className="search-line" onSubmit={e=>{e.preventDefault();setSearch(query);setBounds(null);scrollToTop();}}>
            <label className="destination-picker"><MapPin size={19}/><select aria-label="Destination" value={slug} onChange={e=>go(section,e.target.value)}>{settings.destinations.filter(d=>d.status==='published').map(d=><option key={d.slug} value={d.slug}>{d.name}</option>)}</select><ChevronDown size={14}/></label>
            <div className="search-box"><Search size={19}/><input aria-label="Search places" value={query} onChange={e=>{setQuery(e.target.value);setSearch(e.target.value);setBounds(null);scrollToTop();}} placeholder={section==='Directory'?'Search businesses and services':'Search places or experiences'}/>{query&&<button type="button" className="icon-button" aria-label="Clear search" onClick={()=>{setQuery('');setSearch('');}}><X size={17}/></button>}<button type="submit" className="primary search-submit">Search</button></div>
          </form>
          <div className="mobile-category">
            <label><span>Category</span><span className="select-wrap"><select aria-label="Category" value={cat} onChange={e=>{setCat(e.target.value);setFilter('all');scrollToTop();}}><option value="All">{section==='Directory'?'All businesses':section==='Saved'?'All saved':'All places'}</option>{available.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select><ChevronDown size={15}/></span></label>
            <button type="button" className="secondary filter-mobile" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={16}/> Filters</button>
          </div>
        </div>
      </section>
      <div className="mobile-controls">
        <div className="view-switch" aria-label="Map or list">
          <button type="button" aria-pressed={view==='map'} onClick={()=>setView('map')}><MapIcon size={17}/> Map</button>
          <button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}><LayoutList size={18}/> List</button>
        </div>
      </div>
      <section className="category-strip" aria-label="Categories">
        <div className="chips">
          {[{id:'All',label:'All',icon:undefined},...initialChips].map(c=>{const Icon=categoryIcon(c.id,c.icon);return <button type="button" aria-pressed={cat===c.id} key={c.id} onClick={()=>{setCat(c.id);setFilter('all');scrollToTop();}}><Icon size={17}/><span>{c.label}</span></button>;})}
          {extraChips.length>0&&<button type="button" aria-expanded={more} onClick={()=>setMore(v=>!v)}><span>{more?'Less':'More'}</span><ChevronDown size={14}/></button>}
          {more&&extraChips.map(c=>{const Icon=categoryIcon(c.id,c.icon);return <button type="button" aria-pressed={cat===c.id} key={c.id} onClick={()=>{setCat(c.id);setFilter('all');scrollToTop();}}><Icon size={17}/><span>{c.label}</span></button>;})}
        </div>
      </section>
      <div className="explore">
        <section className="results" aria-label={section==='Directory'?'Business listings':'Explore places'}>
          <div className="result-controls">
            <div className="list-tabs" aria-label="Listing selection">
              <button type="button" aria-pressed={filter==='featured'} onClick={()=>{setFilter('featured');scrollToTop();}}>Featured</button>
              <button type="button" aria-pressed={filter==='all'} onClick={()=>{setFilter('all');scrollToTop();}}>{section==='Directory'?'All businesses':section==='Saved'?'Saved':'All'} <span>({matching.length.toLocaleString()})</span></button>
            </div>
            <button type="button" className="filter-button" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={16}/> Filters <ChevronDown size={13}/></button>
          </div>
          {preview&&<div className="preview-note">Private preview · Imported listings are unverified</div>}
          <div className="result-list" ref={results}>
            {bounds&&<button type="button" className="clear-area" onClick={()=>setBounds(null)}>Clear map area <X size={14}/></button>}
            {loading&&<p className="empty-state" role="status">Loading places…</p>}
            {error&&<div className="empty-state" role="alert">{error} <button onClick={()=>setReload(x=>x+1)}>Retry</button></div>}
            {!loading&&!error&&!filtered.length&&<div className="empty-state"><Compass size={28}/><h2>{filter==='featured'?'No featured places yet':section==='Saved'?'No saved places yet':'No places found'}</h2>{(search||cat!=='All'||bounds||mappedOnly||filter==='featured')&&<button type="button" onClick={resetFilters}>Clear filters</button>}</div>}
            {!loading&&!error&&visiblePlaces.map(b=><PlaceCard key={b.business_id} business={b} media={byId.get(b.business_id)||[]} settings={settings} saved={saved.includes(b.business_id)} selected={selection===b.business_id} categoryId={section==='Directory'?directoryCategory(b,settings.categories):undefined} toggle={()=>toggle(b.business_id)} onOpen={()=>select(b,isMobile()?'full':'preview')}/>)}
            {!loading&&filtered.length>limit&&<button className="load-more" type="button" onClick={()=>setLimit(x=>x+32)}>Load more places</button>}
          </div>
        </section>
        <div className="map-wrap">
          <MapView rows={mappedRows} destination={destination} settings={settings} selected={placeSelected} onSelect={select} onArea={area=>{setBounds(area);scrollToTop();}} areaActive={!!bounds} onClearArea={()=>setBounds(null)} privatePreview={preview} expanded={expanded} onExpand={()=>{setExpanded(v=>!v);setView('map');}}/>
          {!fullProfile&&placeSelected&&stage==='preview'&&<aside className="marker-preview">
            <div className="sheet-grip" role="presentation" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);pointer.current={x:e.clientX,y:e.clientY};}} onPointerUp={swipe}><span/></div>
            <button className="icon-button mini-close" type="button" aria-label="Close selected place" onClick={closeDetail}><X size={17}/></button>
            <div className="mini-summary">
              <div className="mini-photo"><Photo media={coverOf(byId.get(placeSelected.business_id)||[])} name={placeSelected.name}/></div>
              <div><h2>{placeSelected.name}</h2><p>{categoryInfo(placeSelected,settings)?.label||category(placeSelected)}</p><small>{str(placeSelected.barangay||placeSelected.address)}</small></div>
            </div>
            <div className="mini-actions">
              <button className="icon-button" type="button" aria-label="Previous nearby place" onClick={()=>stepResult(-1)}><ChevronLeft size={18}/></button>
              <button className="primary details-button" type="button" onClick={()=>showStage('full')}>View Details <ChevronRight size={16}/></button>
              <button className="icon-button" type="button" aria-label="Next nearby place" onClick={()=>stepResult(1)}><ChevronRight size={18}/></button>
            </div>
            <button type="button" className="summary-button" onClick={()=>showStage('summary')}>Show summary</button>
          </aside>}
        </div>
        {!fullProfile&&placeSelected&&stage!=='preview'&&<aside className={`detail-panel sheet-${stage}`} ref={panel} aria-label="Place details">
          <div className="sheet-grip" role="presentation" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);pointer.current={x:e.clientX,y:e.clientY};}} onPointerUp={swipe}><span/></div>
          {stage==='summary'&&<button type="button" className="summary-expand" onClick={()=>showStage('full')}>Open full profile</button>}
          <PlaceDetail key={placeSelected.business_id} business={placeSelected} media={byId.get(placeSelected.business_id)||[]} settings={settings} destination={profileSlug} saved={saved.includes(placeSelected.business_id)} toggle={()=>toggle(placeSelected.business_id)} onClose={closeDetail} onLocate={locationFromCard} onProfile={openProfile}/>
        </aside>}
      </div>
    </div>:<section className="editorial">
      <p className="eyebrow"><MapPin size={15}/> PALAWAN</p>
      <h1>{section==='Home'?destination.name:section==='About'?`About ${destination.name}`:section==='Discover'?`Discover ${destination.name}`:`${destination.name} guides`}</h1>
      {section!=='Guides'&&<p>{destination.description}</p>}
      {(section==='Home'||section==='About')&&<a className="primary" href={destinationPath(slug,'Explore')} onClick={e=>{e.preventDefault();go('Explore');}}>Explore {destination.name} <ArrowUpRight size={16}/></a>}
      {section==='Discover'&&<div className="editorial-categories">{available.map(c=>{const Icon=categoryIcon(c.id,c.icon);return <button key={c.id} type="button" onClick={()=>{go('Explore');setCat(c.id);}}><Icon size={22}/><span>{c.label}</span></button>;})}</div>}
      {(section==='Guides'||section==='Discover')&&editorial.map(entry=><article className="editorial-entry" key={entry.id}><h2>{entry.title}</h2><p>{entry.body}</p><div className="editorial-cards">{entry.businesses.split(/[,\s]+/).flatMap(id=>{const b=rows.find(x=>x.business_id===id);return b?[<PlaceCard key={id} business={b} media={byId.get(id)||[]} settings={settings} saved={saved.includes(id)} toggle={()=>toggle(id)} onOpen={()=>{go('Explore');select(b,'full');}}/>]:[];})}</div></article>)}
      {section==='Guides'&&!editorial.length&&<p>No published guides yet.</p>}
    </section>}

    <dialog ref={filterDialog} className="filter-dialog" onClose={()=>setFilterOpen(false)} aria-labelledby="filter-heading">
      <div className="dialog-heading"><h2 id="filter-heading">Filters</h2><button type="button" className="icon-button" aria-label="Close filters" onClick={()=>setFilterOpen(false)}><X size={23}/></button></div>
      <label>Search<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setSearch(e.target.value);scrollToTop();}} placeholder="Find a place"/></label>
      <label>Category<select value={cat} onChange={e=>{setCat(e.target.value);scrollToTop();}}><option value="All">All categories</option>{available.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>Sort by<select value={sort} onChange={e=>{setSort(e.target.value);scrollToTop();}}><option value="curated">Recommended order</option><option value="name">Name A–Z</option></select></label>
      <label className="checkbox-line"><input type="checkbox" checked={filter==='featured'} onChange={e=>{setFilter(e.target.checked?'featured':'all');scrollToTop();}}/> Featured places only</label>
      <label className="checkbox-line"><input type="checkbox" checked={mappedOnly} onChange={e=>{setMappedOnly(e.target.checked);scrollToTop();}}/> Places with a map location</label>
      {bounds&&<button type="button" onClick={()=>setBounds(null)}>Clear map area</button>}
      <div className="dialog-actions"><button type="button" onClick={resetFilters}>Reset</button><button className="primary" type="button" onClick={()=>setFilterOpen(false)}>Show {filteredCount} places</button></div>
    </dialog>
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      <a href={destinationPath(slug,'Home')} aria-current={section==='Home'?'page':undefined} onClick={e=>{e.preventDefault();go('Home');}}><Home size={20}/><span>Home</span></a>
      <a href={destinationPath(slug,'Discover')} aria-current={section==='Discover'?'page':undefined} onClick={e=>{e.preventDefault();go('Discover');}}><Compass size={20}/><span>Discover</span></a>
      <a href={destinationPath(slug,'Explore')} aria-current={section==='Explore'?'page':undefined} onClick={e=>{e.preventDefault();go('Explore');}}><MapIcon size={20}/><span>Map</span></a>
      <a href={destinationPath(slug,'Directory')} aria-current={section==='Directory'?'page':undefined} onClick={e=>{e.preventDefault();go('Directory');}}><LayoutList size={20}/><span>Directory</span></a>
      <a href="/saved" aria-current={section==='Saved'?'page':undefined} onClick={e=>{e.preventDefault();go('Saved');}}><Heart size={20} fill={section==='Saved'?'currentColor':'none'}/><span>Saved</span></a>
    </nav>
  </main>;
}
