import {z} from 'zod';
import {dataDirectory,load,mutate} from '../../../lib/store';
import {admin,authorize} from '../../../lib/auth';
import {catalog} from '../../../lib/catalog';
import {isMediaFilename,removeManagedMedia,siteAssetId,withMediaWrite} from '../../../lib/media';
import {coordinates,publicFields,safeLink,str,type Business} from '../../../lib/model';

const record=z.object({business_id:z.string().regex(/^[\w-]{1,100}$/),name:z.string().trim().min(1).max(250)}).passthrough();
const links=['website','facebook','instagram','tiktok','menu','booking_url','inquiry_url','rating_source','verification_source'];
const internal=['source_url','source_id','verification_date','confidence','license','logo_url','photo_url','image_permissions','website_available','mobile_responsive','has_online_booking','has_online_ordering','has_digital_payments','social_media_presence','merqato_opportunity'];
const allowed=new Set<string>([...publicFields,...internal]);
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  if (params.has('admin')) {
    if (!await admin()) return Response.json({error:'Unauthorized'},{status:401});
    return Response.json(await load(),{headers:{'Cache-Control':'no-store'}});
  }
  const data=await catalog(params.get('destination')||undefined,params.has('all'));
  if (params.has('destination')&&!data.active) return Response.json({error:'Destination unavailable'},{status:404});
  const query=(params.get('q')||'').trim().toLowerCase();
  const all=query?data.businesses.filter(b=>[b.name,b.address,b.category,b.subcategory,b.barangay,b.services].some(v=>str(v).toLowerCase().includes(query))):data.businesses;
  const limit=Math.min(500,Math.max(1,Number(params.get('limit'))||500));
  const offset=Math.max(0,Number(params.get('offset'))||0);
  const businesses=all.slice(offset,offset+limit);
  const ids=new Set(businesses.map(b=>b.business_id));
  return Response.json({...data,businesses,total:all.length,media:data.media.filter(m=>ids.has(m.business_id))},{headers:{'Cache-Control':'private, no-store'}});
}
async function save(request:Request,create:boolean) {
  const denied=await authorize(request); if (denied) return denied;
  const parsed=record.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({error:'Enter a valid business ID and name.'},{status:400});
  const input=parsed.data;
  if(input.business_id===siteAssetId) return Response.json({error:'This ID is reserved for site media.'},{status:400});
  const fields=Object.fromEntries(Object.entries(input).filter(([key,value])=>allowed.has(key)&&(value===null||typeof value==='boolean'||typeof value==='number'||typeof value==='string'&&value.length<=12000)));
  for (const key of links) if (str(fields[key])&&!safeLink(fields[key])) return Response.json({error:`Use a valid web URL for ${key.replaceAll('_',' ')}.`},{status:400});
  if (str(fields.whatsapp)&&!safeLink(fields.whatsapp)&&!/^\+?\d[\d ()-]{6,20}$/.test(str(fields.whatsapp))) return Response.json({error:'Enter an international WhatsApp number or URL.'},{status:400});
  if (fields.editorial_status&&!['imported','draft','approved','published','archived'].includes(str(fields.editorial_status))) return Response.json({error:'Invalid editorial status.'},{status:400});
  try {
    return Response.json(await mutate(s=>{
      const index=s.businesses.findIndex(b=>b.business_id===input.business_id);
      if ((create && index!==-1)||(!create && index===-1)) throw Error(create?'This business ID already exists.':'Unknown business.');
      const item:Business={editorial_status:'draft',...s.businesses[index],...fields,business_id:input.business_id,name:input.name};
      if ((str(item.latitude)||str(item.longitude))&&!coordinates(item)) throw Error('Enter valid latitude and longitude together.');
      if (item.editorial_status==='published'&&(!str(item.category)&&!str(item.directory_category)||!str(item.destination))) throw Error('Choose a category and destination before publishing.');
      const old=s.businesses[index];
      const changed=Object.keys(fields).filter(key=>key!=='business_id'&&str(old?.[key])!==str(item[key]));
      item._manual_fields=[...new Set([...(Array.isArray(old?._manual_fields)?old._manual_fields:[]),...changed])];
      if (create) s.businesses.push(item); else s.businesses[index]=item;
      s.audit.push({at:new Date().toISOString(),action:create?'Created business':'Updated business',target:item.business_id});
      return {ok:true,business:item};
    }));
  } catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
}
export const POST=(request:Request)=>save(request,true);
export const PATCH=(request:Request)=>save(request,false);
export async function DELETE(request:Request) {
  const denied=await authorize(request); if (denied) return denied;
  const id=new URL(request.url).searchParams.get('id');
  if(!id||id===siteAssetId)return Response.json({error:'Choose a valid business.'},{status:400});
  return withMediaWrite(async()=>{
    const removed=await mutate(s=>{
      if(!s.businesses.some(b=>b.business_id===id))return null;
      const files=s.media.filter(m=>m.business_id===id);
      s.businesses=s.businesses.filter(b=>b.business_id!==id);
      s.media=s.media.filter(m=>m.business_id!==id);
      s.candidates=s.candidates.filter(m=>m.business_id!==id);
      s.audit.push({at:new Date().toISOString(),action:'Deleted business',target:id});
      return files;
    });
    if(!removed)return Response.json({error:'Unknown business.'},{status:404});
    const results=await Promise.allSettled(removed.filter(m=>isMediaFilename(m.filename)).map(m=>removeManagedMedia(dataDirectory,id,m.filename)));
    return Response.json({ok:true,cleanupErrors:results.filter(x=>x.status==='rejected').length});
  });
}
