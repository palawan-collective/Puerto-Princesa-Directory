import { z } from 'zod';
import { managedMedia, safeLink, type Settings } from './model.ts';

const text=z.string().max(12000);
const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const hex=z.string().regex(/^#[0-9a-f]{6}$/i);
const media=z.string().refine(x=>!x||!!managedMedia(x));
const status=z.enum(['published','draft']);
const latitude=z.number().min(-90).max(90),longitude=z.number().min(-180).max(180);
const item=z.object({id:slug,title:text.min(1),destination:slug,status,body:text,businesses:text});
const tile=z.string().max(400).refine(x=>!x||(['{x}','{y}','{z}'].every(v=>x.includes(v))&&x.startsWith('https://')&&safeLink(x.replaceAll('{s}','a'))));
export const settingsSchema=z.object({
  destinations:z.array(z.object({slug,name:text.min(1),status,description:text,center:z.tuple([latitude,longitude,z.number().int().min(3).max(19)]),bounds:z.tuple([latitude,longitude,latitude,longitude]).optional(),hero:media.optional(),seo:text.optional()})).min(1).max(100),
  categories:z.array(z.object({id:text.min(1),label:text.min(1),tourism:z.boolean(),visible:z.boolean(),color:hex,icon:text.optional()})).max(100),
  guides:z.array(item).max(300),collections:z.array(item).max(300),
  templates:z.array(z.object({category:text.min(1),fields:text,sections:text,ratio:z.enum(['16 / 9','4 / 3','3 / 2','1 / 1']),actions:z.enum(['sticky','inline'])})).max(100),
  branding:z.object({name:text,logo:media,forest:hex,ivory:hex,sand:hex,heading:z.enum(['Playfair Display','Georgia']),font:z.enum(['Inter','Arial'])}),
  tiles:z.object({Street:tile.optional(),Satellite:tile.optional(),Terrain:tile.optional()}),
});

export function settingsIssue(next: Settings) {
  if (new Set(next.destinations.map(d=>d.slug)).size!==next.destinations.length||new Set(next.categories.map(c=>c.id)).size!==next.categories.length||next.destinations.some(d=>d.bounds&&(d.bounds[0]>=d.bounds[2]||d.bounds[1]>=d.bounds[3]))) return 'Use unique slugs and category IDs, and valid south/west/north/east bounds.';
  if (!next.destinations.some(d=>d.status==='published')||next.destinations.some(d=>d.status==='published'&&!d.description.trim())) return 'Published destinations need a description.';
}
