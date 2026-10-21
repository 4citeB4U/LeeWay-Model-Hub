/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY-MODEL-HUB / GOVERNED-INFERENCE-SERVICE
TAG: LEEWAY-MODEL-HUB-SERVICE-v0.1-20261021
WHO: Leonard Jerome Lee, owner; OpenAI coding assistant, implementation contributor
WHAT: Independent local model registry, on-demand warm single-model serving, Ollama and GPU provider boundary
WHEN: 2026-10-21
WHERE: LeeWay-Model-Hub/src/server.mjs
WHY: Replace duplicate model hubs and let authorized devices consume one inference service
HOW: Node HTTP API, allowlist catalog, explicit auth, replaceable upstream, observable status
AUTHORITY: Development candidate only; production Veritas/Formula/GPU admission not asserted
LICENSE: LeeWay original source, all rights reserved; GGUF model terms remain separate
*/
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';

const root = new URL('../', import.meta.url);
const load = path => readFile(new URL(path, root), 'utf8');
const json = (res, status, body, origin, allowed) => {
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  if(origin && allowed.has(origin)) {headers['access-control-allow-origin']=origin;headers['vary']='Origin';}
  res.writeHead(status,headers);res.end(JSON.stringify(body));
};
const safeError=e=>String(e?.message||e).slice(0,220);
const bounded=(text,max)=>typeof text==='string'&&text.length>0&&text.length<=max;
const matches=(provided,secret)=>{
  if(!secret || !provided) return false;
  const a=Buffer.from(provided),b=Buffer.from(secret);
  return a.length===b.length && timingSafeEqual(a,b);
};

export function createHub({catalog, token, ollamaUrl='http://127.0.0.1:11434',
      gpuUrl='', gpuToken='', keepAlive='20m', fetchImpl=fetch, allowedOrigins=[], readUi=()=>load('public/index.html')}={}) {
  if(!catalog?.models?.length) throw Error('CATALOG_REQUIRED');
  const choices=new Map(catalog.models.map(m=>[m.id,m]));
  if(choices.size!==catalog.models.length)throw Error('DUPLICATE_MODEL_ID');
  const allowed=new Set(allowedOrigins.filter(Boolean));
  let activeId=null, busy=false, provider='OLLAMA',lastError=null,lastWarmTime=null;
  const call=async(base,path,{method='GET',body,secret,timeout=40000}={})=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const r=await fetchImpl(base+path,{
        method,headers:{'content-type':'application/json',...(secret?{authorization:'Bearer '+secret}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal
      });
      const parsed=await r.json().catch(()=>({}));
      if(!r.ok)throw Error('UPSTREAM_'+r.status+': '+(parsed.error||'provider rejection'));
      return parsed;
    }finally{clearTimeout(timer);}
  };
  const ollama=(path,options)=>call(ollamaUrl,path,options);
  const gpu=(path,options)=>call(gpuUrl,path,{...options,secret:gpuToken});
  const gpuCapabilities=async()=>{
    if(!gpuUrl)return {bound:false,status:'UNBOUND',gpuInferenceQualified:false};
    try{
      const c=await gpu('/v1/capabilities',{timeout:4000});
      const contract=c.schema==='leeway.gpu.inference.v1'&&c.modelInference===true&&
        c.gpuVerified===true&&bounded(c.receiptId,256)&&Array.isArray(c.models);
      return {bound:true,status:contract?'CAPABILITY_REPORTED':'NOT_QUALIFIED',
        gpuInferenceQualified:contract,receiptId:contract?c.receiptId:null,
        models:contract?c.models:[]};
    }catch(e){return {bound:true,status:'UNREACHABLE',gpuInferenceQualified:false,error:safeError(e)};}
  };
  const inventory=async()=>{
    try{
      const [t,p]=await Promise.all([ollama('/api/tags',{timeout:8000}),ollama('/api/ps',{timeout:8000})]);
      const installed=new Set((t.models||[]).map(x=>x.name));
      const loaded=new Map((p.models||[]).map(x=>[x.name,x]));
      return catalog.models.map(m=>({
        id:m.id,displayName:m.displayName,license:m.weightLicense,format:'GGUF',
        installed:installed.has(m.ollama),loaded:loaded.has(m.ollama),
        vramBytesReported:loaded.get(m.ollama)?.size_vram??null,
        active:activeId===m.id,selectedBackend:provider,
        portableHandOff:'pocketpal://hub/run?repo_id='+encodeURIComponent(m.hfRepo)+'&filename='+encodeURIComponent(m.gguf)+'&source=leeway-model-hub'
      }));
    }catch(e){
      return catalog.models.map(m=>({id:m.id,displayName:m.displayName,
        installed:false,loaded:false,active:activeId===m.id,
        availability:'UNKNOWN_UPSTREAM_ERROR',error:safeError(e),
        portableHandOff:'pocketpal://hub/run?repo_id='+encodeURIComponent(m.hfRepo)+'&filename='+encodeURIComponent(m.gguf)+'&source=leeway-model-hub'}));
    }
  };
  const select=async(id,backend='OLLAMA')=>{
    if(busy)throw Object.assign(Error('MODEL_SWITCH_BUSY'),{code:409});
    const model=choices.get(id);if(!model)throw Object.assign(Error('MODEL_NOT_ALLOWLISTED'),{code:400});
    if(backend!=='OLLAMA'&&backend!=='LEEWAY_GPU')throw Object.assign(Error('BACKEND_NOT_SUPPORTED'),{code:400});
    busy=true;
    try{
      if(backend==='LEEWAY_GPU'){
        const cap=await gpuCapabilities();
        if(!cap.gpuInferenceQualified||!cap.models.includes(id))
          throw Object.assign(Error('LEEWAY_GPU_INFERENCE_PROVIDER_NOT_QUALIFIED'),{code:503});
        await gpu('/v1/models/activate',{method:'POST',body:{modelId:id},timeout:70000});
      }else{
        const t=await ollama('/api/tags',{timeout:12000});
        if(!(t.models||[]).some(x=>x.name===model.ollama))
          throw Object.assign(Error('MODEL_NOT_INSTALLED_ON_PROVIDER'),{code:409});
        if(activeId&&provider==='OLLAMA'&&activeId!==id){
          const old=choices.get(activeId);
          await ollama('/api/generate',{method:'POST',body:{model:old.ollama,prompt:'',stream:false,keep_alive:0},timeout:30000});
        }
        await ollama('/api/generate',{method:'POST',body:{model:model.ollama,prompt:'',stream:false,keep_alive:keepAlive},timeout:120000});
      }
      provider=backend;activeId=id;lastWarmTime=new Date().toISOString();lastError=null;
      return {selected:id,backend,readyForRequests:true,modelWarmRequestedAt:lastWarmTime,
        gpuProof:backend==='OLLAMA'?'NOT_PROVEN':'PROVIDER_REPORTED_NOT_INDEPENDENTLY_CERTIFIED'};
    }catch(e){lastError=safeError(e);throw e}finally{busy=false}
  };
  const infer=async(message)=>{
    if(busy)throw Object.assign(Error('MODEL_SWITCH_BUSY'),{code:409});
    if(!activeId)throw Object.assign(Error('ACTIVATE_MODEL_FIRST'),{code:409});
    if(!bounded(message,6000))throw Object.assign(Error('INVALID_MESSAGE'),{code:400});
    const model=choices.get(activeId);
    const start=performance.now();
    if(provider==='LEEWAY_GPU'){
      const c=await gpuCapabilities();if(!c.gpuInferenceQualified)throw Object.assign(Error('GPU_PROVIDER_NOT_QUALIFIED'),{code:503});
      const answer=await gpu('/v1/generate',{method:'POST',body:{modelId:activeId,prompt:message},timeout:90000});
      if(!bounded(answer.text,12000))throw Error('GPU_PROVIDER_EMPTY_OUTPUT');
      return {modelId:activeId,backend:'LEEWAY_GPU',text:answer.text,
        elapsedMs:Math.round(performance.now()-start),gpuClaim:'PROVIDER_REPORTED',receiptId:c.receiptId};
    }
    const reply=await ollama('/api/generate',{method:'POST',
      body:{model:model.ollama,prompt:message,think:false,stream:false,
        options:{temperature:0.2,num_predict:192},keep_alive:keepAlive},timeout:120000});
    const text=reply.response;
    if(!bounded(text,12000))throw Error('MODEL_GENERATED_NO_USABLE_TEXT');
    const inv=await ollama('/api/ps',{timeout:8000}).catch(()=>({models:[]}));
    const vram=(inv.models||[]).find(m=>m.name===model.ollama)?.size_vram??null;
    return {modelId:activeId,backend:'OLLAMA',text,elapsedMs:Math.round(performance.now()-start),
      tokenCount:reply.eval_count??null,vramBytesReported:vram,
      gpuClaim:vram>0?'UPSTREAM_VRAM_REPORTED_NOT_INDEPENDENTLY_VERIFIED':'NOT_PROVEN'};
  };
  const handler=async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&!allowed.has(origin))return json(res,403,{error:'ORIGIN_NOT_ALLOWED'},origin,allowed);
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'access-control-allow-origin':origin||'', 'access-control-allow-methods':'GET, POST, OPTIONS',
        'access-control-allow-headers':'authorization, content-type','vary':'Origin'});return res.end();
    }
    const url=new URL(req.url||'/', 'http://localhost');
    if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/widget')){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'SAMEORIGIN'});
      return res.end(await readUi());
    }
    if(req.method==='GET'&&url.pathname==='/health')
      return json(res,200,{service:'LEEWAY_MODEL_HUB',status:'RUNNING',modelSelected:activeId,backend:provider,busy,version:'0.1.0'},origin,allowed);
    if(req.method==='GET'&&url.pathname==='/v1/catalog')
      return json(res,200,catalog,origin,allowed);
    if(req.method==='GET'&&url.pathname==='/v1/models')
      return json(res,200,{models:await inventory()},origin,allowed);
    if(req.method==='GET'&&url.pathname==='/v1/status')
      return json(res,200,{activeModel:activeId,backend:provider,busy,
        lastWarmTime,lastError,leeWayGpu:await gpuCapabilities(),
        warning:'A GitHub-hosted shader is not evidence of remote model inference. Verify physical provider independently.'},origin,allowed);
    if(req.method==='POST'&&['/v1/models/activate','/v1/chat'].includes(url.pathname)){
      if(!token)return json(res,503,{error:'OWNER_TOKEN_NOT_CONFIGURED'},origin,allowed);
      const claimed=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      if(!matches(claimed,token))return json(res,401,{error:'UNAUTHORIZED'},origin,allowed);
      let input='',body;
      try{
        for await(const chunk of req){input+=chunk;if(input.length>12000)throw Error('TOO_LARGE');}
        body=JSON.parse(input||'{}');
      }catch{return json(res,400,{error:'INVALID_JSON_OR_TOO_LARGE'},origin,allowed);}
      try{
        const value=url.pathname==='/v1/models/activate'?
          await select(body.modelId,body.backend||'OLLAMA'):
          await infer(body.message);
        return json(res,200,value,origin,allowed);
      }catch(e){return json(res,e.code||502,{error:safeError(e)},origin,allowed);}
    }
    return json(res,404,{error:'NOT_FOUND'},origin,allowed);
  };
  return {handler,select,infer,inventory,getState:()=>({activeId,provider,busy,lastWarmTime}),gpuCapabilities};
}

export async function start(){
  const catalog=JSON.parse(await load('catalog/models.json'));
  const port=Number(process.env.MODEL_HUB_PORT||8879);
  const host=process.env.MODEL_HUB_BIND||'127.0.0.1';
  const allowedOrigins=(process.env.MODEL_HUB_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const hub=createHub({catalog,token:process.env.MODEL_HUB_TOKEN||'',
    ollamaUrl:process.env.MODEL_HUB_OLLAMA_URL||'http://127.0.0.1:11434',
    gpuUrl:process.env.LEEWAY_GPU_INFERENCE_URL||'',gpuToken:process.env.LEEWAY_GPU_INFERENCE_TOKEN||'',
    keepAlive:process.env.MODEL_HUB_KEEP_ALIVE||'-1',
    allowedOrigins});
  const server=http.createServer((req,res)=>hub.handler(req,res).catch(e=>{
    if(!res.headersSent)json(res,500,{error:'SERVICE_ERROR',detail:safeError(e)},null,new Set());
  }));
  server.listen(port,host,()=>{
    console.log(JSON.stringify({
      service:'LEEWAY_MODEL_HUB',url:'http://'+host+':'+port,
      authenticated:!!process.env.MODEL_HUB_TOKEN,
      leeWayGpuProviderConfigured:!!process.env.LEEWAY_GPU_INFERENCE_URL,
      status:'SERVING_NOT_PRODUCTION_ADMITTED'
    }));
    // Owner-configured autowarm: host runtime can be ready before any phone, PC or web client connects.
    // Physical GPU use is not inferred from activation. A real LeeWay GPU inference provider stays fail-closed.
    const bootModel=process.env.MODEL_HUB_AUTOSTART_MODEL||'';
    const bootBackend=process.env.MODEL_HUB_AUTOSTART_BACKEND||'OLLAMA';
    if(bootModel){
      hub.select(bootModel,bootBackend).then(v=>
        console.log(JSON.stringify({event:'MODEL_AUTO_WARMED',model:v.selected,backend:v.backend,gpuProof:v.gpuProof}))
      ).catch(e=>
        console.error(JSON.stringify({event:'MODEL_AUTO_WARM_FAILED',error:safeError(e)}))
      );
    }
  });
  return {server,hub};
}
if(process.argv[1]===fileURLToPath(import.meta.url))await start();
