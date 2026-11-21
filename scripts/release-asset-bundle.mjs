/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.RELEASE_ASSET_TRANSPORT
TAG: LEEWAY.MODEL_HUB.RELEASE_ASSET_BUNDLE.V1
WHO: LeeWay Industries; governed source contribution
WHAT: Stream, split, reconstruct, and verify hash-pinned model files for GitHub Release transport
WHEN: 2026-11-06
WHERE: LeeWay-Model-Hub/scripts/release-asset-bundle.mjs
WHY: Model metadata alone cannot materialize weights; GitHub Release files have a per-asset size limit
HOW: Fail-closed canonical manifest checks, explicit owner-local stage/materialize, exact SHA-256 readback
AUTHORIZED_ROLES: Owner-local CLI; no provider execution, Veritas signing, or admission authority
LICENSE: LeeWay original source; model weights retain their separate licenses
*/
import {createHash} from 'node:crypto';
import {open, readFile, mkdir, lstat, realpath, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const SHA=/^[0-9a-f]{64}$/;
const SEG=/^[A-Za-z0-9_.-]+$/;
const PART=/^[a-f0-9]{16}-part-[0-9]{6}\.bin$/;
const MAX_PART=1024*1024*1024; // 1 GiB, safely below the GitHub Release 2 GiB asset limit
const BUFFER=1024*1024;
const fail=(code)=>{throw Error(code);};
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const validRel=(value)=>typeof value==='string'&&value.length>0&&value.length<300&&
  !value.includes('\\')&&value.split('/').every(s=>SEG.test(s)&&s!=='.'&&s!=='..');
const inside=(parent,child)=>child===parent||child.startsWith(parent+path.sep);

async function canonicalOutputRoot(requested){
  const absolute=path.resolve(requested);
  try{
    const st=await lstat(absolute);
    if(st.isSymbolicLink())fail('OUTPUT_ROOT_SYMLINK_DENIED');
    return await realpath(absolute);
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    const parent=await canonicalOutputRoot(path.dirname(absolute));
    return path.join(parent,path.basename(absolute));
  }
}

export function inspectModel(manifest,modelId){
  const errors=[];
  if(manifest?.schemaVersion!=='leeway.model-hub.runtime-manifest.v1')errors.push('SOURCE_MANIFEST_SCHEMA_INVALID');
  const model=manifest?.models?.find(m=>m.id===modelId);
  if(!model)errors.push('MODEL_ID_NOT_IN_CANONICAL_MANIFEST');
  if(model){
    if(!validRel(model.id)||!validRel(model.relativeDirectory))errors.push('MODEL_PATH_INVALID');
    if(typeof model.weightLicense!=='string'||!model.weightLicense.trim()||/UNVERIFIED|UNKNOWN|REVIEW|TBD/i.test(model.weightLicense))errors.push('WEIGHT_LICENSE_UNVERIFIED');
    if(!Array.isArray(model.requiredFiles)||!model.requiredFiles.length||!Array.isArray(model.integrity))errors.push('INTEGRITY_INCOMPLETE');
    else {
      const seen=new Set();let total=0;
      for(const file of model.requiredFiles){
        if(!validRel(file)||seen.has(file)){errors.push('REQUIRED_FILE_INVALID_OR_DUPLICATE');continue;}
        seen.add(file);
        const entries=model.integrity.filter(x=>x.path===file);
        if(entries.length!==1||!Number.isSafeInteger(entries[0]?.bytes)||entries[0].bytes<1||!SHA.test(entries[0]?.sha256||''))errors.push('REQUIRED_FILE_HASH_MISSING:'+file);
        else total+=entries[0].bytes;
      }
      if(model.integrity.length!==seen.size)errors.push('INTEGRITY_FILE_SET_MISMATCH');
      if(total!==model.totalBytes)errors.push('TOTAL_BYTES_MISMATCH');
    }
  }
  return {status:errors.length?'BLOCKED':'SOURCE_METADATA_VALID_NOT_ADMITTED',modelId,errors,model};
}

async function safeFile(root,relative){
  if(!validRel(relative))fail('UNSAFE_RELATIVE_PATH');
  const base=await realpath(root);
  let current=base;
  for(const segment of relative.split('/')){
    current=path.join(current,segment);
    const st=await lstat(current);
    if(st.isSymbolicLink())fail('SYMLINK_SOURCE_DENIED');
  }
  const final=await realpath(current);
  if(!inside(base,final)||(await lstat(final)).isFile()!==true)fail('SOURCE_NOT_REGULAR_CONTAINED_FILE');
  return final;
}

async function writeAll(handle,bytes){
  let offset=0;while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,null);
    if(bytesWritten<1)fail('FILE_WRITE_INCOMPLETE');offset+=bytesWritten;}
}

async function hashFile(filename){
  const f=await open(filename,'r');const h=createHash('sha256');let size=0;
  const buf=Buffer.allocUnsafe(BUFFER);
  try{while(true){const {bytesRead}=await f.read(buf,0,buf.length,null);if(!bytesRead)break;h.update(buf.subarray(0,bytesRead));size+=bytesRead;}}finally{await f.close();}
  return {bytes:size,sha256:h.digest('hex')};
}

export async function stageRelease({manifest,manifestBytes,modelId,sourceRoot,outputRoot,partBytes=MAX_PART,apply=false}){
  const inspection=inspectModel(manifest,modelId);
  if(inspection.errors.length)fail(inspection.errors.join(';'));
  if(!Number.isSafeInteger(partBytes)||partBytes<1||partBytes>MAX_PART)fail('PART_BYTES_OUT_OF_RANGE');
  if(!path.isAbsolute(sourceRoot)||!path.isAbsolute(outputRoot))fail('ABSOLUTE_ROOTS_REQUIRED');
  const src=await realpath(sourceRoot),out=await canonicalOutputRoot(outputRoot);
  if(inside(src,out)||inside(out,src))fail('SOURCE_OUTPUT_ROOT_OVERLAP');
  const model=inspection.model,files=[];
  for(const entry of model.integrity){
    const filename=await safeFile(src,model.relativeDirectory+'/'+entry.path);
    const observed=await hashFile(filename);
    if(observed.bytes!==entry.bytes||observed.sha256!==entry.sha256)fail('SOURCE_BYTES_HASH_MISMATCH:'+entry.path);
    files.push({entry,filename});
  }
  const plan={schema:'leeway.model-hub.release-assets.v1',modelId,sourceManifestSha256:digest(manifestBytes),
    weightLicense:model.weightLicense,transport:'GITHUB_RELEASE_CANDIDATE_NOT_PUBLISHED',files:[]};
  if(!apply)return {status:'PREFLIGHT_VERIFIED_NO_MUTATION',plan:{...plan,files:files.map(x=>({path:x.entry.path,bytes:x.entry.bytes,sha256:x.entry.sha256}))}};
  await mkdir(out,{recursive:true});
  const dest=path.join(out,modelId);
  await mkdir(dest); // exclusive: never overwrite a previous bundle
  try{
    for(const {entry,filename} of files){
      const input=await open(filename,'r');const all=createHash('sha256');let total=0,index=0,remaining=0,part=null,partHash=null,partSize=0,parts=[];
      const buf=Buffer.allocUnsafe(Math.min(BUFFER,partBytes));
      const closePart=async()=>{
        if(!part)return;
        await part.sync();await part.close();part=null;
        const item=parts[parts.length-1];item.bytes=partSize;item.sha256=partHash.digest('hex');
        const checked=await hashFile(path.join(dest,item.name));
        if(checked.bytes!==item.bytes||checked.sha256!==item.sha256)fail('STAGED_PART_READBACK_MISMATCH');
      };
      try{
        while(total<entry.bytes){
          if(!part){
            index++;
            const name=digest(entry.path).slice(0,16)+'-part-'+String(index).padStart(6,'0')+'.bin';
            part=await open(path.join(dest,name),'wx');partHash=createHash('sha256');partSize=0;remaining=partBytes;parts.push({name});
          }
          const {bytesRead}=await input.read(buf,0,Math.min(buf.length,remaining),null);
          if(!bytesRead)fail('SOURCE_TRUNCATED_DURING_STAGING');
          const data=buf.subarray(0,bytesRead);
          await writeAll(part,data);all.update(data);partHash.update(data);
          total+=bytesRead;partSize+=bytesRead;remaining-=bytesRead;
          if(remaining===0)await closePart();
        }
        await closePart();
      }finally{await input.close();if(part)await part.close();}
      if(total!==entry.bytes||all.digest('hex')!==entry.sha256)fail('SOURCE_CHANGED_DURING_STAGING');
      plan.files.push({path:entry.path,bytes:entry.bytes,sha256:entry.sha256,parts});
    }
    await writeFile(path.join(dest,'release-assets.v1.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
    return {status:'STAGED_VERIFIED_NOT_PUBLISHED_OR_ADMITTED',directory:dest,plan};
  }catch(error){await rm(dest,{recursive:true,force:true});throw error;}
}

export async function materializeRelease({manifest,manifestBytes,modelId,bundleRoot,outputRoot,apply=false}){
  const inspection=inspectModel(manifest,modelId);
  if(inspection.errors.length)fail(inspection.errors.join(';'));
  if(!path.isAbsolute(bundleRoot)||!path.isAbsolute(outputRoot))fail('ABSOLUTE_ROOTS_REQUIRED');
  const bundle=await realpath(bundleRoot),out=await canonicalOutputRoot(outputRoot);
  if(inside(bundle,out)||inside(out,bundle))fail('BUNDLE_OUTPUT_ROOT_OVERLAP');
  const releaseFile=await safeFile(bundle,'release-assets.v1.json');
  const release=JSON.parse(await readFile(releaseFile,'utf8'));
  if(release.schema!=='leeway.model-hub.release-assets.v1'||release.modelId!==modelId||
    release.sourceManifestSha256!==digest(manifestBytes)||release.weightLicense!==inspection.model.weightLicense||
    !Array.isArray(release.files)||release.files.length!==inspection.model.requiredFiles.length)fail('RELEASE_MANIFEST_IDENTITY_MISMATCH');
  const validated=[];
  for(const entry of inspection.model.integrity){
    const items=release.files.filter(f=>f.path===entry.path);
    if(items.length!==1||items[0].bytes!==entry.bytes||items[0].sha256!==entry.sha256||
      !Array.isArray(items[0].parts)||!items[0].parts.length)fail('RELEASE_FILE_IDENTITY_MISMATCH');
    const parts=[];let size=0;let number=0;
    for(const part of items[0].parts){
      number++;
      if(!PART.test(part.name)||!part.name.startsWith(digest(entry.path).slice(0,16)+'-part-')||
        part.name!==digest(entry.path).slice(0,16)+'-part-'+String(number).padStart(6,'0')+'.bin'||
        !SHA.test(part.sha256||'')||!Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>MAX_PART)fail('RELEASE_PART_IDENTITY_INVALID');
      const file=await safeFile(bundle,part.name);
      const actual=await hashFile(file);
      if(actual.bytes!==part.bytes||actual.sha256!==part.sha256)fail('RELEASE_PART_HASH_MISMATCH');
      size+=part.bytes;parts.push({file,part});
    }
    if(size!==entry.bytes)fail('RELEASE_PART_SIZE_MISMATCH');
    validated.push({entry,parts});
  }
  if(!apply)return {status:'RELEASE_BUNDLE_VERIFIED_NOT_MATERIALIZED_OR_ADMITTED',modelId};
  await mkdir(out,{recursive:true});const dest=path.join(out,modelId);
  await mkdir(dest); // exclusive; never overwrite admitted/working models
  try{
    for(const {entry,parts} of validated){
      const target=path.join(dest,...entry.path.split('/'));
      await mkdir(path.dirname(target),{recursive:true});
      const output=await open(target,'wx');const hash=createHash('sha256');let total=0;
      try{
        for(const {file} of parts){
          const input=await open(file,'r');const buf=Buffer.allocUnsafe(BUFFER);
          try{while(true){const {bytesRead}=await input.read(buf,0,buf.length,null);if(!bytesRead)break;
            const data=buf.subarray(0,bytesRead);await writeAll(output,data);hash.update(data);total+=bytesRead;}}
          finally{await input.close();}
        }
        await output.sync();
      }finally{await output.close();}
      if(total!==entry.bytes||hash.digest('hex')!==entry.sha256)fail('RECONSTRUCTED_FILE_HASH_MISMATCH');
      const checked=await hashFile(target);
      if(checked.bytes!==entry.bytes||checked.sha256!==entry.sha256)fail('RECONSTRUCTION_READBACK_MISMATCH');
    }
    return {status:'MATERIALIZED_VERIFIED_NOT_CONTINUUM_OR_VERITAS_ADMITTED',modelId,directory:dest,
      sourceManifestSha256:digest(manifestBytes)};
  }catch(error){await rm(dest,{recursive:true,force:true});throw error;}
}

async function main(argv){
  const [mode,...args]=argv;const flags=new Map();
  for(let i=0;i<args.length;i++){
    if(!args[i].startsWith('--'))fail('CLI_FLAG_INVALID');
    if(args[i]==='--apply'){flags.set('apply',true);continue;}
    if(i+1>=args.length||args[i+1].startsWith('--'))fail('CLI_FLAG_VALUE_MISSING');
    flags.set(args[i].slice(2),args[++i]);
  }
  const manifestPath=flags.get('manifest')||fileURLToPath(new URL('../registry/leeway-model-hub-runtime-manifest.v1.json',import.meta.url));
  const manifestBytes=await readFile(manifestPath);const manifest=JSON.parse(manifestBytes);
  const modelId=flags.get('model');if(!modelId)fail('MODEL_ID_REQUIRED');
  if(mode==='audit')return inspectModel(manifest,modelId);
  if(mode==='stage')return stageRelease({manifest,manifestBytes,modelId,sourceRoot:flags.get('source-root'),
    outputRoot:flags.get('out'),partBytes:flags.has('part-bytes')?Number(flags.get('part-bytes')):MAX_PART,apply:flags.get('apply')===true});
  if(mode==='materialize')return materializeRelease({manifest,manifestBytes,modelId,bundleRoot:flags.get('bundle-root'),
    outputRoot:flags.get('out'),apply:flags.get('apply')===true});
  fail('MODE_MUST_BE_AUDIT_STAGE_OR_MATERIALIZE');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).then(v=>{process.stdout.write(JSON.stringify(v,null,2)+'\n');if(v.status==='BLOCKED')process.exitCode=2;})
    .catch(e=>{process.stderr.write(JSON.stringify({status:'BLOCKED',error:e.message})+'\n');process.exitCode=1;});
}
