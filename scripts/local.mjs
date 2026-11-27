import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

const host='127.0.0.1';
const override=process.env.ISLAVISTA_PORT;
const preferred=Number(override??3000);
if (!Number.isInteger(preferred)||preferred<1024||preferred>65535) {
  console.error('ISLAVISTA_PORT must be a port between 1024 and 65535.');
  process.exit(1);
}

async function availablePort(candidate) {
  const probe=createServer();
  try {
    await new Promise((resolve,reject)=>probe.once('error',reject).listen(candidate,host,resolve));
    const {port}=probe.address();
    await new Promise(resolve=>probe.close(resolve));
    return port;
  } catch(error) {
    if(error.code==='EADDRINUSE'||error.code==='EACCES')return null;
    throw error;
  }
}

let port=await availablePort(preferred);
if(!override) {
  for(let candidate=preferred+1;!port&&candidate<=3099;candidate++) port=await availablePort(candidate);
  port??=await availablePort(0);
}
if(!port) {
  console.error(override?`Port ${preferred} is unavailable. Unset ISLAVISTA_PORT to select a free port automatically.`:'Unable to find an available loopback port.');
  process.exit(1);
}
const origin=`http://${host}:${port}`;

const server=spawn(process.execPath,['scripts/dev.mjs','--local-admin','--port',String(port)],{
  stdio:'inherit',
  env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},
});
const controller=new AbortController();
server.on('exit',code=>{controller.abort();process.exitCode=code??0;});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{controller.abort();server.kill(signal);});

async function openWhenReady() {
  const admin=`${origin}/admin`;
  for (let attempt=0;attempt<60&&!controller.signal.aborted;attempt++) {
    try {
      const response=await fetch(`${origin}/api/session`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2500)])});
      if(response.ok&&(await response.json()).local===true) {
        console.log(`\nIslaVista  ${origin}\nAdmin      ${admin}\n`);
        if(process.env.ISLAVISTA_NO_BROWSER==='1')return;
        const [command,args]=process.platform==='darwin'?['open',[admin]]:process.platform==='win32'?['cmd.exe',['/d','/c','start','',admin]]:['xdg-open',[admin]];
        const launcher=spawn(command,args,{stdio:'ignore',detached:true});
        launcher.on('error',()=>console.log(`Open ${admin} in your browser.`));
        launcher.unref();
        return;
      }
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}
await openWhenReady();
