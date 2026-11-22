/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.CREATOR_THREE_MODEL_CORE
WHAT = Execute exactly three purpose-bound LeeWay models through the existing qualified GPU consumer.
WHY = Models support Agent Lee and applications but never own authority, tools, or permissions.
WHO = Creator-authorized outside support; not Agent Lee or Veritas.
WHERE = LeeWay-Model-Hub/src/creator-three-model-core.mjs
WHEN = 2026-11-22.
HOW = Pinned role manifest, authenticated qualified GPU activation, serialized inference, final evidence checks.
LICENSE = Existing repository terms.
*/
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const expected = Object.freeze({
  reflex:'qwen3-0.6b-q4km',
  'agent-lee':'qwen3-1.7b-q4km',
  'tablet-eyes':'qwen3.5-0.8b'
});
const roles = Object.keys(expected);
const validId = value => typeof value==='string' && /^[a-z0-9][a-z0-9.-]{1,127}$/.test(value);
const fail=(message,code=400)=>{throw Object.assign(Error(message),{code});};
const frozen=value=>Object.freeze(value);

export async function loadThreeModelCore(){
  return JSON.parse(await readFile(new URL('../contracts/creator-three-model-core.v1.json',import.meta.url),'utf8'));
}
export function validateThreeModelCore(profile){
  if(profile?.schema!=='leeway.model-hub.active-three-core.v1'||profile.serviceId!=='leeway.gpu.service'||
    profile.defaultBackend!=='LEEWAY_GPU'||profile.fallback!=='DENY_UNADMITTED'||
    profile.modelAuthority!=='NONE'||!Array.isArray(profile.slots)||profile.slots.length!==3||
    profile.security?.inferOnly!==true||profile.security?.modelMayExecuteTools!==false||
    profile.security?.modelMayGrantPermissions!==false||profile.security?.modelMaySelectAuthority!==false||
    profile.security?.requiresIndependentGpuQualification!==true||
    profile.security?.requiresRequestBoundGpuEvidence!==true||
    profile.security?.requiresGovernedImageTransport!==true) fail('THREE_CORE_CONTRACT_INVALID');
  for(const [index,role] of roles.entries()){
    const slot=profile.slots[index];
    if(slot?.slot!==role||slot?.modelId!==expected[role]||
      !validId(slot.modelId)||!validId(slot.ollama.replace(':','.'))||
      !Array.isArray(slot.modality)||!slot.modality.includes('text')||
      (role==='tablet-eyes')!==slot.modality.includes('image')||
      !Number.isSafeInteger(slot.maxNewTokens)||slot.maxNewTokens<1||slot.maxNewTokens>64)
      fail('THREE_CORE_SLOT_INVALID');
  }
  if(new Set(profile.slots.map(x=>x.modelId)).size!==3)fail('THREE_CORE_DUPLICATE_MODEL');
  return frozen(profile.slots.map(s=>frozen({
    id:s.modelId,displayName:s.displayName,ollama:s.ollama,
    weightLicense:s.weightLicense,role:s.slot,modality:frozen([...s.modality]),
    purpose:frozen([...s.purpose]),maxNewTokens:s.maxNewTokens
  })));
}
export function threeModelCatalog(profile){
  const slots=validateThreeModelCore(profile);
  return {schema:'leeway.model-hub.catalog.v1',owner:'LeeWay Industries',
    profile:'CREATOR_THREE_MODEL_CORE',models:slots.map(s=>({
      id:s.id,displayName:s.displayName,ollama:s.ollama,
      weightLicense:s.weightLicense,family:'Qwen',role:s.role,modality:[...s.modality],
      description:'Only an authenticated qualified LeeWay GPU service may execute this slot.'
    }))};
}
/**
 * A serial execution lane is needed because the existing GPU service has a model
 * activation operation. Selection and generation must not interleave between roles.
 * The GPU client alone verifies all Runtime, Formula, LDWMD, Continuum,
 * independent Veritas and Receipt/Learning evidence; we do not forge callbacks.
 */
export function createThreeModelGpuRuntime({profile,gpuClient}={}){
  const slots=validateThreeModelCore(profile);
  if(typeof gpuClient?.activateModel!=='function'||typeof gpuClient?.generate!=='function'||
    typeof gpuClient?.capabilities!=='function')fail('THREE_CORE_GPU_CLIENT_REQUIRED',503);
  const byRole=new Map(slots.map(slot=>[slot.role,slot]));
  let tail=Promise.resolve();
  const schedule=fn=>{
    const run=tail.then(fn);
    tail=run.catch(()=>{});
    return run;
  };
  async function infer({role,prompt,requestId=randomUUID(),maxNewTokens,image}={}, {signal}={}){
    if(!byRole.has(role))fail('THREE_CORE_ROLE_INVALID');
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>4096)fail('THREE_CORE_PROMPT_INVALID');
    if(!validId(requestId))fail('THREE_CORE_REQUEST_ID_INVALID');
    const slot=byRole.get(role);
    const tokens=maxNewTokens===undefined?slot.maxNewTokens:maxNewTokens;
    if(!Number.isSafeInteger(tokens)||tokens<1||tokens>slot.maxNewTokens)fail('THREE_CORE_TOKEN_BUDGET_INVALID');
    // No image bytes may be dropped, coerced to text or sent through a text-only
    // GPU transport. A separate governed image contract must be qualified first.
    if(image!==undefined)fail('THREE_CORE_GOVERNED_IMAGE_TRANSPORT_UNAVAILABLE',503);
    if(signal?.aborted)fail('THREE_CORE_CANCELLED',499);
    return schedule(async()=>{
      if(signal?.aborted)fail('THREE_CORE_CANCELLED',499);
      const capability=await gpuClient.capabilities();
      if(capability?.gpuInferenceQualified!==true||!capability.models?.includes(slot.id))
        fail('THREE_CORE_GPU_MODEL_NOT_QUALIFIED',503);
      const activation=await gpuClient.activateModel({modelId:slot.id});
      if(!validId(activation?.sessionId)||!validId(activation?.clientId))
        fail('THREE_CORE_GPU_ACTIVATION_INVALID',503);
      if(signal?.aborted)fail('THREE_CORE_CANCELLED',499);
      const result=await gpuClient.generate({
        modelId:slot.id,prompt,requestId,sessionId:activation.sessionId,maxNewTokens:tokens
      },{expectedClientId:activation.clientId,signal});
      if(result?.verification!=='TRUSTED_CONSUMER_VERIFIED'||result.modelId!==slot.id||
        result.requestId!==requestId||result.sessionId!==activation.sessionId||
        result.backend!=='LEEWAY_GPU'||result.canonicalReceiptIssued!==true)
        fail('THREE_CORE_FINAL_GPU_EVIDENCE_REQUIRED',503);
      return frozen({role,modelId:slot.id,backend:'LEEWAY_GPU',requestId,
        sessionId:activation.sessionId,text:result.text,verification:result.verification,
        executionBinding:result.executionBinding,modelGraphTimings:result.modelGraphTimings??null});
    });
  }
  const status=async()=>{
    const c=await gpuClient.capabilities();
    return {schema:'leeway.model-hub.three-core-status.v1',
      serviceId:'leeway.gpu.service',modelAuthority:'NONE',
      gpuQualified:c.gpuInferenceQualified===true,
      slots:slots.map(s=>({role:s.role,modelId:s.id,
        qualified:c.gpuInferenceQualified===true&&c.models?.includes(s.id)===true,
        modality:s.modality}))};
  };
  return frozen({infer,status});
}
