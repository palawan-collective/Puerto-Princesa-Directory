import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,Image,MapPin,Plus,Search,Star,Trash2} from 'lucide-react';
import {
  approved,businessPath,category,categoryInfo,coordinates,inDestination,list,slugify,str,type Business,type State,
} from '../lib/model';
import {categoryFields,fieldLabel} from './PlaceCard';
import {AdminPreview} from './AdminPreview';
import {Empty,Field,CheckField,PageButtons,TextField,jsonRequest,type Run} from './AdminFields';
import {AdminBusinessMedia} from './AdminMedia';

const statuses=['draft','imported','approved','published','archived'];
const perPage=30;
const newBusiness=Symbol('new business');

type FieldDescription={key:string;label?:string;hint?:string;multiline?:boolean;type?:string};
const contactFields:FieldDescription[]=[
  {key:'phone'},{key:'email'},{key:'website',type:'url'},{key:'facebook',type:'url'},
  {key:'instagram',type:'url'},{key:'whatsapp',label:'WhatsApp'},{key:'tiktok',label:'TikTok',type:'url'},
  {key:'booking_url',label:'Direct booking URL',type:'url'},{key:'inquiry_url',label:'Inquiry URL',type:'url'},
];
const facts:FieldDescription[]=[
  {key:'description',multiline:true},{key:'opening_hours',multiline:true},{key:'price_range'},
  {key:'services',multiline:true},{key:'amenities',multiline:true,hint:'Enter one amenity per line, such as Wi-Fi, Pool or Parking.'},
  {key:'custom_fields',multiline:true,hint:'Enter one label and value per line, separated by a colon.'},
];
const provenanceFields:FieldDescription[]=[
  {key:'source_url',label:'Source URL'},{key:'source_id',label:'Source ID'},{key:'license'},
  {key:'verification_date'},{key:'confidence'},{key:'logo_url',label:'Original logo URL'},{key:'photo_url',label:'Original photo URL'},
  {key:'image_permissions'},{key:'website_available'},{key:'mobile_responsive'},{key:'has_online_booking'},
  {key:'has_online_ordering'},{key:'has_digital_payments'},{key:'social_media_presence'},
  {key:'merqato_opportunity',multiline:true},
];

function Section({title,children}:{title:string;children:React.ReactNode}) {
  return <section className="studio-panel studio-form-section"><h3>{title}</h3><div className="studio-form-grid">{children}</div></section>;
}

function BusinessEditor({state,original,onBack,run,busy}:{state:State;original:Business|null;onBack:()=>void;run:Run;busy:boolean}) {
  const [saved,setSaved]=useState(original);
  const [draft,setDraft]=useState<Business>(original||{name:'',business_id:'',editorial_status:'draft'});
  const [showMedia,setShowMedia]=useState(false);
  const deleteDialog=useRef<HTMLDialogElement>(null);
  const editorHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    window.scrollTo({top:0});
    editorHeading.current?.focus({preventScroll:true});
  },[]);
  const [fieldIdEdited,setFieldIdEdited]=useState(false);
  const media=state.media.filter(m=>m.business_id===draft.business_id);
  const hasChanges=!saved||Object.keys(draft).some(key=>!Object.is(draft[key],saved[key]));
  const set=(key:string,value:unknown)=>setDraft(current=>({...current,[key]:value}));
  const destination=str(draft.destination);
  const destinationId=state.settings.destinations.find(x=>x.slug===destination||x.name===destination)?.slug||destination;
  const knownCategory=category(draft);
  const status=str(draft.editorial_status)||'draft';
  const ownDestinations=list(draft.destinations);
  const liveDestination=saved&&approved(saved)&&categoryInfo(saved,state.settings)?.visible&&state.settings.destinations.find(d=>d.status==='published'&&inDestination(saved,d));

  function updateName(value:string) {
    setDraft(previous=>({...previous,name:value,...!saved&&!fieldIdEdited?{business_id:slugify(value).slice(0,100)}:{}}));
  }

  function textField({key,label,hint,multiline,type}:FieldDescription) {
    return <TextField key={key} label={label||fieldLabel(key)} value={draft[key]} hint={hint} multiline={multiline} wide={multiline} type={type} set={value=>set(key,value)}/>;
  }

  async function save(nextStatus=status) {
    const fields=saved?Object.fromEntries(Object.entries(draft).filter(([key,value])=>!Object.is(value,saved[key]))):draft;
    const response=await run<{business:Business}>('/api/businesses',jsonRequest(saved?'PATCH':'POST',{
      ...fields,business_id:draft.business_id,name:draft.name,editorial_status:nextStatus,
    }),nextStatus==='published'?'Business published.':nextStatus==='archived'?'Business archived.':'Business saved.');
    if (response) {
      setDraft(response.business);
      setSaved(response.business);
    }
  }

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    const nextStatus=action==='published'||action==='archived'?action:status;
    if (nextStatus==='archived'&&saved?.editorial_status!=='archived'&&!window.confirm(`Archive ${draft.name}? It will be removed from the public directory.`)) return;
    void save(nextStatus);
  }

  async function remove() {
    if (!saved) return;
    const result=await run<{ok:boolean}>(`/api/businesses?id=${encodeURIComponent(saved.business_id)}`,{method:'DELETE'},'Business deleted.');
    if (result) onBack();
  }

  return <>
    <button type="button" className="studio-back" onClick={()=>{if (!hasChanges||window.confirm('Return to the list and discard unsaved edits?')) onBack();}}><ArrowLeft size={17}/> All businesses</button>
    <div className="studio-editor-title">
      <div><h2 ref={editorHeading} tabIndex={-1}>{saved?draft.name||'Edit business':'New business'}</h2>{saved&&<p><code>{saved.business_id}</code></p>}</div>
      <span className="studio-status" data-status={str(saved?.editorial_status)||'draft'}>{str(saved?.editorial_status)||'draft'}</span>
    </div>
    <div className="studio-editor">
      <div className="studio-editor-fields">
        <div className="studio-tabbar" aria-label="Business editor sections">
          <button type="button" aria-pressed={!showMedia} onClick={()=>setShowMedia(false)}>Listing details</button>
          <button type="button" aria-pressed={showMedia} onClick={()=>setShowMedia(true)} disabled={!saved}><Image size={16}/> Media ({media.length})</button>
          <a href="#studio-live-preview" className="studio-jump-preview">Live preview <ArrowRight size={15}/></a>
        </div>
        {showMedia&&saved?<AdminBusinessMedia id={saved.business_id} media={media} run={run} busy={busy}/>:<form className="studio-editor-form" onSubmit={submit}>
          <fieldset className="studio-busy-form" disabled={busy}>
          <Section title="Basics">
            <TextField label="Business name" value={draft.name} set={updateName} required maxLength={250} wide/>
            <TextField label="Business ID" value={draft.business_id} set={value=>{setFieldIdEdited(true);set('business_id',value);}} required pattern={"[A-Za-z0-9_\\-]{1,100}"} readOnly={!!saved} hint={saved?'Stable ID used by imports and media.':'Use letters, numbers, hyphens or underscores.'}/>
            <Field label="Directory category"><select value={str(draft.directory_category)} onChange={event=>set('directory_category',event.target.value)}>
              <option value="">Use source category ({knownCategory})</option>
              {!!str(draft.directory_category)&&!state.settings.categories.some(c=>c.id===draft.directory_category)&&<option value={str(draft.directory_category)}>{str(draft.directory_category)}</option>}
              {state.settings.categories.map(c=><option key={c.id} value={c.id}>{c.label}{c.visible?'':' (hidden)'}</option>)}
            </select></Field>
            {textField({key:'category',label:'Source category'})}{textField({key:'subcategory'})}
            {textField({key:'operating_status'})}
            <Field label="Editorial status"><select value={status} onChange={event=>set('editorial_status',event.target.value)}>
              {statuses.map(item=><option key={item} value={item}>{item[0].toUpperCase()+item.slice(1)}</option>)}
            </select></Field>
            <TextField label="Sort order" value={draft.sort_order} set={value=>set('sort_order',value===''?null:Number(value))} type="number" step={1} hint="Lower numbers appear first."/>
            <CheckField label="Feature this business" value={draft.featured===true} set={value=>set('featured',value)}/>
          </Section>
          <Section title="Location">
            <Field label="Primary destination"><select value={destinationId} onChange={event=>set('destination',event.target.value)}>
              <option value="">Select a destination</option>
              {destinationId&&!state.settings.destinations.some(d=>d.slug===destinationId)&&<option value={destinationId}>{destination}</option>}
              {state.settings.destinations.map(d=><option key={d.slug} value={d.slug}>{d.name}{d.status==='draft'?' (draft)':''}</option>)}
            </select></Field>
            {textField({key:'municipality'})}{textField({key:'barangay'})}{textField({key:'address'})}
            <TextField label="Latitude" value={draft.latitude} set={value=>set('latitude',value)} type="number" min={-90} max={90} step="any"/>
            <TextField label="Longitude" value={draft.longitude} set={value=>set('longitude',value)} type="number" min={-180} max={180} step="any"/>
            <fieldset className="studio-wide studio-multicheck"><legend>Also listed under</legend>{state.settings.destinations.filter(d=>d.slug!==destinationId).map(d=><CheckField key={d.slug} label={d.name} value={ownDestinations.includes(d.slug)||ownDestinations.includes(d.name)} set={checked=>{
              const next=ownDestinations.filter(value=>value!==d.slug&&value!==d.name);
              if (checked) next.push(d.slug);
              set('destinations',next.join(', '));
            }}/>)}</fieldset>
          </Section>
          <Section title="Public card content">
            {facts.map(textField)}
            {(categoryFields[knownCategory]||[]).map(key=>textField({key}))}
            <details className="studio-wide studio-details"><summary>Other category fields</summary><div className="studio-form-grid">
              {[...new Set(Object.values(categoryFields).flat())].filter(key=>!categoryFields[knownCategory]?.includes(key)).map(key=>textField({key}))}
            </div></details>
          </Section>
          <Section title="Contact and external links">{contactFields.map(textField)}</Section>
          <Section title="Verification and rating">
            <CheckField label="Mark as verified" value={draft.verified===true} set={value=>set('verified',value)}/>
            {textField({key:'verification_source',label:'Verification evidence URL',type:'url'})}
            <TextField label="Rating (out of 5)" value={draft.rating} set={value=>set('rating',value?Number(value):null)} type="number" min={0} max={5} step="any"/>
            <TextField label="Number of ratings" value={draft.rating_count} set={value=>set('rating_count',value?Number(value):null)} type="number" min={0} step={1}/>
            {textField({key:'rating_source',label:'Rating evidence URL',type:'url'})}
          </Section>
          <section className="studio-panel studio-form-section"><details className="studio-details">
            <summary>Source data and internal fields</summary>
            <div className="studio-form-grid">{provenanceFields.map(textField)}</div>
          </details></section>
          </fieldset>
          <div className="studio-form-actions studio-sticky-actions">
            <button className="primary" type="submit" disabled={busy||(!hasChanges&&!!saved)}>Save business</button>
            {status!=='published'&&<button type="submit" value="published" disabled={busy}>Publish</button>}
            {saved&&status!=='archived'&&<button type="submit" value="archived" disabled={busy}>Archive</button>}
            {saved&&<button type="button" className="studio-danger" onClick={()=>deleteDialog.current?.showModal()} disabled={busy}><Trash2 size={16}/> Delete</button>}
            {saved&&liveDestination&&<a className="studio-link" href={businessPath(saved,liveDestination.slug)} target="_blank" rel="noreferrer">View live profile <ArrowRight size={15}/></a>}
          </div>
        </form>}
      </div>
      <AdminPreview id="studio-live-preview" business={{...draft,name:draft.name||'Business name'}} media={media} settings={state.settings} destination={destinationId}/>
    </div>
    <dialog ref={deleteDialog} aria-labelledby="studio-delete-title" className="studio-panel studio-modal">
      <h2 id="studio-delete-title">Delete this business?</h2><p>{saved?.name} and its media references will be removed from the directory.</p>
      <div className="studio-form-actions"><button autoFocus type="button" disabled={busy} onClick={()=>deleteDialog.current?.close()}>Cancel</button><button type="button" className="studio-danger" disabled={busy} onClick={remove}>Delete permanently</button></div>
    </dialog>
  </>;
}

export function AdminBusinesses({state,run,busy,initialId}:{state:State;run:Run;busy:boolean;initialId:string}) {
  const [selected,setSelected]=useState<string|typeof newBusiness>(initialId);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('');
  const [destination,setDestination]=useState('');
  const [page,setPage]=useState(1);
  const matching=useMemo(()=>{
    const term=query.trim().toLocaleLowerCase();
    const target=state.settings.destinations.find(d=>d.slug===destination);
    return state.businesses.filter(b=>
      (!term||[b.name,b.business_id,b.category,b.directory_category,b.subcategory,b.destination,b.barangay].some(v=>str(v).toLocaleLowerCase().includes(term)))&&
      (!status||(status==='live'?approved(b):str(b.editorial_status)===status))&&
      (!target||[str(b.destination),...list(b.destinations)].some(value=>value===target.slug||value===target.name))
    );
  },[state.businesses,state.settings.destinations,query,status,destination]);
  const mediaCounts=useMemo(()=>{
    const counts=new Map<string,number>();
    state.media.forEach(item=>counts.set(item.business_id,(counts.get(item.business_id)||0)+1));
    return counts;
  },[state.media]);
  const original=selected===newBusiness?null:state.businesses.find(b=>b.business_id===selected);
  if (selected===newBusiness||original) return <BusinessEditor key={selected===newBusiness?'new':`record-${selected}`} state={state} original={original||null} onBack={()=>setSelected('')} run={run} busy={busy}/>;

  const pages=Math.ceil(matching.length/perPage);
  const currentPage=Math.min(page,pages||1);
  return <section className="studio-panel studio-business-list">
    <div className="studio-panel-heading"><div><h2>Business listings</h2><p>{matching.length.toLocaleString()} {matching.length===1?'record':'records'}</p></div><button type="button" className="primary" onClick={()=>setSelected(newBusiness)}><Plus size={18}/> New business</button></div>
    <div className="studio-list-filters">
      <Field label="Search businesses"><div className="studio-search"><Search size={17}/><input type="search" placeholder="Name, ID, category or barangay" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></div></Field>
      <Field label="Editorial status"><select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">All statuses</option><option value="live">Published or approved</option>{statuses.map(item=><option key={item} value={item}>{item[0].toUpperCase()+item.slice(1)}</option>)}</select></Field>
      <Field label="Destination"><select value={destination} onChange={event=>{setDestination(event.target.value);setPage(1);}}><option value="">All destinations</option>{state.settings.destinations.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></Field>
    </div>
    {matching.length?<div className="studio-table studio-list-table"><table><thead><tr><th>Business</th><th>Category</th><th>Status</th><th>Media</th><th><span className="studio-visually-hidden">Edit listing</span></th></tr></thead><tbody>
      {matching.slice((currentPage-1)*perPage,currentPage*perPage).map(b=><tr key={b.business_id}>
        <td><strong>{b.name}</strong>{b.featured===true&&<Star size={14} fill="currentColor" aria-label="Featured"/>}<small>{str(b.barangay)||b.business_id}</small></td>
        <td>{categoryInfo(b,state.settings)?.label||category(b)}{!coordinates(b)&&<small><MapPin size={12}/> Unmapped</small>}</td>
        <td><span className="studio-status" data-status={str(b.editorial_status)||'draft'}>{str(b.editorial_status)||'draft'}</span></td>
        <td>{mediaCounts.get(b.business_id)||0}</td>
        <td><button type="button" onClick={()=>setSelected(b.business_id)} aria-label={`Edit ${b.name}`}>Edit</button></td>
      </tr>)}
    </tbody></table></div>:<Empty>No businesses match these filters.</Empty>}
    <PageButtons page={currentPage} pages={pages} set={setPage}/>
  </section>;
}
