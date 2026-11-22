/*
LEEWAY HEADER — DO NOT REMOVE
REGION: MODEL_HUB / CUSTOMER_MODEL_ASSIGNMENT_TEST
TAG: LEEWAY.MODEL_HUB.SLOTS.TEST.V1
WHO: Leonard Jerome Lee, LeeWay Industries
WHAT: Deterministic catalog-card selection and fail-closed tests
WHEN: 2026-10-25
WHERE: tests/model-slots.test.mjs
WHY: Prevent selection cards being misrepresented as running models
HOW: Native Node test runner, no host provider or model weight side effects
AUTHORITY: Selection contract only
LICENSE: LeeWay original source, all rights reserved
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignModelSlot} from '../src/model-slots.mjs';
const catalog={models:[{id:'qwen'},{id:'gemma'},{id:'gemma4'},{id:'tiny'},{id:'fifth'}]};
test('four slots represent preferences not runtime model residency',()=>{
 const one=assignModelSlot({catalog,slot:0,modelId:'qwen'});
 const two=assignModelSlot({catalog,slots:one.slots,slot:1,modelId:'gemma'});
 assert.equal(two.selectedCount,2);
 assert.deepEqual(two.slots,['qwen','gemma',null,null]);
 assert.equal(two.executionStatus,'SELECTION_ONLY_NOT_LOADED');
 assert.ok(Object.isFrozen(two.slots));
});
test('replacement changes one card and never triggers an engine',()=>{
 const old=['qwen','gemma','gemma4','tiny'];
 const replacement=assignModelSlot({catalog,slots:old,slot:2,modelId:'fifth'});
 assert.deepEqual(replacement.slots,['qwen','gemma','fifth','tiny']);
 assert.deepEqual(old,['qwen','gemma','gemma4','tiny']);
});
test('reject unknown model and duplicate assignment',()=>{
 assert.throws(()=>assignModelSlot({catalog,slot:0,modelId:'unknown'}),/MODEL_NOT_IN_CANONICAL_CATALOG/);
 assert.throws(()=>assignModelSlot({catalog,slots:['qwen'],slot:1,modelId:'qwen'}),/MODEL_ALREADY_ASSIGNED/);
});
test('fail closed on invalid catalog or out-of-range slots',()=>{
 assert.throws(()=>assignModelSlot({catalog,slot:4,modelId:'qwen'}),/MODEL_SLOT_INDEX_INVALID/);
 assert.throws(()=>assignModelSlot({catalog,slot:0,modelId:'qwen',limit:5}),/MODEL_SLOT_LIMIT_INVALID/);
 assert.throws(()=>assignModelSlot({catalog:{models:[{id:'qwen'},{id:'qwen'}]},slot:0,modelId:'qwen'}),/MODEL_CATALOG_INVALID/);
});
test('clear card without altering other preferences',()=>{
 const s=assignModelSlot({catalog,slots:['qwen','gemma'],slot:0,modelId:null});
 assert.deepEqual(s.slots,[null,'gemma',null,null]);
});
