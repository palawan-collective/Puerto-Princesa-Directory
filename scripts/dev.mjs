import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const local=process.argv.includes('--local-admin');
const args=process.argv.slice(2).filter(arg=>arg!=='--strictPort'&&arg!=='--local-admin').map(arg=>arg==='--host'?'--hostname':arg);
const hostArgs=args.flatMap((arg,index)=>{
  if(arg==='--hostname'||arg==='-H') return [args[index+1]];
  if(arg.startsWith('--hostname=')) return [arg.slice('--hostname='.length)];
  return [];
});
if(local&&hostArgs.some(host=>!['127.0.0.1','localhost','::1'].includes(host))){
  console.error('The login-free admin requires a loopback address.');
  process.exit(1);
}
if(!hostArgs.length) args.push('--hostname','127.0.0.1');
const env={...process.env,ISLAVISTA_LOOPBACK_ADMIN:String(local)};
if(local) Object.assign(env,{DIRECTORY_PREVIEW:'true',DATABASE_URL:''});
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev',...args],{stdio:'inherit',env});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
