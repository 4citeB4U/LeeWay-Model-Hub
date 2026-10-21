/*
LEEWAY HEADER — DO NOT REMOVE
REGION: MODEL_HUB / UI_ENDPOINT_REGRESSION
TAG: LEEWAY-MODEL-HUB-NO-HTML-AS-JSON-REGRESSION-20261021
WHO: Leonard Jerome Lee (creator), OpenAI assistant (test contributor)
WHAT: Protect static-host detection, JSON validation, model discovery and widget JS syntax
WHEN: 2026-10-21
WHERE: LeeWay-Model-Hub/tests/widget.test.mjs
WHY: Prevent screenshot bug where GitHub Pages HTML is parsed as an inference API response
HOW: Node test runner, source syntax check and asset contract checks
AUTHORITY: Source validation, not physical runtime certification
LICENSE: LeeWay original source
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('widget module is valid JavaScript',()=>{
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(script,'widget must have one module');
 const temp=mkdtempSync(join(tmpdir(),'leeway-model-ui-'));
 try{
  const filename=join(temp,'widget.mjs');writeFileSync(filename,script[1]);
  const check=spawnSync(process.execPath,['--check',filename],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('GitHub Pages and Vercel remain catalog-only until real service is enrolled',()=>{
 assert.match(html,/STATIC_HOST/);
 assert.match(html,/NO_INFERENCE_SERVICE/);
 assert.match(html,/github\\.io/);
 assert.match(html,/vercel\\.app/);
 assert.match(html,/model discovery only|Model discovery only/);
});
test('inference never parses unverified website HTML as JSON',()=>{
 assert.match(html,/content-type/);
 assert.match(html,/API_NOT_JSON/);
 assert.match(html,/if\(!endpoint\)throw Error\('NO_INFERENCE_SERVICE'\)/);
 assert.match(html,/service&&!!\$\('token'\)/);
});
test('PocketPal/Hugging Face GGUF search is not represented as installed inference',()=>{
 assert.match(html,/huggingface\.co\/api\/models/);
 assert.match(html,/PocketPal-compatible models/);
 assert.match(html,/Discovery is separate from installation/);
});
