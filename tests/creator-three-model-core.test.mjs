import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadThreeModelCore,validateThreeModelCore,threeModelCatalog,createThreeModelGpuRuntime} from '../src/creator-three-model-core.mjs';
import {createHub} from '../src/server.mjs';

const profile=await loadThreeModelCore();
const idByRole={reflex:'qwen3-0.6b-q4km','agent-lee':'qwen3-1.7b-q4km','tablet-eyes':'qwen3.5-0.8b'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('Creator core is exactly three immutable purpose-scoped models',()=>{
  const slots=validateThreeModelCore(profile);
  assert.deepEqual(slots.map(s=>s.id),Object.values(idByRole));
  assert.deepEqual(threeModelCatalog(profile).models.map(s=>s.id),Object.values(idByRole));
  assert.ok(slots[2].modality.includes('image'));
  assert.ok(!slots[0].modality.includes('image'));
  assert.equal(profile.security.modelMayExecuteTools,false);
  assert.equal(profile.security.modelMayGrantPermissions,false);
  assert.equal(profile.defaultBackend,'LEEWAY_GPU');
  assert.equal(profile.fallback,'DENY_UNADMITTED');
});
test('invalid roster and model self-authority are rejected',()=>{
  for(const mutation of [p=>p.slots.pop(),p=>p.slots[0].modelId='foreign',
    p=>p.slots[1].slot='reflex',p=>p.security.modelMayExecuteTools=true,
    p=>p.defaultBackend='OLLAMA']){
    const p=structuredClone(profile);mutation(p);
    assert.throws(()=>validateThreeModelCore(p),/THREE_CORE_/);
  }
});
test('each role activates its own model then generates with matching verified request',async()=>{
  const calls=[],client={
    capabilities:async()=>({gpuInferenceQualified:true,models:Object.values(idByRole)}),
    activateModel:async({modelId})=>{calls.push(['activate',modelId]);return {sessionId:'session-'+modelId,clientId:'owner-client'};},
    generate:async(request,context)=>{calls.push(['generate',request.modelId,request.requestId,context.expectedClientId]);
      return {...request,backend:'LEEWAY_GPU',text:'verified',verification:'TRUSTED_CONSUMER_VERIFIED',
        canonicalReceiptIssued:true,executionBinding:{requestId:request.requestId}};}
  };
  const runtime=createThreeModelGpuRuntime({profile,gpuClient:client});
  for(const role of Object.keys(idByRole)){
    const result=await runtime.infer({role,prompt:'test',requestId:'req-'+role});
    assert.equal(result.modelId,idByRole[role]);
    assert.equal(result.backend,'LEEWAY_GPU');
    assert.equal(result.verification,'TRUSTED_CONSUMER_VERIFIED');
  }
  assert.deepEqual(calls.map(c=>c[0]),['activate','generate','activate','generate','activate','generate']);
});
test('concurrent requests serialize activation and generation',async()=>{
  const gate=deferred(),events=[];let first=true;
  const runtime=createThreeModelGpuRuntime({profile,gpuClient:{
    capabilities:async()=>({gpuInferenceQualified:true,models:Object.values(idByRole)}),
    activateModel:async({modelId})=>{events.push('activate:'+modelId);return {sessionId:'session-'+modelId,clientId:'owner-client'};},
    generate:async r=>{events.push('generate:'+r.modelId);if(first){first=false;await gate.promise;}
      return {...r,backend:'LEEWAY_GPU',text:'ok',verification:'TRUSTED_CONSUMER_VERIFIED',canonicalReceiptIssued:true};}
  }});
  const one=runtime.infer({role:'reflex',prompt:'route'});
  const two=runtime.infer({role:'agent-lee',prompt:'draft'});
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(events,['activate:qwen3-0.6b-q4km','generate:qwen3-0.6b-q4km']);
  gate.resolve();await Promise.all([one,two]);
  assert.deepEqual(events,['activate:qwen3-0.6b-q4km','generate:qwen3-0.6b-q4km',
    'activate:qwen3-1.7b-q4km','generate:qwen3-1.7b-q4km']);
});
test('unqualified models, bad authority, unsupported image transport and cancellation fail closed',async()=>{
  let activations=0;
  const client={
    capabilities:async()=>({gpuInferenceQualified:false,models:Object.values(idByRole)}),
    activateModel:async()=>{activations++;throw Error('SHOULD_NOT_CALL');},
    generate:async()=>{throw Error('SHOULD_NOT_CALL');}
  };
  const runtime=createThreeModelGpuRuntime({profile,gpuClient:client});
  await assert.rejects(runtime.infer({role:'reflex',prompt:'hello'}),/GPU_MODEL_NOT_QUALIFIED/);
  await assert.rejects(runtime.infer({role:'tablet-eyes',prompt:'inspect',image:{bytes:'fake'}}),/GOVERNED_IMAGE_TRANSPORT_UNAVAILABLE/);
  await assert.rejects(runtime.infer({role:'admin',prompt:'hello'}),/ROLE_INVALID/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(runtime.infer({role:'reflex',prompt:'hello'},{signal:controller.signal}),/CANCELLED/);
  assert.equal(activations,0);
});
test('unverified GPU result is never returned',async()=>{
  const runtime=createThreeModelGpuRuntime({profile,gpuClient:{
    capabilities:async()=>({gpuInferenceQualified:true,models:Object.values(idByRole)}),
    activateModel:async()=>({sessionId:'s1',clientId:'owner'}),
    generate:async()=>({verification:'UNADMITTED_PREVIEW',backend:'OLLAMA',text:'unverified'})
  }});
  await assert.rejects(runtime.infer({role:'agent-lee',prompt:'test'}),/FINAL_GPU_EVIDENCE_REQUIRED/);
});
test('Model Hub three-core HTTP path requires owner authentication and rejects legacy controls',async t=>{
  const hub=createHub({catalog:threeModelCatalog(profile),coreProfile:profile,token:'owner-secret',gpuRequired:true,
    gpuUrl:'https://gpu.example.invalid',authenticateGpuRequest:async()=>({clientId:'owner',headers:{authorization:'Bearer fixture'}}),
    verifyGpuQualification:async()=>true,verifyGpuResult:async()=>true,
    fetchImpl:async()=>Response.json({schema:'leeway.gpu.inference.v1',serviceId:'leeway.gpu.service',
      modelInference:true,gpuVerified:true,receiptId:'test',models:Object.values(idByRole)})});
  const server=http.createServer((req,res)=>hub.handler(req,res));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  const request=(path,token,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',
    ...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const denied=await request('/v1/core/infer','',{role:'reflex',prompt:'hi'});assert.equal(denied.status,401);
  const old=await request('/v1/models/activate','owner-secret',{modelId:idByRole.reflex});assert.equal(old.status,409);
  const image=await request('/v1/core/infer','owner-secret',{role:'tablet-eyes',prompt:'see',image:{}});
  assert.equal(image.status,503);
  const status=await fetch(base+'/v1/core/status');assert.equal(status.status,200);
  assert.equal((await status.json()).slots.length,3);
});
