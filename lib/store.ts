import {Pool} from 'pg';import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';import path from 'node:path';import {defaultSettings,type State,type Business,type Media,type Destination} from './model';import seed from '../data/businesses.json';import {withPreviewEditorial} from './preview-content';

export const dataDirectory=process.env.ISLAVISTA_DATA_DIR || path.join(process.cwd(),'.local-data');
const databaseUrl=process.env.DATABASE_URL?.includes('ep-fragrant-rice')?'postgresql://neondb_owner:npg_EZtfku6csJ8V@ep-fragrant-rice-biythn8g.c-5.ap-southeast-1.aws.neon.tech/neondb?sslmode=require':process.env.DATABASE_URL;
const dir=dataDirectory;const file=path.join(dir,'directory.json');let pool:Pool|undefined;let initialized:Promise<void>|undefined;

function getPool(){if(!databaseUrl)return null;pool??=new Pool({connectionString:databaseUrl});return pool;}

const initial=():State=>withPreviewEditorial({businesses:seed as State['businesses'],media:[],candidates:[],settings:structuredClone(defaultSettings),audit:[],imports:[],analytics:[]});

async function loadFromDb():Promise<{businesses:Business[];media:Media[]}|null>{
  const p=getPool();if(!p)return null;
  try{
    const [bizRes,mediaRes]=await Promise.all([
      p.query('SELECT * FROM businesses'),
      p.query('SELECT * FROM media'),
    ]);
    // Map Neon media columns to app Media type
    const media=mediaRes.rows.map((m:any)=>({
      business_id:m.business_id,filename:m.filename,url:m.url,source_url:m.source_url||'',license:m.license||'',attribution:m.attribution||'',permission_status:m.permission_status||'approved',cover:m.cover??true,alt:m.alt||m.image_alt||'',kind:m.kind||'image',thumbnail:m.thumbnail||undefined,
    }));
    return {businesses:bizRes.rows as Business[],media};
  }catch(e){console.error('DB load failed:',e);return null;}
}

function hydrate(s:State):State{return withPreviewEditorial({...s,settings:{...structuredClone(defaultSettings),...s.settings},audit:s.audit||[],imports:s.imports||[],analytics:s.analytics||[]})}

export async function load():Promise<State>{
  const dbData=await loadFromDb();
  let state:State;
  const p=getPool();
  if(p){
    try{
      const r=await p.query('SELECT payload FROM directory_workspace WHERE id=1');
      state=hydrate(r.rows[0].payload);
    }catch(e){
      if((e as any).code==='42P01') state=initial();
      else throw e;
    }
  }else{
    try{state=hydrate(JSON.parse(await readFile(file,'utf8')));}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return initial();throw e;}
  }
  if(dbData){
    if(dbData.businesses.length) state.businesses=dbData.businesses;
    if(dbData.media.length) state.media=dbData.media;
  }
  return state;
}

const queue=globalThis as typeof globalThis & {islaWriteQueue?:Promise<void>};
export async function mutate<T>(fn:(s:State)=>T|Promise<T>):Promise<T>{
  const p=getPool();
  if(p){
    const c=await p.connect();
    try{
      await c.query('BEGIN');
      const r=await c.query('SELECT payload FROM directory_workspace WHERE id=1 FOR UPDATE');
      let s:State;
      if(r.rows.length){
        s=hydrate(r.rows[0].payload);
      }else{
        s=initial();
        await c.query('INSERT INTO directory_workspace(id,payload) VALUES(1,$1)',[JSON.stringify(s)]);
      }
      // Override with DB data
      const [bizRes,mediaRes]=await Promise.all([
        c.query('SELECT * FROM businesses'),
        c.query('SELECT * FROM media'),
      ]);
      if(bizRes.rows.length) s.businesses=bizRes.rows as Business[];
      if(mediaRes.rows.length) s.media=mediaRes.rows.map((m:any)=>({business_id:m.business_id,filename:m.filename,url:m.url,source_url:m.source_url||'',license:m.license||'',attribution:m.attribution||'',permission_status:m.permission_status||'approved',cover:m.cover??true,alt:m.alt||'',kind:m.kind||'image',thumbnail:m.thumbnail||undefined}));
      const result=await fn(s);
      // Write settings/collections/guides/etc back to JSON blob
      await c.query('UPDATE directory_workspace SET payload=$1 WHERE id=1',[JSON.stringify(s)]);
      // Sync businesses to Neon (batched upserts)
      try{
        const bizCols=['business_id','name','category','subcategory','directory_category','destination','municipality','barangay','address','latitude','longitude','phone','email','website','facebook','instagram','whatsapp','description','opening_hours','amenities','services','editorial_status','operating_status','featured','source_url','source_id','license','confidence','verification_date','merqato_opportunity','has_online_booking','has_online_ordering','has_digital_payments','social_media_presence','website_available','mobile_responsive','image_permissions','photo_url','logo_url','extra'];
        const batchSize=100;
        for(let i=0;i<s.businesses.length;i+=batchSize){
          const batch=s.businesses.slice(i,i+batchSize);
          const placeholders=batch.map((_,ri)=>`(${bizCols.map((_,ci)=>`$${ri*bizCols.length+ci+1}`).join(',')})`).join(',');
          const updates=bizCols.filter(c=>c!=='business_id').map(c=>`${c}=EXCLUDED.${c}`).join(',');
          const values=batch.flatMap(b=>bizCols.map(c=>(b as any)[c]??null));
          await c.query(`INSERT INTO businesses (${bizCols.join(',')}) VALUES ${placeholders} ON CONFLICT (business_id) DO UPDATE SET ${updates}`,values);
        }
      }catch(e){console.error('Business sync failed:',e);}
      // Sync media to Neon
      try{
        for(const m of s.media){
          await c.query(`INSERT INTO media (business_id,filename,url,source_url,license,attribution,permission_status,cover) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,[m.business_id,m.filename,m.url,m.source_url,m.license,m.attribution,m.permission_status,m.cover]);
        }
      }catch(e){console.error('Media sync failed:',e);}
      await c.query('COMMIT');
      return result;
    }catch(e){await c.query('ROLLBACK');throw e;}
    finally{c.release();}
  }
  if(process.env.VERCEL)throw Error('Configure DATABASE_URL for persistent writes on Vercel');
  const work=(queue.islaWriteQueue||Promise.resolve()).then(async()=>{
    const s=await load();const result=await fn(s);
    await mkdir(dir,{recursive:true,mode:0o700});
    await writeFile(file+'.tmp',JSON.stringify(s),{mode:0o600});
    await rename(file+'.tmp',file);
    return result;
  });
  queue.islaWriteQueue=work.then(()=>{},()=>{});
  return work;
}
