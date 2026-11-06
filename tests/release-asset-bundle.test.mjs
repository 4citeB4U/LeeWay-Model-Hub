/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.TESTS
TAG: LEEWAY.MODEL_HUB.RELEASE_ASSET_BUNDLE_TEST.V1
WHO: LeeWay Model Hub source reviewers
WHAT: Exercise real byte chunking, hash readback, reconstruction, and fail-closed gates
WHEN: 2026-11-06
WHERE: LeeWay-Model-Hub/tests/release-asset-bundle.test.mjs
WHY: Prevent metadata-only models from being mislabeled materialized or admitted
HOW: Temporary synthetic byte fixtures, no real weights, GitHub release, or Veritas authority
AUTHORIZED_ROLES: Source tests only
LICENSE: LeeWay original source
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectModel,stageRelease,materializeRelease} from '../scripts/release-asset-bundle.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){
  const dir=await mkdtemp(path.join(tmpdir(),'leeway-release-test-'));
  const source=path.join(dir,'source'),staged=path.join(dir,'staged'),output=path.join(dir,'out');
  await mkdir(path.join(source,'fixture'),{recursive:true});
  const data=Buffer.from('GGUF\u0001\u0002\u0003test-asset-contents');
  await writeFile(path.join(source,'fixture','model.gguf'),data);
  const manifest={schemaVersion:'leeway.model-hub.runtime-manifest.v1',models:[{id:'fixture-1',relativeDirectory:'fixture',
    weightLicense:'Apache-2.0',totalBytes:data.length,requiredFiles:['model.gguf'],
    integrity:[{path:'model.gguf',bytes:data.length,sha256:sha(data)}]}]};
  const manifestBytes=Buffer.from(JSON.stringify(manifest));
  return {dir,source,staged,output,data,manifest,manifestBytes,modelId:'fixture-1'};
}
async function clean(f){await rm(f.dir,{recursive:true,force:true});}

test('real bytes stage, split, exact verify, reconstruct; never claim admission',async()=>{
 const f=await fixture();try{
   const staged=await stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged,partBytes:7,apply:true});
   assert.equal(staged.status,'STAGED_VERIFIED_NOT_PUBLISHED_OR_ADMITTED');
   assert.ok(staged.plan.files[0].parts.length>1);
   const pre=await materializeRelease({...f,bundleRoot:staged.directory,outputRoot:f.output});
   assert.equal(pre.status,'RELEASE_BUNDLE_VERIFIED_NOT_MATERIALIZED_OR_ADMITTED');
   await assert.rejects(access(f.output));
   const result=await materializeRelease({...f,bundleRoot:staged.directory,outputRoot:f.output,apply:true});
   assert.equal(result.status,'MATERIALIZED_VERIFIED_NOT_CONTINUUM_OR_VERITAS_ADMITTED');
   assert.deepEqual(await readFile(path.join(result.directory,'model.gguf')),f.data);
   await assert.rejects(materializeRelease({...f,bundleRoot:staged.directory,outputRoot:f.output,apply:true}));
 }finally{await clean(f);}
});

test('missing hash and unverified license block before staging',async()=>{
 const f=await fixture();try{
   f.manifest.models[0].integrity=[];
   assert.equal(inspectModel(f.manifest,f.modelId).status,'BLOCKED');
   await assert.rejects(stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged,apply:true}),/REQUIRED_FILE_HASH_MISSING/);
   f.manifest.models[0].integrity=[{path:'model.gguf',bytes:f.data.length,sha256:sha(f.data)}];
   f.manifest.models[0].weightLicense='UNVERIFIED_LOCAL_IMPORT_LICENSE';
   await assert.rejects(stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged,apply:true}),/WEIGHT_LICENSE_UNVERIFIED/);
 }finally{await clean(f);}
});

test('mismatched source SHA denies before output',async()=>{
 const f=await fixture();try{
   f.manifest.models[0].integrity[0].sha256='0'.repeat(64);
   await assert.rejects(stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged,apply:true}),/SOURCE_BYTES_HASH_MISMATCH/);
   await assert.rejects(access(f.staged));
 }finally{await clean(f);}
});

test('tampered staged chunk is rejected before output',async()=>{
 const f=await fixture();try{
   const staged=await stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged,partBytes:8,apply:true});
   await writeFile(path.join(staged.directory,staged.plan.files[0].parts[0].name),'malicious');
   await assert.rejects(materializeRelease({...f,bundleRoot:staged.directory,outputRoot:f.output,apply:true}),/RELEASE_PART_HASH_MISMATCH/);
   await assert.rejects(access(f.output));
 }finally{await clean(f);}
});

test('different canonical manifest bytes deny stale release manifest',async()=>{
 const f=await fixture();try{
   const staged=await stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged,apply:true});
   await assert.rejects(materializeRelease({...f,manifestBytes:Buffer.from('different'),bundleRoot:staged.directory,outputRoot:f.output}),/RELEASE_MANIFEST_IDENTITY_MISMATCH/);
 }finally{await clean(f);}
});

test('source symlink cannot escape explicit root',async()=>{
 const f=await fixture();try{
   await rm(path.join(f.source,'fixture','model.gguf'));
   const external=path.join(f.dir,'external.gguf');await writeFile(external,f.data);
   await symlink(external,path.join(f.source,'fixture','model.gguf'));
   await assert.rejects(stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged,apply:true}),/SYMLINK_SOURCE_DENIED/);
 }finally{await clean(f);}
});

test('dry run hashes source without publishing, materializing or admitting',async()=>{
 const f=await fixture();try{
   const result=await stageRelease({...f,sourceRoot:f.source,outputRoot:f.staged});
   assert.equal(result.status,'PREFLIGHT_VERIFIED_NO_MUTATION');
   await assert.rejects(access(f.staged));
 }finally{await clean(f);}
});

test('canonical GitHub model metadata remains closed until actual license and file hashes qualify',async()=>{
 const source=JSON.parse(await readFile(new URL('../registry/leeway-model-hub-runtime-manifest.v1.json',import.meta.url),'utf8'));
 const gguf=inspectModel(source,'qwen3-4b');
 assert.equal(gguf.status,'BLOCKED');
 assert.ok(gguf.errors.includes('WEIGHT_LICENSE_UNVERIFIED'));
 for(const id of ['qwen3-vl-8b-instruct','wan2.1-t2v-1.3b']){
   const result=inspectModel(source,id);
   assert.equal(result.status,'SOURCE_METADATA_VALID_NOT_ADMITTED');
   assert.deepEqual(result.errors,[]);
 }
});

test('symlink output root cannot write back into source tree',async()=>{
 const f=await fixture();try{
   const linked=path.join(f.dir,'linked-out');
   await symlink(f.source,linked);
   await assert.rejects(stageRelease({...f,sourceRoot:f.source,outputRoot:linked,apply:true}),/OUTPUT_ROOT_SYMLINK_DENIED/);
 }finally{await clean(f);}
});
