import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import ipaddr from 'ipaddr.js';
import {safeLink} from './model';

export type LinkImage={url:string;size:number;source:string};

const imageHosts=/(bstatic\.com|googleusercontent\.com|twimg\.com|unsplash\.com|pexels\.com|pixabay\.com|cloudinary\.com|wp-content|imagekit\.io)/i;
const junk=/(favicon|logo|icon|flag|sprite|avatar|emoji|placeholder|blank|pixel|button|banner_?ad)/i;
const maxHtml=4*1024*1024;

function publicIp(address:string) {
  try {
    const parsed=ipaddr.process(address);
    if (parsed.range()!=='unicast') return false;
    return parsed.kind()==='ipv4'||(parsed as ipaddr.IPv6).match(ipaddr.IPv6.parse('2000::'),3);
  } catch { return false; }
}

async function publicAddress(hostname:string,signal:AbortSignal) {
  if (isIP(hostname)) {
    if (!publicIp(hostname)) throw Error('Use a public HTTPS link.');
    return hostname;
  }
  if (!hostname.includes('.')||/\.(?:localhost|local|internal|test)\.?$/i.test(hostname)) throw Error('Use a public HTTPS link.');
  const addresses=await new Promise<{address:string}[]>((resolve,reject)=>{
    const abort=()=>reject(Error('The link timed out.'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort',abort,{once:true});
    lookup(hostname,{all:true}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
  if (!addresses.length||addresses.some(({address})=>!publicIp(address))) throw Error('Use a public HTTPS link.');
  return addresses[0].address;
}

function requestHtml(url:URL,address:string,signal:AbortSignal) {
  return new Promise<NodeJS.ReadableStream>((resolve,reject)=>{
    const host=url.hostname.replace(/^\[|\]$/g,'');
    const req=httpsRequest({
      hostname:address,port:443,agent:false,method:'GET',path:url.pathname+url.search,signal,
      servername:isIP(host)?undefined:host,
      headers:{Host:url.host,Accept:'text/html,application/xhtml+xml', 'User-Agent':'IslaVista directory image importer (+https://merqato.digital)', 'Accept-Language':'en-US,en;q=0.9'},
    },resolve);
    req.once('error',reject);
    req.end();
  });
}

async function readHtml(response:NodeJS.ReadableStream) {
  let size=0;
  const chunks:Buffer[]=[];
  for await (const chunk of response) {
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=bytes.length;
    if (size>maxHtml) throw Error('The page is too large to scan.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function clean(value:string) {
  return value.replace(/\\\//g,'/').replace(/\\u002F/gi,'/').replace(/&amp;/g,'&').replace(/^\s+|\s+$/g,'');
}

function score(url:string) {
  const match=url.match(/(?:^|[^0-9])(\d{3,4})[xX](\d{3,4})/);
  if (match) return Number(match[1])*Number(match[2]);
  const wide=url.match(/(?:w=|width=)(\d{3,4})/i);
  return wide?Number(wide[1])*1000:0;
}

export async function extractLinkImages(raw:string):Promise<LinkImage[]> {
  const url=URL.parse(safeLink(raw));
  if (!url||url.protocol!=='https:'||url.port||url.username||url.password) throw Error('Paste a public https:// link.');
  const signal=AbortSignal.timeout(18_000);
  let current=url;
  let html='';
  for (let redirects=0;redirects<=3;redirects++) {
    const address=await publicAddress(current.hostname.replace(/^\[|\]$/g,''),signal);
    const response=await requestHtml(current,address,signal);
    const status=Number((response as {statusCode?:number}).statusCode||200);
    if ([301,302,303,307,308].includes(status)) {
      const next=(response as {headers?:Record<string,unknown>}).headers?.location;
      (response as {destroy?:()=>void}).destroy?.();
      if (!next) throw Error('The link redirected without a destination.');
      const target=URL.parse(safeLink(new URL(String(next),current).href));
      if (!target) throw Error('The link redirected to an invalid address.');
      current=target;
      continue;
    }
    if (status!==200) { (response as {destroy?:()=>void}).destroy?.(); throw Error('The link returned HTTP '+status+'. Add ?aid=... or use the business website instead.'); }
    html=await readHtml(response as NodeJS.ReadableStream);
    break;
  }
  if (!html) throw Error('No page content was returned.');
  const candidates=new Set<string>();
  for (const pattern of [
    /<meta[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi,
    /https?:\\?\/\\?\/[^"'<>\s\\]+/gi,
  ]) {
    for (const match of html.matchAll(pattern)) {
      const value=clean(match[1]||match[0]);
      if (!value) continue;
      const absolute=value.startsWith('//')?'https:'+value:value;
      const parsed=URL.parse(absolute);
      if (!parsed||parsed.protocol!=='https:') continue;
      const href=parsed.href;
      if (junk.test(href)) continue;
      if (!/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(href)&&!imageHosts.test(href)) continue;
      candidates.add(href);
    }
  }
  const byPath=new Map<string,string>();
  for (const href of candidates) {
    const key=new URL(href).pathname.replace(/\.[^.]+$/,'');
    const previous=byPath.get(key);
    if (!previous||score(href)>score(previous)) byPath.set(key,href);
  }
  const images=[...byPath.values()].map(url=>({url,size:score(url),source:current.hostname})).sort((a,b)=>b.size-a.size).slice(0,12);
  if (!images.length) throw Error('No usable images were found on that page. Try the business website or a gallery/city page.');
  return images;
}
