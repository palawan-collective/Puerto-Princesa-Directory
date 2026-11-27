import {privatePreview} from './auth';
import {load} from './store';
import {approved,authorized,byName,categoryInfo,inDestination,managedMedia,publicBusiness, str} from './model';

export async function catalog(slug?:string,all=false) {
  const [state,preview]=await Promise.all([load(),privatePreview()]);
  const destinations=state.settings.destinations.filter(d=>d.status==='published');
  const active=all ? undefined : slug ? destinations.find(d=>d.slug===slug) : destinations[0];
  const published=state.businesses.filter(b=>approved(b)||(preview&&str(b.editorial_status)==='imported'));
  const raw=published.filter(b=>(active?inDestination(b,active):destinations.some(d=>inDestination(b,d))) && categoryInfo(b,state.settings)?.visible);
  const ids=new Set(raw.map(b=>b.business_id));
  const businesses=raw.map(publicBusiness).sort((a,b)=>Number(b.featured===true)-Number(a.featured===true)||Number(a.sort_order??9999)-Number(b.sort_order??9999)||byName(a,b));
  const media=state.media.filter(m=>ids.has(m.business_id)&&authorized(m.permission_status)).map(m=>({...m,source_url:''}));
  const settings={
    ...state.settings,destinations:destinations.map(d=>({...d,hero:managedMedia(d.hero)})),
    categories:state.settings.categories.filter(c=>c.visible),
    guides:state.settings.guides.filter(g=>g.status==='published'),
    collections:state.settings.collections.filter(g=>g.status==='published'),
  };
  return {active,settings,businesses,media,preview};
}
