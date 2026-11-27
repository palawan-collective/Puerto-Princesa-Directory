'use client';

import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,CalendarDays,Check,ChevronLeft,ChevronRight,Clock,Expand,Globe,Heart,Image as ImageIcon,Mail,MapPin,MessageSquare,Navigation,Phone,Share2,Star,Tag,X} from 'lucide-react';
import {siFacebook,siInstagram,siTiktok,siWhatsapp} from 'simple-icons';
import {authorized,businessPath,category,categoryInfo,coordinates,list,safeLink,str,type Business,type Media,type Settings} from '../lib/model';
import {amenityIcon,categoryIcon,IslandMark} from './Icons';

export function Photo({media,name,video=false,icon}:{media?:Media;name:string;video?:boolean;icon?:ReactNode}) {
  if (!media) return <div className="photo-placeholder" role="img" aria-label="No photo available">{icon??<IslandMark/>}</div>;
  if (media.kind==='video' && video) return <video src={media.url} poster={media.thumbnail} controls playsInline preload="metadata" aria-label={media.alt||name}/>;
  if (media.kind==='video'&&!media.thumbnail) return <div className="photo-placeholder"><ImageIcon size={24}/></div>;
  return <img src={media.kind==='video'?media.thumbnail:video?media.url:media.thumbnail||media.url} alt={media.alt||name} loading="lazy"/>;
}
export function coverOf(media:Media[]) {
  return media.find(m=>m.cover)||media[0];
}
function SavedButton({saved,toggle}:{saved:boolean;toggle:()=>void}) {
  return <button type="button" className={'icon-button save-button '+(saved?'is-saved':'')} aria-label={saved?'Remove from saved':'Save place'} aria-pressed={saved} onClick={toggle}><Heart size={21} fill={saved?'currentColor':'none'}/></button>;
}
function Rating({business:b}:{business:Business}) {
  const value=Number(b.rating);
  return safeLink(b.rating_source)&&value>0&&value<=5?<a className="rating" href={safeLink(b.rating_source)} target="_blank" rel="noreferrer"><Star size={14} fill="currentColor"/><span>{value.toFixed(1)}{Number(b.rating_count)>0?` (${Number(b.rating_count).toLocaleString()})`:''}</span></a>:null;
}
type CardProps={business:Business;media:Media[];settings:Settings;saved:boolean;toggle:()=>void;categoryId?:string};
export function PlaceCard({business:b,media,settings,saved,toggle,selected=false,onOpen,categoryId}:{selected?:boolean;onOpen:()=>void}&CardProps) {
  const override=categoryId?settings.categories.find(c=>c.id===categoryId):undefined;
  const info=override||categoryInfo(b,settings),resolved=categoryId||category(b),Icon=categoryIcon(resolved,info?.icon);
  const label=info?.label||resolved;
  return <article className={'place-card '+(selected?'active-card':'')} data-place-id={b.business_id}>
    <button type="button" className="card-main" onClick={onOpen} aria-label={`View ${b.name}`} aria-pressed={selected}>
      <div className="card-photo" style={{'--ph':info?.color||'#628473'} as React.CSSProperties}><Photo media={coverOf(media)} name={b.name} icon={<Icon size={30}/>}/></div>
      <div className="card-copy">
        {b.featured===true&&<span className="featured-badge"><Star size={11} fill="currentColor"/> Featured</span>}
        <h3>{b.name}</h3>
        <div className="card-meta"><Icon size={14}/><span>{label}</span>{!!str(b.barangay||b.address)&&<><b aria-hidden="true">·</b><span>{str(b.barangay||b.address)}</span></>}</div>
        {!!str(b.description)&&<p>{str(b.description)}</p>}
        {!coordinates(b)&&<small className="muted">Map location unavailable</small>}
      </div>
    </button>
    <SavedButton saved={saved} toggle={toggle}/>
    <Rating business={b}/>
  </article>;
}

const brandIcons={Facebook:siFacebook,Instagram:siInstagram,TikTok:siTiktok,WhatsApp:siWhatsapp};
function BrandIcon({name}:{name:keyof typeof brandIcons}) {
  return <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="currentColor"><path d={brandIcons[name].path}/></svg>;
}
function tel(value:unknown) { const x=str(value).replace(/[^+\d]/g,''); return /^\+?\d{5,16}$/.test(x)?x:''; }
function email(value:unknown) { const x=str(value);return /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(x)?x:''; }
function track(id:string,channel:string) {
  void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:id,channel}),keepalive:true}).catch(()=>{});
}
function Action({href,id,channel,children,className}:{href:string;id:string;channel:string;children:ReactNode;className?:string}) {
  const external=/^https?:/.test(href);
  return <a className={className} href={href} target={external?'_blank':undefined} rel={external?'noreferrer':undefined} onClick={()=>track(id,channel)}>{children}</a>;
}
export const categoryFields:Record<string,string[]> = {
  Stay:['room_types','check_in','check_out'],Eat:['cuisine','menu','reservations','delivery'],
  Drink:['menu','workspace'],Explore:['duration','pickup','inclusions','group_size'],
  Discover:['duration','pickup','inclusions'],Wellness:['treatments','appointments'],
};
export const fieldLabel=(key:string)=>({opening_hours:'Opening hours',price_range:'Price range',check_in:'Check-in',check_out:'Check-out',room_types:'Room types',group_size:'Group size'}[key]||key.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()));

function Gallery({media,name,ratio,icon,color}:{media:Media[];name:string;ratio?:string;icon?:ReactNode;color?:string}) {
  const ordered=useMemo(()=>media.filter(m=>authorized(m.permission_status)).sort((a,b)=>Number(b.cover)-Number(a.cover)),[media]);
  const [index,setIndex]=useState(0),[full,setFull]=useState(false);
  const origin=useRef(0),dialog=useRef<HTMLDialogElement>(null);
  const count=ordered.length;
  const current=ordered[Math.min(index,count-1)];
  const change=(step:number)=>{if(count)setIndex(i=>(i+step+count)%count);};
  useEffect(()=>{if (full&&!dialog.current?.open) dialog.current?.showModal();if(!full&&dialog.current?.open) dialog.current.close();},[full]);
  function controls() {
    return count>1?<><button type="button" className="icon-button gallery-prev" aria-label="Previous photo or video" onClick={()=>change(-1)}><ChevronLeft size={19}/></button><button type="button" className="icon-button gallery-next" aria-label="Next photo or video" onClick={()=>change(1)}><ChevronRight size={19}/></button></>:null;
  }
  return <div className="place-gallery" style={{'--ph':color||'#628473'} as React.CSSProperties} onKeyDown={e=>{if(e.key==='ArrowLeft')change(-1);if(e.key==='ArrowRight')change(1);}}>
    <div className={`gallery-grid ${count>=3?'gallery-with-thumbs':''}`}>
      <div className="gallery-frame" style={ratio?{aspectRatio:ratio}:undefined}
        onTouchStart={e=>{origin.current=e.changedTouches[0].clientX;}}
        onTouchEnd={e=>{const delta=e.changedTouches[0].clientX-origin.current;if(Math.abs(delta)>44)change(delta<0?1:-1);}}>
        <Photo key={current?.filename} media={current} name={name} video icon={icon}/>
        {count>0&&<div className="gallery-count">{index+1}/{count}</div>}
        {count>0&&<button type="button" className="icon-button gallery-expand" aria-label="Open full-screen gallery" onClick={()=>setFull(true)}><Expand size={16}/></button>}
        {controls()}
      </div>
      {count>=3&&<div className="gallery-thumbs">{[1,2].map(offset=><button type="button" key={offset} onClick={()=>change(offset)} aria-label={`View media ${(index+offset)%count+1}`}><Photo media={ordered[(index+offset)%count]} name={name}/></button>)}</div>}
    </div>
    {count>1&&<div className="gallery-dots" aria-label="Gallery position">{ordered.map((m,i)=><button type="button" key={m.filename} aria-label={`Media ${i+1}`} aria-current={i===index?'true':undefined} onClick={()=>setIndex(i)} />)}</div>}
    {current?.attribution&&<small className="gallery-credit">Credit · {current.attribution}</small>}
    <dialog className="gallery-dialog" ref={dialog} onClose={()=>setFull(false)} aria-label={`${name} gallery`}>
      {full&&<><button autoFocus type="button" className="icon-button close" aria-label="Close full-screen gallery" onClick={()=>setFull(false)}><X/></button><Photo key={current?.filename} media={current} name={name} video icon={icon}/>{controls()}<span className="gallery-count">{index+1}/{count}</span></>}
    </dialog>
  </div>;
}

export function PlaceDetail({business:b,media,settings,saved,toggle,destination,onClose,onLocate,onProfile,preview=false}:{destination:string;onClose?:()=>void;onLocate?:()=>void;onProfile?:()=>void;preview?:boolean}&CardProps) {
  const [shareStatus,setShareStatus]=useState('');
  const info=categoryInfo(b,settings),id=category(b),Icon=categoryIcon(id,info?.icon);
  const template=settings.templates.find(t=>t.category===id);
  const available=(key:string)=>!list(template?.fields).length||list(template?.fields).includes(key);
  const point=coordinates(b);
  const phone=tel(b.phone),mail=email(b.email),whatsapp=tel(b.whatsapp);
  const channels=[
    {name:'Website',href:safeLink(b.website),icon:<Globe size={21}/>},
    ...(['Facebook','Instagram','WhatsApp','TikTok'] as const).map(name=>({name,href:safeLink(b[name.toLowerCase()])||(name==='WhatsApp'&&whatsapp?`https://wa.me/${whatsapp.replace(/^\+/,'')}`:''),icon:<BrandIcon name={name}/>})),
    {name:'Call',href:phone?`tel:${phone}`:'',icon:<Phone size={21}/>},
    {name:'Email',href:mail?`mailto:${mail}`:'',icon:<Mail size={21}/>},
  ].filter(x=>x.href);
  const booking=safeLink(b.booking_url);
  const inquiry=safeLink(b.inquiry_url)||(mail?`mailto:${mail}`:phone?`tel:${phone}`:channels.find(x=>x.name==='WhatsApp')?.href||'');
  const direction=point?`https://www.openstreetmap.org/directions?to=${point.join('%2C')}`:'';
  const facts=['opening_hours','price_range',...(categoryFields[id]||[]),'services'].filter(key=>available(key)&&str(b[key]));
  const amenities=available('amenities')?list(b.amenities):[];
  async function share() {
    const url=new URL(businessPath(b,destination),location.origin).href;
    try {
      if (navigator.share) await navigator.share({title:b.name,url});
      else {await navigator.clipboard.writeText(url);setShareStatus('Link copied');}
    } catch (error) {if ((error as Error).name!=='AbortError')setShareStatus('Open the place profile to copy its link.');}
  }

  const sections:Record<string,ReactNode>={
    description:available('description')&&str(b.description)?<p className="place-description">{str(b.description)}</p>:null,
    amenities:amenities.length?<div className="amenities" aria-label="Amenities">{amenities.map(label=>{const Amenity=amenityIcon(label);return <div key={label}><Amenity size={23}/><span>{label}</span></div>;})}</div>:null,
    facts:facts.length||point||str(b.custom_fields)?<div className="place-facts">
      {facts.map(key=>{const FactIcon=key==='price_range'?Tag:/hour|check/.test(key)?Clock:CalendarDays;const value=str(b[key]);const link=safeLink(value);return <div className="fact" key={key}><FactIcon size={17}/><strong>{fieldLabel(key)}</strong><span>{link?<Action href={link} id={b.business_id} channel={key==='menu'?'Menu':'Reservations'}>Open {fieldLabel(key).toLowerCase()}</Action>:value}</span></div>;})}
      {available('custom_fields')&&str(b.custom_fields).split('\n').filter(line=>line.includes(':')).map((line,i)=>{const colon=line.indexOf(':');return <div className="fact" key={i}><Tag size={17}/><strong>{line.slice(0,colon).trim()}</strong><span>{line.slice(colon+1).trim()}</span></div>;})}
      {point&&<div className="fact"><MapPin size={18}/><strong>Location</strong><span>{onLocate?<button type="button" className="link-button" onClick={onLocate}>View on map <ChevronRight size={14}/></button>:<Action href={direction} id={b.business_id} channel="Directions">View on map</Action>}</span></div>}
    </div>:null,
    social:channels.length?<div className="connect"><h3>Connect &amp; inquire</h3><div className="social-grid">{channels.map(c=><Action key={c.name} href={c.href} id={b.business_id} channel={c.name}>{c.icon}<span>{c.name}</span></Action>)}</div></div>:null,
  };
  const order=[...new Set([...list(template?.sections).filter(x=>x in sections),'description','amenities','facts','social'])];
  const destinationName=settings.destinations.find(d=>d.slug===b.destination)?.name||str(b.destination);
  const area=[str(b.barangay||b.address),destinationName].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');
  return <article className="place-detail">
    <div className="detail-top">
      <div className="detail-labels"><span className="category-badge"><Icon size={15}/> {info?.label||id}</span>{b.featured===true&&<span className="featured-badge"><Star size={13} fill="currentColor"/> Editor’s pick</span>}</div>
      <h2>{b.name}</h2>
      {area&&<div className="location-line"><MapPin size={16}/>{area}</div>}
      <div className="identity-badges"><Rating business={b}/>{b.verified===true&&safeLink(b.verification_source)&&<a className="verified" href={safeLink(b.verification_source)} target="_blank" rel="noreferrer"><Check size={14}/> Verified</a>}</div>
    </div>
    <div className="detail-toolbar">
      {onClose&&<button type="button" className="icon-button detail-close" aria-label="Close details" onClick={onClose}><X className="wide-close" size={22}/><ArrowLeft className="narrow-close" size={22}/></button>}
      <SavedButton saved={saved} toggle={toggle}/>
      {!preview&&<button type="button" className="icon-button share-button" aria-label="Share place" onClick={share}><Share2 size={19}/></button>}
    </div>
    <Gallery media={media} name={b.name} ratio={template?.ratio} icon={<Icon size={44}/>} color={info?.color}/>
    <div className="detail-body">
      {order.map(key=><div key={key} hidden={!sections[key]}>{sections[key]}</div>)}
      {shareStatus&&<p role="status">{shareStatus}</p>}
      {!preview&&onClose&&<a className="profile-link" href={businessPath(b,destination)} onClick={e=>{if(onProfile&&!e.ctrlKey&&!e.metaKey){e.preventDefault();onProfile();}}}>Open place profile <ChevronRight size={15}/></a>}
    </div>
    {(booking||inquiry||direction)&&<footer className={`detail-actions ${template?.actions==='inline'?'inline-actions':''}`}>
      {(booking||inquiry)&&<Action className="primary" href={booking||inquiry} id={b.business_id} channel={booking?'Book':'Inquire'}><MessageSquare size={19}/>{booking?'Book directly':'Inquire'}</Action>}
      {direction&&<Action className={booking||inquiry?'secondary':'primary'} href={direction} id={b.business_id} channel="Directions"><Navigation size={18}/> Directions</Action>}
    </footer>}
  </article>;
}
