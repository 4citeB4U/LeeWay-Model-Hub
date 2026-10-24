// Synthetic HTTP evidence fixtures exercise the consumer boundary only.
// These tests do not qualify hardware, run a model, or issue canonical receipts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHub} from '../src/server.mjs';
import {createQualifiedGpuClient} from '../src/qualified-gpu-client.mjs';

const catalog={models:[{id:'fixture-model',displayName:'Fixture model',weightLicense:'fixture',ollama:'fixture:model'},
  {id:'other-model',displayName:'Other model',weightLicense:'fixture',ollama:'other:model'}]};
const hashes=['requestHash','resultHash','modelSha256','tokenizerSha256','implementationSha256',
  'formulaReceiptSha256','formulaReplaySha256','ldWmdReceiptSha256','continuumReceiptSha256',
  'postReceiptSha256','commitAttestationSha256','receiptLedgerReceiptSha256','learningLedgerReceiptSha256'];
const fixture=(options={})=>{
  const calls=[],verifiedResults=[];
  const capabilities={schema:'leeway.gpu.inference.v1',serviceId:'leeway.gpu.service',
    modelInference:true,gpuVerified:true,receiptId:'fixture-qualification',models:['fixture-model']};
  const startup={catalog,token:'owner-fixture',gpuUrl:'https://gpu.example.invalid/service',
    authenticateGpuRequest:async()=>({clientId:'model-hub-fixture',headers:{authorization:'Bearer private-upstream-fixture'}}),
    verifyGpuQualification:async({capabilities:c})=>c.receiptId==='fixture-qualification',
    verifyGpuResult:async context=>{verifiedResults.push(context);return context.result.text==='fixture-output';},
    fetchImpl:async(url,request={})=>{
      const body=request.body?JSON.parse(request.body):undefined;
      calls.push({url,body,headers:request.headers,redirect:request.redirect});
      if(url.endsWith('/v1/capabilities'))return Response.json(capabilities);
      if(url.endsWith('/v1/models/activate'))return Response.json(options.activation?.(body)||{
        serviceId:'leeway.gpu.service',modelId:body.modelId,activeModel:body.modelId,
        backend:'LEEWAY_GPU',activation:'SELECTED_NO_MODEL_EXECUTION'});
      if(url.endsWith('/v1/generate')){
        await options.beforeGenerate?.({body,request});
        const result={serviceId:'leeway.gpu.service',modelId:body.modelId,backend:'LEEWAY_GPU',
          requestId:body.requestId,sessionId:body.sessionId,text:'fixture-output',
          execution:'LEEWAY_QUANTIZED_WGSL_GRAPH',canonicalReceiptIssued:true,
          modelGraphTimings:{schema:'leeway.gpu.model-graph-timings.v1',
            scope:'MODEL_GRAPH_AFTER_LOAD_EXCLUDES_AUTHORIZATION_POST_VERITAS_AND_CONTINUUM_COMMIT',
            modelLoadMs:12,prefillMs:4,timeToFirstTokenMs:4,decodeMs:1,totalInferenceMs:5,
            promptTokens:3,visibleOutputTokens:1,tokenTimings:[{position:2,commands:8,elapsedMs:4}]},
          executionBinding:{requestId:body.requestId,sessionId:body.sessionId,
            ...Object.fromEntries(hashes.map(key=>[key,'a'.repeat(64)]))}};
        options.mutateResult?.(result);
        return Response.json(result);
      }
      throw Error('UNEXPECTED_UPSTREAM');
    },...options.startup};
  return {startup,calls,capabilities,verifiedResults,hub:createHub(startup)};
};

async function serve(hub,t){
  const server=http.createServer((req,res)=>hub.handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  return {base,post:(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer owner-fixture'},body:JSON.stringify(body)})};
}

test('capability booleans without trusted verifier or authentication stay unavailable',async()=>{
  for(const omitted of ['verifyGpuQualification','verifyGpuResult','authenticateGpuRequest']){
    const f=fixture({startup:{[omitted]:undefined}});
    assert.equal((await f.hub.gpuCapabilities()).gpuInferenceQualified,false);
    await assert.rejects(()=>f.hub.select('fixture-model','LEEWAY_GPU'),/GPU_TRUSTED_CONSUMER_BINDING_REQUIRED/);
    assert.equal(f.calls.length,0);
    assert.equal(f.hub.getState().provider,'OLLAMA');
    assert.equal(f.hub.getState().activeId,null);
  }
});

test('trusted verifier must return primitive true rather than a claimed verification object',async()=>{
  const f=fixture({startup:{verifyGpuQualification:async()=>({verified:true})}});
  assert.equal((await f.hub.gpuCapabilities()).gpuInferenceQualified,false);
  await assert.rejects(()=>f.hub.select('fixture-model','LEEWAY_GPU'),/NOT_INDEPENDENTLY_VERIFIED/);
  assert.ok(f.calls.every(call=>call.url.endsWith('/v1/capabilities')));
});

test('authenticated qualified route preserves fresh request, session, and complete execution evidence',async t=>{
  const f=fixture();const service=await serve(f.hub,t);
  const selected=await service.post('/v1/models/activate',{modelId:'fixture-model',backend:'LEEWAY_GPU'});
  assert.equal(selected.status,200);const activation=await selected.json();
  assert.equal(activation.modelWarmState,'SELECTED_NO_MODEL_EXECUTION');
  assert.equal(activation.modelWarmRequestedAt,null);
  const response=await service.post('/v1/chat',{message:'fixture prompt',requestId:'request-1',sessionId:activation.sessionId,maxNewTokens:4});
  assert.equal(response.status,200);const answer=await response.json();
  assert.equal(answer.requestId,'request-1');assert.equal(answer.sessionId,activation.sessionId);
  assert.equal(answer.gpuClaim,'TRUSTED_CONSUMER_VERIFIED_REQUEST');
  assert.equal(answer.modelGraphTimings.totalInferenceMs,5);
  assert.equal(answer.modelGraphTimings.tokenTimings[0].position,2);
  assert.equal(answer.executionBinding.commitAttestationSha256,'a'.repeat(64));
  assert.equal(answer.executionBinding.learningLedgerReceiptSha256,'a'.repeat(64));
  assert.equal(f.verifiedResults.length,1);assert.equal(f.verifiedResults[0].clientId,'model-hub-fixture');
  assert.equal(f.verifiedResults[0].request.prompt,'fixture prompt');
  assert.ok(f.calls.every(call=>call.headers.authorization==='Bearer private-upstream-fixture'));
  assert.ok(f.calls.every(call=>call.redirect==='error'));
  assert.ok(f.calls.every(call=>!(JSON.stringify(call.body)||'').includes('private-upstream-fixture')));
  assert.ok(f.calls.every(call=>call.url.startsWith('https://gpu.example.invalid/service/v1/')));
  assert.ok(f.calls.every(call=>!call.url.includes('/api/')));
});

test('GPU inventory uses qualified catalog evidence and never queries Ollama',async()=>{
  const f=fixture({startup:{gpuRequired:true}});
  const inventory=await f.hub.inventory();
  assert.equal(inventory[0].availability,'QUALIFIED_PROVIDER_MODEL');
  assert.equal(inventory[0].loaded,null);assert.equal(inventory[0].installed,null);
  assert.equal(inventory[1].availability,'UNAVAILABLE');
  assert.ok(f.calls.every(call=>call.url.endsWith('/v1/capabilities')));
});

test('GPU-required mode refuses other providers before side effects and defaults selection to GPU',async()=>{
  const f=fixture({startup:{gpuRequired:true}});
  assert.equal(f.hub.getState().provider,'LEEWAY_GPU');
  for(const backend of ['OLLAMA','LEEWAY_GPU_PREVIEW'])
    await assert.rejects(()=>f.hub.select('fixture-model',backend),/GPU_REQUIRED_NO_FALLBACK/);
  assert.equal(f.calls.length,0);
  await f.hub.select('fixture-model');assert.equal(f.hub.getState().provider,'LEEWAY_GPU');
  assert.throws(()=>createHub({...f.startup,gpuRequired:true,gpuPreviewOnly:true}),/CONFLICT/);
});

test('activation identity mismatch preserves prior state',async()=>{
  const f=fixture({activation:body=>({serviceId:'other-service',modelId:body.modelId,activeModel:body.modelId,backend:'LEEWAY_GPU',activation:'SELECTED_NO_MODEL_EXECUTION'})});
  await assert.rejects(()=>f.hub.select('fixture-model','LEEWAY_GPU'),/ACTIVATION_IDENTITY_MISMATCH/);
  assert.equal(f.hub.getState().provider,'OLLAMA');assert.equal(f.hub.getState().activeId,null);
});

test('mismatched request/session and missing final evidence never reach independent verifier',async()=>{
  for(const mutateResult of [r=>{r.requestId='other'},r=>{r.sessionId='other'},
    r=>{r.executionBinding.requestId='other'},r=>{delete r.executionBinding.commitAttestationSha256},
    r=>{delete r.executionBinding.learningLedgerReceiptSha256},r=>{r.canonicalReceiptIssued=false}]){
    const f=fixture({mutateResult});await f.hub.select('fixture-model','LEEWAY_GPU');
    await assert.rejects(()=>f.hub.infer('fixture prompt'),/EVIDENCE_INCOMPLETE_OR_MISMATCHED/);
    assert.equal(f.verifiedResults.length,0);assert.equal(f.hub.getState().provider,'LEEWAY_GPU');
    assert.ok(f.calls.every(call=>!call.url.includes('/api/')));
  }
});

test('independent verifier rejection cannot release output or trigger fallback',async()=>{
  const f=fixture({mutateResult:r=>{r.text='tampered output'}});await f.hub.select('fixture-model','LEEWAY_GPU');
  await assert.rejects(()=>f.hub.infer('fixture prompt'),/RESULT_NOT_INDEPENDENTLY_VERIFIED/);
  assert.equal(f.hub.getState().provider,'LEEWAY_GPU');
  assert.ok(f.calls.every(call=>!call.url.includes('/api/')));
});

test('qualification is rechecked before each generation and removed models cannot execute',async()=>{
  const f=fixture();await f.hub.select('fixture-model','LEEWAY_GPU');
  f.capabilities.models=['other-model'];
  await assert.rejects(()=>f.hub.infer('fixture prompt'),/MODEL_NOT_QUALIFIED/);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/v1/generate')).length,0);
});

test('client identity drift and foreign sessions stop before generation',async()=>{
  let clientId='first-client';
  const f=fixture({startup:{authenticateGpuRequest:async()=>({clientId,headers:{authorization:'Bearer test'}})}});
  await f.hub.select('fixture-model','LEEWAY_GPU');
  await assert.rejects(()=>f.hub.infer('prompt',{sessionId:'foreign-session'}),/SESSION_MISMATCH/);
  clientId='different-client';await assert.rejects(()=>f.hub.infer('prompt'),/AUTHENTICATED_CLIENT_CHANGED/);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/v1/generate')).length,0);
});

test('a generation holds the provider-selection lock until its request completes',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const f=fixture({startup:{gpuRequired:true},beforeGenerate:()=>pending});
  await f.hub.select('fixture-model');
  const generation=f.hub.infer('serialized prompt');
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(()=>f.hub.select('other-model'),/MODEL_SWITCH_BUSY/);
  await assert.rejects(()=>f.hub.infer('overlapping prompt'),/MODEL_SWITCH_BUSY/);
  release();const answer=await generation;assert.equal(answer.text,'fixture-output');
  assert.equal(f.hub.getState().busy,false);
});

test('caller cancellation is propagated to the qualified GPU HTTP request',async()=>{
  let generatedSignal;
  const client=createQualifiedGpuClient({endpoint:'https://gpu.example.invalid',
    authenticateGpuRequest:async()=>({clientId:'model-hub-fixture',headers:{authorization:'Bearer test'}}),
    verifyGpuQualification:async()=>true,verifyGpuResult:async()=>true,
    fetchImpl:async(url,request={})=>{
      if(url.endsWith('/v1/capabilities'))return Response.json({schema:'leeway.gpu.inference.v1',serviceId:'leeway.gpu.service',
        modelInference:true,gpuVerified:true,receiptId:'fixture-qualification',models:['fixture-model']});
      if(url.endsWith('/v1/generate')){
        generatedSignal=request.signal;
        return await new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
      }
      throw Error('UNEXPECTED_UPSTREAM');
    }});
  const controller=new AbortController();
  const pending=client.generate({modelId:'fixture-model',prompt:'cancel me',sessionId:'session-1'},
    {expectedClientId:'model-hub-fixture',signal:controller.signal});
  await new Promise(resolve=>setImmediate(resolve));controller.abort();
  await assert.rejects(pending,/UPSTREAM_UNAVAILABLE/);assert.equal(generatedSignal.aborted,true);
});

test('request JSON cannot supply a provider URL, credentials, verifier, or alternate model',async t=>{
  const f=fixture();const service=await serve(f.hub,t);
  for(const key of ['gpuUrl','gpuToken','verifyGpuResult','modelId']){
    const response=await service.post('/v1/chat',{message:'prompt',[key]:'attacker-value'});
    assert.equal(response.status,400);
  }
  assert.equal(f.calls.length,0);
});

test('endpoint adapters require HTTPS off-host and deny credential-bearing URLs',()=>{
  for(const endpoint of ['http://192.0.2.1:4178','https://user:secret@gpu.example.invalid','https://gpu.example.invalid?token=secret'])
    assert.throws(()=>createQualifiedGpuClient({endpoint}),/HTTPS_OR_LOOPBACK/);
  assert.doesNotThrow(()=>createQualifiedGpuClient({endpoint:'http://127.0.0.1:4178'}));
  assert.doesNotThrow(()=>createQualifiedGpuClient({endpoint:'https://gpu.example.invalid/service'}));
});
