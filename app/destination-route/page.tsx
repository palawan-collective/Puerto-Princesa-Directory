import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Directory,{type Section} from '../../../components/Directory';
import {catalog} from '../../../lib/catalog';
import {businessPath,str} from '../../../lib/model';

type Props={params:Promise<{destination:string;route?:string[]}>};
const sections:Record<string,Section>={home:'Home',explore:'Explore',discover:'Discover',guides:'Guides',directory:'Directory',about:'About'};
export async function generateMetadata({params}:Props):Promise<Metadata> {
  const {destination,route=[]}=await params;
  const data=await catalog(destination);
  const place=route[0]==='place'&&data.businesses.find(b=>b.business_id===route[1]?.split('--').at(-1));
  return {
    title:place?place.name:data.active?.name||'IslaVista',
    description:place?str(place.description)||undefined:data.active?.seo||data.active?.description,
    alternates:{canonical:place?businessPath(place,destination):`/${[destination,...route].join('/')}`},
    robots:data.preview?{index:false,follow:false}:undefined,
  };
}
export default async function DestinationPage({params}:Props) {
  const {destination,route=[]}=await params;
  const data=await catalog(destination);
  if(!data.active)notFound();
  if(route[0]==='place'&&route.length===2){
    const place=data.businesses.find(b=>b.business_id===route[1]?.split('--').at(-1));
    if(!place)notFound();
    const schema={'@context':'https://schema.org','@type':'LocalBusiness',name:place.name,address:str(place.address),url:businessPath(place,destination)};
    return <>{!data.preview&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replaceAll('<','\\u003c')}}/>}<Directory initialSlug={destination} initialPlace={place.business_id}/></>;
  }
  if(route.length>1||(route[0]&&!sections[route[0]]))notFound();
  return <Directory initialSlug={destination} initialSection={sections[route[0]]||'Explore'}/>;
}
