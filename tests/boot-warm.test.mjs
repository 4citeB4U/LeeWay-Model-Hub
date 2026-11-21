/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.TESTS
TAG: LEEWAY.MODEL_HUB.AUTO_WARM_BOOT_TEST.V1
5WH:
WHAT = Verify existing startup process requests both registered models warm using the real Model Hub service.
WHY = Prevent a green selection test from hiding a broken boot-time warm pool.
WHO = LeeWay Model Hub source reviewers.
WHERE = tests/boot-warm.test.mjs
WHEN = 2026-11-05
HOW = Local mock Ollama provider; original start(), live HTTP readback and bounded polling.
AUTHORIZED_ROLES: Source tests; no native model weights or GPU.
LICENSE: Existing repository terms.
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {start} from '../src/server.mjs';
const catalog=JSON.parse(await readFile(new URL('../catalog/models.json',import.meta.url),'utf8'));
const first=catalog.models[0],second=catalog.models.find(m=>m.id==='qwen-2-5-0-5b-local');
test('existing owner startup warms two installed models and retains first as selected default',async()=>{
 const warm=new Map(),called=[];
 const provider=createServer(async (req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  let result={},status=200;
  if(url.pathname==='/api/tags')result={models:[first,second].map(m=>({name:m.ollama}))};
  else if(url.pathname==='/api/ps')result={models:[...warm.keys()].map(name=>({name,size_vram:0}))};
  else if(url.pathname==='/api/generate'){
   let raw='';for await(const chunk of req)raw+=chunk;
   const body=JSON.parse(raw);called.push(body);
   if(body.keep_alive===0)warm.delete(body.model);else warm.set(body.model,true);
   result={response:'',eval_count:0};
  }else{status=404;result={error:'unknown mock route'};}
  res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(result));
 });
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const keys=['MODEL_HUB_PORT','MODEL_HUB_BIND','MODEL_HUB_TOKEN','MODEL_HUB_OLLAMA_URL',
  'MODEL_HUB_KEEP_ALIVE','MODEL_HUB_MAX_WARM_MODELS','MODEL_HUB_AUTOSTART_MODELS',
  'MODEL_HUB_AUTOSTART_MODEL','MODEL_HUB_AUTOSTART_BACKEND','MODEL_HUB_GPU_REQUIRED',
  'MODEL_HUB_GPU_PREVIEW_ONLY'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let service;
 try{
  process.env.MODEL_HUB_PORT='0';process.env.MODEL_HUB_BIND='127.0.0.1';
  process.env.MODEL_HUB_TOKEN='test-fixture-owner-token';
  process.env.MODEL_HUB_OLLAMA_URL='http://127.0.0.1:'+provider.address().port;
  process.env.MODEL_HUB_KEEP_ALIVE='-1';process.env.MODEL_HUB_MAX_WARM_MODELS='2';
  process.env.MODEL_HUB_AUTOSTART_MODELS=first.id+','+second.id;
  delete process.env.MODEL_HUB_AUTOSTART_MODEL;delete process.env.MODEL_HUB_AUTOSTART_BACKEND;
  delete process.env.MODEL_HUB_GPU_REQUIRED;delete process.env.MODEL_HUB_GPU_PREVIEW_ONLY;
  service=await start();
  if(!service.server.listening)await once(service.server,'listening');
  const base='http://127.0.0.1:'+service.server.address().port;
  let state;
  for(let i=0;i<80;i++){
   state=await(await fetch(base+'/v1/status')).json();
   if(state.activeModel===first.id&&state.warmPool?.observedLoadedModelIds?.length===2)break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(state.activeModel,first.id);
  assert.deepEqual(state.warmPool.observedLoadedModelIds,[first.id,second.id]);
  assert.equal(state.warmPool.state,'UPSTREAM_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(state.warmPool.keepAlive,-1);
  assert.equal(state.warmPool.targetMaxModels,2);
  assert.equal(warm.size,2);
  assert.equal(called.length,2);
  assert.ok(called.every(x=>x.prompt===''&&x.stream===false&&x.keep_alive===-1));
  assert.deepEqual(called.map(x=>x.model),[second.ollama,first.ollama]);
 }finally{
  if(service?.server.listening)await new Promise(resolve=>service.server.close(resolve));
  await new Promise(resolve=>provider.close(resolve));
  for(const k of keys){
   if(previous[k]===undefined)delete process.env[k];
   else process.env[k]=previous[k];
  }
 }
});
