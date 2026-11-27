import type {MetadataRoute} from 'next';
import {load} from '../lib/store';
import {approved,businessPath,categoryInfo,inDestination} from '../lib/model';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const origin=process.env.SITE_ORIGIN;
  if (!origin) return [];
  const state=await load();
  return state.settings.destinations.filter(d=>d.status==='published').flatMap(d=>[
    ...['','/home','/discover','/directory','/guides','/about'].map(s=>({url:new URL('/'+d.slug+s,origin).href})),
    ...state.businesses.filter(b=>approved(b)&&inDestination(b,d)&&categoryInfo(b,state.settings)?.visible).map(b=>({url:new URL(businessPath(b,d.slug),origin).href})),
  ]);
}
