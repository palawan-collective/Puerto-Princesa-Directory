import {Readable} from 'node:stream';
import {admin,authorize,privatePreview} from '../../../lib/auth';
import {parseRows} from '../../../lib/imports';
import {
  bundledPreviewResponse,collectBytes,downloadApprovedMedia,isMediaFilename,isMediaId,maxUploadBytes,mediaResponse,openMediaZip,
  prepareMedia,removeManagedMedia,siteAssetId,withMediaWrite,writeManagedMedia,
} from '../../../lib/media';
import {approved,authorized,categoryInfo,inDestination,safeLink,str,type Media,type State} from '../../../lib/model';
import {dataDirectory,load,mutate} from '../../../lib/store';

export const runtime='nodejs';

function isReferenced(state:State,media:Media,publishedOnly=false) {
  const matches=(url?:string)=>!!url&&(url===media.url||url===media.thumbnail);
  const editorial=publishedOnly
    ?[...state.settings.collections,...state.settings.guides].filter(entry=>entry.status==='published')
    :[...state.settings.collections,...state.settings.guides];
  return matches(state.settings.branding.logo)||state.settings.destinations.some(destination=>
    (!publishedOnly||destination.status==='published')&&matches(destination.hero),
  )||editorial.some(entry=>matches(entry.cover));
}

async function serve(request:Request,head=false) {
  try {
    const params=new URL(request.url).searchParams;
    const id=params.get('id')||'',file=params.get('file')||'';
    if (!isMediaId(id)||!isMediaFilename(file)) return new Response(null,{status:404});
    const state=await load();
    const media=state.media.find(item=>item.business_id===id&&item.filename===file);
    if (!media) return new Response(null,{status:404});
    if (!await admin()) {
      if (!authorized(media.permission_status)) return new Response(null,{status:404});
      if (id===siteAssetId) {
        if (!isReferenced(state,media,true)) return new Response(null,{status:404});
      } else {
        const business=state.businesses.find(item=>item.business_id===id);
        if (!business||!categoryInfo(business,state.settings)?.visible||
          !state.settings.destinations.some(destination=>destination.status==='published'&&inDestination(business,destination))||
          !(approved(business)||(str(business.editorial_status)==='imported'&&await privatePreview()))) {
          return new Response(null,{status:404});
        }
      }
    }
    const thumbnail=params.get('thumb')==='1'&&!!media.thumbnail;
    try {
      return await mediaResponse(dataDirectory,id,file,{thumbnail,head},request.headers.get('range'));
    } catch {
      if (id===siteAssetId) return await bundledPreviewResponse(file,{thumbnail,head});
      throw Error('The media file is missing.');
    }
  } catch {
    return new Response(null,{status:404});
  }
}
export const GET=(request:Request)=>serve(request);
export const HEAD=(request:Request)=>serve(request,true);

async function boundedBody(request:Request,limit:number) {
  const message='The upload exceeds the allowed size.';
  if (!request.body) throw Error('Choose a file to upload.');
  if (Number(request.headers.get('content-length'))>limit) throw Error(message);
  return collectBytes(Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),limit,message);
}

type MediaInput={
  businessId:string;source:string;license:string;attribution:string;alt:string;permission:unknown;cover:boolean;
};
type Upload={input:MediaInput;name:string;read:()=>Promise<Buffer>;candidate?:boolean};

function mediaInput(row:Record<string,unknown>):MediaInput {
  return {
    businessId:str(row.business_id),
    source:str(row.original_source_url||row.source_url||row.source),
    license:str(row.license),
    attribution:str(row.attribution),
    alt:str(row.alt||row.alt_text),
    permission:row.reuse_permission_status||row.permission_status||row.permission,
    cover:str(row.image_type||row.type).toLowerCase()==='cover',
  };
}

function validateMetadata({source,license,attribution,alt}:Pick<MediaInput,'source'|'license'|'attribution'|'alt'>) {
  if (!source||!license) throw Error('Enter the original source or permission reference and the license.');
  if (source.length>2048||license.length>250||attribution.length>500||alt.length>500) throw Error('Media metadata is too long.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)&&!safeLink(source) ||
    /^(javascript|data|file|vbscript|blob):/i.test(source)) throw Error('Use a web URL or a plain-text permission reference for the source.');
}

async function saveUploads(uploads:Upload[]) {
  const imported:Media[]=[];
  const errors:string[]=[];
  let skipped=0;
  return withMediaWrite(async()=>{
    const created:{id:string;filename:string}[]=[];
    try {
      await mutate(async state=>{
        const makeAudit=(action:string,target:string)=>state.audit.push({at:new Date().toISOString(),action,target});
        const ids=new Set(state.businesses.map(business=>business.business_id));
        for (const upload of uploads) {
          const {businessId,source,license,attribution,alt,permission,cover}=upload.input;
          try {
            if (!isMediaId(businessId)||(businessId!==siteAssetId&&!ids.has(businessId))) throw Error('Unknown business ID.');
            if (!authorized(permission)) throw Error('Reuse permission must be approved.');
            validateMetadata(upload.input);
            const candidate=upload.candidate&&state.candidates.find(item=>item.business_id===businessId&&item.source_url===source);
            if (upload.candidate&&!candidate) throw Error('Import this URL as an image candidate before approving it.');
            const prepared=await prepareMedia(businessId,await upload.read());
            if (businessId===siteAssetId&&prepared.kind!=='image') throw Error('Upload an image for branding and destination assets.');
            const gallery=state.media.filter(item=>item.business_id===businessId);
            const existing=gallery.find(item=>item.filename===prepared.filename);
            if (existing) {
              // An explicit cover assignment still applies when an identical file already exists.
              if (cover&&!existing.cover) {
                gallery.forEach(item=>item.cover=item===existing);
                makeAudit('Changed media cover',existing.filename);
              }
              if (candidate) {
                Object.assign(candidate,{permission_status:'approved',license,attribution});
                makeAudit('Approved media candidate',source);
              }
              skipped++;
              errors.push(`${businessId} • ${upload.name}: already in the media library.`);
              continue;
            }
            created.push({id:businessId,filename:prepared.filename});
            await writeManagedMedia(dataDirectory,businessId,prepared).catch(async error=>{
              await removeManagedMedia(dataDirectory,businessId,prepared.filename).catch(()=>{});
              created.pop();
              throw error;
            });
            const useCover=cover||!gallery.some(item=>item.cover);
            if (useCover) gallery.forEach(item=>item.cover=false);
            const {filename,url,kind,thumbnail}=prepared;
            const item:Media={
              business_id:businessId,filename,url,kind,thumbnail,source_url:source,license,attribution,alt,
              permission_status:'approved',cover:useCover,
            };
            state.media.push(item);
            if (candidate) Object.assign(candidate,{permission_status:'approved',license,attribution});
            imported.push(item);
            makeAudit(candidate?'Approved media candidate':'Added media',filename);
          } catch (error) {
            skipped++;
            errors.push(`${businessId||'Missing business ID'} • ${upload.name}: ${(error as Error).message}`);
          }
        }
      });
    } catch (error) {
      await Promise.allSettled(created.map(item=>removeManagedMedia(dataDirectory,item.id,item.filename)));
      throw error;
    }
    return {imported:imported.length,skipped,errors,media:imported};
  });
}

async function importCandidate(request:Request) {
  const body=await boundedBody(request,16*1024);
  const json=JSON.parse(body.toString()) as Record<string,unknown>;
  if (!json||typeof json!=='object'||Array.isArray(json)) throw Error('Enter the image candidate details.');
  const input=mediaInput(json);
  const source=safeLink(input.source);
  if (!source||!source.startsWith('https:')) throw Error('Use a public HTTPS media URL.');
  if (!authorized(input.permission)) throw Error('Confirm approval to reuse this image.');
  input.source=source;
  validateMetadata(input);
  const state=await load();
  if (!state.businesses.some(item=>item.business_id===input.businessId)||
    !state.candidates.some(item=>item.business_id===input.businessId&&item.source_url===source)) {
    throw Error('Import this URL as an image candidate before approving it.');
  }
  const bytes=await downloadApprovedMedia(source);
  const result=await saveUploads([{input,name:'URL candidate',read:async()=>bytes,candidate:true}]);
  if (!result.imported&&!result.errors[0]?.endsWith('already in the media library.')) {
    throw Error(result.errors[0]||'The image could not be imported.');
  }
  return result;
}

async function uploadFiles(request:Request) {
  const bytes=await boundedBody(request,maxUploadBytes+1024*1024);
  const form=await new Response(new Uint8Array(bytes),{
    headers:{'Content-Type':request.headers.get('content-type')||''},
  }).formData();
  const files=form.getAll('file').filter((entry):entry is File=>typeof entry!=='string');
  if (!files.length||files.length>20) throw Error('Choose between one and 20 media files.');
  const archives=files.filter(file=>/\.zip$/i.test(file.name));
  if (archives.length) {
    if (files.length!==1) throw Error('Upload one ZIP archive at a time.');
    const zip=await openMediaZip(Buffer.from(await archives[0].arrayBuffer()));
    try {
      const rows=await parseRows('image-manifest.csv',await zip.readManifest());
      if (!rows.length||rows.length>500) throw Error('Use a manifest containing one to 500 media rows.');
      const uploads=rows.map((row,index)=>{
        const name=str(row.filename||row.image_filename);
        return {
          input:mediaInput(row),name:`Row ${index+2}${name?' • '+name:''}`,
          read:()=>zip.readAsset(str(row.relative_file_path||row.relative_path),name),
        };
      });
      return await saveUploads(uploads);
    } finally {
      zip.close();
    }
  }
  const input=mediaInput(Object.fromEntries(form));
  return saveUploads(files.map((file,index)=>({
    input:{...input,cover:input.cover&&index===0},name:file.name,read:async()=>Buffer.from(await file.arrayBuffer()),
  })));
}

export async function POST(request:Request) {
  const denied=await authorize(request);
  if (denied) return denied;
  try {
    const contentType=request.headers.get('content-type')||'';
    if (/^application\/json\b/i.test(contentType)) return Response.json(await importCandidate(request));
    if (/^multipart\/form-data\b/i.test(contentType)) return Response.json(await uploadFiles(request));
    return Response.json({error:'Choose a supported upload file or image candidate.'},{status:415});
  } catch (error) {
    return Response.json({error:(error as Error).message},{status:400});
  }
}

export async function PATCH(request:Request) {
  const denied=await authorize(request);
  if (denied) return denied;
  try {
    const json=JSON.parse((await boundedBody(request,16*1024)).toString()) as Record<string,unknown>;
    if (!json||typeof json!=='object'||Array.isArray(json)) throw Error('Choose a media file.');
    const businessId=str(json.business_id),filename=str(json.filename),action=str(json.action)||'cover';
    if (!isMediaId(businessId)||!isMediaFilename(filename)||!['cover','up','down','delete','metadata'].includes(action)) {
      throw Error('Invalid media action.');
    }
    return await withMediaWrite(async()=>{
      const outcome=await mutate(state=>{
        const gallery=state.media.flatMap((item,index)=>item.business_id===businessId?[index]:[]);
        const position=gallery.findIndex(index=>state.media[index].filename===filename);
        if (position<0) return {error:'Media file not found.',status:404};
        const index=gallery[position],item=state.media[index];
        if (action==='delete') {
          if (businessId===siteAssetId&&isReferenced(state,item)) {
            return {error:'Remove this image from branding or destination settings before deleting it.',status:409};
          }
          state.media.splice(index,1);
          if (item.cover) {
            const remaining=state.media.filter(media=>media.business_id===businessId);
            const next=remaining.find(media=>media.kind!=='video')||remaining[0];
            if (next) next.cover=true;
          }
        } else if (action==='cover') {
          gallery.forEach(i=>state.media[i].cover=i===index);
        } else if (action==='metadata') {
          const metadata={
            source:json.source_url===undefined?item.source_url:str(json.source_url),
            license:json.license===undefined?item.license:str(json.license),
            attribution:json.attribution===undefined?item.attribution:str(json.attribution),
            alt:json.alt===undefined?item.alt||'':str(json.alt),
          };
          validateMetadata(metadata);
          Object.assign(item,{source_url:metadata.source,license:metadata.license,attribution:metadata.attribution,alt:metadata.alt});
        } else {
          const next=gallery[position+(action==='up'?-1:1)];
          if (next===undefined) return {ok:true,media:item};
          [state.media[next],state.media[index]]=[state.media[index],state.media[next]];
        }
        const labels:Record<string,string>={cover:'Changed media cover',up:'Reordered media',down:'Reordered media',delete:'Deleted media',metadata:'Updated media metadata'};
        state.audit.push({at:new Date().toISOString(),action:labels[action],target:filename});
        return {ok:true,media:item};
      });
      if (outcome.error) return Response.json({error:outcome.error},{status:outcome.status});
      if (action==='delete') {
        try {
          await removeManagedMedia(dataDirectory,businessId,filename);
        } catch {
          return Response.json({ok:true,warning:'The media was removed from the library. A local file could not be cleaned up.'});
        }
      }
      return Response.json(outcome);
    });
  } catch (error) {
    return Response.json({error:(error as Error).message},{status:400});
  }
}
