import {authorize} from '../../../lib/auth';
import {extractLinkImages} from '../../../lib/link-import';
import {isMediaId,downloadApprovedMedia,prepareMedia,withMediaWrite,writeManagedMedia} from '../../../lib/media';
import {str,type Media} from '../../../lib/model';
import {dataDirectory,load,mutate} from '../../../lib/store';

export async function POST(request:Request) {
  const denied=await authorize(request);
  if (denied) return denied;
  const body=await request.text();
  if (body.length>32*1024) return Response.json({error:'Request too large.'},{status:413});
  const json=JSON.parse(body||'{}') as Record<string,unknown>;
  const url=str(json.url),businessId=str(json.business_id),step=str(json.step)||'scan';
  if (!isMediaId(businessId)) return Response.json({error:'Choose a business.'},{status:400});
  if (json.rights!==true) return Response.json({error:'Confirm you have the business owner’s permission to use photos from this link.'},{status:400});
  if (!['scan','commit'].includes(step)) return Response.json({error:'Invalid import step.'},{status:400});
  const state=await load();
  if (!state.businesses.some(item=>item.business_id===businessId)) return Response.json({error:'Unknown business.'},{status:400});
  try {
    const selected=Array.isArray(json.selected)?json.selected.map(str).filter(Boolean):[];
    const cover=str(json.cover);
    const images=step==='scan'
      ? await extractLinkImages(url)
      : selected.map(image=>({url:image,size:0,source:(()=>{try{return new URL(image).hostname}catch{return 'listing link'}})()}));
    if (step==='scan') {
      let added=0;
      await mutate(s=>{
        const seen=new Set(s.candidates.filter(item=>item.business_id===businessId).map(item=>item.source_url));
        for (const image of images) {
          if (seen.has(image.url)) continue;
          seen.add(image.url);
          s.candidates.push({business_id:businessId,source_url:image.url,permission_status:'pending',license:'Owner permission to confirm',attribution:'Source: '+image.source});
          added++;
        }
        s.audit.push({at:new Date().toISOString(),action:'Scanned link for images',target:businessId+' · '+url.slice(0,200)});
      });
      return Response.json({step,url,found:images.length,added,images});
    }
    const known=new Set(state.candidates.filter(item=>item.business_id===businessId).map(item=>item.source_url));
    const chosen=images.filter(image=>known.has(image.url)).slice(0,6);
    if (!chosen.length) return Response.json({error:'Choose at least one scanned image to feature.'},{status:400});
    const errors:string[]=[];
    let imported=0;
    await withMediaWrite(()=>mutate(async s=>{
      const business=s.businesses.find(item=>item.business_id===businessId);
      if (!business) return;
      const existing=new Set(s.media.filter(item=>item.business_id===businessId).map(item=>item.source_url));
      const uploaded:{id:string;filename:string}[]=[];
      for (const image of chosen) {
        if (existing.has(image.url)) continue;
        try {
          const prepared=await prepareMedia(businessId,await downloadApprovedMedia(image.url));
          if (prepared.kind!=='image') continue;
          await writeManagedMedia(dataDirectory,businessId,prepared);
          uploaded.push({id:businessId,filename:prepared.filename});
          const isCover=image.url===cover||(!cover&&!imported);
          if (isCover) s.media.filter(item=>item.business_id===businessId).forEach(item=>{item.cover=false;});
          const item:Media={business_id:businessId,filename:prepared.filename,url:prepared.url,kind:prepared.kind,thumbnail:prepared.thumbnail,source_url:image.url,license:'Owner-provided listing link',attribution:'Featured via '+image.source,alt:str(business.name),permission_status:'approved',cover:isCover};
          s.media.push(item);
          existing.add(image.url);
          imported++;
        } catch (error) { errors.push(`${image.url.slice(0,90)}: ${(error as Error).message}`); }
      }
      for (const item of s.candidates) {
        if (item.business_id===businessId&&chosen.some(image=>image.url===item.source_url))
          Object.assign(item,{permission_status:'approved',license:'Owner-provided listing link',attribution:'Featured via listing link'});
      }
      business.featured=true;
      if (business.editorial_status==='imported') business.editorial_status='approved';
      s.audit.push({at:new Date().toISOString(),action:'Featured business from link',target:businessId+' · '+url.slice(0,200)});
      return uploaded;
    }));
    return Response.json({step,selected:chosen.length,imported,featured:true,errors});
  } catch (error) {
    return Response.json({error:(error as Error).message},{status:400});
  }
}
