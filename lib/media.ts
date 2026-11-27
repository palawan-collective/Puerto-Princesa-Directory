import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {mkdir,mkdtemp,open,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {request as httpsRequest} from 'node:https';
import type {IncomingMessage} from 'node:http';
import {isIP} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {promisify} from 'node:util';
import ipaddr from 'ipaddr.js';
import sharp from 'sharp';
import {fromBufferPromise,type Entry} from 'yauzl';

const MiB=1024*1024;
export const maxUploadBytes=50*MiB;
const maxImageBytes=20*MiB;
const maxExpandedZipBytes=256*MiB;
const maxZipEntries=1500;
const maxManifestBytes=512*1024;
const maxPixels=30_000_000;
const run=promisify(execFile);
const imageFormats=new Set(['jpeg','png','webp','gif','heif','tiff']);
const avifBrands=new Set(['avif','avis']);
const heifBrands=new Set(['avif','avis','heic','heix','hevc','hevx','mif1','msf1']);
const pngSignature=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const types={webp:'image/webp',mp4:'video/mp4',webm:'video/webm'} as const;
type Extension=keyof typeof types;

type PreparedMedia={
  kind:'image'|'video';
  filename:string;
  url:string;
  thumbnail:string;
  bytes:Buffer;
  preview:Buffer;
};

export const siteAssetId='site-assets';
export const isMediaId=(id:string)=>/^[A-Za-z0-9_-]{1,100}$/.test(id);
export const isMediaFilename=(file:string)=>/^[-\w]{1,130}\.(webp|mp4|webm)$/.test(file);

const queue=globalThis as typeof globalThis & {islaMediaQueue?:Promise<void>};
export function withMediaWrite<T>(operation:()=>Promise<T>) {
  const task=(queue.islaMediaQueue||Promise.resolve()).then(operation);
  queue.islaMediaQueue=task.then(()=>{},()=>{});
  return task;
}

function mediaPath(root:string,id:string,filename:string,thumbnail=false) {
  if (!isMediaId(id)||!isMediaFilename(filename)) throw Error('Invalid media path.');
  return path.join(root,'images',id,filename+(thumbnail?'.thumb.webp':''));
}

function fileTypeBrands(bytes:Buffer) {
  if (bytes.length<16||bytes.toString('latin1',4,8)!=='ftyp') return [];
  const boxSize=bytes.readUInt32BE(0);
  if (boxSize<16||boxSize>bytes.length||boxSize>4096||boxSize%4!==0) return [];
  const brands=[bytes.toString('latin1',8,12)];
  for (let offset=16;offset<boxSize;offset+=4) brands.push(bytes.toString('latin1',offset,offset+4));
  return brands;
}

function videoExtension(bytes:Buffer,brands:string[]):'mp4'|'webm'|undefined {
  if (brands.length&&brands[0]!=='qt  '&&!brands.some(brand=>heifBrands.has(brand))) return 'mp4';
  if (bytes.length<10||bytes.readUInt32BE(0)!==0x1a45dfa3) return;
  const header=bytes.subarray(4,Math.min(4096,bytes.length));
  const length=readEbmlInteger(header,0,true);
  if (!length||length.size+length.value>header.length) return;
  const end=length.size+length.value;
  for (let cursor=length.size;cursor<end;) {
    const id=readEbmlInteger(header,cursor,false);
    if (!id) return;
    cursor+=id.size;
    const size=readEbmlInteger(header,cursor,true);
    if (!size) return;
    cursor+=size.size;
    if (cursor+size.value>end) return;
    if (id.value===0x4282) return header.toString('ascii',cursor,cursor+size.value)==='webm'?'webm':undefined;
    cursor+=size.value;
  }
}

function readEbmlInteger(bytes:Buffer,offset:number,stripWidth:boolean) {
  const first=bytes[offset];
  if (!first) return;
  const size=Math.clz32(first)-23;
  if (size>4||offset+size>bytes.length) return;
  let value=stripWidth?first&((1<<(8-size))-1):first;
  for (let i=1;i<size;i++) value=value*256+bytes[offset+i];
  return {size,value};
}

async function videoPreview(bytes:Buffer,extension:'mp4'|'webm') {
  const scratch=await mkdtemp(path.join(tmpdir(),'islavista-video-'));
  const input=path.join(scratch,'input.'+extension), output=path.join(scratch,'thumbnail.png');
  const demuxer=extension==='mp4'?'mov':'matroska';
  const inputOptions=['-protocol_whitelist','file','-f',demuxer,'-probesize','5000000','-analyzeduration','5000000',
    ...(extension==='mp4'?['-enable_drefs','0','-use_absolute_path','0']:[]),
  ];
  const settings={timeout:20_000,maxBuffer:256*1024,killSignal:'SIGKILL' as const};
  try {
    await writeFile(input,bytes);
    const {stdout}=await run('ffprobe',[
      '-v','error',...inputOptions,'-select_streams','V:0','-show_entries',
      'stream=index,width,height,codec_name:format=duration','-of','json',input,
    ],settings);
    const probe=JSON.parse(stdout) as {
      streams?: {index?:number;width?:number;height?:number;codec_name?:string}[];
      format?: {duration?:string};
    };
    const stream=probe.streams?.[0], duration=Number(probe.format?.duration);
    const width=stream?.width||0,height=stream?.height||0;
    const codecs=extension==='mp4'?['h264','av1']:['vp8','vp9','av1'];
    if (stream?.index===undefined||!codecs.includes(stream.codec_name||'')) throw Error('Unsupported video codec. Use H.264 MP4 or VP8/VP9 WebM.');
    if (!width||!height||Math.max(width,height)>3840||width*height>8_294_400||!(duration>0&&duration<=300)) {
      throw Error('Use a video up to 4K and five minutes long.');
    }
    await run('ffmpeg',[
      '-v','error','-nostdin','-xerror','-threads','2',...inputOptions,'-i',input,
      '-map','0:'+stream.index,'-frames:v','1','-vf','scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2',
      '-filter_threads','1','-threads','1',output,
    ],settings);
    return await sharp(await readFile(output),{limitInputPixels:maxPixels}).webp({quality:78}).toBuffer();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code==='ENOENT') throw Error('Video uploads require FFmpeg and FFprobe on this computer.');
    const message=(error as Error).message;
    if (message.startsWith('Unsupported video codec.')||message.startsWith('Use a video up to')) throw error;
    throw Error('The video could not be decoded. Choose a valid MP4 or WebM file.');
  } finally {
    await rm(scratch,{force:true,recursive:true});
  }
}

function hasRasterSignature(bytes:Buffer,brands:string[]) {
  const first=bytes.toString('latin1',0,4);
  return brands.some(brand=>avifBrands.has(brand)) ||
    bytes.subarray(0,8).equals(pngSignature) ||
    (bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) ||
    (first==='RIFF'&&bytes.toString('latin1',8,12)==='WEBP') ||
    ['GIF87a','GIF89a'].includes(bytes.toString('latin1',0,6)) ||
    ['II*\0','MM\0*','II+\0','MM\0+'].includes(first);
}

async function optimizeImage(input:Buffer,brands:string[]) {
  if (input.length>maxImageBytes) throw Error('Images must be 20 MB or smaller.');
  const invalid='Choose a supported raster image with at most 30 million pixels (JPEG, PNG, WebP, GIF, AVIF or TIFF).';
  if (!hasRasterSignature(input,brands)) throw Error(invalid);
  try {
    const image=sharp(input,{limitInputPixels:maxPixels,failOn:'warning'});
    const metadata=await image.metadata();
    if (!metadata.format||!imageFormats.has(metadata.format)||(metadata.format==='heif'&&metadata.compression!=='av1')||
      !metadata.width||!metadata.height||metadata.width*metadata.height>maxPixels) {
      throw Error('Unsupported or oversized image.');
    }
    return await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
  } catch {
    throw Error(invalid);
  }
}

export async function prepareMedia(id:string,input:Buffer):Promise<PreparedMedia> {
  if (!isMediaId(id)) throw Error('Invalid business ID.');
  if (!input.length||input.length>maxUploadBytes) throw Error('Choose a media file up to 50 MB.');
  const brands=fileTypeBrands(input);
  const video=videoExtension(input,brands);
  const extension=video||'webp';
  const bytes=video?input:await optimizeImage(input,brands);
  const preview=video
    ? await videoPreview(input,video)
    : await sharp(bytes).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,24);
  const filename=id+'-'+hash+'.'+extension;
  const url='/api/media?id='+encodeURIComponent(id)+'&file='+encodeURIComponent(filename);
  return {kind:video?'video':'image',filename,url,thumbnail:url+'&thumb=1',bytes,preview};
}

async function writeAtomic(target:string,bytes:Buffer) {
  const temporary=target+'.'+randomUUID()+'.tmp';
  try {
    await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});
    await rename(temporary,target);
  } finally {
    await rm(temporary,{force:true});
  }
}

export async function writeManagedMedia(root:string,id:string,media:PreparedMedia) {
  const target=mediaPath(root,id,media.filename);
  await mkdir(path.dirname(target),{recursive:true});
  await writeAtomic(mediaPath(root,id,media.filename,true),media.preview);
  await writeAtomic(target,media.bytes);
}

export async function removeManagedMedia(root:string,id:string,filename:string) {
  await Promise.all([
    rm(mediaPath(root,id,filename),{force:true}),
    rm(mediaPath(root,id,filename,true),{force:true}),
  ]);
}

function getRange(value:string,length:number) {
  const parts=/^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!parts||!length||(!parts[1]&&!parts[2])) return;
  if (!parts[1]) {
    const suffix=Number(parts[2]);
    if (!Number.isSafeInteger(suffix)||suffix<=0) return;
    return {start:Math.max(0,length-suffix),end:length-1};
  }
  const start=Number(parts[1]),end=parts[2]?Math.min(Number(parts[2]),length-1):length-1;
  if (!Number.isSafeInteger(start)||start<0||start>=length||end<start) return;
  return {start,end};
}

export async function mediaResponse(root:string,id:string,filename:string,options:{thumbnail?:boolean;head?:boolean}={},rangeHeader?:string|null) {
  const file=await open(mediaPath(root,id,filename,options.thumbnail),'r');
  let streaming=false;
  try {
    const {size}=await file.stat();
    const type=types[options.thumbnail?'webp':path.extname(filename).slice(1) as Extension];
    const range=rangeHeader?getRange(rangeHeader,size):undefined;
    const headers=new Headers({
      'Content-Type':type,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'Accept-Ranges':'bytes',
    });
    if (rangeHeader&&!range) {
      headers.set('Content-Range','bytes */'+size);
      return new Response(null,{status:416,headers});
    }
    headers.set('Content-Length',String(range?range.end-range.start+1:size));
    if (range) headers.set('Content-Range',`bytes ${range.start}-${range.end}/${size}`);
    const status=range?206:200;
    if (options.head) return new Response(null,{status,headers});
    const stream=file.createReadStream({...range,autoClose:true});
    const response=new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{status,headers});
    streaming=true;
    return response;
  } finally {
    // Read streams close their own descriptor on completion or cancellation.
    if (!streaming) await file.close();
  }
}

export async function collectBytes(stream:AsyncIterable<Uint8Array>,limit:number,message:string) {
  const chunks:Buffer[]=[];
  let total=0;
  for await (const chunk of stream) {
    total+=chunk.byteLength;
    if (total>limit) throw Error(message);
    chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  }
  return Buffer.concat(chunks,total);
}

function archivePath(name:string) {
  if (!name||name.length>512||/[\\\x00-\x1F\x7F:\uFFFD]/.test(name)) return false;
  return name.split('/').every(piece=>piece&&piece!=='.'&&piece!=='..');
}

export async function openMediaZip(bytes:Buffer) {
  if (bytes.length>maxUploadBytes) throw Error('ZIP files must be 50 MB or smaller.');
  const zip=await fromBufferPromise(bytes,{autoClose:false,lazyEntries:true,validateEntrySizes:true,strictFileNames:true});
  try {
    if (zip.entryCount>maxZipEntries) throw Error('Too many ZIP entries. Split the archive into smaller batches.');
    const entries=new Map<string,Entry>();
    const basenames=new Map<string,Entry[]>();
    let total=0;
    for await (const entry of zip.eachEntry()) {
      const filename=entry.fileName, directory=filename.endsWith('/');
      const mode=entry.externalFileAttributes>>>16&0o170000;
      if (!archivePath(directory?filename.slice(0,-1):filename)||(mode&&mode!==(directory?0o040000:0o100000))) {
        throw Error('ZIP contains an unsafe path or unsupported file entry.');
      }
      if (directory) continue;
      total+=entry.uncompressedSize;
      if (entry.uncompressedSize>maxUploadBytes||total>maxExpandedZipBytes) throw Error('ZIP exceeds the decompression limits.');
      if (!entry.canDecodeFileData()) throw Error('ZIP contains an encrypted or unsupported file entry.');
      if (entries.has(filename)) throw Error('ZIP contains duplicate paths.');
      entries.set(filename,entry);
      const base=path.posix.basename(filename);
      const matches=basenames.get(base)||[];
      matches.push(entry);
      basenames.set(base,matches);
    }
    const manifests=[...entries.values()].filter(e=>path.posix.basename(e.fileName).toLowerCase()==='image-manifest.csv');
    if (manifests.length!==1) throw Error('ZIP must contain exactly one image-manifest.csv.');
    const manifest=manifests[0];
    let expanded=0;
    async function read(entry:Entry,limit:number) {
      if (entry.uncompressedSize>limit) throw Error('ZIP entry is too large.');
      if (expanded+entry.uncompressedSize>maxExpandedZipBytes) throw Error('ZIP exceeds the decompression limits.');
      expanded+=entry.uncompressedSize;
      return collectBytes(await zip.openReadStreamPromise(entry),limit,'ZIP entry is too large.');
    }
    return {
      close:()=>zip.close(),
      readManifest:()=>read(manifest,maxManifestBytes),
      async readAsset(relative:string,filename:string) {
        let entry:Entry|undefined;
        if (relative) {
          if (!archivePath(relative)) throw Error('Manifest contains an unsafe relative path.');
          entry=entries.get(path.posix.join(path.posix.dirname(manifest.fileName),relative))||entries.get(relative);
        } else {
          if (!archivePath(filename)||filename.includes('/')) throw Error('Manifest contains an unsafe filename.');
          const matches=basenames.get(filename)||[];
          if (matches.length>1) throw Error('More than one ZIP file has this name. Specify its relative file path.');
          entry=matches[0];
        }
        if (!entry||entry===manifest) throw Error('Missing media file in ZIP.');
        return read(entry,maxUploadBytes);
      },
    };
  } catch (error) {
    zip.close();
    throw error;
  }
}

function publicIp(address:string) {
  const parsed=ipaddr.process(address);
  if (parsed.range()!=='unicast') return false;
  return parsed.kind()==='ipv4'||(parsed as ipaddr.IPv6).match(ipaddr.IPv6.parse('2000::'),3);
}

async function publicAddress(hostname:string,signal:AbortSignal) {
  if (isIP(hostname)) {
    if (!publicIp(hostname)) throw Error('Use a public HTTPS media URL.');
    return hostname;
  }
  if (!hostname.includes('.')||/\.(?:localhost|local|internal|test)\.?$/i.test(hostname)) throw Error('Use a public HTTPS media URL.');
  const addresses=await new Promise<{address:string;family:number}[]>((resolve,reject)=>{
    const abort=()=>reject(Error('The media download timed out.'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort',abort,{once:true});
    lookup(hostname,{all:true}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
  if (!addresses.length||addresses.some(({address})=>!publicIp(address))) throw Error('Use a public HTTPS media URL.');
  return addresses[0].address;
}

function requestMedia(url:URL,address:string,signal:AbortSignal) {
  return new Promise<IncomingMessage>((resolve,reject)=>{
    const hostname=url.hostname.replace(/^\[|\]$/g,'');
    const request=httpsRequest({
      hostname:address,port:443,agent:false,method:'GET',path:url.pathname+url.search,signal,
      servername:isIP(hostname)?undefined:hostname,
      headers:{Host:url.host,Accept:'image/*, video/mp4, video/webm, application/octet-stream'},
    },resolve);
    request.once('error',reject);
    request.end();
  });
}

export async function downloadApprovedMedia(source:string) {
  let current=source;
  const signal=AbortSignal.timeout(15_000);
  for (let redirects=0;redirects<=3;redirects++) {
    const url=URL.parse(current);
    if (!url||url.protocol!=='https:'||url.port||url.username||url.password) throw Error('Use a public HTTPS media URL.');
    const address=await publicAddress(url.hostname.replace(/^\[|\]$/g,''),signal);
    const response=await requestMedia(url,address,signal);
    if ([301,302,303,307,308].includes(response.statusCode||0)&&response.headers.location) {
      response.destroy();
      current=new URL(response.headers.location,url).href;
      continue;
    }
    const type=String(response.headers['content-type']||'').split(';')[0].toLowerCase().trim();
    const encoding=response.headers['content-encoding'];
    if (response.statusCode!==200||(type&&!/^(image\/[-\w.+]+|video\/(mp4|webm)|application\/octet-stream)$/.test(type))||
      (encoding&&encoding!=='identity')||Number(response.headers['content-length'])>maxUploadBytes) {
      response.destroy();
      throw Error('The URL did not return a supported media file up to 50 MB.');
    }
    return collectBytes(response,maxUploadBytes,'The media download exceeded 50 MB.');
  }
  throw Error('The media URL redirected too many times.');
}
