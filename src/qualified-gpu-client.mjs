// Consumer of the existing LeeWay GPU service. Trusted deployment callbacks
// verify qualification and final receipts; HTTP metadata cannot issue authority.
import {randomUUID} from 'node:crypto';

const SERVICE='leeway.gpu.service';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;
const SHA=/^[a-f0-9]{64}$/;
const evidenceHashes=['requestHash','resultHash','modelSha256','tokenizerSha256','implementationSha256',
  'formulaReceiptSha256','formulaReplaySha256','ldWmdReceiptSha256','continuumReceiptSha256',
  'postReceiptSha256','commitAttestationSha256','receiptLedgerReceiptSha256','learningLedgerReceiptSha256'];
const fail=code=>{throw Object.assign(Error(code),{code:503});};
const snapshot=value=>{
  const copy=structuredClone(value);
  const freeze=item=>{if(item&&typeof item==='object'&&!Object.isFrozen(item)){Object.values(item).forEach(freeze);Object.freeze(item);}return item;};
  return freeze(copy);
};

function endpointUrl(endpoint){
  let url;try{url=new URL(endpoint)}catch{fail('GPU_ENDPOINT_INVALID')}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||
    !(url.protocol==='https:'||(url.protocol==='http:'&&local)))fail('GPU_ENDPOINT_REQUIRES_HTTPS_OR_LOOPBACK');
  return url.href.replace(/\/$/,'');
}

export function createQualifiedGpuClient({endpoint='',token='',fetchImpl=fetch,
  authenticateGpuRequest,verifyGpuQualification,verifyGpuResult}={}){
  const base=endpoint?endpointUrl(endpoint):'';
  const authenticate=typeof authenticateGpuRequest==='function'?authenticateGpuRequest:
    token?async()=>({clientId:'leeway.model-hub',headers:{authorization:'Bearer '+token}}):null;
  const bound=!!base&&!!authenticate&&typeof verifyGpuQualification==='function'&&typeof verifyGpuResult==='function';

  async function principal(operation,request){
    let auth;try{auth=await authenticate({operation,endpoint:base,...request})}catch{fail('GPU_AUTHENTICATION_CAPABILITY_REJECTED')}
    if(!ID.test(auth?.clientId||'')||!auth.headers||typeof auth.headers!=='object'||Array.isArray(auth.headers))
      fail('GPU_AUTHENTICATION_CAPABILITY_REJECTED');
    const headers={};
    for(const [name,value]of Object.entries(auth.headers)){
      const key=name.toLowerCase();
      if(!['authorization','x-leeway-client-proof'].includes(key)||typeof value!=='string'||!value||value.length>8192||/[\r\n]/.test(value))
        fail('GPU_AUTHENTICATION_HEADERS_INVALID');
      headers[key]=value;
    }
    if(!headers.authorization&&!headers['x-leeway-client-proof'])fail('GPU_AUTHENTICATION_CAPABILITY_REJECTED');
    return {clientId:auth.clientId,headers};
  }

  async function call(path,{auth,body,timeout=90000,signal}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    const abort=()=>controller.abort();
    if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
    try{
      const response=await fetchImpl(base+path,{method:body===undefined?'GET':'POST',redirect:'error',
        headers:{'content-type':'application/json',...auth.headers},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
      if(!response.ok)fail('GPU_UPSTREAM_HTTP_'+response.status);
      if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('GPU_RESPONSE_JSON_REQUIRED');
      const reader=response.body?.getReader();let raw='';
      if(reader){
        let bytes=0;const chunks=[];
        for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;
          if(bytes>256*1024){await reader.cancel();fail('GPU_RESPONSE_TOO_LARGE')}chunks.push(Buffer.from(next.value));}
        raw=Buffer.concat(chunks).toString('utf8');
      }else{raw=await response.text();if(Buffer.byteLength(raw)>256*1024)fail('GPU_RESPONSE_TOO_LARGE');}
      let value;try{value=JSON.parse(raw)}catch{fail('GPU_RESPONSE_JSON_INVALID')}
      if(!value||typeof value!=='object'||Array.isArray(value))fail('GPU_RESPONSE_JSON_INVALID');
      return snapshot(value);
    }catch(error){if(error?.code===503)throw error;fail('GPU_UPSTREAM_UNAVAILABLE')}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }

  async function qualified(auth,signal){
    const c=await call('/v1/capabilities',{auth,timeout:4000,signal});
    if(c.serviceId!==SERVICE||c.schema!=='leeway.gpu.inference.v1'||c.modelInference!==true||c.gpuVerified!==true||
      !ID.test(c.receiptId||'')||!Array.isArray(c.models)||c.models.length<1||c.models.length>128||
      c.models.some(id=>!ID.test(id))||new Set(c.models).size!==c.models.length)fail('GPU_QUALIFICATION_CONTRACT_INVALID');
    let verified=false;try{verified=await verifyGpuQualification({capabilities:c,endpoint:base,clientId:auth.clientId})}catch{}
    if(verified!==true)
      fail('GPU_QUALIFICATION_NOT_INDEPENDENTLY_VERIFIED');
    return c;
  }

  async function capabilities(){
    if(!base)return {bound:false,status:'UNBOUND',gpuInferenceQualified:false,models:[]};
    if(!bound)return {bound:true,status:'UNAVAILABLE',gpuInferenceQualified:false,models:[],reason:'GPU_TRUSTED_CONSUMER_BINDING_REQUIRED'};
    try{
      const auth=await principal('capabilities');const c=await qualified(auth);
      return {bound:true,status:'QUALIFICATION_VERIFIED_REQUEST_AUTHORIZATION_REQUIRED',gpuInferenceQualified:true,
        serviceId:SERVICE,receiptId:c.receiptId,models:[...c.models],verification:'TRUSTED_CONSUMER_VERIFIED'};
    }catch{return {bound:true,status:'UNAVAILABLE',gpuInferenceQualified:false,models:[],reason:'GPU_QUALIFICATION_UNAVAILABLE'};}
  }

  async function activateModel({modelId}){
    if(!bound)fail('GPU_TRUSTED_CONSUMER_BINDING_REQUIRED');
    const auth=await principal('activate',{modelId});const c=await qualified(auth);
    if(!c.models.includes(modelId))fail('GPU_MODEL_NOT_QUALIFIED');
    const result=await call('/v1/models/activate',{auth,body:{modelId},timeout:70000});
    if(result.serviceId!==SERVICE||result.modelId!==modelId||result.activeModel!==modelId||result.backend!=='LEEWAY_GPU'||
      result.activation!=='SELECTED_NO_MODEL_EXECUTION')fail('GPU_ACTIVATION_IDENTITY_MISMATCH');
    return snapshot({...result,clientId:auth.clientId,sessionId:randomUUID()});
  }

  async function generate({modelId,prompt,requestId=randomUUID(),sessionId,maxNewTokens=32},{expectedClientId,signal}={}){
    if(!bound)fail('GPU_TRUSTED_CONSUMER_BINDING_REQUIRED');
    if(!ID.test(modelId||'')||!ID.test(requestId)||!ID.test(sessionId||'')||typeof prompt!=='string'||!prompt.trim()||
      prompt.length>4096||!Number.isSafeInteger(maxNewTokens)||maxNewTokens<1||maxNewTokens>64)fail('GPU_GENERATION_REQUEST_INVALID');
    const request=snapshot({modelId,prompt,requestId,sessionId,maxNewTokens});
    const auth=await principal('generate',{modelId,requestId,sessionId});
    if(auth.clientId!==expectedClientId)fail('GPU_AUTHENTICATED_CLIENT_CHANGED');
    const c=await qualified(auth,signal);if(!c.models.includes(modelId))fail('GPU_MODEL_NOT_QUALIFIED');
    const result=await call('/v1/generate',{auth,body:request,signal});const e=result.executionBinding;
    if(result.serviceId!==SERVICE||result.modelId!==modelId||result.backend!=='LEEWAY_GPU'||
      result.requestId!==requestId||result.sessionId!==sessionId||result.execution!=='LEEWAY_QUANTIZED_WGSL_GRAPH'||
      result.canonicalReceiptIssued!==true||typeof result.text!=='string'||!result.text.trim()||result.text.length>12000||
      e?.requestId!==requestId||e?.sessionId!==sessionId||evidenceHashes.some(key=>!SHA.test(e?.[key]||'')))
      fail('GPU_EXECUTION_EVIDENCE_INCOMPLETE_OR_MISMATCHED');
    let verified=false;try{verified=await verifyGpuResult({request,result,qualification:c,endpoint:base,clientId:auth.clientId})}catch{}
    if(verified!==true)
      fail('GPU_RESULT_NOT_INDEPENDENTLY_VERIFIED');
    return snapshot({...result,verification:'TRUSTED_CONSUMER_VERIFIED'});
  }

  return Object.freeze({capabilities,activateModel,generate});
}
