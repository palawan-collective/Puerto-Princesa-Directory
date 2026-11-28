/**
 * Local-only preview imagery.
 *
 * Downloads commercially free photographs (Pexels License) of Palawan and the
 * Philippines, then writes WebP covers and thumbnails into the git-ignored
 * .local-data workspace. Never runs in the app or a deploy.
 *
 * Pexels License: free to use, no attribution required. Credit is still stored
 * in the media record so it can be shown or replaced later.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=process.cwd();
const mediaRoot=path.join(root,'.local-data','images','site-assets');
const srcRoot=path.join(root,'.local-data','images','preview-src');
const manifestFile=path.join(srcRoot,'manifest.json');

const photos=[
  {file:'preview-hero.webp',id:13596888,photographer:'Kent Spencer Mendez',
   title:'Aerial view of Nagtabon Beach, Palawan',
   alt:'Aerial view of a Palawan beach with clear turquoise water and green hills'},
  {file:'preview-bay.webp',id:5307846,photographer:'Gera Guerrero',
   title:'Boats on water near palm trees',
   alt:'Traditional boats in a tropical harbor framed by palm trees and green hills'},
  {file:'preview-river.webp',id:6877000,photographer:'Quang Nguyen Vinh',
   title:'Lake in a limestone cave',
   alt:'Calm water inside a limestone cave lit by natural light'},
  {file:'preview-coffee.webp',id:33216070,photographer:'Thiago Matos',
   title:'Flat white with latte art on a wooden table',
   alt:'A flat white coffee with latte art on a warm wooden café table'},
  {file:'preview-cafe.webp',id:34255748,photographer:'Yasin Onuş',
   title:'Barista serving a latte in an artisan café',
   alt:'A barista handing over a latte in a small, plant-filled café'},
  {file:'preview-craft.webp',id:29530568,photographer:'Julio Lopez',
   title:'Colorful handwoven baskets in sunlight',
   alt:'Handwoven baskets in warm sunlight, showing local craft textures'},
  {file:'preview-market.webp',id:33527383,photographer:'Ella Ragasa',
   title:'Bustling street market in the Philippines',
   alt:'Shoppers and vendors at a busy street market in the Philippines'},
  {file:'preview-shore.webp',id:35650899,photographer:'Nothing Ahead',
   title:'Tropical beach with limestone cliffs in El Nido',
   alt:'A Palawan beach with limestone cliffs, palm trees and outrigger boats'},
  {file:'preview-beach.webp',id:31107466,photographer:'Pinkmean Creative',
   title:'Idyllic beach scene in Palawan',
   alt:'A sandy Palawan beach with boats resting on clear blue water'},
  {file:'preview-calm.webp',id:8776607,photographer:'Maria',
   title:'Palm trees on a beach in Culion, Palawan',
   alt:'Palm trees leaning over a quiet beach with clear water'},
  {file:'preview-stay.webp',id:20128161,photographer:'KD VLLJN',
   title:'Rustic hut on a tropical sea coast',
   alt:'A simple wooden hut between tropical forest and calm sea'},
  {file:'preview-sunset.webp',id:27054066,photographer:'G David',
   title:'Sunset over the sea in Puerto Princesa',
   alt:'An orange sunset over calm water in Puerto Princesa'},
  {file:'preview-maker.webp',id:23106805,photographer:'Ehsan Haque',
   title:'A vendor at a Philippine fish market',
   alt:'A smiling market vendor arranging fresh fish at her stall'},
  {file:'preview-fruits.webp',id:33571981,photographer:'Conrad Rotor',
   title:'Tropical fruit market in the Philippines',
   alt:'Tropical fruit stacked in colorful piles at a Philippine market'},
  {file:'preview-mangrove.webp',id:10218402,photographer:'Muffin Creatives',
   title:'A boat resting by the mangroves',
   alt:'A small wooden boat on still water beside green mangroves'},
];

await mkdir(mediaRoot,{recursive:true});
await mkdir(srcRoot,{recursive:true});

const records=[];
for (const photo of photos) {
  const sourceFile=path.join(srcRoot,photo.file.replace('.webp','.jpg'));
  let bytes;
  try {
    bytes=await readFile(sourceFile);
  } catch {
    const url=`https://images.pexels.com/photos/${photo.id}/pexels-photo-${photo.id}.jpeg?auto=compress&cs=tinysrgb&w=1800`;
    const response=await fetch(url);
    if (!response.ok) throw new Error(`Download failed ${photo.id}: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
    await writeFile(sourceFile,bytes);
  }
  const image=sharp(bytes).rotate();
  const meta=await image.metadata();
  const width=Math.min(meta.width||1600,1600);
  const cover=await image.clone().resize({width,withoutEnlargement:true}).webp({quality:82}).toBuffer();
  const thumb=await image.clone().resize({width:Math.min(width,520),withoutEnlargement:true}).webp({quality:70}).toBuffer();
  await writeFile(path.join(mediaRoot,photo.file),cover);
  await writeFile(path.join(mediaRoot,photo.file+'.thumb.webp'),thumb);
  records.push({
    file:photo.file,
    url:`/api/media?id=site-assets&file=${photo.file}`,
    alt:photo.alt,
    title:photo.title,
    source_url:`https://www.pexels.com/photo/${photo.id}/`,
    license:'Pexels License (free to use)',
    attribution:`Photo by ${photo.photographer} on Pexels`,
  });
  console.log(`${photo.file} ${width}px <- ${photo.photographer}`);
}

await writeFile(manifestFile,JSON.stringify(records,null,2),'utf8');
console.log(`\nWrote ${records.length} preview images and ${manifestFile}`);
