export type Business = { business_id: string; name: string; [key: string]: unknown };
export type Media = {
  business_id: string; filename: string; url: string; source_url: string; license: string;
  attribution: string; permission_status: string; cover: boolean; alt?: string;
  kind?: 'image' | 'video'; thumbnail?: string;
};
export type Candidate = { business_id: string; source_url: string; permission_status: string; filename?: string; license?: string; attribution?: string };
export type Bounds = [number, number, number, number];
export type Destination = {
  slug: string; name: string; status: 'published' | 'draft'; description: string; center: [number, number, number];
  bounds?: Bounds; hero?: string; seo?: string;
};
export type Category = { id: string; label: string; tourism: boolean; visible: boolean; color: string; icon?: string };
export type Editorial = { id: string; title: string; destination: string; status: 'draft' | 'published'; body: string; businesses: string };
export type Template = { category: string; fields: string; sections: string; ratio: string; actions: 'sticky' | 'inline' };
export type Branding = { name: string; logo: string; forest: string; ivory: string; sand: string; heading: string; font: string };
export type Settings = {
  destinations: Destination[]; categories: Category[]; guides: Editorial[]; collections: Editorial[];
  templates: Template[]; branding: Branding; tiles: { Street?: string; Satellite?: string; Terrain?: string };
};
export type State = {
  businesses: Business[]; media: Media[]; candidates: Candidate[];
  settings: Settings; audit: { at: string; action: string; target: string }[];
  imports: { at: string; name: string; added: number; updated: number; rejected: number; id?: string; kind?: string; total?: number; unchanged?: number; duplicates?: number; errors?: string[] }[];
  analytics: { at: string; business_id: string; channel: string }[];
};

export const categories = ['All', 'Stay', 'Eat', 'Drink', 'Explore', 'Discover', 'Wellness', 'Shop', 'Transport', 'Essentials'] as const;
export const colors: Record<string, string> = {
  Stay: '#8350b5', Eat: '#cf6518', Drink: '#875b35', Explore: '#128047', Discover: '#42794e',
  Wellness: '#8a54ae', Shop: '#ba3875', Transport: '#25758c', Essentials: '#17799d',
};
export const defaultSettings: Settings = {
  destinations: [
    { slug: 'puerto-princesa', name: 'Puerto Princesa', status: 'published', center: [9.755,118.752,12], description: 'Stay, eat, explore, and discover local businesses in the City in a Forest.' },
    { slug: 'port-barton', name: 'Port Barton', status: 'draft', center: [10.411,119.176,13], description: '' },
    { slug: 'sabang', name: 'Sabang', status: 'draft', center: [10.199,118.886,13], description: '' },
    { slug: 'san-vicente', name: 'San Vicente', status: 'draft', center: [10.53,119.273,11], description: '' },
    { slug: 'el-nido', name: 'El Nido', status: 'draft', center: [11.2,119.39,11], description: '' },
    { slug: 'coron', name: 'Coron', status: 'draft', center: [12.001,120.205,12], description: '' },
    { slug: 'balabac', name: 'Balabac', status: 'draft', center: [7.986,117.054,12], description: '' },
  ],
  categories: [
    ...Object.entries({ Stay: 'Accommodations', Drink: 'Cafes', Eat: 'Restaurants', Explore: 'Tours', Discover: 'Attractions', Wellness: 'Wellness', Shop: 'Shopping', Transport: 'Transport', Essentials: 'Services' }).map(([id,label])=>({ id,label,tourism:true,visible:true,color:colors[id] })),
    ...['Retail','Real Estate','Financial Services','Professional Services','Education','Automotive','Construction','Events & Entertainment','Healthcare','Other'].map(id=>({id,label:id,tourism:false,visible:true,color:'#526c62'})),
  ],
  guides: [], collections: [], templates: [], tiles: {},
  branding: {name:'',logo:'',forest:'#124F3A',ivory:'#F7F4ED',sand:'#E6B65F',heading:'Playfair Display',font:'Inter'},
};
export function str(x:unknown) {
  try {return String(x??'').trim();} catch {return '';}
}
export const list = (x: unknown): string[] => Array.isArray(x) ? x.map(str).filter(Boolean) : str(x).split(/[,;|\n]/).map(s=>s.trim()).filter(Boolean);
export const slugify = (x: string) => x.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const businessSlug = (b: Business) => `${slugify(b.name) || 'place'}--${b.business_id}`;
export const businessPath = (b: Business, destination: string) => `/${destination}/place/${businessSlug(b)}`;
export const inDestination = (b: Business, d: Destination) => [str(b.destination),...list(b.destinations)].some(x=>x===d.slug||x===d.name);
export const byName = (a: Business,b: Business) => a.name.localeCompare(b.name,'en',{sensitivity:'base'});
export function category(r: Business) {
  const raw = str(r.directory_category || r.category), c = raw.toLowerCase(), s = str(r.subcategory).toLowerCase();
  const known = categories.slice(1).find(x=>x.toLowerCase()===c);
  if (known) return known;
  if (r.directory_category) return raw;
  if (c === 'accommodation' || /hotel|lodging|resort/.test(s)) return 'Stay';
  if (c === 'food & beverage') return /coffee|cafe|café|bar|bakery|dessert/.test(s) ? 'Drink' : 'Eat';
  if (/tour|activit/.test(c)) return 'Explore';
  if (/attraction/.test(c)) return 'Discover';
  if (c === 'transportation') return 'Transport';
  if (c === 'wellness') return 'Wellness';
  if (c === 'retail') {
    if (/pharmacy|convenience/.test(s)) return 'Essentials';
    if (/arts_crafts|flowers_and_gifts|souvenir/.test(s)) return 'Shop';
  }
  if (/health|medical/.test(c)) return 'Healthcare';
  return raw || 'Other';
}
export const categoryInfo = (b: Business, settings: Settings) => settings.categories.find(c=>c.id===category(b));
export function coordinates(r: Business): [number,number] | null {
  if (!str(r.latitude) || !str(r.longitude)) return null;
  const lat = Number(r.latitude), lon = Number(r.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180 ? [lat,lon] : null;
}
export const approved = (r: Business) => /^(approved|published)$/i.test(str(r.editorial_status));
export function safeLink(x: unknown) {
  try {
    const u = new URL(str(x));
    return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : '';
  } catch { return ''; }
}
export function managedMedia(x: unknown) {
  const value = str(x);
  return /^\/api\/media\?id=[\w-]+&file=[\w.-]+(?:&thumb=1)?$/.test(value) ? value : '';
}
export const publicFields = [
  'business_id','name','category','directory_category','subcategory','destination','destinations',
  'municipality','barangay','address','latitude','longitude','phone','email','website','facebook',
  'instagram','whatsapp','tiktok','opening_hours','services','amenities','description','featured',
  'operating_status','check_in','check_out','price_range','room_types','cuisine','menu','reservations',
  'delivery','workspace','duration','pickup','inclusions','group_size','treatments','appointments',
  'booking_url','inquiry_url','custom_fields','rating','rating_count','rating_source','verified',
  'verification_source','editorial_status','sort_order',
] as const;
export function publicBusiness(b: Business): Business {
  const fields = Object.fromEntries(publicFields.filter(k=>b[k]!=null && k!=='editorial_status').map(k=>[k,b[k]]));
  return {...fields,business_id:b.business_id,name:b.name};
}
export function mergeRecords(existing: Business[], incoming: Record<string,unknown>[], overwrite=false) {
  const records = new Map(existing.map(r=>[r.business_id,r]));
  const seen = new Set<string>();
  let added=0, updated=0, unchanged=0, rejected=0, duplicates=0;
  const errors: string[] = [];
  for (const [i,r] of incoming.entries()) {
    const id = typeof r?.business_id==='string'?str(r.business_id):'';
    let error = '';
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || typeof r?.name!=='string' || !str(r.name) || str(r.name).length>250) error = 'missing or invalid business ID or name';
    else if (seen.has(id)) { duplicates++; error = `duplicate ID ${id}`; }
    else if ((str(r.latitude)||str(r.longitude)) && !coordinates({...r,business_id:id,name:str(r.name)})) error = 'invalid coordinates';
    if (error) { rejected++; errors.push(`Row ${i+2}: ${error}`); continue; }
    seen.add(id);
    const old = records.get(id);
    const next: Business = {...old,business_id:id,name:old?.name || str(r.name)};
    for (const [k,v] of Object.entries(r)) {
      if (['business_id','__proto__','constructor','prototype','_manual_fields','editorial_status','featured','verified','verification_source','rating','rating_source','rating_count','sort_order'].includes(k)) continue;
      if ((typeof v==='object' && !Array.isArray(v)) || !str(v)) continue;
      const provenance=['source_url','source_id','license','verification_date','confidence','photo_url','logo_url','image_permissions'].includes(k);
      if (!overwrite && Array.isArray(old?._manual_fields) && old._manual_fields.includes(k)) continue;
      if (!old || overwrite&&!provenance || !str(old[k])) next[k]=k==='name'?str(v):v;
    }
    next.editorial_status=old?.editorial_status || 'imported';
    if (!old) added++;
    else if (Object.keys(next).some(k=>JSON.stringify(next[k])!==JSON.stringify(old[k]))) updated++;
    else unchanged++;
    records.set(id,next);
  }
  return {businesses:[...records.values()],added,updated,unchanged,rejected,duplicates,errors};
}
export function authorized(p: unknown) {
  return ['approved','authorized','permitted','openly licensed','open_license'].includes(str(p).toLowerCase());
}
export function imageCandidate(r: Record<string,unknown>): Candidate | null {
  const business_id=str(r?.business_id),source_url=safeLink(r?.original_source_url||r?.source_url||r?.image_url||r?.photo_url||r?.url);
  if (!business_id||!source_url) return null;
  return {business_id,source_url,permission_status:str(r.reuse_permission_status||r.permission_status||'pending'),filename:str(r.filename),license:str(r.license),attribution:str(r.attribution)};
}
