'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, ChartNoAxesCombined, ChevronDown, ExternalLink,
  FileText, Image, LayoutDashboard, LayoutTemplate, ListChecks, LogOut, Map as MapIcon, MapPin,
  Palette, Store, Tags, Upload, type LucideIcon,
} from 'lucide-react';
import {approved,type State} from '../lib/model';
import {IslandMark} from './Icons';
import {AdminBusinesses} from './AdminBusinesses';
import {AdminSettings,type SettingsTab} from './AdminSettings';
import {AdminMediaLibrary} from './AdminMedia';
import {AdminImport,AdminExports,type ImportKind} from './AdminTransfer';
import {adminRequest,Empty,formatDate,jsonRequest,type Run} from './AdminFields';
import '../app/admin/admin.css';

const navigation=[
  {label:'Workspace',items:[['Overview',LayoutDashboard],['Businesses',Store],['Media library',Image]]},
  {label:'Site content',items:[['Destinations',MapPin],['Categories',Tags],['Collections',ListChecks],['Guides',BookOpen],['Card designer',LayoutTemplate],['Page copy',FileText],['Branding',Palette],['Map settings',MapIcon]]},
  {label:'Data',items:[['Imports',Upload],['Exports',ArrowDownToLine],['Analytics',ChartNoAxesCombined],['Audit log',FileText]]},
] as const satisfies readonly {label:string;items:readonly (readonly [string,LucideIcon])[]}[];
type Tab=typeof navigation[number]['items'][number][0];

const descriptions:Record<Tab,string>={
  Overview:'Manage the businesses and editorial content visitors see in IslaVista.',
  Businesses:'Find, review and publish business listings.',
  'Media library':'Manage approved images, videos and source candidates.',
  Destinations:'Manage the destinations available to visitors and how each opens on the map.',
  Categories:'Choose which categories appear in Explore and the general Business Directory.',
  Collections:'Group published businesses into curated recommendations.',
  Guides:'Write and publish destination guides.',
  'Card designer':'Choose visible fields and layout for category-specific place profiles.',
  'Page copy':'Edit the headings and introductions shown on Home, About, Discover and Guides.',
  Branding:'Set the name, approved logo, typography and colors used across the site.',
  'Map settings':'Edit basemap sources. Leave a provider blank to use its default.',
  Imports:'Check business data and media permissions before adding them to the directory.',
  Exports:'Download a working copy of the directory or restore a local JSON snapshot.',
  Analytics:'Review outbound clicks recorded from published place profiles.',
  'Audit log':'Review changes made in this local workspace.',
};
const settingsTabs:SettingsTab[]=['Destinations','Categories','Collections','Guides','Card designer','Page copy','Branding','Map settings'];

function Overview({state,open}:{state:State;open:(tab:Tab)=>void}) {
  const published=state.businesses.filter(approved).length;
  const stats=[
    {label:'Business listings',value:state.businesses.length,icon:Store,tab:'Businesses' as const},
    {label:'Published listings',value:published,icon:ListChecks,tab:'Businesses' as const},
    {label:'Approved media',value:state.media.length,icon:Image,tab:'Media library' as const},
    {label:'Live destinations',value:state.settings.destinations.filter(x=>x.status==='published').length,icon:MapPin,tab:'Destinations' as const},
  ];
  return <>
    <div className="studio-stats">{stats.map(({label,value,icon:Icon,tab})=><button className="studio-stat" type="button" key={label} onClick={()=>open(tab)}><Icon size={19}/><span>{label}</span><strong>{value.toLocaleString()}</strong><ArrowRight className="studio-stat-arrow" size={16}/></button>)}</div>
    <section className="studio-panel studio-overview-tasks">
      <div><h2>Review the directory</h2><p>{(state.businesses.length-published).toLocaleString()} listings are outside the published directory. Review records before making them public.</p></div>
      <button type="button" className="primary" onClick={()=>open('Businesses')}>Browse listings <ArrowRight size={16}/></button>
    </section>
    <section className="studio-panel"><div className="studio-panel-heading"><h2>Recent changes</h2><button type="button" onClick={()=>open('Audit log')}>View audit log</button></div><Audit state={state} limit={5}/></section>
  </>;
}

function Audit({state,limit=50}:{state:State;limit?:number}) {
  return state.audit.length?<div className="studio-table"><table><thead><tr><th>Change</th><th>Record</th><th>Time</th></tr></thead>
    <tbody>{state.audit.slice(-limit).reverse().map((item,index)=><tr key={item.at+index}><td>{item.action}</td><td>{item.target}</td><td>{formatDate(item.at)}</td></tr>)}</tbody></table></div>
    :<Empty>No changes have been recorded yet.</Empty>;
}

function Analytics({state}:{state:State}) {
  const channels=new Map<string,number>();
  const listings=new Map<string,number>();
  for (const event of state.analytics) {
    channels.set(event.channel,(channels.get(event.channel)||0)+1);
    listings.set(event.business_id,(listings.get(event.business_id)||0)+1);
  }
  const names=new Map(state.businesses.map(b=>[b.business_id,b.name]));
  const top=(items:Map<string,number>)=>[...items].sort((a,b)=>b[1]-a[1]);
  return !state.analytics.length?<Empty>No outbound clicks have been recorded yet.</Empty>:<>
    <div className="studio-panel"><h2>{state.analytics.length.toLocaleString()} recorded clicks</h2><p>Counts reflect clicks on links such as directions, calls and external booking.</p>
      <div className="studio-analytics">
        <div><h3>By channel</h3><dl>{top(channels).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></div>
        <div><h3>Most clicked listings</h3><dl>{top(listings).slice(0,10).map(([key,value])=><div key={key}><dt>{names.get(key)||key}</dt><dd>{value}</dd></div>)}</dl></div>
      </div>
    </div>
    <div className="studio-panel"><h2>Recent clicks</h2><div className="studio-table"><table><thead><tr><th>Listing</th><th>Channel</th><th>Time</th></tr></thead><tbody>{state.analytics.slice(-50).reverse().map((event,index)=><tr key={event.at+index}><td>{names.get(event.business_id)||event.business_id}</td><td>{event.channel}</td><td>{formatDate(event.at)}</td></tr>)}</tbody></table></div></div>
  </>;
}

export default function Admin() {
  const [session,setSession]=useState<'loading'|'signed-out'|'signed-in'>('loading');
  const [state,setState]=useState<State|null>(null);
  const [local,setLocal]=useState(false);
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const activeRequest=useRef(false);
  const [notice,setNotice]=useState<{message:string;error?:boolean}|null>(null);
  const [tab,setTab]=useState<Tab>('Overview');
  const [importKind,setImportKind]=useState<ImportKind>('businesses');
  const [businessId,setBusinessId]=useState('');
  const [mobileNav,setMobileNav]=useState(false);

  async function refresh() {
    const next=await adminRequest<State>('/api/businesses?admin=1');
    setState(next);
  }
  useEffect(()=>{
    let cancelled=false;
    async function load() {
      try {
        const auth=await adminRequest<{admin:boolean;local:boolean}>('/api/session');
        const next=auth.admin?await adminRequest<State>('/api/businesses?admin=1'):null;
        if (!cancelled) {
          setState(next);
          setLocal(auth.local);
          setSession(auth.admin?'signed-in':'signed-out');
        }
      } catch(error) {
        if (!cancelled) {
          setSession('signed-out');
          setNotice({message:(error as Error).message,error:true});
        }
      }
    }
    void load();
    return ()=>{cancelled=true;};
  },[]);

  const run:Run=async <T,>(url:string,options:RequestInit,message?:string,reload=true)=>{
    if (activeRequest.current) return null;
    activeRequest.current=true;
    setBusy(true);
    setNotice(null);
    try {
      const result=await adminRequest<T>(url,options);
      if (reload) {
        try {
          await refresh();
        } catch(error) {
          setNotice({message:`The request succeeded, but the refreshed workspace could not be loaded. Refresh this page. ${(error as Error).message}`,error:true});
          return result;
        }
      }
      if (message) setNotice({message});
      return result;
    } catch(error) {
      setNotice({message:(error as Error).message,error:true});
      return null;
    } finally {
      activeRequest.current=false;
      setBusy(false);
    }
  };

  async function signIn(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run('/api/session',jsonRequest('POST',{password}),undefined,false)) {
      try {
        await refresh();
        setPassword('');
        setSession('signed-in');
      } catch(error) {
        setNotice({message:(error as Error).message,error:true});
      }
    }
  }
  function open(next:Tab) {
    setTab(next);
    setBusinessId('');
    setMobileNav(false);
    setNotice(null);
  }
  function openImport(kind:ImportKind) {
    setImportKind(kind);
    open('Imports');
  }
  function openBusiness(id:string) {
    open('Businesses');
    setBusinessId(id);
  }
  async function signOut() {
    if (await run('/api/session',{method:'DELETE'},undefined,false)) {
      setState(null);
      setSession('signed-out');
      open('Overview');
    }
  }

  if (session!=='signed-in'||!state) return <main className="studio-login">
    <section>
      <a className="studio-brand" href="/"><IslandMark/><span>IslaVista</span></a>
      <h1>Directory studio</h1>
      {session==='loading'?<p role="status">Checking session…</p>:<>
        <p>Sign in to manage your local directory.</p>
        <form onSubmit={signIn}>
          <label className="studio-field"><span>Admin password</span><input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label>
          <button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
        </form>
        {notice&&<p className="studio-notice" data-error={notice.error} role="alert">{notice.message}</p>}
      </>}
      <a className="studio-login-back" href="/">Back to the public site <ExternalLink size={14}/></a>
    </section>
  </main>;

  return <div className="studio-shell">
    <aside className="studio-side">
      <div className="studio-side-top">
        <a className="studio-brand" href="/admin"><IslandMark/><span>{state.settings.branding.name||'IslaVista'}</span></a>
        <button className="studio-mobile-nav" type="button" aria-controls="studio-navigation" aria-expanded={mobileNav} onClick={()=>setMobileNav(!mobileNav)}>Menu <ChevronDown size={16}/></button>
      </div>
      <nav id="studio-navigation" aria-label="Administration" className={mobileNav?'studio-nav-open':''}>
        {navigation.map(group=><div className="studio-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(([label,Icon])=><button type="button" key={label} aria-current={tab===label?'page':undefined} onClick={()=>open(label)}><Icon size={18}/>{label}</button>)}</div>)}
        <div className="studio-nav-group studio-nav-footer">
          <a href="/"><ExternalLink size={17}/> View public site</a>
          {!local&&<button type="button" disabled={busy} onClick={signOut}><LogOut size={17}/> Sign out</button>}
        </div>
      </nav>
    </aside>
    <main className="studio-main">
      <header className="studio-header">
        <h1>{tab}</h1>
        <p>{descriptions[tab]}</p>
      </header>
      {notice&&<div className="studio-notice" data-error={notice.error} role={notice.error?'alert':'status'}><span>{notice.message}</span><button type="button" aria-label="Dismiss message" onClick={()=>setNotice(null)}>×</button></div>}
      {tab==='Overview'&&<Overview state={state} open={open}/>}
      {tab==='Businesses'&&<AdminBusinesses state={state} run={run} busy={busy} initialId={businessId}/>}
      {tab==='Media library'&&<AdminMediaLibrary state={state} run={run} busy={busy} openImport={openImport} openBusiness={openBusiness}/>}
      {settingsTabs.includes(tab as SettingsTab)&&<AdminSettings tab={tab as SettingsTab} state={state} run={run} busy={busy}/>}
      {tab==='Imports'&&<AdminImport initialKind={importKind} run={run} busy={busy} history={state.imports}/>}
      {tab==='Exports'&&<AdminExports run={run} busy={busy}/>}
      {tab==='Analytics'&&<Analytics state={state}/>}
      {tab==='Audit log'&&<section className="studio-panel"><Audit state={state}/></section>}
    </main>
  </div>;
}
