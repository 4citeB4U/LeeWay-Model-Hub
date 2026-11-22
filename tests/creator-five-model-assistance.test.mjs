/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.CREATOR_FIVE_MODEL_ASSISTANCE_TESTS
TAG: LEEWAY.MODEL_HUB.CREATOR_FIVE_MODEL_ASSISTANCE_TESTS.V1
5WH:
WHAT = Assert the five-model assistance plans use real canonical source IDs and never impersonate execution.
WHY = Keep Model Hub task planning bounded until actual Formula, GPU and independent admission.
WHO = LeeWay Model Hub source owner; GPT-6 outside engineering support, not Agent Lee.
WHERE = tests/creator-five-model-assistance.test.mjs.
WHEN = 2026-11-22.
HOW = Use Node test and original repository registry data with negative authorization cases.
LICENSE = Existing source terms unchanged; no new license asserted.
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  inspectCreatorFiveModelRoster,
  planCreatorFactoryTask,
  describeCreatorLearningReview,
  loadCreatorFiveModelContract,
  inspectCreatorLightweightProfile,
  planCreatorSkillAssistance
} from '../src/creator-five-model-assistance.mjs';

const catalog = JSON.parse(readFileSync(new URL('../catalog/models.json', import.meta.url), 'utf8'));
const runtimeManifest = JSON.parse(readFileSync(new URL('../registry/leeway-model-hub-runtime-manifest.v1.json', import.meta.url), 'utf8'));
const contract = loadCreatorFiveModelContract();
const sources = {catalog, runtimeManifest, contract};
const expected = [
  'gemma-3-1b-q4km',
  'gemma-3-270m-q4km',
  'qwen3-4b',
  'qwen3-vl-8b-instruct',
  'wan2.1-t2v-1.3b'
];

test('exact five Creator-selected model IDs resolve through original two canonical sources', () => {
  const r = inspectCreatorFiveModelRoster(sources);
  assert.equal(r.modelCount, 5);
  assert.deepEqual(r.models.map(m => m.id), expected);
  assert.equal(r.models.filter(m => m.source === 'catalog/models.json').length, 2);
  assert.equal(r.models.filter(m => m.source === 'registry/leeway-model-hub-runtime-manifest.v1.json').length, 3);
});

test('original extra catalog models remain preserved, not silently removed', () => {
  const oldIds = ['qwen-3-5-4b-local', 'qwen-2-5-0-5b-local', 'gemma-4-e4b-local'];
  for (const id of oldIds) assert.ok(catalog.models.some(m => m.id === id));
});

test('catalog membership, memory, weight hashes, GPU and inference are never faked', () => {
  const report = inspectCreatorFiveModelRoster(sources);
  for (const model of report.models) {
    assert.equal(model.sourceRegistered, true);
    assert.equal(model.installedOnCurrentHost, 'NOT_ESTABLISHED');
    assert.equal(model.actualWeightIntegrity, 'NOT_INDEPENDENTLY_VERIFIED');
    assert.equal(model.residentMemory, 'NOT_ESTABLISHED');
    assert.equal(model.leeWayGpuInference, 'NOT_EXECUTED');
    assert.equal(model.executionAuthority, 'NOT_CONFERRED');
  }
  assert.equal(report.actualInference, 'NOT_EXECUTED');
  assert.equal(report.schedulerStarted, false);
});

test('rejects model IDs missing from their original registries', () => {
  const modified = structuredClone(contract);
  modified.primaryModels[2].id = 'invented-super-model';
  assert.throws(() => inspectCreatorFiveModelRoster({...sources, contract:modified}), /CREATOR_MODEL_ID_NOT_IN_ORIGINAL_REGISTRY/);
});

test('rejects invalid registry and any attempt to give models control', () => {
  assert.throws(() => inspectCreatorFiveModelRoster({...sources, runtimeManifest:{models:[]}}), /CREATOR_MODEL_CANONICAL_SOURCES_REQUIRED/);
  const modified = structuredClone(contract);
  modified.governance.modelsMayAuthorizeTools = true;
  assert.throws(() => inspectCreatorFiveModelRoster({...sources, contract:modified}), /CREATOR_MODEL_AUTHORITY_CONTRACT_INVALID/);
});

test('source-to-infographic requires real approved sources before planning', () => {
  const denied = planCreatorFactoryTask({application:'OFFICE',task:'source_to_infographic',...sources});
  assert.equal(denied.status, 'BLOCKED');
  assert.equal(denied.reason, 'CREATOR_FACTORY_APPROVED_SOURCE_REQUIRED');
  assert.equal(denied.inferenceStarted, false);
  const plan = planCreatorFactoryTask({application:'OFFICE',task:'source_to_infographic',sourceIds:['source-123'],...sources});
  assert.equal(plan.outputOwner, 'LEEWAY_OFFICE_SUITES_RENDERER');
  assert.equal(plan.deterministicOutputRequired, true);
  assert.ok(plan.candidateModels.includes('qwen3-vl-8b-instruct'));
  assert.equal(plan.contentPublished,false);
  assert.equal(plan.inferenceStarted,false);
});

test('IDE tasks cannot execute tools and CRM tasks cannot send communications', () => {
  const ide = planCreatorFactoryTask({application:'IDE',task:'plan_code_review_and_test',sourceIds:['repo-sha'],...sources});
  assert.equal(ide.actionApproval,'REQUIRED_FROM_ORIGINAL_AUTHORITY');
  assert.equal(ide.mutation,'NOT_EXECUTED');
  const crm = planCreatorFactoryTask({application:'CRM_ERP',task:'sales_followup_and_pipeline',sourceIds:['consented-customer'],...sources});
  assert.match(crm.dataPolicy,/CONTACT_CONSENT/);
  assert.equal(crm.contentPublished,false);
});

test('Logistics camera planning requires source and does not invent live CCTV', () => {
  const blocked = planCreatorFactoryTask({application:'LOGISTICS',task:'route_guidance_and_traffic_camera_context',...sources});
  assert.equal(blocked.status,'BLOCKED');
  const plan = planCreatorFactoryTask({application:'LOGISTICS',task:'route_guidance_and_traffic_camera_context',sourceIds:['licensed-feed-id'],...sources});
  assert.match(plan.dataPolicy,/LICENSED_LIVE_CCTV/);
  assert.equal(plan.leeWayGpuGate,'NOT_EXECUTED');
});

test('foundry video task references Wan but is not a running video generator', () => {
  const plan = planCreatorFactoryTask({application:'CONTENT_FOUNDRY',task:'text_to_video',...sources});
  assert.equal(plan.candidateModels[0],'wan2.1-t2v-1.3b');
  assert.equal(plan.inferenceStarted,false);
  assert.equal(plan.status,'CANDIDATE_PLAN_REQUIRES_ORIGINAL_RUNTIME_ADMISSION');
});

test('unknown tasks and unbounded or malformed source references fail closed', () => {
  assert.throws(() => planCreatorFactoryTask({application:'OFFICE',task:'invented_action',...sources}),/CREATOR_FACTORY_TASK_NOT_REGISTERED/);
  assert.throws(() => planCreatorFactoryTask({application:'IDE',task:'plan_code_review_and_test',sourceIds:['../../escape'],...sources}),/CREATOR_FACTORY_SOURCES_INVALID/);
  assert.throws(() => planCreatorFactoryTask({application:'IDE',task:'plan_code_review_and_test',sourceIds:new Array(21).fill('safe-id'),...sources}),/CREATOR_FACTORY_SOURCES_INVALID/);
});

test('all five app surfaces are represented and model suggestions cannot promote themselves', () => {
  const apps = new Set(contract.appTasks.map(t => t.application));
  assert.deepEqual([...apps].sort(),['CONTENT_FOUNDRY','CRM_ERP','IDE','LOGISTICS','OFFICE']);
  for (const task of contract.appTasks) {
    assert.equal(task.executionStatus,'NOT_IMPLEMENTED_BY_THIS_CONTRACT');
    for (const id of task.models) assert.ok(expected.includes(id));
  }
  assert.equal(contract.governance.modelsMayWriteProcedureOrWeightsWithoutApproval,false);
  assert.equal(contract.artifactPlan.automaticWeightOverwrite,false);
});

test('three-hour evaluation is explicitly unscheduled and is not autonomous weight training', () => {
  const r = describeCreatorLearningReview({contract});
  assert.equal(r.cadenceHours,3);
  assert.equal(r.scheduleState,'UNSCHEDULED_UNTIL_ACTUAL_RUNTIME_ADMISSION');
  assert.equal(r.modelWeightTraining,'NOT_AUTHORIZED_OR_EXECUTED');
  assert.equal(r.learningAdmission,'NOT_EXECUTED');
  assert.equal(r.mutation,'NOT_EXECUTED');
});


test('compact Qwen3-first profile is small, three candidates, and never reports actual residency', () => {
  const report = inspectCreatorLightweightProfile(sources);
  assert.equal(report.profileId, 'LEEWAY_QWEN3_COMPACT_CPU_FIRST');
  assert.equal(report.nominalPackageMegabytes, 2215);
  assert.equal(report.nominalBytesAreNotRam, true);
  assert.deepEqual(report.models.map(m => m.modelId), [
    'gemma-3-270m-q4km','qwen3-0.6b-q4km','qwen3-1.7b-q4km'
  ]);
  for (const m of report.models) {
    assert.equal(m.installed,'NOT_ESTABLISHED');
    assert.equal(m.loaded,'NOT_ESTABLISHED');
    assert.equal(m.skillsConnectedAtRuntime,false);
    assert.equal(m.leeWayGpuExecuted,false);
    assert.equal(m.inferenceStarted,false);
  }
  assert.equal(report.mutation,'NOT_EXECUTED');
});

test('existing Gemma catalog registration is distinct from new Qwen3 import candidates', () => {
  const p = inspectCreatorLightweightProfile(sources);
  assert.equal(p.models[0].registeredInModelHub, true);
  assert.equal(p.models[0].intakeRequired, false);
  assert.equal(p.models[1].registeredInModelHub, false);
  assert.equal(p.models[1].intakeRequired, true);
  assert.equal(p.models[2].registeredInModelHub, false);
  assert.equal(p.models[2].intakeRequired, true);
  assert.equal(p.automaticDownloads, false);
  assert.equal(p.productionCpuProvider,'NOT_VERIFIED');
});

test('original Qwen3 4B and big vision/video assets are preserved as on-demand or cold', () => {
  const p=inspectCreatorLightweightProfile(sources);
  assert.ok(p.retainedOnDemand.includes('qwen3-4b'));
  assert.ok(p.retainedCold.includes('qwen3-vl-8b-instruct'));
  assert.ok(p.retainedCold.includes('wan2.1-t2v-1.3b'));
  assert.ok(contract.primaryModels.some(m => m.id === 'qwen3-vl-8b-instruct'));
  assert.ok(contract.primaryModels.some(m => m.id === 'wan2.1-t2v-1.3b'));
});

test('each compact candidate routes skill intent through original governed orchestrator', () => {
  for (const model of inspectCreatorLightweightProfile(sources).models) {
    const plan = planCreatorSkillAssistance({
      ...sources, modelId:model.modelId, application:'IDE',task:'plan_code_review_and_test'
    });
    assert.equal(plan.selectionOwner,'skills/leeway-skill-orchestrator/SKILL.md');
    assert.equal(plan.authorityOwner,'skills/leeway-tool-gateway/SKILL.md');
    assert.equal(plan.originalSkillRegistry,'4citeB4U/LeeWay-Agent-Skills');
    assert.equal(plan.status,'SKILL_GRAPH_DISCOVERY_REQUEST_NOT_DISPATCHED');
    assert.equal(plan.runtimeSkillInstructions,'NOT_LOADED');
    assert.equal(plan.runtimeSkillsList,'NOT_CALLED');
    assert.equal(plan.toolGrant,'NOT_CONFERRED');
    assert.equal(plan.modelMayAuthorizeTools,false);
    assert.equal(plan.physicalInference,'NOT_EXECUTED');
    assert.equal(plan.mutation,'NOT_EXECUTED');
  }
});

test('skill planner denies models outside compact and retained sets', () => {
  assert.throws(() => planCreatorSkillAssistance({
    ...sources,modelId:'random-unapproved-model',application:'IDE',task:'plan_code_review_and_test'
  }),/CREATOR_LIGHTWEIGHT_MODEL_NOT_IN_APPROVED_PROFILE/);
  assert.throws(() => planCreatorSkillAssistance({
    ...sources,modelId:'qwen3-0.6b-q4km',application:'OFFICE',task:'undeclared_task'
  }),/CREATOR_FACTORY_TASK_NOT_REGISTERED/);
});

test('compact selection fails closed if model size, identity or actual authority is rewritten', () => {
  const changedSize=structuredClone(contract);
  changedSize.lightweightProfile.candidateCore[1].publishedPackageMegabytes=12;
  assert.throws(() => inspectCreatorLightweightProfile({...sources,contract:changedSize}),/CREATOR_LIGHTWEIGHT_MODEL_OR_SIZE_MISMATCH/);
  const forgedScope=structuredClone(contract);
  forgedScope.lightweightProfile.skillsBinding.skillGrantFromModel=true;
  assert.throws(() => inspectCreatorLightweightProfile({...sources,contract:forgedScope}),/CREATOR_LIGHTWEIGHT_AUTHORITY_CONTRACT_INVALID/);
  const falseRegistration=structuredClone(contract);
  falseRegistration.lightweightProfile.candidateCore[1].sourceType='ALREADY_IN_CANONICAL_CATALOG';
  assert.throws(() => inspectCreatorLightweightProfile({...sources,contract:falseRegistration}),/CREATOR_LIGHTWEIGHT_SOURCE_CLASSIFICATION_INVALID/);
});

test('GitHub Pages and Actions never count as persistent LeeWay inference CPU', () => {
  assert.equal(contract.lightweightProfile.githubCpu.claimGitHubAsPersistentCpu,false);
  assert.match(contract.lightweightProfile.githubCpu.pages,/STATIC/);
  assert.match(contract.lightweightProfile.githubCpu.actions,/EPHEMERAL/);
  assert.equal(contract.lightweightProfile.modelIntake.automaticInference,false);
  assert.equal(contract.lightweightProfile.skillsBinding.runtimeBindingState,'SOURCE_CONTRACT_ONLY_NOT_CONNECTED');
});
