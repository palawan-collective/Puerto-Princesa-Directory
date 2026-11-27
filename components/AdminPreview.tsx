import {useRef,useState} from 'react';
import {Expand,Eye,X} from 'lucide-react';
import type {Business,Media,Settings} from '../lib/model';
import {Empty,Field} from './AdminFields';
import {PlaceCard,PlaceDetail} from './PlaceCard';

type Format='Card'|'Profile';

export function AdminPreview({business,media,settings,destination,id,title='Live preview'}:{
  business?:Business;media:Media[];settings:Settings;destination:string;id?:string;title?:string;
}) {
  const [device,setDevice]=useState('phone');
  const [format,setFormat]=useState<Format>('Profile');
  const [saved,setSaved]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  function display() {
    if (!business) return <Empty>Add a listing in this category to see it in the preview.</Empty>;
    const props={business,media,settings,saved,toggle:()=>setSaved(value=>!value)};
    return <div className="studio-preview" data-device={device}
      onClickCapture={event=>{
        if (event.target instanceof Element&&event.target.closest('a')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}>
      {format==='Card'?<PlaceCard {...props} onOpen={()=>setFormat('Profile')}/>:<PlaceDetail key={business.business_id} {...props} destination={destination} preview/>}
    </div>;
  }
  return <aside className="studio-preview-panel" id={id}>
    <div className="studio-preview-header">
      <h3><Eye size={17}/> {title}</h3>
      <Field label="Preview size"><select value={device} onChange={event=>setDevice(event.target.value)}><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select></Field>
    </div>
    <div className="studio-tabbar studio-preview-controls" aria-label="Preview format">
      {(['Card','Profile'] as const).map(item=><button type="button" aria-pressed={format===item} key={item} onClick={()=>setFormat(item)}>{item}</button>)}
      {business&&<button type="button" className="studio-expand-preview" onClick={()=>{setExpanded(true);dialog.current?.showModal();}}><Expand size={15}/> Expand</button>}
    </div>
    {display()}
    <dialog className="studio-preview-dialog" aria-label={`${title} at ${device} size`} data-device={device} ref={dialog} onClose={()=>setExpanded(false)}>
      {expanded&&<>
        <div className="studio-panel-heading"><h3>{title}</h3><button type="button" autoFocus onClick={()=>dialog.current?.close()} aria-label="Close expanded preview"><X size={18}/></button></div>
        {display()}
      </>}
    </dialog>
  </aside>;
}
