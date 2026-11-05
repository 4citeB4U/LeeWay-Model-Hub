/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.TESTS
TAG: LEEWAY.MODEL_HUB.TWO_MODEL_WARM_POOL.V1
5WH:
WHAT = Exercise real Model Hub code with bounded provider fixtures.
WHY = Preserve two requested model residencies without fake GPU or model health.
WHO = LeeWay Model Hub source reviewers.
WHERE = tests/warm-pool.test.mjs
WHEN = 2026-11-05
HOW = HTTP acceptance fixtures around original Ollama route.
AUTHORIZED_ROLES: Source tests only; no production admission.
LICENSE: Existing repository terms.
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHub} from '../src/server.mjs';
const source=JSON.parse(await readFile(new URL('../catalog/models.json',import.meta.url),'utf8'));
const models=source.models.slice(0,3);
const catalog={...source,models};
function upstream(){
 const warm=new Map(),calls=[];
 let observerAvailable=true;
 const fetchImpl=async(url,opts={})=>{
  const path=new URL(url).pathname;
  const body=opts.body?JSON.parse(opts.body):null;
  calls.push({path,body});
  if(path==='/api/tags')return Response.json({models:models.map(m=>({name:m.ollama}))});
  if(path==='/api/ps'){
   if(!observerAvailable)return Response.json({error:'observer failed'},{status:503});
   return Response.json({models:[...warm].map(([name,info])=>({name,size_vram:info.vram}))});
  }
  if(path==='/api/generate'){
   if(!models.some(x=>x.ollama===body.model))return Response.json({error:'not installed'},{status:404});
   if(body.keep_alive===0)warm.delete(body.model);
   else warm.set(body.model,{vram:0});
   return Response.json({response:body.prompt?'response-from:'+body.model:'',eval_count:2});
  }
  return Response.json({error:'unexpected upstream path'},{status:404});
 };
 return{fetchImpl,calls,warm,setObserverAvailable:value=>{observerAvailable=value;}};
}
async function serve(hub){
 const server=http.createServer((req,res)=>hub.handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{base:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
const post=(base,path,body,token='test-owner-token')=>fetch(base+path,{
 method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)
});
test('two registered installed models remain warm across switching and are independently addressable',async()=>{
 const u=upstream(),hub=createHub({catalog,token:'test-owner-token',fetchImpl:u.fetchImpl,keepAlive:-1,maxWarmModels:2}),s=await serve(hub);
 try{
  const first=await post(s.base,'/v1/models/activate',{modelId:models[0].id,backend:'OLLAMA'});
  assert.equal(first.status,200);
  const second=await post(s.base,'/v1/models/activate',{modelId:models[1].id,backend:'OLLAMA'});
  assert.equal(second.status,200);
  assert.equal(u.warm.size,2);
  assert.ok(u.warm.has(models[0].ollama));
  assert.ok(u.warm.has(models[1].ollama));
  assert.ok(u.calls.filter(c=>c.path==='/api/generate').every(c=>c.body.keep_alive!==0));
  const state=await(await fetch(s.base+'/v1/status')).json();
  assert.equal(state.activeModel,models[1].id);
  assert.equal(state.warmPool.state,'UPSTREAM_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
  assert.deepEqual(state.warmPool.observedLoadedModelIds,[models[0].id,models[1].id]);
  assert.equal(state.warmPool.keepAlive,-1);
  const b=await post(s.base,'/v1/chat',{message:'bounded task from worker B'});
  assert.equal(b.status,200);
  assert.equal((await b.json()).modelId,models[1].id);
  const reselect=await post(s.base,'/v1/models/activate',{modelId:models[0].id});
  assert.equal(reselect.status,200);
  assert.equal(u.warm.size,2,'switching back does not unload the other warm model');
  assert.equal(u.calls.filter(c=>c.body?.keep_alive===0).length,0);
  const a=await post(s.base,'/v1/chat',{message:'bounded task from worker A'});
  assert.equal(a.status,200);
  assert.equal((await a.json()).modelId,models[0].id);
  assert.equal(hub.getState().activeId,models[0].id);
 }finally{await s.close()}
});
test('third selection only releases least-recently requested model after warming the replacement',async()=>{
 const u=upstream(),hub=createHub({catalog,token:'test-owner-token',fetchImpl:u.fetchImpl,keepAlive:-1,maxWarmModels:2}),s=await serve(hub);
 try{
  for(const m of models)assert.equal((await post(s.base,'/v1/models/activate',{modelId:m.id})).status,200);
  assert.deepEqual([...u.warm.keys()],[models[1].ollama,models[2].ollama]);
  const lastTwo=u.calls.filter(c=>c.path==='/api/generate').slice(-2);
  assert.equal(lastTwo[0].body.model,models[2].ollama);
  assert.equal(lastTwo[0].body.keep_alive,-1);
  assert.equal(lastTwo[1].body.model,models[0].ollama);
  assert.equal(lastTwo[1].body.keep_alive,0);
  assert.equal((await post(s.base,'/v1/chat',{message:'alternate model not authorized',modelId:models[0].id})).status,400);
  assert.equal(u.warm.size,2);
  assert.equal(hub.getState().activeId,models[2].id);
 }finally{await s.close()}
});
test('invalid model and missing owner authorization never change active or warm state',async()=>{
 const u=upstream(),hub=createHub({catalog,token:'test-owner-token',fetchImpl:u.fetchImpl,maxWarmModels:2}),s=await serve(hub);
 try{
  assert.equal((await post(s.base,'/v1/models/activate',{modelId:models[0].id},'wrong')).status,401);
  assert.equal((await post(s.base,'/v1/models/activate',{modelId:'unknown-model'})).status,400);
  assert.equal((await post(s.base,'/v1/chat',{message:'test',modelId:'unknown-model'})).status,409);
  assert.equal(u.calls.length,0);
  assert.equal(hub.getState().activeId,null);
  assert.deepEqual(hub.getState().requestedWarmIds,[]);
 }finally{await s.close()}
});
test('missing upstream residency observer cannot be presented as warm availability',async()=>{
 const u=upstream(),hub=createHub({catalog,token:'test-owner-token',fetchImpl:u.fetchImpl,maxWarmModels:2}),s=await serve(hub);
 try{
  for(const m of models.slice(0,2))assert.equal((await post(s.base,'/v1/models/activate',{modelId:m.id})).status,200);
  u.setObserverAvailable(false);
  const status=await(await fetch(s.base+'/v1/status')).json();
  assert.equal(status.warmPool.state,'OBSERVER_UNAVAILABLE');
  assert.equal(status.warmPool.observedLoadedModelIds,null);
  assert.deepEqual(status.warmPool.requestedModelIds,[models[0].id,models[1].id]);
  assert.equal(status.warmPool.observedLoadedModelIds,null);
 }finally{await s.close()}
});
test('warm target is bounded by explicit configured capacity',()=>{
 for(const maxWarmModels of [0,3,-1,1.5,'2'])assert.throws(()=>
  createHub({catalog,token:'test-owner-token',maxWarmModels}),/WARM_POOL_LIMIT_INVALID/);
});
