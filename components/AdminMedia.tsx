import {useRef,useState,type FormEvent,type MouseEvent} from 'react';
import {ArrowDown,ArrowUp,ExternalLink,Image as ImageIcon,Link2,Star,Trash2,Upload} from 'lucide-react';
import {authorized,safeLink,str,type Candidate,type Media,type State} from '../lib/model';
import {Photo} from './PlaceCard';
import {CheckField,downloadText,Empty,Field,jsonRequest,PageButtons,TextField,type Run} from './AdminFields';
import type {ImportKind} from './AdminTransfer';

export type MediaResult={imported:number;skipped:number;errors:string[];media:Media[]};
export const siteAssets='site-assets';

export function MediaReport({result}:{result:MediaResult}) {
  return <div className="studio-report" role="status">
    <strong>{result.imported} imported · {result.skipped} skipped</strong>
    {!!result.errors?.length&&<>
      <ul>{result.errors.slice(0,8).map((error,index)=><li key={index}>{error}</li>)}</ul>
      <button type="button" onClick={()=>downloadText('media-import-report.txt',result.errors.join('\n'))}>Download full media report</button>
    </>}
  </div>;
}

export function MediaUpload({id,run,busy,site=false,onUploaded}:{id:string;run:Run;busy:boolean;site?:boolean;onUploaded?:(media:Media)=>void}) {
  const [count,setCount]=useState(0);
  const [permitted,setPermitted]=useState(false);
  const [result,setResult]=useState<MediaResult|null>(null);
  const form=useRef<HTMLDivElement>(null);
  async function upload(event:MouseEvent<HTMLButtonElement>) {
    event.preventDefault();event.stopPropagation();
    const root=form.current;
    const data=new FormData();
    for (const element of root?.querySelectorAll('input,select')||[]) {
      if(!(element instanceof HTMLInputElement||element instanceof HTMLSelectElement))continue;
      if(!element.name)continue;
      if(element instanceof HTMLInputElement&&element.type==='file'){
        for(const file of element.files||[])data.append(element.name,file);
      } else data.append(element.name,element.value);
    }
    data.set('permission',permitted?'approved':'pending');
    data.set('business_id',id);
    const next=await run<MediaResult>('/api/media',{method:'POST',body:data});
    if (next) {
      setResult(next);
      if (next.imported>0) {
        for(const element of root?.querySelectorAll('input')||[]){
          if(element.type==='file')element.value='';else if(element.type!=='checkbox')element.value='';
        }
        setPermitted(false);
        setCount(0);
      }
      if(next.media?.[0]) onUploaded?.(next.media[0]);
    }
  }
  return <div ref={form} className="studio-panel studio-media-upload">
    <h3><Upload size={17}/> {site?'Upload an approved image':'Upload approved media'}</h3>
    <div className="studio-form-grid">
      <Field label={site?'Image file':'Images and videos'} wide hint={site?'Upload a logo or destination hero.':'Select up to 20 images or videos, 50 MB total. Rights details apply to the batch.'}><input name="file" type="file" required multiple={!site} accept={site?'image/jpeg,image/png,image/webp,image/gif,image/avif':'image/*,video/mp4,video/webm'} onChange={event=>{setCount(event.target.files?.length||0);setResult(null);}}/></Field>
      <Field label="Original source or rights reference"><input name="source" required maxLength={2048} placeholder="Publisher URL or written permission reference"/></Field>
      <Field label="License or permission"><input name="license" required maxLength={250} placeholder="License name or permission terms"/></Field>
      <Field label="Attribution"><input name="attribution" maxLength={500} placeholder="Creator or rights holder"/></Field>
      <Field label="Alt text"><input name="alt" maxLength={500}/></Field>
      {!site&&<Field label="Placement"><select name="type"><option value="gallery">Gallery item</option><option value="cover">Cover item</option></select></Field>}
    </div>
    <CheckField label="I have confirmed permission to publish these files." value={permitted} set={setPermitted}/>
    <button className="primary" type="button" disabled={busy||!permitted||!count} onClick={upload}>{busy?'Uploading…':`Upload${count>1?` ${count} files`:site?' image':' media'}`}</button>
    {result&&<MediaReport result={result}/>}
  </div>;
}

function MediaItem({item,run,busy,isFirst,isLast}:{item:Media;run:Run;busy:boolean;isFirst?:boolean;isLast?:boolean}) {
  const [alt,setAlt]=useState(item.alt||'');
  const [attribution,setAttribution]=useState(item.attribution);
  const [source,setSource]=useState(item.source_url);
  const [license,setLicense]=useState(item.license);
  async function action(action:'cover'|'up'|'down'|'delete'|'metadata') {
    if (action==='delete'&&!window.confirm(`Delete ${item.filename} from the media library?`)) return;
    await run('/api/media',jsonRequest('PATCH',{
      business_id:item.business_id,filename:item.filename,action,
      ...(action==='metadata'?{alt,attribution,source_url:source,license}:{}),
    }),action==='delete'?'Media deleted.':'Media updated.');
  }
  const site=item.business_id===siteAssets;
  return <article className="studio-asset">
    <div className="studio-asset-photo"><Photo media={item} name={item.filename} video/></div>
    <div className="studio-asset-body">
      <div className="studio-asset-title"><strong title={item.filename}>{item.filename}</strong><span className="studio-status" data-status={item.cover&&!site?'published':'draft'}>{site?'Site image':item.cover?'Cover':item.kind==='video'?'Video':'Image'}</span></div>
      <div className="studio-asset-actions">
        {!site&&!item.cover&&<button type="button" disabled={busy} onClick={()=>action('cover')}><Star size={15}/> Cover</button>}
        {!site&&<><button type="button" title="Move earlier" aria-label={`Move ${item.filename} earlier`} disabled={busy||isFirst} onClick={()=>action('up')}><ArrowUp size={16}/></button>
        <button type="button" title="Move later" aria-label={`Move ${item.filename} later`} disabled={busy||isLast} onClick={()=>action('down')}><ArrowDown size={16}/></button></>}
        <button className="studio-danger" type="button" title="Delete media" aria-label={`Delete ${item.filename}`} disabled={busy} onClick={()=>action('delete')}><Trash2 size={16}/></button>
      </div>
      <details className="studio-details">
        <summary>Alt text and rights</summary>
        <form className="studio-form-grid" onSubmit={event=>{event.preventDefault();void action('metadata');}}>
          <TextField label="Alt text" value={alt} set={setAlt} wide/>
          <TextField label="Attribution" value={attribution} set={setAttribution} wide/>
          <TextField label="Original source or rights reference" value={source} set={setSource} wide required/>
          <TextField label="License" value={license} set={setLicense} wide required/>
          <button type="submit" disabled={busy}>Save metadata</button>
        </form>
      </details>
    </div>
  </article>;
}

export function AdminBusinessMedia({id,media,run,busy}:{id:string;media:Media[];run:Run;busy:boolean}) {
  return <div className="studio-stack">
    <MediaUpload id={id} run={run} busy={busy}/>
    {media.length?<div className="studio-asset-grid">{media.map((item,index)=><MediaItem key={item.filename} item={item} run={run} busy={busy} isFirst={index===0} isLast={index===media.length-1}/>)}</div>:<Empty>There are no approved media files for this business.</Empty>}
  </div>;
}

function CandidateReview({candidate,run,busy}:{candidate:Candidate;run:Run;busy:boolean}) {
  const [license,setLicense]=useState(candidate.license||'');
  const [attribution,setAttribution]=useState(candidate.attribution||'');
  const [permission,setPermission]=useState(false);
  const [result,setResult]=useState<MediaResult|null>(null);
  async function download(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permission) return;
    setResult(await run<MediaResult>('/api/media',jsonRequest('POST',{
      business_id:candidate.business_id,source_url:candidate.source_url,license,attribution,permission:'approved',
    }),'Image candidate approved.'));
  }
  return <details className="studio-details">
    <summary>Review permission</summary>
    <form className="studio-form-grid" onSubmit={download}>
      <TextField wide label="License or permission" value={license} set={setLicense} required/>
      <TextField wide label="Attribution" value={attribution} set={setAttribution}/>
      <CheckField label="I have confirmed publication rights for this image." value={permission} set={setPermission}/>
      <button className="primary" type="submit" disabled={!permission||!license.trim()||busy}>Fetch and approve</button>
      {result&&<MediaReport result={result}/>}
    </form>
  </details>;
}

type LinkImage={url:string;size:number;source:string};
type LinkResult={step?:string;found?:number;added?:number;selected?:number;imported?:number;featured?:boolean;errors?:string[];error?:string;images?:LinkImage[]};
function LinkImport({state,run,busy}:{state:State;run:Run;busy:boolean}) {
  const [url,setUrl]=useState('');
  const [business,setBusiness]=useState('');
  const [rights,setRights]=useState(false);
  const [images,setImages]=useState<LinkImage[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [cover,setCover]=useState('');
  const [result,setResult]=useState<LinkResult|null>(null);
  const id=state.businesses.find(item=>item.business_id===business||item.name.toLowerCase()===business.toLowerCase().trim())?.business_id||business;
  async function scan(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next=await run<LinkResult>('/api/link',jsonRequest('POST',{url,business_id:id,step:'scan',rights}),'Link scanned.');
    if (next?.error) {setResult(next);return;}
    if (next) {
      const found=next.images||[];
      setImages(found);
      setSelected(found.slice(0,5).map(image=>image.url));
      setCover(found[0]?.url||'');
      setResult(null);
    }
  }
  async function commit() {
    const next=await run<LinkResult>('/api/link',jsonRequest('POST',{url,business_id:id,step:'commit',rights,selected,cover}),'Business featured from link.');
    if (next) {setResult(next);if (!next.error) {setImages([]);setSelected([]);setUrl('');setRights(false);}}
  }
  const toggle=(image:string)=>setSelected(list=>list.includes(image)?list.filter(x=>x!==image):list.length<6?[...list,image]:list);
  return <form className="studio-panel" onSubmit={scan}>
    <h3><Link2 size={17}/> Feature a business from a link</h3>
    <p>Paste a Google Business Profile, Booking.com collection or website link. Scan first, then choose the cover and up to 5 gallery photos before anything is published.</p>
    <div className="studio-form-grid">
      <Field label="Business" wide hint="Start typing the business name or paste its ID"><input list="link-businesses" value={business} onChange={event=>setBusiness(event.target.value)} placeholder="e.g. Dampa sa Mansion" required/></Field>
      <datalist id="link-businesses">{state.businesses.map(item=><option key={item.business_id} value={item.name}/>)}</datalist>
      <Field label="Business link" wide><input type="url" value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://www.booking.com/city/ph/puerto-princesa.html" required/></Field>
      <CheckField label="I confirm the business owner has allowed us to use photos from this link." value={rights} set={setRights}/>
      <button type="submit" disabled={!rights||!business||!url||busy}>Scan link</button>
    </div>
    {!!images.length&&<div className="studio-stack">
      <p><strong>{images.length} candidates found.</strong> Tick the cover and up to 5 gallery photos ({selected.length}/6 selected).</p>
      <div className="studio-asset-grid">{images.map(image=><label className="studio-candidate" key={image.url}>
        <img src={image.url} alt="" loading="lazy" style={{width:'100%',aspectRatio:'4 / 3',objectFit:'cover',borderRadius:8}}/>
        <span className="studio-form-actions">
          <input type="radio" name="link-cover" checked={cover===image.url} onChange={()=>setCover(image.url)} aria-label="Use as cover"/> Cover
          <input type="checkbox" checked={selected.includes(image.url)} onChange={()=>toggle(image.url)} aria-label="Include in gallery"/> Gallery
        </span>
        <small>{image.source} · {Math.round((image.size||0)/1000)}k</small>
      </label>)}</div>
      <button type="button" className="primary" onClick={commit} disabled={!selected.length||!cover||busy}>Feature selected photos</button>
    </div>}
    {result&&<div className="studio-report" role="status"><strong>{result.error?'':`Selected ${result.selected||0} · imported ${result.imported||0} · featured ${result.featured?'yes':'no'}`}</strong>{result.error&&<p>{result.error}</p>}{!!result.errors?.length&&<ul>{result.errors.slice(0,5).map((error,index)=><li key={index}>{error}</li>)}</ul>}</div>}
  </form>;
}

export function AdminMediaLibrary({state,run,busy,openImport,openBusiness}:{state:State;run:Run;busy:boolean;openImport:(kind:ImportKind)=>void;openBusiness:(id:string)=>void}) {
  const [tab,setTab]=useState<'approved'|'candidates'>('approved');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [upload,setUpload]=useState(false);
  const names=new Map(state.businesses.map(b=>[b.business_id,b.name]));
  const term=query.toLowerCase().trim();
  const matches=(id:string,...values:unknown[])=>[id,names.get(id),...values].some(value=>str(value).toLowerCase().includes(term));
  const assets=state.media.filter(item=>matches(item.business_id,item.filename,item.alt));
  const managedSources=new Set(state.media.map(item=>`${item.business_id}|${item.source_url}`));
  const candidates=state.candidates.filter(item=>matches(item.business_id,item.filename,item.source_url,item.permission_status));
  const count=tab==='approved'?assets.length:candidates.length;
  const pageSize=18;
  const pageCount=Math.ceil(count/pageSize);
  const current=Math.min(page,pageCount||1);
  const choose=(value:typeof tab)=>{setTab(value);setPage(1);};
  return <div className="studio-stack">
    <section className="studio-panel">
      <div className="studio-panel-heading">
        <div className="studio-tabbar" aria-label="Media type"><button type="button" aria-pressed={tab==='approved'} onClick={()=>choose('approved')}><ImageIcon size={16}/> Approved media</button><button type="button" aria-pressed={tab==='candidates'} onClick={()=>choose('candidates')}>Image candidates</button></div>
        <div className="studio-form-actions">
          {tab==='approved'?<><button type="button" onClick={()=>setUpload(!upload)}>{upload?'Close upload':'Upload site image'}</button><button className="primary" type="button" onClick={()=>openImport('zip')}>Import media ZIP</button></>:<button className="primary" type="button" onClick={()=>openImport('urls')}>Import URL manifest</button>}
        </div>
      </div>
      <Field label={tab==='approved'?'Search media':'Search candidates'}><input type="search" placeholder="Business name, ID or filename" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></Field>
      {tab==='candidates'&&<p>Review rights before fetching an image from its source. Approved files are stored locally.</p>}
      {tab==='candidates'&&<LinkImport state={state} run={run} busy={busy}/>}
    </section>
    {tab==='approved'&&upload&&<MediaUpload id={siteAssets} site run={run} busy={busy}/>}
    {count===0?<Empty>{tab==='approved'?'No approved media matches your search.':'No image candidates match your search.'}</Empty>
      :tab==='approved'?<div className="studio-asset-grid">{assets.slice((current-1)*pageSize,current*pageSize).map(item=><div className="studio-library-asset" key={item.business_id+item.filename}>
        {names.has(item.business_id)&&<button type="button" className="studio-link" onClick={()=>openBusiness(item.business_id)}>{names.get(item.business_id)} <ExternalLink size={14}/></button>}
        <MediaItem item={item} run={run} busy={busy}/>
      </div>)}</div>:<div className="studio-candidate-grid">{candidates.slice((current-1)*pageSize,current*pageSize).map(candidate=><article className="studio-panel studio-candidate" key={candidate.business_id+candidate.source_url}>
        <h3>{names.get(candidate.business_id)||candidate.business_id}</h3>
        <span className="studio-status" data-status={authorized(candidate.permission_status)?'published':'draft'}>{candidate.permission_status}</span>
        {safeLink(candidate.source_url)&&<a className="studio-link" href={safeLink(candidate.source_url)} target="_blank" rel="noreferrer">Open source <ExternalLink size={14}/></a>}
        {managedSources.has(`${candidate.business_id}|${candidate.source_url}`)?<p>Available in approved media.</p>:<CandidateReview candidate={candidate} run={run} busy={busy}/>}
      </article>)}</div>}
    <PageButtons page={current} pages={pageCount} set={setPage}/>
  </div>;
}
