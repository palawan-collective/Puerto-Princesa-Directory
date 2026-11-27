import {redirect} from 'next/navigation';
import {load} from '../lib/store';

export const dynamic='force-dynamic';
export default async function Page() {
  const state=await load();
  redirect('/'+(state.settings.destinations.find(d=>d.status==='published')?.slug||'puerto-princesa'));
}
