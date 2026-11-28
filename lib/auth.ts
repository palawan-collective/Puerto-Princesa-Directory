import {createHmac,timingSafeEqual} from 'node:crypto';
import {cookies,headers} from 'next/headers';

function eq(a:string,b:string) {
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
function sign(value:string) {
  return createHmac('sha256',process.env.SESSION_SECRET||'').update(value).digest('hex');
}
export function verifyPassword(password:string) {
  return !!process.env.ADMIN_PASSWORD && !!process.env.SESSION_SECRET && eq(password,process.env.ADMIN_PASSWORD);
}
export async function login(request:Request) {
  const expires=String(Date.now()+8*3600_000);
  (await cookies()).set('palawan-admin',expires+'.'+sign(expires),{
    httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:' || request.headers.get('x-forwarded-proto')==='https',
    path:'/',maxAge:28800,
  });
}
const loopbackHost=/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
export async function localAdmin() {
  if (process.env.NODE_ENV!=='development'||process.env.ISLAVISTA_LOOPBACK_ADMIN!=='true') return false;
  const incoming=await headers();
  const host=incoming.get('host')||'';
  const forwarded=incoming.get('x-forwarded-host');
  return loopbackHost.test(host)&&(!forwarded||forwarded===host);
}
export async function admin() {
  // Building mode: when no admin password is configured, allow admin access
  // everywhere (local and deployed previews) without a login. Set ADMIN_PASSWORD
  // and SESSION_SECRET in production to lock this down.
  if (!process.env.ADMIN_PASSWORD) return true;
  if (await localAdmin()) return true;
  if (!process.env.SESSION_SECRET) return false;
  const [expires,hmac]=(await cookies()).get('palawan-admin')?.value.split('.')||[];
  return !!expires && !!hmac && Number(expires)>Date.now() && eq(hmac,sign(expires));
}
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin'),host=request.headers.get('host');
  if (!origin || !host) return false;
  try {
    const url=new URL(origin);
    return url.host===host && ['http:','https:'].includes(url.protocol) && request.headers.get('sec-fetch-site')!=='cross-site';
  } catch { return false; }
}
export async function authorize(request:Request) {
  if (!sameOrigin(request)) return Response.json({error:'Invalid request origin'},{status:403});
  if (!await admin()) return Response.json({error:'Sign in to continue'},{status:401});
}
export async function privatePreview() {
  if (process.env.DIRECTORY_PREVIEW!=='true' || process.env.NODE_ENV==='production') return false;
  const host=(await headers()).get('host')||'';
  return loopbackHost.test(host) || await admin();
}
