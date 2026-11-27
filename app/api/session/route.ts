import {admin,localAdmin,login,sameOrigin,verifyPassword} from '../../../lib/auth';
import {cookies} from 'next/headers';

const attempts=new Map<string,{count:number;reset:number}>();
export async function GET() {
  return Response.json({admin:await admin(),local:await localAdmin()});
}
export async function POST(request:Request) {
  if (!sameOrigin(request)) return Response.json({error:'Invalid request origin'},{status:403});
  const now=Date.now();
  const key='local-admin';
  const last=attempts.get(key);
  const entry=last&&last.reset>now?last:{count:0,reset:now+60_000};
  if (entry.count>=8) return Response.json({error:'Too many attempts. Try again in a minute.'},{status:429});
  const input=await request.json().catch(()=>null);
  if (typeof input?.password!=='string' || input.password.length>1024 || !verifyPassword(input.password)) {
    attempts.set(key,{...entry,count:entry.count+1});
    return Response.json({error:'Incorrect admin password'},{status:401});
  }
  attempts.delete(key);
  await login(request);
  return Response.json({ok:true});
}
export async function DELETE(request:Request) {
  if (!sameOrigin(request)) return Response.json({error:'Invalid request origin'},{status:403});
  (await cookies()).delete('palawan-admin');
  return Response.json({ok:true});
}
