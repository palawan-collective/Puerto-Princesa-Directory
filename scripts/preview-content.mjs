/**
 * Local-only preview content for the Discover, Guides and About pages.
 *
 * This script never runs as part of the app or a deploy. It writes preview
 * editorial entries and commercially free imagery into the git-ignored
 * .local-data workspace so the approved V2 layouts can be reviewed with
 * realistic cards. Replace every entry and image from /admin when real
 * content is ready.
 *
 * Run scripts/preview-images.mjs first to refresh the image files.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const store=path.join(root,'.local-data','directory.json');
const mediaRoot=path.join(root,'.local-data','images','site-assets');
const manifestFile=path.join(root,'.local-data','images','preview-src','manifest.json');

const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
const images=Object.fromEntries(manifest.map(item=>[item.file,item]));
const state=JSON.parse(await readFile(store,'utf8'));
const previous=new Set(state.settings.collections.map(entry=>entry.id));

state.settings.collections=[];
state.settings.guides=[];
state.media=state.media.filter(item=>!String(item.filename).startsWith('preview-'));
await mkdir(mediaRoot,{recursive:true});

const urls={};
for (const item of manifest) {
  const url=item.url;
  urls[item.file]=url;
  state.media.push({
    business_id:'site-assets',filename:item.file,url,thumbnail:url+'&thumb=1',kind:'image',
    source_url:item.source_url,license:item.license,attribution:item.attribution,
    permission_status:'approved',cover:true,alt:item.alt,
  });
}

const cover=(file,alt)=>urls[file];
const alt=(file)=>images[file]?.alt||'';
const base={destination:'puerto-princesa',status:'published',businesses:'',body:''};

const collections=[
  {...base,id:'preview-local-edit',title:'Make a little more of your time here.',category:'The local edit',
    cover:cover('preview-bay.webp'),imageAlt:alt('preview-bay.webp'),
    excerpt:'Explore collections of local experiences, food, shops and hidden corners. Each published pick should connect to a real listing.'},
  {...base,id:'preview-nature-close-to-city',title:'Nature close to the city',category:'Explore',
    cover:cover('preview-river.webp'),imageAlt:alt('preview-river.webp'),
    excerpt:'Forest, coast and outdoor experiences.'},
  {...base,id:'preview-coffee-local-flavors',title:'Coffee and local flavors',category:'Eat & drink',
    cover:cover('preview-coffee.webp'),imageAlt:alt('preview-coffee.webp'),
    excerpt:'Find cafés and food worth discovering.'},
  {...base,id:'preview-day-by-the-water',title:'A day by the water',category:'Experiences',
    cover:cover('preview-shore.webp'),imageAlt:alt('preview-shore.webp'),
    excerpt:'Ideas for island and coastal adventures.'},
  {...base,id:'preview-made-found-locally',title:'Made and found locally',category:'Shop local',
    cover:cover('preview-craft.webp'),imageAlt:alt('preview-craft.webp'),
    excerpt:'Local makers, shops and everyday finds.'},
  {...base,id:'preview-slow-down-wellness',title:'Slow down, feel better',category:'Wellness',
    cover:cover('preview-calm.webp'),imageAlt:alt('preview-calm.webp'),
    excerpt:'Quiet places and everyday ways to recharge.'},
  {...base,id:'preview-stay-a-little-longer',title:'Stay a little longer',category:'Stay',
    cover:cover('preview-stay.webp'),imageAlt:alt('preview-stay.webp'),
    excerpt:'Places to base yourself, from town to shoreline.'},
];

const guides=[
  {...base,id:'preview-weekend-in-puerto-princesa',title:'A weekend in Puerto Princesa',category:'Weekend guide',
    cover:cover('preview-beach.webp'),imageAlt:alt('preview-beach.webp'),
    excerpt:'Start with nature, find something good to eat and discover the city at your own pace.',
    body:'A weekend is enough to see why people keep coming back. Start close to the city, leave room for an unscheduled meal and let the day move at island pace.\n\nThis is a preview guide for the V2 design review. When it is replaced with published editorial, each recommendation will connect to a real, reviewed listing.'},
  {...base,id:'preview-local-guide-to-coffee',title:'A local guide to coffee',category:'Food & drink',
    cover:cover('preview-cafe.webp'),imageAlt:alt('preview-cafe.webp'),
    excerpt:'A guide concept for finding your next café.',
    body:'A good coffee stop is part of the day, not a detour. This preview guide is a placeholder for a locally reviewed list of cafés, roasters and quiet corners to sit for a while.'},
  {...base,id:'preview-beyond-the-city',title:'Beyond the city',category:'Day trips',
    cover:cover('preview-sunset.webp'),imageAlt:alt('preview-sunset.webp'),
    excerpt:'A guide concept for coastal adventures.',
    body:'The coast opens up quickly once you leave the center. This preview guide is a placeholder for reviewed day trips, transport notes and places worth the drive.'},
  {...base,id:'preview-people-places-local-life',title:'People, places and local life.',category:'Community',
    cover:cover('preview-craft.webp'),imageAlt:alt('preview-craft.webp'),
    excerpt:'Publish locally reviewed stories about history, culture, neighborhoods and communities here.',
    body:'Publish locally reviewed stories about history, culture, neighborhoods and communities here. Link every referenced place to a real directory record when available.'},
  {...base,id:'preview-meet-the-local-makers',title:'Meet the local makers',category:'Community',
    cover:cover('preview-maker.webp'),imageAlt:alt('preview-maker.webp'),
    excerpt:'A story concept about local businesses.',
    body:'A story concept about the people who make, grow, cook and build in the city. Replace this placeholder with a published interview and link the makers to their real directory records.'},
  {...base,id:'preview-market-morning',title:'A market morning',category:'Food & drink',
    cover:cover('preview-market.webp'),imageAlt:alt('preview-market.webp'),
    excerpt:'Where to start, what to look for and how to shop well.',
    body:'A concept guide for an early market run: what is in season, which stalls to look for and how to build a meal around what you find.'},
  {...base,id:'preview-quiet-places-to-reset',title:'Quiet places to reset',category:'Wellness',
    cover:cover('preview-mangrove.webp'),imageAlt:alt('preview-mangrove.webp'),
    excerpt:'A slower kind of day in and around the city.',
    body:'A concept guide for slower days: quiet water, long lunches and the kind of places where the point is to stay a little longer.'},
];

state.settings.collections=collections;
state.settings.guides=guides;
const destination=state.settings.destinations.find(item=>item.slug==='puerto-princesa');
if (destination) destination.hero=urls['preview-hero.webp'];
state.settings.pages.discoverIntro='A hand-picked way to explore the city, whether you are visiting or call it home.';
state.settings.pages.guidesIntro='Stories, itineraries and useful recommendations shaped by local knowledge.';
state.settings.pages.aboutIntro='A local perspective on Puerto Princesa, its communities and the places that make it home.';
state.settings.pages.aboutBody='We are building a place where visitors can discover with confidence and residents can find the businesses and services they need every day.';
state.settings.pages.aboutPurpose='Help visitors explore and help residents find what they need, while giving local businesses a stronger digital presence.';

await writeFile(store,JSON.stringify(state),'utf8');
console.log(`Seeded ${collections.length} collections, ${guides.length} guides and ${manifest.length} images.`);
console.log(`Replaced ${previous.size} existing collection(s).`);
