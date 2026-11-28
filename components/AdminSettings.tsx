import {useState,type FormEvent,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react';
import {
  category,list,managedMedia,slugify,str,type Category,type Destination,type Editorial,
  type Media,type Settings,type State,type Template,
} from '../lib/model';
import {categoryIcon,iconChoices,IslandMark} from './Icons';
import {categoryFields,fieldLabel} from './PlaceCard';
import {CheckField,Empty,Field,jsonRequest,TextField,type Run} from './AdminFields';
import {MediaUpload,siteAssets} from './AdminMedia';
import {AdminPreview} from './AdminPreview';

export type SettingsTab='Destinations'|'Categories'|'Collections'|'Guides'|'Card designer'|'Page copy'|'Branding'|'Map settings';
const slugPattern='[a-z0-9]+(?:-[a-z0-9]+)*';
const sectionOptions=[['description','Description'],['amenities','Amenities'],['facts','Facts and location'],['social','Links and inquiry']];
const tileDefaults={
  Street:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  Satellite:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  Terrain:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
};
const unique=(base:string,existing:string[])=>{
  let value=base;
  for (let suffix=2;existing.includes(value);suffix++) value=`${base}-${suffix}`;
  return value;
};
function moved<T>(items:T[],index:number,delta:number) {
  const next=[...items],target=index+delta;
  [next[target],next[index]]=[next[index],next[target]];
  return next;
}
function changed<T>(items:T[],index:number,patch:Partial<T>) {
  return items.map((item,position)=>position===index?{...item,...patch}:item);
}
function StatusField({value,set}:{value:Destination['status'];set:(status:Destination['status'])=>void}) {
  return <Field label="Status"><select value={value} onChange={event=>set(event.target.value as Destination['status'])}><option value="draft">Draft</option><option value="published">Published</option></select></Field>;
}
function CoordinateInput({label,value,set,min,max,step='any'}:{label:string;value:number;set:(value:number)=>void;min:number;max:number;step?:string}) {
  return <Field label={label}><input type="number" defaultValue={value} step={step} min={min} max={max} required onChange={event=>{if (Number.isFinite(event.target.valueAsNumber)) set(event.target.valueAsNumber);}}/></Field>;
}

function ItemSelector({caption,options,selected,choose,add,drop,move}:{caption:string;options:string[];selected:number;choose:(value:number)=>void;add:()=>void;drop?:()=>void;move?:(delta:number)=>void}) {
  return <div className="studio-picker">
    <Field label={caption}><select value={selected} onChange={event=>choose(Number(event.target.value))}>
      {!options.length&&<option value={0}>None yet</option>}
      {options.map((item,index)=><option key={index} value={index}>{item||'Untitled'}</option>)}
    </select></Field>
    <button type="button" onClick={add}><Plus size={17}/> Add</button>
    {move&&<>
      <button type="button" aria-label="Move earlier" disabled={selected<=0||options.length===0} onClick={()=>move(-1)}><ArrowUp size={17}/></button>
      <button type="button" aria-label="Move later" disabled={selected>=options.length-1} onClick={()=>move(1)}><ArrowDown size={17}/></button>
    </>}
    {drop&&<button type="button" aria-label="Delete selected item" className="studio-danger" onClick={drop}><Trash2 size={17}/></button>}
  </div>;
}

function AssetPicker({title,media,value,set,run,busy}:{title:string;media:Media[];value:string;set:(value:string)=>void;run:Run;busy:boolean}) {
  const [upload,setUpload]=useState(false);
  const managed=managedMedia(value);
  const options=media.filter(m=>m.business_id===siteAssets&&m.kind!=='video'&&managedMedia(m.url));
  return <>
    <div className="studio-asset-picker">
      <Field label={title}><select value={value} onChange={event=>set(event.target.value)}>
        <option value="">Use the default</option>
        {value&&!options.some(m=>m.url===value)&&<option value={value}>Current image</option>}
        {options.map(m=><option key={m.filename} value={m.url}>{m.alt||m.filename}</option>)}
      </select></Field>
      {managed&&<img src={managed} alt={title}/>}
      <button type="button" aria-expanded={upload} onClick={()=>setUpload(!upload)}>{upload?'Close upload':'Upload a new image'}</button>
      <button type="button" disabled={!value} onClick={()=>set('')}>Remove image</button>
    </div>
    {upload&&<MediaUpload id={siteAssets} run={run} busy={busy} site onUploaded={item=>{set(item.url);setUpload(false);}}/>}
  </>;
}

function DestinationEditor({value,set}:{value:Destination;set:(patch:Partial<Destination>)=>void}) {
  const setCenter=(index:number,n:number)=>set({center:value.center.map((current,i)=>i===index?n:current) as Destination['center']});
  const setBounds=(index:number,n:number)=>{if (value.bounds) set({bounds:value.bounds.map((current,i)=>i===index?n:current) as Destination['bounds']});};
  return <div className="studio-form-grid">
    <TextField label="Destination name" value={value.name} set={name=>set({name})} required/>
    <TextField label="URL slug" value={value.slug} set={slug=>set({slug})} required pattern={slugPattern} maxLength={100}/>
    <StatusField value={value.status} set={status=>set({status})}/>
    <TextField label="Destination description" value={value.description} set={description=>set({description})} multiline wide required={value.status==='published'}/>
    <TextField label="Search description" value={value.seo} set={seo=>set({seo})} multiline wide/>
    <div className="studio-wide studio-form-grid studio-map-fields">
      <h3 className="studio-wide">Initial map view</h3>
      <CoordinateInput label="Center latitude" value={value.center[0]} set={n=>setCenter(0,n)} min={-90} max={90}/>
      <CoordinateInput label="Center longitude" value={value.center[1]} set={n=>setCenter(1,n)} min={-180} max={180}/>
      <CoordinateInput label="Initial zoom" value={value.center[2]} set={n=>setCenter(2,n)} min={3} max={19} step="1"/>
      <CheckField label="Use destination map bounds" value={!!value.bounds} set={checked=>set({bounds:checked?[
        Math.max(-90,value.center[0]-.1),Math.max(-180,value.center[1]-.1),Math.min(90,value.center[0]+.1),Math.min(180,value.center[1]+.1),
      ]:undefined})}/>
      {value.bounds&&['South','West','North','East'].map((label,index)=><CoordinateInput key={label} label={`${label} bound`} value={value.bounds![index]} set={n=>setBounds(index,n)} min={index%2===0?-90:-180} max={index%2===0?90:180}/>)}
    </div>
  </div>;
}

function CategoryEditor({value,set}:{value:Category;set:(patch:Partial<Category>)=>void}) {
  const Icon=categoryIcon(value.id,value.icon);
  return <div className="studio-form-grid">
    <TextField label="Category label" value={value.label} set={label=>set({label})} required/>
    <TextField label="Stable category ID" value={value.id} set={()=>{}} readOnly/>
    <Field label="Map marker color"><input type="color" value={value.color} onChange={event=>set({color:event.target.value})}/></Field>
    <Field label="Category icon"><div className="studio-icon-picker"><Icon size={22} style={{color:value.color}}/><select value={value.icon||''} onChange={event=>set({icon:event.target.value})}><option value="">Default icon</option>{iconChoices.map(icon=><option key={icon}>{icon}</option>)}</select></div></Field>
    <CheckField label="Include in tourism discovery" value={value.tourism} set={tourism=>set({tourism})}/>
    <CheckField label="Visible in the public directory" value={value.visible} set={visible=>set({visible})}/>
  </div>;
}

function EditorialEditor({value,set,state,destinations,run,busy}:{value:Editorial;set:(patch:Partial<Editorial>)=>void;state:State;destinations:Destination[];run:Run;busy:boolean}) {
  const [query,setQuery]=useState('');
  const chosen=list(value.businesses);
  const term=query.trim().toLowerCase();
  const options=term?state.businesses.filter(b=>[b.name,b.business_id].some(field=>field.toLowerCase().includes(term))).slice(0,8):[];
  return <div className="studio-form-grid">
    <TextField label="Title" value={value.title} set={title=>set({title})} required wide/>
    <TextField label="URL identifier" value={value.id} set={id=>set({id})} required pattern={slugPattern} maxLength={100}/>
    <TextField label="Category" value={value.category||''} set={category=>set({category})} maxLength={120}/>
    <TextField label="Short excerpt" value={value.excerpt||''} set={excerpt=>set({excerpt})} multiline wide/>
    <Field label="Destination"><select value={value.destination} onChange={event=>set({destination:event.target.value})}>
      {!destinations.some(d=>d.slug===value.destination)&&<option value={value.destination}>{value.destination||'Choose a destination'}</option>}
      {destinations.map(destination=><option key={destination.slug} value={destination.slug}>{destination.name}</option>)}
    </select></Field>
    <StatusField value={value.status} set={status=>set({status})}/>
    <TextField label="Body" value={value.body} set={body=>set({body})} multiline wide required={value.status==='published'}/>
    <div className="studio-wide studio-form-grid">
      <AssetPicker title="Cover image" media={state.media} value={value.cover||''} set={cover=>set({cover})} run={run} busy={busy}/>
      <TextField label="Image alt text" value={value.imageAlt||''} set={imageAlt=>set({imageAlt})} maxLength={500}/>
      <TextField label="Image caption" value={value.coverCaption||''} set={coverCaption=>set({coverCaption})} maxLength={500}/>
    </div>
    <TextField label="Linked business IDs" value={value.businesses} set={businesses=>set({businesses})} wide multiline hint="Enter IDs in the order they should appear, one per line."/>
    <TextField label="Find a business to link" value={query} set={setQuery} wide placeholder="Search name or ID"/>
    {term&&<div className="studio-wide studio-business-options">{options.length?options.map(b=><button key={b.business_id} type="button" disabled={chosen.includes(b.business_id)} onClick={()=>set({businesses:[...chosen,b.business_id].join('\n')})}><Plus size={15}/>{b.name}</button>):<p>No matching businesses.</p>}</div>}
  </div>;
}

function TemplateEditor({state,settings,set}:{state:State;settings:Settings;set:(templates:Template[])=>void}) {
  const [selected,setSelected]=useState(state.settings.categories[0]?.id||'');
  const cat=settings.categories.find(c=>c.id===selected)||settings.categories[0];
  if (!cat) return <Empty>Create a category before designing a card template.</Empty>;
  const existing=settings.templates.find(t=>t.category===cat.id);
  const value:Template=existing||{category:cat.id,fields:'',sections:'',ratio:'16 / 9',actions:'sticky'};
  const setTemplate=(patch:Partial<Template>)=>set([...settings.templates.filter(t=>t.category!==cat.id),{...value,...patch}]);
  const all=['description','amenities','opening_hours','price_range',...(categoryFields[cat.id]||[]),'services','custom_fields'];
  const fields=list(value.fields);
  const visible=fields.length?fields:all;
  const order=[...new Set([...list(value.sections),...sectionOptions.map(([key])=>key)])];
  const records=state.businesses.filter(b=>category(b)===cat.id);
  const mediaIds=new Set(state.media.map(m=>m.business_id));
  const example=records.find(b=>mediaIds.has(b.business_id))||records[0];
  const media=state.media.filter(item=>item.business_id===example?.business_id);
  const destination=str(example?.destination)||settings.destinations[0]?.slug||'';
  return <div className="studio-editor studio-template-editor">
    <div className="studio-stack">
      <div className="studio-panel studio-form-grid">
        <Field label="Category"><select value={cat.id} onChange={event=>setSelected(event.target.value)}>{settings.categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Gallery aspect ratio"><select value={value.ratio} onChange={event=>setTemplate({ratio:event.target.value})}>{['16 / 9','4 / 3','3 / 2','1 / 1'].map(ratio=><option key={ratio}>{ratio}</option>)}</select></Field>
        <Field label="Action placement"><select value={value.actions} onChange={event=>setTemplate({actions:event.target.value as Template['actions']})}><option value="sticky">Sticky footer</option><option value="inline">Inline footer</option></select></Field>
        <button type="button" disabled={!existing} onClick={()=>set(settings.templates.filter(item=>item.category!==cat.id))}>Reset to defaults</button>
      </div>
      <div className="studio-panel">
        <fieldset className="studio-multicheck"><legend>Visible profile fields</legend>{all.map(key=><CheckField key={key} label={fieldLabel(key)} value={visible.includes(key)} set={checked=>{
          const next=visible.filter(field=>field!==key&&all.includes(field));
          if (checked) next.push(key);
          setTemplate({fields:next.length?next.join(', '):'none'});
        }}/>)}</fieldset>
      </div>
      <div className="studio-panel studio-section-order">
        <h3>Profile section order</h3>
        {order.map((key,index)=><div key={key}><span>{sectionOptions.find(([id])=>id===key)?.[1]||fieldLabel(key)}</span>
          <button type="button" disabled={index===0} aria-label={`Move ${key} earlier`} onClick={()=>setTemplate({sections:moved(order,index,-1).join(', ')})}><ArrowUp size={17}/></button>
          <button type="button" disabled={index===order.length-1} aria-label={`Move ${key} later`} onClick={()=>setTemplate({sections:moved(order,index,1).join(', ')})}><ArrowDown size={17}/></button>
        </div>)}
      </div>
    </div>
    <AdminPreview title="Template preview" business={example} media={media} settings={settings} destination={destination}/>
  </div>;
}

export function AdminSettings({tab,state,run,busy}:{tab:SettingsTab;state:State;run:Run;busy:boolean}) {
  const [draft,setDraft]=useState(state.settings);
  const [baseline,setBaseline]=useState(state.settings);
  const [origins,setOrigins]=useState(state.settings.destinations.map(d=>d.slug));
  const [selection,setSelection]=useState<Record<string,number>>({});
  const [reset,setReset]=useState(0);
  const index=selection[tab]||0;
  const choose=(i:number)=>setSelection(previous=>({...previous,[tab]:i}));
  const update=<K extends keyof Settings,>(key:K,value:Settings[K])=>setDraft(previous=>({...previous,[key]:value}));
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destinationRenames=Object.fromEntries(draft.destinations.flatMap((d,i)=>origins[i]&&origins[i]!==d.slug?[[origins[i],d.slug]]:[]));
    const rename=(items:Editorial[])=>items.map(item=>({...item,destination:destinationRenames[item.destination]||item.destination}));
    const next={...draft,guides:rename(draft.guides),collections:rename(draft.collections)};
    const result=await run('/api/settings',jsonRequest('PATCH',{...next,destinationRenames}),'Site settings saved.');
    if (result) {
      setDraft(next);
      setBaseline(next);
      setOrigins(next.destinations.map(item=>item.slug));
    }
  }
  function remove<T>(items:T[],setter:(value:T[])=>void,name:string,message='') {
    if (!window.confirm(`Delete ${name}?${message?' '+message:''}`)) return false;
    setter(items.filter((_,i)=>i!==index));
    choose(Math.max(0,index-1));
    return true;
  }

  let content:ReactNode;
  let siteAsset:ReactNode;
  if (tab==='Destinations') {
    const items=draft.destinations;
    const item=items[index];
    const set=(patch:Partial<Destination>)=>update('destinations',changed(items,index,patch));
    content=<section className="studio-panel studio-stack">
      <ItemSelector caption="Edit destination" options={items.map(d=>d.name)} selected={index} choose={choose}
        add={()=>{const slug=unique('new-destination',items.map(d=>d.slug));update('destinations',[...items,{name:'New destination',slug,status:'draft',description:'',center:[0,0,10]}]);setOrigins([...origins,'']);choose(items.length);}}
        move={delta=>{update('destinations',moved(items,index,delta));setOrigins(moved(origins,index,delta));choose(index+delta);}}
        drop={item&&items.length>1?()=>{if(remove(items,next=>update('destinations',next),item.name,'Linked listings will be unavailable from this destination.')) setOrigins(origins.filter((_,i)=>i!==index));}:undefined}/>
      {item&&<DestinationEditor key={index+'-'+reset} value={item} set={set}/>}
    </section>;
    if(item) siteAsset=<AssetPicker key={index} title="Destination hero" media={state.media} value={item.hero||''} set={hero=>set({hero})} run={run} busy={busy}/>;
  } else if (tab==='Categories') {
    const items=draft.categories;
    const item=items[index];
    const set=(patch:Partial<Category>)=>update('categories',changed(items,index,patch));
    content=<section className="studio-panel studio-stack">
      <ItemSelector caption="Edit category" options={items.map(c=>c.label)} selected={index} choose={choose}
        add={()=>{const id=unique('new-category',items.map(c=>c.id));update('categories',[...items,{id,label:'New category',color:'#526c62',tourism:false,visible:false}]);choose(items.length);}}
        move={delta=>{update('categories',moved(items,index,delta));choose(index+delta);}}
        drop={item?()=>remove(items,next=>{update('categories',next);update('templates',draft.templates.filter(template=>template.category!==item.id));},item.label,'Listings assigned to this category will be hidden until reassigned.'):undefined}/>
      {item?<CategoryEditor value={item} set={set}/>:<Empty>Add a category to get started.</Empty>}
    </section>;
  } else if (tab==='Guides'||tab==='Collections') {
    const key=tab==='Guides'?'guides':'collections',name=tab==='Guides'?'guide':'collection';
    const items=draft[key];
    const item=items[index];
    const set=(patch:Partial<Editorial>)=>update(key,changed(items,index,patch));
    const stableDestinations=draft.destinations.map((d,i)=>({...d,slug:origins[i]||d.slug}));
    content=<section className="studio-panel studio-stack">
      <ItemSelector caption={`Edit ${name}`} options={items.map(item=>item.title)} selected={index} choose={choose}
        add={()=>{const title=`New ${name}`;update(key,[...items,{id:unique(slugify(title),items.map(item=>item.id)),title,destination:stableDestinations[0]?.slug||'',status:'draft',body:'',businesses:''}]);choose(items.length);}}
        move={delta=>{update(key,moved(items,index,delta));choose(index+delta);}}
        drop={item?()=>remove(items,next=>update(key,next),item.title):undefined}/>
      {item?<EditorialEditor key={index} value={item} set={set} state={state} destinations={stableDestinations} run={run} busy={busy}/>:<Empty>Add a {name} to start writing.</Empty>}
    </section>;
  } else if (tab==='Card designer') {
    content=<TemplateEditor state={state} settings={draft} set={templates=>update('templates',templates)}/>;
  } else if (tab==='Page copy') {
    const pages=draft.pages;
    const set=(patch:Partial<Settings['pages']>)=>update('pages',{...pages,...patch});
    content=<section className="studio-panel studio-form-grid">
      <TextField label="Home heading" value={pages.homeTitle} set={homeTitle=>set({homeTitle})} wide required/>
      <TextField label="Home introduction" value={pages.homeIntro} set={homeIntro=>set({homeIntro})} multiline wide/>
      <TextField label="Local perspective note" value={pages.homeNote} set={homeNote=>set({homeNote})} multiline wide/>
      <TextField label="About introduction" value={pages.aboutIntro} set={aboutIntro=>set({aboutIntro})} multiline wide/>
      <TextField label="About feature paragraph" value={pages.aboutBody} set={aboutBody=>set({aboutBody})} multiline wide/>
      <TextField label="About purpose note" value={pages.aboutPurpose} set={aboutPurpose=>set({aboutPurpose})} multiline wide/>
      <TextField label="Discover introduction" value={pages.discoverIntro} set={discoverIntro=>set({discoverIntro})} multiline wide/>
      <TextField label="Guides introduction" value={pages.guidesIntro} set={guidesIntro=>set({guidesIntro})} multiline wide/>
    </section>;
  } else if (tab==='Branding') {
    const brand=draft.branding;
    const set=(patch:Partial<Settings['branding']>)=>update('branding',{...brand,...patch});
    content=<section className="studio-panel studio-form-grid">
      <TextField label="Site name" value={brand.name} set={name=>set({name})} wide placeholder="IslaVista"/>
      <Field label="Heading typeface"><select value={brand.heading} onChange={event=>set({heading:event.target.value})}><option>Playfair Display</option><option>Georgia</option></select></Field>
      <Field label="Interface typeface"><select value={brand.font} onChange={event=>set({font:event.target.value})}><option>Inter</option><option>Arial</option></select></Field>
      {([['forest','Primary color'],['ivory','Background color'],['sand','Accent color']] as const).map(([key,label])=><Field label={label} key={key}><input type="color" value={brand[key]} onChange={event=>set({[key]:event.target.value})}/></Field>)}
      <div className="studio-brand-preview studio-wide" style={{background:brand.ivory,color:brand.forest,borderColor:brand.sand,fontFamily:brand.font}}>
        {managedMedia(brand.logo)?<img src={managedMedia(brand.logo)} alt=""/>:<IslandMark/>}
        <span style={{fontFamily:brand.heading}}>{brand.name||'IslaVista'}</span>
      </div>
    </section>;
    siteAsset=<AssetPicker title="Site logo" media={state.media} value={brand.logo} set={logo=>set({logo})} run={run} busy={busy}/>;
  } else {
    content=<section className="studio-panel studio-stack">
      {(Object.keys(tileDefaults) as (keyof Settings['tiles'])[]).map(key=><TextField key={key} label={`${key} tile URL`} value={draft.tiles[key]} set={value=>update('tiles',{...draft.tiles,[key]:value})} placeholder={tileDefaults[key]} hint="Use an HTTPS tile URL with {x}, {y} and {z} placeholders. Dark mode uses the Street provider." maxLength={400}/>)}
    </section>;
  }
  return <div className="studio-stack">
    <form onSubmit={save} className="studio-stack" id="studio-settings-form"><fieldset className="studio-busy-form" disabled={busy}>{content}</fieldset></form>
    {siteAsset&&<div className="studio-panel studio-stack">{siteAsset}</div>}
    <div className="studio-form-actions studio-settings-save">
      <button className="primary" form="studio-settings-form" type="submit" disabled={busy||!dirty}>{busy?'Saving…':'Save settings'}</button>
      {dirty&&<button type="button" disabled={busy} onClick={()=>{setDraft(baseline);setOrigins(baseline.destinations.map(item=>item.slug));setSelection({});setReset(value=>value+1);}}>Discard changes</button>}
    </div>
  </div>;
}
