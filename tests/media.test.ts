import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import * as media from '../lib/media.ts';

test('optimizes a raster upload, preserves its aspect ratio, and creates a thumbnail', async () => {
  const bytes=await sharp({create:{width:1800,height:900,channels:3,background:'#124F3A'}}).png().toBuffer();
  assert.ok('prepareMedia' in media, 'Managed uploads must produce optimized media and thumbnails');
  const prepared=await media.prepareMedia('BIZ-1',bytes);
  assert.equal(prepared.kind,'image');
  assert.match(prepared.filename,/^BIZ-1-[a-f0-9]{24}\.webp$/);
  const main=await sharp(prepared.bytes).metadata(), thumbnail=await sharp(prepared.preview).metadata();
  assert.deepEqual([main.format,main.width,main.height],['webp',1600,800]);
  assert.deepEqual([thumbnail.format,thumbnail.width,thumbnail.height],['webp',480,240]);
  assert.equal((await media.prepareMedia('BIZ-1',bytes)).filename,prepared.filename);
});

test('rejects SVG and content masquerading as a video', async () => {
  assert.ok('prepareMedia' in media, 'Managed uploads must validate decoded media types');
  await assert.rejects(media.prepareMedia('BIZ-1',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')),/supported raster image/i);
  await assert.rejects(media.prepareMedia('BIZ-1',Buffer.from('fake mp4 bytes')),/supported raster image/i);
});

test('treats AVIF containers as raster images', async () => {
  const input=await sharp({create:{width:80,height:50,channels:3,background:'#124F3A'}}).avif().toBuffer();
  const prepared=await media.prepareMedia('BIZ-1',input);
  assert.equal(prepared.kind,'image');
  assert.equal((await sharp(prepared.bytes).metadata()).format,'webp');
});

test('reads only the requested bytes of a validated MP4 and removes its derivatives', async t => {
  const directory=await mkdtemp(path.join(tmpdir(),'islavista-media-test-'));
  t.after(()=>rm(directory,{force:true,recursive:true}));
  assert.ok('mediaResponse' in media, 'Managed videos must support browser byte-range requests');
  const input=path.join(directory,'input.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:d=0.5','-c:v','libx264','-pix_fmt','yuv420p',input]);
  const source=await readFile(input);
  const prepared=await media.prepareMedia('BIZ-1',source);
  assert.equal(prepared.kind,'video');
  assert.equal((await sharp(prepared.preview).metadata()).format,'webp');
  await media.writeManagedMedia(directory,'BIZ-1',prepared);
  const range=await media.mediaResponse(directory,'BIZ-1',prepared.filename,{},'bytes=10-19');
  assert.equal(range.status,206);
  assert.equal(range.headers.get('content-range'),`bytes 10-19/${source.length}`);
  assert.equal(range.headers.get('content-type'),'video/mp4');
  assert.deepEqual(Buffer.from(await range.arrayBuffer()),source.subarray(10,20));
  const unsatisfiable=await media.mediaResponse(directory,'BIZ-1',prepared.filename,{},`bytes=${source.length}-`);
  assert.equal(unsatisfiable.status,416);
  const thumbnail=await media.mediaResponse(directory,'BIZ-1',prepared.filename,{thumbnail:true});
  assert.equal(thumbnail.headers.get('content-type'),'image/webp');
  await thumbnail.arrayBuffer();
  await media.removeManagedMedia(directory,'BIZ-1',prepared.filename);
  await assert.rejects(media.mediaResponse(directory,'BIZ-1',prepared.filename), {code:'ENOENT'});
  await assert.rejects(media.mediaResponse(directory,'BIZ-1',prepared.filename,{thumbnail:true}), {code:'ENOENT'});
});

test('validates and thumbnails WebM video', async t => {
  const directory=await mkdtemp(path.join(tmpdir(),'islavista-media-test-'));
  t.after(()=>rm(directory,{force:true,recursive:true}));
  const input=path.join(directory,'input.webm');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:d=0.5','-c:v','libvpx-vp9',input]);
  const source=await readFile(input);
  const prepared=await media.prepareMedia('BIZ-1',source);
  assert.equal(prepared.kind,'video');
  assert.match(prepared.filename,/\.webm$/);
  assert.equal((await sharp(prepared.preview).metadata()).format,'webp');
});

test('indexes a ZIP relative path and rejects an ambiguous fallback filename', async () => {
  assert.ok('openMediaZip' in media, 'Bulk uploads must validate and index ZIP manifests');
  const zip=new JSZip();
  zip.file('assets/image-manifest.csv','business_id,filename');
  zip.file('assets/a/same.png','first');
  zip.file('assets/b/same.png','second');
  const archive=await media.openMediaZip(await zip.generateAsync({type:'nodebuffer'}));
  try {
    assert.equal((await archive.readAsset('a/same.png','same.png')).toString(),'first');
    await assert.rejects(archive.readAsset('','same.png'),/more than one ZIP file/i);
    await assert.rejects(archive.readAsset('../same.png','same.png'),/unsafe/i);
  } finally { archive.close(); }
});

test('refuses ZIP archives containing traversal paths', async () => {
  assert.ok('openMediaZip' in media, 'Bulk uploads must reject traversal');
  const zip=new JSZip();
  zip.file('image-manifest.csv','business_id,filename');
  zip.file('../escape.png','unsafe');
  await assert.rejects(media.openMediaZip(await zip.generateAsync({type:'nodebuffer'})),/relative path|unsafe/i);
});

test('rejects insecure and local remote media URLs before downloading', async () => {
  assert.ok('downloadApprovedMedia' in media, 'Approved URL imports must reject insecure and internal destinations');
  for (const source of ['http://example.org/image.jpg','https://user:pass@example.org/image.jpg','https://127.0.0.1/image.jpg','https://169.254.169.254/image.jpg','https://[::ffff:127.0.0.1]/image.jpg','https://localhost/image.jpg']) {
    await assert.rejects(media.downloadApprovedMedia(source),/HTTPS|public/i);
  }
});
