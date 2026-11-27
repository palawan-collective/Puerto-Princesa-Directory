import {BedDouble,BriefcaseBusiness,Building2,Car,Coffee,Compass,Grid2X2,HeartPulse,Landmark,Mountain,Settings,ShoppingBag,Sparkles,Utensils,Wifi,Waves,Palmtree,Snowflake,Flower2,ParkingCircle,Clock,MapPin,Globe} from 'lucide-react';

export const categoryIcons = {
  All:Grid2X2,Stay:BedDouble,Drink:Coffee,Eat:Utensils,Explore:Mountain,Discover:Compass,Wellness:Flower2,
  Shop:ShoppingBag,Transport:Car,Essentials:Settings,Retail:ShoppingBag,'Real Estate':Building2,
  'Financial Services':Landmark,'Professional Services':BriefcaseBusiness,Healthcare:HeartPulse,Automotive:Car,
};
export const iconChoices = Object.keys(categoryIcons);
export function categoryIcon(id:string, override?:string) {
  return categoryIcons[(override||id) as keyof typeof categoryIcons] || BriefcaseBusiness;
}
export function amenityIcon(label:string) {
  if (/wifi|wi-fi|internet/i.test(label)) return Wifi;
  if (/pool|swim/i.test(label)) return Waves;
  if (/beach|seafront/i.test(label)) return Palmtree;
  if (/air cond|a\/c|^ac$/i.test(label)) return Snowflake;
  if (/dining|restaurant|breakfast|meal/i.test(label)) return Utensils;
  if (/parking/i.test(label)) return ParkingCircle;
  if (/spa|wellness/i.test(label)) return Flower2;
  if (/hour|check.in/i.test(label)) return Clock;
  if (/pickup/i.test(label)) return MapPin;
  if (/online/i.test(label)) return Globe;
  return Sparkles;
}
export function IslandMark({className}:{className?:string}) {
  return <svg className={className} width="49" height="33" viewBox="0 0 56 36" aria-hidden="true" fill="currentColor">
    <path d="M6 26 22 8a3 3 0 0 1 4.4-.2l8 8.1 5-5a2.6 2.6 0 0 1 3.7.2L54 26l-13-5.1-5.7.7-10.6-7.2-5 6.5-3.1-1.1Z"/>
    <path d="M0 34c11-8 20-8 30-5s17 4 26 0c-6 7-16 7-28 4C18 30 9 31 0 34Z"/>
    <path d="M10 25c.2-3.6 1.7-6.6 3-8.7-3-.1-5.1.6-6.7 2.3a7 7 0 0 1 4.4-4 8 8 0 0 0-5.6-.2c2.6-2 5-2.1 7.1-.7-.6-1.8-1.7-3-3.7-3.4 3.1-.4 4.6 1 5.4 2.8 2-1.9 4.2-1.6 6.4-.4-2.4-.1-3.8.6-5 2.1 2.6-.2 4.4 1 5.4 3-2-1-4.6-1.5-5.6-1.1-1.5 2.8-2.6 6-2.7 8.1Z"/>
  </svg>;
}
