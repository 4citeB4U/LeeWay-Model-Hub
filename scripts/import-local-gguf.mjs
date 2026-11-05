/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.OWNER_LOCAL_IMPORT
TAG: LEEWAY.MODEL_HUB.OWNER_GGUF_IMPORT.V1
5WH:
WHAT = Explicit owner-side, hash-pinned GGUF import using the original Ollama provider and canonical Model Hub catalog.
WHY = Let the Creator bring an already-held local model into LeeWay without public uploads or worker-side downloads.
WHO = Authorized local Model Hub operator; not a model, worker or Device Bridge.
WHERE = scripts/import-local-gguf.mjs
WHEN = 2026-11-05
HOW = Read-only preflight by default; opt-in apply with Ollama create, provider readback, then catalog update.
AUTHORIZED_ROLES: Owner-controlled local CLI only; no network or browser action authority.
LICENSE: LeeWay original source, owner controlled. Imported weights retain separate rights.
*/
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, realpath, stat, open, mkdtemp, writeFile, rename, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';

const run=promisify(execFile);
const root=new URL('../',import.meta.url);
const DEFAULT_CATALOG=fileURLToPath(new URL('catalog/models.json',root));
const DEFAULT_PUBLIC_CATALOG=fileURLToPath(new URL('public/catalog/models.json',root));
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-z][a-z0-9-]{2,63}$/;
const originalCatalogSchema='leeway.model-hub.catalog.v1';

const fail=(reason)=>{const e=new Error(reason);e.code=reason;throw e;};
const normalizedText=(v,max=120)=>typeof v==='string'&&v.trim().length>0&&
 v.length<=max&&!/[\r\n\x00-\x1f]/.test(v);
async function hashFile(file){
 const digester=createHash('sha256');
 for await(const chunk of createReadStream(file))digester.update(chunk);
 return digester.digest('hex');
}
async function providerModels(fetchImpl){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetchImpl('http://127.0.0.1:11434/api/tags',{
    method:'GET',signal:controller.signal,headers:{accept:'application/json'}
  });
  if(!response.ok)fail('LOCAL_PROVIDER_INVENTORY_UNAVAILABLE');
  const contentType=response.headers?.get?.('content-type')||'';
  if(!/^application\/json(?:;|$)/i.test(contentType))fail('LOCAL_PROVIDER_RESPONSE_NOT_JSON');
  const body=await response.json();
  if(!Array.isArray(body?.models)||body.models.length>10000||
    body.models.some(m=>typeof m.name!=='string'))fail('LOCAL_PROVIDER_INVENTORY_INVALID');
  return new Set(body.models.map(m=>m.name));
 }finally{clearTimeout(timer);}
}
async function readMatchingCatalogs(canonicalFile,publicFile){
 const [canonicalBytes,publicBytes]=await Promise.all([readFile(canonicalFile),readFile(publicFile)]);
 if(!canonicalBytes.equals(publicBytes))fail('CATALOG_MIRROR_CONFLICT');
 const catalog=JSON.parse(canonicalBytes.toString('utf8'));
 if(catalog.schema!==originalCatalogSchema||!Array.isArray(catalog.models)||!catalog.rules?.listedDoesNotMeanDownloaded)
  fail('CATALOG_AUTHORITY_INVALID');
 return{catalog,original:canonicalBytes};
}
export async function importLocalGguf({
 filePath,importRoot,modelId,displayName,weightLicense,expectedSha256,apply=false,
 canonicalFile=DEFAULT_CATALOG,publicFile=DEFAULT_PUBLIC_CATALOG
},{fetchImpl=fetch,execFileImpl=run}={}){
 if(!ID.test(modelId||''))fail('MODEL_ID_INVALID');
 if(!normalizedText(displayName,100))fail('DISPLAY_NAME_INVALID');
 if(!normalizedText(weightLicense,150))fail('WEIGHT_LICENSE_REQUIRED');
 if(!SHA.test(expectedSha256||''))fail('EXPECTED_SHA256_REQUIRED');
 if(!path.isAbsolute(importRoot||'')||!path.isAbsolute(filePath||''))fail('ABSOLUTE_LOCAL_PATH_REQUIRED');
 if(!/\.gguf$/i.test(filePath)||/["\r\n]/.test(filePath))fail('GGUF_SINGLE_FILE_REQUIRED');
 const base=await realpath(importRoot);
 const source=await realpath(filePath);
 const relative=path.relative(base,source);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))
  fail('FILE_OUTSIDE_OWNER_IMPORT_ROOT');
 const info=await stat(source);
 if(!info.isFile()||info.size<32)fail('MODEL_FILE_NOT_QUALIFIED');
 const fh=await open(source,'r');
 try{const magic=Buffer.alloc(4);await fh.read(magic,0,4,0);
  if(magic.toString('ascii')!=='GGUF')fail('GGUF_MAGIC_INVALID');
 }finally{await fh.close();}
 const fileSha256=await hashFile(source);
 if(fileSha256!==expectedSha256)fail('FILE_HASH_MISMATCH');
 const {catalog,original}=await readMatchingCatalogs(canonicalFile,publicFile);
 const providerName='leeway-'+modelId+':latest';
 if(catalog.models.some(m=>m.id===modelId||m.ollama===providerName))
  fail('MODEL_ID_ALREADY_REGISTERED_USE_VERSIONED_ID');
 const output={mode:apply?'APPLY_REQUESTED':'PREFLIGHT_ONLY',modelId,providerName,
  fileSha256,fileSizeBytes:info.size,weightLicense,providerInstalled:false,catalogUpdated:false,
  inferenceVerified:false,gpuVerified:false,formulaVerified:false,veritasVerified:false};
 if(!apply)return output;
 // Explicit owner action only. No model weight is copied to or fetched from GitHub.
 const installedBefore=await providerModels(fetchImpl);
 if(installedBefore.has(providerName))fail('PROVIDER_MODEL_NAME_ALREADY_EXISTS');
 const temp=await mkdtemp(path.join(tmpdir(),'leeway-model-import-'));
 try{
  // Ollama reads the existing file on the owner's local host, and owns the weight store.
  const from=source.replace(/\\/g,'/');
  await writeFile(path.join(temp,'Modelfile'),'FROM "'+from+'"\n',{flag:'wx',mode:0o600});
  await execFileImpl('ollama',['create',providerName,'-f',path.join(temp,'Modelfile')],{
   timeout:600000,maxBuffer:128*1024,windowsHide:true
  });
  const installedAfter=await providerModels(fetchImpl);
  if(!installedAfter.has(providerName))fail('PROVIDER_CREATE_NOT_OBSERVED');
  // Detect source modification during the native provider import.
  if(await hashFile(source)!==fileSha256)fail('MODEL_FILE_CHANGED_DURING_IMPORT');
  const fresh=await readMatchingCatalogs(canonicalFile,publicFile);
  if(!fresh.original.equals(original))fail('CATALOG_CHANGED_DURING_IMPORT');
  fresh.catalog.models.push({
   id:modelId,displayName,ollama:providerName,hfRepo:null,gguf:null,
   weightLicense,family:'Owner-local',
   description:'Owner-provided local GGUF; provider installation independently re-observed, inference not yet qualified.',
   source:'OWNER_LOCAL_GGUF',
   sourceFileSha256:fileSha256,sourceSizeBytes:info.size,
   producer:'ORIGINAL_LEEWAY_MODEL_HUB'
  });
  const bytes=JSON.stringify(fresh.catalog,null,2)+'\n';
  // Two metadata mirrors, never the raw weights; stage both before replacing either.
  const a=canonicalFile+'.import-'+process.pid;
  const b=publicFile+'.import-'+process.pid;
  await writeFile(a,bytes,{flag:'wx',mode:0o600});
  await writeFile(b,bytes,{flag:'wx',mode:0o600});
  try{
   await rename(a,canonicalFile);
   try{await rename(b,publicFile);}
   catch(e){await writeFile(canonicalFile,original);throw e;}
  }finally{await rm(a,{force:true});await rm(b,{force:true});}
  return {...output,mode:'PROVIDER_INSTALLED_CATALOG_REGISTERED',providerInstalled:true,catalogUpdated:true,
   note:'The current Model Hub process reads catalog on startup. A controlled Hub service reload is required; provider weights remain under Ollama.'};
 }finally{await rm(temp,{recursive:true,force:true});}
}

function parse(argv){
 const map=new Map();
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply'){map.set('apply',true);continue;}
  if(!/^--[a-z-]+$/.test(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))
   fail('OWNER_IMPORT_ARGS_INVALID');
  if(map.has(argv[i].slice(2)))fail('DUPLICATE_IMPORT_ARG');
  map.set(argv[i].slice(2),argv[++i]);
 }
 return {filePath:map.get('file'),importRoot:map.get('import-root'),
  modelId:map.get('id'),displayName:map.get('display-name'),weightLicense:map.get('license'),
  expectedSha256:map.get('expected-sha256'),apply:map.get('apply')===true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  const result=await importLocalGguf(parse(process.argv.slice(2)));
  console.log(JSON.stringify(result));
 }catch(e){console.error(JSON.stringify({state:'BLOCKED',reason:String(e.message).slice(0,140),
  providerMayBePartiallyInstalled:true,catalogAdmission:'NOT_PROVEN'}));process.exitCode=1;}
}
