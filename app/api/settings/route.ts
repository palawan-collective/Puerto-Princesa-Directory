import {authorize} from '../../../lib/auth';
import {mutate} from '../../../lib/store';
import {approved,authorized,inDestination,list,str} from '../../../lib/model';
import {siteAssetId,withMediaWrite} from '../../../lib/media';
import {settingsIssue,settingsSchema} from '../../../lib/settings-validation';

export async function PATCH(request:Request) {
  const denied=await authorize(request); if (denied) return denied;
  const input=await request.json().catch(()=>null);
  const parsed=settingsSchema.safeParse(input);
  if (!parsed.success) return Response.json({error:parsed.error.issues.map(i=>`${i.path.join('.')} ${i.message}`).join('; ')},{status:400});
  const next=parsed.data;
  const issue=settingsIssue(next);
  if (issue) return Response.json({error:issue},{status:400});
  const renames=Object.entries(input.destinationRenames&&typeof input.destinationRenames==='object'?input.destinationRenames:{});
  try {
    await withMediaWrite(()=>mutate(s=>{
      const allowed=new Set(s.media.filter(m=>m.business_id===siteAssetId&&m.kind!=='video'&&authorized(m.permission_status)).map(m=>m.url));
      if ([next.branding.logo,...next.destinations.map(d=>d.hero)].some(url=>url&&!allowed.has(url))) throw Error('Choose an approved image from site media.');
      for (const [from,to] of renames) {
        if(!s.settings.destinations.some(d=>d.slug===from)||!next.destinations.some(d=>d.slug===to)||next.destinations.some(d=>d.slug===from)) throw Error('Invalid destination rename.');
      }
      for (const before of s.settings.destinations) {
        const after=next.destinations.find(d=>d.slug===(renames.find(([from])=>from===before.slug)?.[1]||before.slug));
        if(!after||(before.slug===after.slug&&before.name===after.name))continue;
        const previous=[before.slug,before.name];
        for(const b of s.businesses){
          if(previous.includes(str(b.destination)))b.destination=after.slug;
          const related=list(b.destinations);
          if(related.some(d=>previous.includes(d)))b.destinations=[...new Set(related.map(d=>previous.includes(d)?after.slug:d))].join(', ');
        }
        for(const entry of [...next.guides,...next.collections])if(entry.destination===before.slug)entry.destination=after.slug;
      }
      for(const destination of next.destinations.filter(d=>d.status==='published')){
        const hasContent=s.businesses.some(b=>inDestination(b,destination)&&(approved(b)||str(b.editorial_status)==='imported'))||
          next.guides.some(g=>g.destination===destination.slug&&g.status==='published'&&g.body.trim());
        if(!hasContent)throw Error(`Add a listing or published guide before publishing ${destination.name}.`);
      }
      s.settings=next;
      s.audit.push({at:new Date().toISOString(),action:'Updated site settings',target:'Settings'});
    }));
    return Response.json({ok:true});
  } catch(error) {return Response.json({error:(error as Error).message},{status:400});}
}
