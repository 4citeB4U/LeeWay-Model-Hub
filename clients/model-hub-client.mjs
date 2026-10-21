/*
LEEWAY HEADER — DO NOT REMOVE
REGION: MODEL_HUB / UNIVERSAL_CLIENT_SDK
TAG: LEEWAY-MODEL-HUB-CLIENT-v1-20261021
WHO: Leonard Jerome Lee, LeeWay Industries; OpenAI assistant contributor
WHAT: Model Hub client contract for Pocket Agent, Logistics, SlowLane and desktop apps
WHEN: 2026-10-21
WHERE: clients/model-hub-client.mjs
WHY: One source of model authority and a single active model backend for any device
HOW: Fetch stable HTTPS/localhost JSON contract; explicit owner auth for actions
AUTHORITY: API client, not a model executor or governance authority
LICENSE: LeeWay original source, owner-controlled
*/
export function createModelHubClient({baseUrl,ownerToken='',fetchImpl=fetch}={}){
 if(!baseUrl || typeof baseUrl!=='string')throw Error('MODEL_HUB_ENDPOINT_REQUIRED');
 const parsed=new URL(baseUrl);
 if(parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('MODEL_HUB_ENDPOINT_NOT_CANONICAL');
 const loopback=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
 if(parsed.protocol!=='https:' && !(parsed.protocol==='http:'&&loopback))
   throw Error('MODEL_HUB_HTTPS_REQUIRED_FOR_NETWORK_ACCESS');
 const base=parsed.origin+parsed.pathname.replace(/\/$/,'');
 const call=async(path,body)=>{
  const method=body?'POST':'GET';
  if(method==='POST'&&!ownerToken)throw Error('MODEL_HUB_OWNER_TOKEN_REQUIRED');
  const r=await fetchImpl(base+path,{method,headers:{
   'content-type':'application/json',
   ...(body?{authorization:'Bearer '+ownerToken}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  const j=await r.json();
  if(!r.ok)throw Error('MODEL_HUB_'+r.status+': '+(j.error||'unknown'));
  return j;
 };
 return Object.freeze({
  catalog:()=>call('/v1/catalog'),
  models:()=>call('/v1/models'),
  status:()=>call('/v1/status'),
  activate:(modelId,backend='OLLAMA')=>call('/v1/models/activate',{modelId,backend}),
  generate:message=>call('/v1/chat',{message}),
  health:()=>call('/health')
 });
}
