/*
LEEWAY HEADER — DO NOT REMOVE
REGION: MODEL_HUB / TESTS
TAG: LEEWAY-MODEL-HUB-CONTRACT-TESTS-20261021
WHO: Leonard Jerome Lee, owner; OpenAI coding assistant, tests author
WHAT: Test real service routing with mocked Ollama, HTTP authentication and GPU fail-closed law
WHEN: 2026-10-21
WHERE: tests/server.test.mjs
WHY: No invented model state, unsafe public mutation, or GPU capability inference
HOW: Node test runner and local ephemeral server, simulated upstream only
AUTHORITY: Test proof only, not deployed acceptance
LICENSE: LeeWay source, creator controlled
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHub} from '../src/server.mjs';
const catalog=JSON.parse(await readFile(new URL('../catalog/models.json',import.meta.url),'utf8'));
const model=catalog.models[0];
function mock(){
 let warm=false,calls=[],reply='Synthetic unit had a brake hose replaced. Inspection was not recorded.';
 const fetchImpl=async(url,opts)=>{
   calls.push({url,body:opts?.body?JSON.parse(opts.body):null});
   const path=new URL(url).pathname;
   if(path==='/api/tags')return Response.json({models:[{name:model.ollama}]});
   if(path==='/api/ps')return Response.json({models:warm?[{name:model.ollama,size_vram:0}]:[]});
   if(path==='/api/generate'){warm=opts.body.includes('"keep_alive":0')?false:true;
     return Response.json({response:opts.body.includes('"prompt":""')?'':reply,eval_count:19});}
   return Response.json({error:'unrecognized mock route'}, {status:404});
 };
 return {fetchImpl,calls,getWarm:()=>warm};
}
async function serve(hub){
 const server=http.createServer((req,res)=>hub.handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 return {base,close:()=>new Promise(resolve=>server.close(resolve))};
}
const authorized=(base,path,body,token='secret')=>
 fetch(base+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
test('catalog is single source, model identifiers unique and rights preserved',()=>{
 assert.equal(new Set(catalog.models.map(x=>x.id)).size,catalog.models.length);
 assert.equal(catalog.models[0].weightLicense,'Google Gemma Terms');
 assert.equal(catalog.origin.includes('LeeWay-Pocket-Agent'),true);
});
test('new server health does not announce a pre-warmed or GPU-qualified model',async()=>{
 const m=mock(),hub=createHub({catalog,token:'secret',fetchImpl:m.fetchImpl}),s=await serve(hub);
 try{
  const r=await(await fetch(s.base+'/health')).json();
  assert.equal(r.modelSelected,null);assert.equal(r.status,'RUNNING');
  const st=await(await fetch(s.base+'/v1/status')).json();
  assert.equal(st.leeWayGpu.gpuInferenceQualified,false);assert.equal(st.leeWayGpu.status,'UNBOUND');
 }finally{await s.close()}
});
test('local catalog asset route serves the same allowlist used by the API',async()=>{
 const hub=createHub({catalog,token:'secret',fetchImpl:mock().fetchImpl}),s=await serve(hub);
 try{
  assert.deepEqual(await(await fetch(s.base+'/catalog/models.json')).json(),catalog);
 }finally{await s.close()}
});
test('opt-in loopback session auto-fills only a bounded owner token in the local UI',async()=>{
 const token='a'.repeat(43),hub=createHub({catalog,token,localUiSession:true,readUi:()=>'<input id="token" type="password" autocomplete="off" placeholder="Required for protected model controls">'}),s=await serve(hub);
 try{
  const html=await(await fetch(s.base+'/')).text();
  assert.match(html,new RegExp('value="'+token+'"'));
 }finally{await s.close()}
});
test('activation without bearer cannot change model',async()=>{
 const m=mock(),hub=createHub({catalog,token:'secret',fetchImpl:m.fetchImpl}),s=await serve(hub);
 try{
  const r=await authorized(s.base,'/v1/models/activate',{modelId:model.id},'bad');
  assert.equal(r.status,401);assert.equal(hub.getState().activeId,null);assert.equal(m.calls.length,0);
 }finally{await s.close()}
});
test('only registered and installed models can be activated',async()=>{
 const m=mock(),hub=createHub({catalog,token:'secret',fetchImpl:m.fetchImpl}),s=await serve(hub);
 try{
  const a=await authorized(s.base,'/v1/models/activate',{modelId:'arbitrary/other'});
  assert.equal(a.status,400);
  const b=await authorized(s.base,'/v1/models/activate',{modelId:catalog.models[1].id});
  assert.equal(b.status,409);
  assert.equal(hub.getState().activeId,null);
 }finally{await s.close()}
});
test('registered GGUF model can be activated then used for real upstream route',async()=>{
 const m=mock(),hub=createHub({catalog,token:'secret',fetchImpl:m.fetchImpl}),s=await serve(hub);
 try{
  const activated=await authorized(s.base,'/v1/models/activate',{modelId:model.id,backend:'OLLAMA'});
  assert.equal(activated.status,200);assert.equal(m.getWarm(),true);
  const result=await authorized(s.base,'/v1/chat',{message:'Maintenance note for synthetic truck'});
  assert.equal(result.status,200);
  const out=await result.json();
  assert.match(out.text,/brake hose/);
  assert.equal(out.modelId,model.id);assert.equal(out.backend,'OLLAMA');
  assert.equal(out.gpuClaim,'NOT_PROVEN');
  const models=await(await fetch(s.base+'/v1/models')).json();
  assert.equal(models.models[0].loaded,true);
  assert.equal(models.models[0].vramBytesReported,0);
  assert.match(models.models[0].portableHandOff,/pocketpal:\/\/hub\/run/);
 }finally{await s.close()}
});
test('arbitrary unbound LeeWay GPU inference provider fails closed and never falls back mislabeled',async()=>{
 const m=mock(),hub=createHub({catalog,token:'secret',fetchImpl:m.fetchImpl}),s=await serve(hub);
 try{
  const r=await authorized(s.base,'/v1/models/activate',{modelId:model.id,backend:'LEEWAY_GPU'});
  assert.equal(r.status,503);
  assert.equal(m.calls.length,0);
  assert.equal(hub.getState().activeId,null);
 }finally{await s.close()}
});
function previewMock({fullVram=true}={}){
 const calls=[];
 const fetchImpl=async(url,opts={})=>{
  const path=new URL(url).pathname;calls.push({url,path,body:opts.body?JSON.parse(opts.body):null});
  if(path==='/v1/inference/status')return Response.json({available:[model.ollama],availableOk:true,
   mode:'REMOTE_GPU_PREVIEW',backend:'paired LeeWay GPU workstation',authority:'UNADMITTED_PREVIEW'});
  if(path==='/v1/models')return Response.json({object:'list',data:[{id:model.ollama,object:'model',owned_by:'leeway'}]});
  if(path==='/v1/chat/completions')return Response.json({choices:[{message:{role:'assistant',content:'LEEWAY_GPU_PREVIEW_RESPONSE'}}]},
   {headers:{'x-leeway-authority':'UNADMITTED_PREVIEW','x-leeway-execution-mode':'REMOTE_GPU_PREVIEW',
    'x-leeway-gpu-backend':'Ollama CUDA preview','x-leeway-gpu-device':'NVIDIA GeForce RTX 5060 Laptop GPU',
    'x-leeway-gpu-model-bytes':'879818178','x-leeway-gpu-vram-bytes':fullVram?'879818178':'700000000',
    'x-leeway-gpu-residency':fullVram?'FULL_MODEL_IN_VRAM':'PARTIAL_MODEL_IN_VRAM'}});
  return Response.json({error:'unexpected preview route'},{status:404});
 };
 return {fetchImpl,calls};
}
test('LeeWay GPU preview backend routes Model Hub catalog inference only through full remote VRAM evidence',async()=>{
 const p=previewMock(),hub=createHub({catalog,token:'secret',fetchImpl:p.fetchImpl,gpuPreviewUrl:'http://gpu-preview'}),s=await serve(hub);
 try{
  const state=await(await fetch(s.base+'/v1/status')).json();
  assert.equal(state.leeWayGpu.gpuInferenceQualified,false);
  assert.equal(state.leeWayGpuPreview.available,true);
  assert.equal(state.leeWayGpuPreview.authority,'UNADMITTED_PREVIEW');
  const activated=await authorized(s.base,'/v1/models/activate',{modelId:model.id,backend:'LEEWAY_GPU_PREVIEW'});
  assert.equal(activated.status,200);
  const result=await authorized(s.base,'/v1/chat',{message:'Respond with the requested test phrase.'});
  assert.equal(result.status,200);
  const out=await result.json();
  assert.equal(out.text,'LEEWAY_GPU_PREVIEW_RESPONSE');
  assert.equal(out.backend,'LEEWAY_GPU_PREVIEW');
  assert.equal(out.authority,'UNADMITTED_PREVIEW');
  assert.equal(out.gpuClaim,'REMOTE_FULL_MODEL_IN_VRAM_PREVIEW');
  assert.equal(out.modelBytes,out.vramBytes);
  assert.equal(p.calls.some(c=>c.path.startsWith('/api/')),false,'preview must not call Ollama on the Hub host');
  const models=await(await fetch(s.base+'/v1/models')).json();
  assert.equal(models.models[0].executionLocation,'REMOTE_LEEWAY_GPU');
  assert.equal(models.models[0].installed,true);
 }finally{await s.close()}
});
test('LeeWay GPU preview rejects incomplete VRAM evidence and does not fall back',async()=>{
 const p=previewMock({fullVram:false}),hub=createHub({catalog,token:'secret',fetchImpl:p.fetchImpl,gpuPreviewUrl:'http://gpu-preview'}),s=await serve(hub);
 try{
  assert.equal((await authorized(s.base,'/v1/models/activate',{modelId:model.id,backend:'LEEWAY_GPU_PREVIEW'})).status,200);
  const result=await authorized(s.base,'/v1/chat',{message:'This must not fall back.'});
  assert.equal(result.status,503);
  assert.equal((await result.json()).error,'LEEWAY_GPU_PREVIEW_FULL_VRAM_REQUIRED');
  assert.equal(p.calls.some(c=>c.path.startsWith('/api/')),false);
 }finally{await s.close()}
});
test('LeeWay GPU preview refuses catalog models absent from the remote workstation allowlist',async()=>{
 const p=previewMock(),hub=createHub({catalog,token:'secret',fetchImpl:p.fetchImpl,gpuPreviewUrl:'http://gpu-preview'}),s=await serve(hub);
 try{
  const absent=catalog.models.find(x=>x.ollama!==model.ollama);
  const result=await authorized(s.base,'/v1/models/activate',{modelId:absent.id,backend:'LEEWAY_GPU_PREVIEW'});
  assert.equal(result.status,409);
  assert.equal((await result.json()).error,'MODEL_NOT_ALLOWLISTED_ON_REMOTE_LEEWAY_GPU');
  assert.equal(p.calls.some(c=>c.path==='/v1/chat/completions'),false);
 }finally{await s.close()}
});
test('GPU-preview-only Hub never contacts or falls back to host Ollama',async()=>{
 const p=previewMock(),hub=createHub({catalog,token:'secret',fetchImpl:p.fetchImpl,
  gpuPreviewUrl:'http://gpu-preview',gpuPreviewOnly:true}),s=await serve(hub);
 try{
  const state=await(await fetch(s.base+'/v1/status')).json();
  assert.equal(state.gpuPreviewOnly,true);assert.equal(state.backend,'LEEWAY_GPU_PREVIEW');
  const inventory=await(await fetch(s.base+'/v1/models')).json();
  assert.equal(inventory.models[0].executionLocation,'REMOTE_LEEWAY_GPU');
  const denied=await authorized(s.base,'/v1/models/activate',{modelId:model.id,backend:'OLLAMA'});
  assert.equal(denied.status,403);
  assert.equal((await authorized(s.base,'/v1/models/activate',{modelId:model.id,backend:'LEEWAY_GPU_PREVIEW'})).status,200);
  const result=await authorized(s.base,'/v1/chat',{message:'Use only LeeWay GPU.'});
  assert.equal(result.status,200);
  assert.equal(p.calls.some(c=>c.path.startsWith('/api/')),false);
 }finally{await s.close()}
});
test('CORS rejects unknown browser origins without mutation',async()=>{
 const m=mock(),hub=createHub({catalog,token:'secret',fetchImpl:m.fetchImpl,allowedOrigins:['https://trusted.example']}),s=await serve(hub);
 try{
  const r=await fetch(s.base+'/v1/models/activate',{method:'POST',headers:{origin:'https://evil.example',authorization:'Bearer secret','content-type':'application/json'},body:JSON.stringify({modelId:model.id})});
  assert.equal(r.status,403);assert.equal(m.calls.length,0);
 }finally{await s.close()}
});
test('no configured owner token means privileged routes unavailable',async()=>{
 const m=mock(),hub=createHub({catalog,fetchImpl:m.fetchImpl}),s=await serve(hub);
 try{
  const r=await authorized(s.base,'/v1/chat',{message:'hi'});
  assert.equal(r.status,503);
 }finally{await s.close()}
});
test('input bounds and missing activation state enforced',async()=>{
 const m=mock(),hub=createHub({catalog,token:'secret',fetchImpl:m.fetchImpl}),s=await serve(hub);
 try{
  assert.equal((await authorized(s.base,'/v1/chat',{message:'hello'})).status,409);
  await authorized(s.base,'/v1/models/activate',{modelId:model.id});
  assert.equal((await authorized(s.base,'/v1/chat',{message:'x'.repeat(6001)})).status,400);
 }finally{await s.close()}
});

test('public model catalog matches the canonical service catalog',async()=>{
 const published=JSON.parse(await readFile(new URL('../public/catalog/models.json',import.meta.url),'utf8'));
 assert.deepEqual(published,catalog);
});
test('public widget labels per-response GPU preview evidence and its admission boundary',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 for(const label of ['Where the last answer ran','Provider-reported device','Provider-reported VRAM',
  'GPU PREVIEW · NOT PRODUCTION-ADMITTED','No verified response','independent production admission is not established'])
  assert.ok(html.includes(label),'Missing response evidence label: '+label);
});
test('portable client denies insecure non-localhost services',async()=>{
 const {createModelHubClient}=await import('../clients/model-hub-client.mjs');
 assert.throws(()=>createModelHubClient({baseUrl:'http://192.168.1.4:8879'}),/HTTPS_REQUIRED/);
 assert.throws(()=>createModelHubClient({baseUrl:'https://someone:secret@example.com'}),/NOT_CANONICAL/);
 const c=createModelHubClient({baseUrl:'http://127.0.0.1:8879'});
 await assert.rejects(()=>c.activate('gemma-3-1b-q4km'),/OWNER_TOKEN_REQUIRED/);
});
