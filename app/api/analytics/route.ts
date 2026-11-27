import {sameOrigin} from '../../../lib/auth';
import {mutate} from '../../../lib/store';
import {approved} from '../../../lib/model';

const channels=new Set(['Website','Facebook','Instagram','WhatsApp','TikTok','Call','Email','Directions','Inquire','Book','Menu','Reservations']);
export async function POST(request:Request) {
  if (!sameOrigin(request)) return new Response(null,{status:403});
  const data=await request.json().catch(()=>null);
  if (!data||typeof data.business_id!=='string'||!channels.has(data.channel)) return new Response(null,{status:400});
  await mutate(s=>{
    if (!s.businesses.some(b=>b.business_id===data.business_id&&approved(b))) return;
    s.analytics=[...s.analytics.slice(-4999),{at:new Date().toISOString(),business_id:data.business_id,channel:data.channel}];
  });
  return new Response(null,{status:204});
}
