/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.TESTS
TAG: LEEWAY.MODEL_HUB.OWNER_LOCAL_IMPORT_TEST.V1
5WH:
WHAT = Test the original Hub local model import contract without writing weights or invoking a real provider.
WHY = Fail closed on unapproved paths, unverified weights and model replacement.
WHO = LeeWay Model Hub source reviewers.
WHERE = tests/local-import.test.mjs
WHEN = 2026-11-05
HOW = Temporary local fixture and injected synthetic provider readback.
AUTHORIZED_ROLES: Source tests, not device or worker authorization.
LICENSE: Existing repository terms.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {importLocalGguf} from '../scripts/import-local-gguf.mjs';
const original=JSON.parse(await readFile(new URL('../catalog/models.json',import.meta.url),'utf8'));

async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'leeway-local-gguf-test-'));
 const imports=path.join(root,'owner-imports'),outside=path.join(root,'outside');
 await mkdir(imports);await mkdir(outside);
 const file=path.join(imports,'reviewed.gguf');
 const buffer=Buffer.concat([Buffer.from('GGUF'),Buffer.alloc(256,7)]);
 await writeFile(file,buffer);
 const sha=createHash('sha256').update(buffer).digest('hex');
 const canonicalFile=path.join(root,'catalog.json'),publicFile=path.join(root,'public-catalog.json');
 const catalogText=JSON.stringify(original,null,2)+'\n';
 await writeFile(canonicalFile,catalogText);await writeFile(publicFile,catalogText);
 const params={filePath:file,importRoot:imports,modelId:'owner-research-v1',
  displayName:'Owner Research v1',weightLicense:'Owner review: license reference required',
  expectedSha256:sha,canonicalFile,publicFile};
 return {root,imports,outside,file,sha,canonicalFile,publicFile,params,
  cleanup:()=>rm(root,{recursive:true,force:true})};
}
function fakeProvider(){
 const names=new Set(),calls=[];
 const fetchImpl=async(url,opts)=>{
  assert.equal(url,'http://127.0.0.1:11434/api/tags');
  assert.equal(opts.method,'GET');
  calls.push('tags');
  return Response.json({models:[...names].map(name=>({name}))});
 };
 const execFileImpl=async(executable,args,opts)=>{
  calls.push('create');
  assert.equal(executable,'ollama');
  assert.deepEqual(args.slice(0,2),['create','leeway-owner-research-v1:latest']);
  assert.equal(args[2],'-f');
  assert.ok(opts.windowsHide);
  const modelfile=await readFile(args[3],'utf8');
  assert.ok(modelfile.startsWith('FROM "'));
  assert.ok(modelfile.endsWith('"\n'));
  names.add(args[1]);
  return {stdout:'model created',stderr:''};
 };
 return {names,calls,fetchImpl,execFileImpl};
}
test('preflight checks local file magic and SHA but cannot call provider or mutate catalog',async()=>{
 const f=await fixture();
 try{
  const data=await importLocalGguf(f.params,{fetchImpl:()=>{throw Error('NO_NETWORK');},
   execFileImpl:()=>{throw Error('NO_INSTALL');}});
  assert.equal(data.mode,'PREFLIGHT_ONLY');
  assert.equal(data.fileSha256,f.sha);
  assert.equal(data.providerInstalled,false);
  assert.equal(data.catalogUpdated,false);
  assert.equal(data.inferenceVerified,false);
  assert.equal(JSON.parse(await readFile(f.canonicalFile,'utf8')).models.length,original.models.length);
 }finally{await f.cleanup();}
});
test('out-of-root file, wrong digest, wrong magic or absent license are blocked before any provider work',async()=>{
 const f=await fixture();
 try{
  await assert.rejects(importLocalGguf({...f.params,expectedSha256:'a'.repeat(64)}),/FILE_HASH_MISMATCH/);
  await assert.rejects(importLocalGguf({...f.params,weightLicense:''}),/WEIGHT_LICENSE_REQUIRED/);
  await assert.rejects(importLocalGguf({...f.params,modelId:'../../wrong'}),/MODEL_ID_INVALID/);
  const external=path.join(f.outside,'outside.gguf');
  await writeFile(external,Buffer.concat([Buffer.from('GGUF'),Buffer.alloc(64)]));
  await assert.rejects(importLocalGguf({...f.params,filePath:external}),/FILE_OUTSIDE_OWNER_IMPORT_ROOT/);
  const bad=path.join(f.imports,'bad.gguf');
  const invalid=Buffer.alloc(64,5);await writeFile(bad,invalid);
  await assert.rejects(importLocalGguf({...f.params,filePath:bad,
    expectedSha256:createHash('sha256').update(invalid).digest('hex')}),/GGUF_MAGIC_INVALID/);
 }finally{await f.cleanup();}
});
test('explicit apply uses original local provider, confirms installed name, then writes both catalog mirrors',async()=>{
 const f=await fixture(),p=fakeProvider();
 try{
  const data=await importLocalGguf({...f.params,apply:true},p);
  assert.equal(data.mode,'PROVIDER_INSTALLED_CATALOG_REGISTERED');
  assert.equal(data.providerInstalled,true);assert.equal(data.catalogUpdated,true);
  assert.equal(data.inferenceVerified,false);
  assert.deepEqual(p.calls,['tags','create','tags']);
  const a=await readFile(f.canonicalFile,'utf8'),b=await readFile(f.publicFile,'utf8');
  assert.equal(a,b);
  const added=JSON.parse(a).models.at(-1);
  assert.equal(added.id,f.params.modelId);
  assert.equal(added.ollama,'leeway-owner-research-v1:latest');
  assert.equal(added.sourceFileSha256,f.sha);
  assert.ok(!a.includes(f.root));
  assert.equal(JSON.parse(a).models.length,original.models.length+1);
  await assert.rejects(importLocalGguf({...f.params,apply:true},p),/MODEL_ID_ALREADY_REGISTERED_USE_VERSIONED_ID/);
  assert.deepEqual(p.calls,['tags','create','tags']);
 }finally{await f.cleanup();}
});
test('cannot replace a provider name that already exists without explicit versioned identity',async()=>{
 const f=await fixture(),p=fakeProvider();
 try{
  p.names.add('leeway-owner-research-v1:latest');
  await assert.rejects(importLocalGguf({...f.params,apply:true},p),/PROVIDER_MODEL_NAME_ALREADY_EXISTS/);
  assert.equal(p.calls.includes('create'),false);
  assert.equal(JSON.parse(await readFile(f.canonicalFile,'utf8')).models.length,original.models.length);
 }finally{await f.cleanup();}
});
test('missing provider readback blocks catalog registration even when create was called',async()=>{
 const f=await fixture(),p=fakeProvider();
 try{
  const execFileImpl=async()=>({stdout:'reported success',stderr:''});
  await assert.rejects(importLocalGguf({...f.params,apply:true},{fetchImpl:p.fetchImpl,execFileImpl}),/PROVIDER_CREATE_NOT_OBSERVED/);
  assert.equal(JSON.parse(await readFile(f.canonicalFile,'utf8')).models.length,original.models.length);
  assert.equal((await readFile(f.canonicalFile)).equals(await readFile(f.publicFile)),true);
 }finally{await f.cleanup();}
});
test('divergent catalog mirrors cannot be overwritten by local import',async()=>{
 const f=await fixture();
 try{
  await writeFile(f.publicFile,'{}');
  await assert.rejects(importLocalGguf(f.params),/CATALOG_MIRROR_CONFLICT/);
 }finally{await f.cleanup();}
});
