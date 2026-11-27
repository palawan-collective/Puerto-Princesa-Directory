import type {InputHTMLAttributes,ReactNode} from 'react';

export async function adminRequest<T>(url:string,options:RequestInit={}):Promise<T> {
  const response=await fetch(url,{cache:'no-store',...options});
  const result=await response.json().catch(()=>null);
  if (!response.ok || result?.error) throw new Error(result?.error || `Request failed (${response.status}).`);
  return result as T;
}

export function jsonRequest(method:string,value:unknown):RequestInit {
  return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)};
}

export type Run = <T>(url:string,options:RequestInit,message?:string,refresh?:boolean)=>Promise<T|null>;

export function Field({label,hint,wide,children}:{label:string;hint?:string;wide?:boolean;children:ReactNode}) {
  return <label className={`studio-field${wide?' studio-wide':''}`}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;
}

export function TextField({label,value,set,hint,wide,multiline,...input}:{
  label:string;value:unknown;set:(value:string)=>void;hint?:string;wide?:boolean;multiline?:boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'>) {
  const display=Array.isArray(value)?value.join(multiline?'\n':', '):String(value??'');
  return <Field label={label} hint={hint} wide={wide}>{multiline
    ? <textarea value={display} rows={3} maxLength={input.maxLength??12000} onChange={event=>set(event.target.value)} placeholder={input.placeholder} required={input.required} />
    : <input maxLength={12000} {...input} value={display} onChange={event=>set(event.target.value)} />}
  </Field>;
}

export function CheckField({label,value,set}:{label:string;value:boolean;set:(value:boolean)=>void}) {
  return <label className="studio-check"><input type="checkbox" checked={value} onChange={event=>set(event.target.checked)}/>{label}</label>;
}

export function Empty({children}:{children:ReactNode}) {
  return <div className="studio-empty">{children}</div>;
}

export function PageButtons({page,pages,set}:{page:number;pages:number;set:(page:number)=>void}) {
  if (pages<2) return null;
  return <div className="studio-pagination">
    <button type="button" onClick={()=>set(page-1)} disabled={page<=1}>Previous page</button>
    <span>Page {page} of {pages}</span>
    <button type="button" onClick={()=>set(page+1)} disabled={page>=pages}>Next page</button>
  </div>;
}

export function downloadText(name:string,text:string) {
  const objectUrl=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=objectUrl;
  link.download=name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),500);
}

export function formatDate(value:string) {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:date.toLocaleString();
}
