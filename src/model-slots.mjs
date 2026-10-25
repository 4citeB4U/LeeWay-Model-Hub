/*
LEEWAY HEADER — DO NOT REMOVE
REGION: MODEL_HUB / CUSTOMER_MODEL_ASSIGNMENT
TAG: LEEWAY.MODEL_HUB.SLOTS.V1
WHO: Leonard Jerome Lee, LeeWay Industries
WHAT: Canonical bounded selection cards for LeeWay-hosted model inference
WHEN: 2026-10-25
WHERE: src/model-slots.mjs
WHY: Separate customer preferences from model installation, residency and runtime execution
HOW: Pure validated assignment transitions; no provider calls, downloads or unverified execution claims
AUTHORITY: Catalog selection only; Runtime Fabric and qualified providers own execution
LICENSE: LeeWay original source, all rights reserved
*/
export const SLOT_LIMIT=4;
export function assignModelSlot({catalog,slots=[],slot,modelId,limit=SLOT_LIMIT}={}){
  if(!Number.isInteger(limit)||limit<1||limit>SLOT_LIMIT)throw Error('MODEL_SLOT_LIMIT_INVALID');
  if(!Array.isArray(catalog?.models)||!Array.isArray(slots)||slots.length>limit)throw Error('MODEL_SLOT_INPUT_INVALID');
  if(!Number.isInteger(slot)||slot<0||slot>=limit)throw Error('MODEL_SLOT_INDEX_INVALID');
  const allowed=new Set(catalog.models.map(m=>m.id));
  if(allowed.size!==catalog.models.length||[...allowed].some(id=>typeof id!=='string'||!id))throw Error('MODEL_CATALOG_INVALID');
  if(modelId!==null&&!allowed.has(modelId))throw Error('MODEL_NOT_IN_CANONICAL_CATALOG');
  const next=Array.from({length:limit},(_,i)=>slots[i]??null);
  if(next.some(id=>id!==null&&!allowed.has(id)))throw Error('MODEL_SLOT_EXISTING_ID_INVALID');
  next[slot]=modelId;
  const occupied=next.filter(id=>id!==null);
  if(new Set(occupied).size!==occupied.length)throw Error('MODEL_ALREADY_ASSIGNED');
  return Object.freeze({schema:'leeway.model-hub.customer-slots.v1',slots:Object.freeze(next),selectedCount:occupied.length,limit,executionStatus:'SELECTION_ONLY_NOT_LOADED'});
}
