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
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {createQualifiedGpuClient} from './qualified-gpu-client.mjs';

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
      gpuUrl='', gpuToken='', gpuPreviewUrl='', gpuPreviewOnly=false, gpuRequired=false,
      authenticateGpuRequest,verifyGpuQualification,verifyGpuResult,
      localUiSession=false, keepAlive='20m', fetchImpl=fetch, allowedOrigins=[], readUi=()=>load('public/index.html')}={}) {
  if(!catalog?.models?.length) throw Error('CATALOG_REQUIRED');
  const choices=new Map(catalog.models.map(m=>[m.id,m]));
  if(choices.size!==catalog.models.length)throw Error('DUPLICATE_MODEL_ID');
  const allowed=new Set(allowedOrigins.filter(Boolean));
  const ui=async()=>{
    const html=await readUi();
    if(!localUiSession)return html;
    if(!/^[A-Za-z0-9_-]{32,128}$/.test(token||''))throw Error('LOCAL_UI_SESSION_TOKEN_INVALID');
    const marker='id="token" type="password" autocomplete="off"';
    if(!html.includes(marker))throw Error('MODEL_HUB_TOKEN_INPUT_NOT_FOUND');
    return html.replace(marker,marker+' value="'+token+'"');
  };
  if(gpuRequired&&gpuPreviewOnly)throw Error('GPU_REQUIRED_AND_PREVIEW_ONLY_CONFLICT');
  const qualifiedGpu=createQualifiedGpuClient({endpoint:gpuUrl,token:gpuToken,fetchImpl,
    authenticateGpuRequest,verifyGpuQualification,verifyGpuResult});
  let activeId=null, busy=false, provider=gpuRequired?'LEEWAY_GPU':gpuPreviewOnly?'LEEWAY_GPU_PREVIEW':'OLLAMA',lastError=null,lastWarmTime=null,gpuSession=null;
  const callResult=async(base,path,{method='GET',body,secret,timeout=40000}={})=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const r=await fetchImpl(base+path,{
        method,headers:{'content-type':'application/json',...(secret?{authorization:'Bearer '+secret}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal
      });
      const parsed=await r.json().catch(()=>({}));
      if(!r.ok)throw Error('UPSTREAM_'+r.status+': '+(parsed.error||'provider rejection'));
      return {body:parsed,response:r};
    }finally{clearTimeout(timer);}
  };
  const call=async(base,path,options)=>(await callResult(base,path,options)).body;
  const ollama=(path,options)=>call(ollamaUrl,path,options);
  const gpuPreview=(path,options)=>call(gpuPreviewUrl,path,options);
  const gpuCapabilities=()=>qualifiedGpu.capabilities();
  const gpuPreviewStatus=async()=>{
    if(!gpuPreviewUrl)return {configured:false,available:false,status:'UNBOUND',authority:'UNADMITTED_PREVIEW',models:[]};
    try{
      const [state,inventory]=await Promise.all([
        gpuPreview('/v1/inference/status',{timeout:6000}),gpuPreview('/v1/models',{timeout:6000})
      ]);
      const listed=new Set((inventory.data||[]).map(x=>x?.id).filter(x=>typeof x==='string'));
      const models=Array.isArray(state.available)?state.available.filter(x=>listed.has(x)):[];
      const available=state.availableOk===true&&state.mode==='REMOTE_GPU_PREVIEW'&&
        state.authority==='UNADMITTED_PREVIEW'&&models.length>0;
      return {configured:true,available,status:available?'REMOTE_GPU_PREVIEW_AVAILABLE':'NOT_AVAILABLE',
        mode:state.mode||null,authority:'UNADMITTED_PREVIEW',backend:state.backend||null,models};
    }catch(e){return {configured:true,available:false,status:'UNREACHABLE',authority:'UNADMITTED_PREVIEW',models:[],error:safeError(e)};}
  };
  const inventory=async()=>{
    if(provider==='LEEWAY_GPU'){
      const gpu=await gpuCapabilities();
      return catalog.models.map(m=>({id:m.id,displayName:m.displayName,license:m.weightLicense,format:'GGUF',
        installed:null,loaded:null,active:activeId===m.id,selectedBackend:provider,
        executionLocation:'QUALIFIED_LEEWAY_GPU_PROVIDER',
        availability:gpu.gpuInferenceQualified&&gpu.models.includes(m.id)?'QUALIFIED_PROVIDER_MODEL':'UNAVAILABLE',
        qualificationVerified:gpu.gpuInferenceQualified&&gpu.models.includes(m.id)}));
    }
    if(gpuPreviewOnly||provider==='LEEWAY_GPU_PREVIEW'){
      const preview=await gpuPreviewStatus();
      return catalog.models.map(m=>({id:m.id,displayName:m.displayName,license:m.weightLicense,format:'GGUF',
        installed:preview.models.includes(m.ollama),loaded:null,active:activeId===m.id,
        selectedBackend:provider,executionLocation:'REMOTE_LEEWAY_GPU',
        availability:preview.models.includes(m.ollama)?'REMOTE_ALLOWLISTED':'NOT_AVAILABLE_ON_REMOTE_GPU',
        portableHandOff:'pocketpal://hub/run?repo_id='+encodeURIComponent(m.hfRepo||'')+'&filename='+encodeURIComponent(m.gguf||'')+'&source=leeway-model-hub'}));
    }
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
  const select=async(id,backend=provider)=>{
    if(busy)throw Object.assign(Error('MODEL_SWITCH_BUSY'),{code:409});
    const model=choices.get(id);if(!model)throw Object.assign(Error('MODEL_NOT_ALLOWLISTED'),{code:400});
    if(backend!=='OLLAMA'&&backend!=='LEEWAY_GPU'&&backend!=='LEEWAY_GPU_PREVIEW')throw Object.assign(Error('BACKEND_NOT_SUPPORTED'),{code:400});
    if(gpuPreviewOnly&&backend!=='LEEWAY_GPU_PREVIEW')
      throw Object.assign(Error('LEEWAY_GPU_PREVIEW_ONLY_NO_FALLBACK'),{code:403});
    if(gpuRequired&&backend!=='LEEWAY_GPU')throw Object.assign(Error('LEEWAY_GPU_REQUIRED_NO_FALLBACK'),{code:403});
    busy=true;
    try{
      let selectedGpuSession=null;
      if(backend==='LEEWAY_GPU'){
        selectedGpuSession=await qualifiedGpu.activateModel({modelId:id});
      }else if(backend==='LEEWAY_GPU_PREVIEW'){
        const preview=await gpuPreviewStatus();
        if(!preview.available)throw Object.assign(Error('LEEWAY_GPU_PREVIEW_UNAVAILABLE'),{code:503});
        if(!preview.models.includes(model.ollama))
          throw Object.assign(Error('MODEL_NOT_ALLOWLISTED_ON_REMOTE_LEEWAY_GPU'),{code:409});
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
      provider=backend;activeId=id;gpuSession=selectedGpuSession;
      lastWarmTime=backend==='OLLAMA'?new Date().toISOString():null;lastError=null;
      return {selected:id,backend,readyForRequests:true,modelWarmRequestedAt:lastWarmTime,
        authority:backend==='LEEWAY_GPU_PREVIEW'?'UNADMITTED_PREVIEW':undefined,
        modelWarmState:backend==='LEEWAY_GPU'?'SELECTED_NO_MODEL_EXECUTION':backend==='LEEWAY_GPU_PREVIEW'?'REMOTE_COLD_START_ON_FIRST_REQUEST':'WARM_REQUESTED',
        gpuProof:backend==='OLLAMA'?'NOT_PROVEN':backend==='LEEWAY_GPU_PREVIEW'?'REQUIRES_PER_REQUEST_FULL_VRAM_EVIDENCE':'QUALIFICATION_VERIFIED_REQUEST_EVIDENCE_REQUIRED',
        ...(gpuSession?{sessionId:gpuSession.sessionId}:{})};
    }catch(e){lastError=safeError(e);throw e}finally{busy=false}
  };
  const infer=async(message,options={}, {signal}={})=>{
    if(busy)throw Object.assign(Error('MODEL_SWITCH_BUSY'),{code:409});
    if(!activeId)throw Object.assign(Error('ACTIVATE_MODEL_FIRST'),{code:409});
    if(!bounded(message,6000))throw Object.assign(Error('INVALID_MESSAGE'),{code:400});
    busy=true;
    try{
    const model=choices.get(activeId);
    const start=performance.now();
    if(provider==='LEEWAY_GPU_PREVIEW'){
      const result=await callResult(gpuPreviewUrl,'/v1/chat/completions',{method:'POST',body:{
        model:model.ollama,messages:[{role:'user',content:message}],max_tokens:192,stream:false
      },timeout:180000});
      const headers=result.response.headers;
      const authority=headers.get('x-leeway-authority');
      const mode=headers.get('x-leeway-execution-mode');
      const residency=headers.get('x-leeway-gpu-residency');
      const physicalBackend=headers.get('x-leeway-gpu-backend');
      const device=headers.get('x-leeway-gpu-device');
      const modelBytes=Number(headers.get('x-leeway-gpu-model-bytes'));
      const vramBytes=Number(headers.get('x-leeway-gpu-vram-bytes'));
      if(authority!=='UNADMITTED_PREVIEW'||mode!=='REMOTE_GPU_PREVIEW'||!physicalBackend||!device)
        throw Object.assign(Error('LEEWAY_GPU_PREVIEW_EVIDENCE_MISSING'),{code:503});
      if(residency!=='FULL_MODEL_IN_VRAM'||!Number.isSafeInteger(modelBytes)||!Number.isSafeInteger(vramBytes)||
         modelBytes<1||vramBytes<modelBytes)
        throw Object.assign(Error('LEEWAY_GPU_PREVIEW_FULL_VRAM_REQUIRED'),{code:503});
      const text=result.body?.choices?.[0]?.message?.content;
      if(!bounded(text,12000))throw Error('GPU_PREVIEW_EMPTY_OUTPUT');
      return {modelId:activeId,backend:'LEEWAY_GPU_PREVIEW',text,elapsedMs:Math.round(performance.now()-start),
        authority,executionMode:mode,physicalBackend,device,modelBytes,vramBytes,residency,
        gpuClaim:'REMOTE_FULL_MODEL_IN_VRAM_PREVIEW'};
    }
    if(provider==='LEEWAY_GPU'){
      if(!gpuSession)throw Object.assign(Error('GPU_ACTIVATION_REQUIRED'),{code:503});
      if(!options||typeof options!=='object'||Array.isArray(options)||
        Object.keys(options).some(key=>!['requestId','sessionId','maxNewTokens'].includes(key)))
        throw Object.assign(Error('GPU_REQUEST_OPTIONS_INVALID'),{code:400});
      if(options.sessionId!==undefined&&options.sessionId!==gpuSession.sessionId)
        throw Object.assign(Error('GPU_SESSION_MISMATCH'),{code:400});
      const answer=await qualifiedGpu.generate({modelId:activeId,prompt:message,...options,sessionId:gpuSession.sessionId},
        {expectedClientId:gpuSession.clientId,signal});
      return {...answer,elapsedMs:Math.round(performance.now()-start),gpuClaim:'TRUSTED_CONSUMER_VERIFIED_REQUEST'};
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
    }finally{busy=false;}
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
      return res.end(await ui());
    }
    if(req.method==='GET'&&url.pathname==='/catalog/models.json')
      return json(res,200,catalog,origin,allowed);
    if(req.method==='GET'&&url.pathname==='/health')
      return json(res,200,{service:'LEEWAY_MODEL_HUB',status:'RUNNING',modelSelected:activeId,backend:provider,busy,version:'0.1.0'},origin,allowed);
    if(req.method==='GET'&&url.pathname==='/v1/catalog')
      return json(res,200,catalog,origin,allowed);
    if(req.method==='GET'&&url.pathname==='/v1/models')
      return json(res,200,{models:await inventory()},origin,allowed);
    if(req.method==='GET'&&url.pathname==='/v1/status')
      return json(res,200,{activeModel:activeId,backend:provider,busy,gpuPreviewOnly,gpuRequired,
        lastWarmTime,lastError,leeWayGpu:await gpuCapabilities(),leeWayGpuPreview:await gpuPreviewStatus(),
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
        const allowedFields=new Set(url.pathname==='/v1/models/activate'?['modelId','backend']:['message','requestId','sessionId','maxNewTokens']);
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!allowedFields.has(key)))
          return json(res,400,{error:'REQUEST_FIELD_UNSUPPORTED'},origin,allowed);
        const abortController=new AbortController();
        const abort=()=>abortController.abort();
        req.once('aborted',abort);
        res.once('close',()=>{if(!res.writableEnded)abort();});
        const value=url.pathname==='/v1/models/activate'?
          await select(body.modelId,body.backend??provider):
          await infer(body.message,Object.fromEntries(['requestId','sessionId','maxNewTokens'].filter(key=>body[key]!==undefined).map(key=>[key,body[key]])),
            {signal:abortController.signal});
        return json(res,200,value,origin,allowed);
      }catch(e){return json(res,e.code||502,{error:safeError(e)},origin,allowed);}
    }
    return json(res,404,{error:'NOT_FOUND'},origin,allowed);
  };
  return {handler,select,infer,inventory,getState:()=>({activeId,provider,busy,lastWarmTime}),gpuCapabilities};
}

export async function start({authenticateGpuRequest,verifyGpuQualification,verifyGpuResult}={}){
  const catalog=JSON.parse(await load('catalog/models.json'));
  const port=Number(process.env.MODEL_HUB_PORT||8879);
  const host=process.env.MODEL_HUB_BIND||'127.0.0.1';
  const localUiSession=process.env.MODEL_HUB_LOCAL_UI_SESSION==='true';
  const gpuPreviewOnly=process.env.MODEL_HUB_GPU_PREVIEW_ONLY==='true';
  const gpuRequired=process.env.MODEL_HUB_GPU_REQUIRED==='true';
  if(localUiSession&&host!=='127.0.0.1')throw Error('LOCAL_UI_SESSION_REQUIRES_LOOPBACK_BIND');
  if(gpuPreviewOnly&&!process.env.LEEWAY_GPU_PREVIEW_URL)throw Error('GPU_PREVIEW_ONLY_REQUIRES_LEEWAY_GPU_ENDPOINT');
  const token=process.env.MODEL_HUB_TOKEN||(localUiSession?randomBytes(32).toString('base64url'):'');
  const allowedOrigins=(process.env.MODEL_HUB_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(localUiSession){allowedOrigins.push('http://127.0.0.1:'+port,'http://localhost:'+port);}
  const hub=createHub({catalog,token,localUiSession,gpuPreviewOnly,gpuRequired,
    authenticateGpuRequest,verifyGpuQualification,verifyGpuResult,
    ollamaUrl:process.env.MODEL_HUB_OLLAMA_URL||'http://127.0.0.1:11434',
    gpuUrl:process.env.LEEWAY_GPU_INFERENCE_URL||'',gpuToken:process.env.LEEWAY_GPU_INFERENCE_TOKEN||'',
    gpuPreviewUrl:process.env.LEEWAY_GPU_PREVIEW_URL||'',
    keepAlive:/^-?\d+$/.test(process.env.MODEL_HUB_KEEP_ALIVE||'')?Number(process.env.MODEL_HUB_KEEP_ALIVE):(process.env.MODEL_HUB_KEEP_ALIVE||'20m'),
    allowedOrigins});
  const server=http.createServer((req,res)=>hub.handler(req,res).catch(e=>{
    if(!res.headersSent)json(res,500,{error:'SERVICE_ERROR',detail:safeError(e)},null,new Set());
  }));
  server.listen(port,host,()=>{
    console.log(JSON.stringify({
      service:'LEEWAY_MODEL_HUB',url:'http://'+host+':'+port,
      authenticated:!!token,
      leeWayGpuProviderConfigured:!!process.env.LEEWAY_GPU_INFERENCE_URL,
      leeWayGpuPreviewConfigured:!!process.env.LEEWAY_GPU_PREVIEW_URL,
      gpuPreviewOnly,
      status:'SERVING_NOT_PRODUCTION_ADMITTED'
    }));
    // Owner-configured autowarm: host runtime can be ready before any phone, PC or web client connects.
    // Physical GPU use is not inferred from activation. A real LeeWay GPU inference provider stays fail-closed.
    const bootModel=process.env.MODEL_HUB_AUTOSTART_MODEL||'';
    const bootBackend=process.env.MODEL_HUB_AUTOSTART_BACKEND||(gpuRequired?'LEEWAY_GPU':gpuPreviewOnly?'LEEWAY_GPU_PREVIEW':'OLLAMA');
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
