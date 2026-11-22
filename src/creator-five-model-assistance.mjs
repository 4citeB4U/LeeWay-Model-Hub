/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MODEL_HUB.CREATOR_FIVE_MODEL_ASSISTANCE
TAG: LEEWAY.MODEL_HUB.CREATOR_FIVE_MODEL_ASSISTANCE.V1
5WH:
WHAT = Describe five Creator-selected model capabilities without starting inference or granting model authority.
WHY = Reuse canonical catalog and runtime manifest for bounded Office, Foundry, IDE, CRM and Logistics task planning.
WHO = LeeWay Model Hub source owner; GPT-6 outside engineering support, not Agent Lee.
WHERE = src/creator-five-model-assistance.mjs in the original LeeWay Model Hub.
WHEN = 2026-11-22.
HOW = Validate canonical identity references and return read-only, fail-closed task and evaluation plans.
LICENSE = Existing source terms unchanged; no new license asserted.
*/
import {readFileSync} from 'node:fs';

const contractUrl = new URL('../contracts/creator-five-model-assistance.v1.json', import.meta.url);
export const loadCreatorFiveModelContract = () => JSON.parse(readFileSync(contractUrl, 'utf8'));
const idValid = id => typeof id === 'string' && /^[a-z0-9][a-z0-9.-]{1,127}$/.test(id);
const declaredSchema = 'leeway.model-hub.creator-assistance-plan.v1';
const registered = (items, id) => Array.isArray(items) && items.find(item => item?.id === id);

export function inspectCreatorFiveModelRoster({catalog, runtimeManifest, contract = loadCreatorFiveModelContract()} = {}) {
  if (contract?.schemaVersion !== declaredSchema ||
      contract.governance?.modelsMayAuthorizeTools !== false ||
      contract.governance?.modelsMayWriteProcedureOrWeightsWithoutApproval !== false ||
      contract.artifactPlan?.automaticWeightOverwrite !== false ||
      contract.threeHourReview?.scheduleState !== 'UNSCHEDULED_UNTIL_ACTUAL_RUNTIME_ADMISSION') {
    throw Error('CREATOR_MODEL_AUTHORITY_CONTRACT_INVALID');
  }
  if (catalog?.schema !== 'leeway.model-hub.catalog.v1' ||
      runtimeManifest?.schemaVersion !== 'leeway.model-hub.runtime-manifest.v1') {
    throw Error('CREATOR_MODEL_CANONICAL_SOURCES_REQUIRED');
  }
  const models = contract.primaryModels;
  if (!Array.isArray(models) || models.length !== 5 ||
      new Set(models.map(model => model.id)).size !== 5) {
    throw Error('CREATOR_FIVE_MODEL_ROSTER_INVALID');
  }
  const recognized = models.map(model => {
    if (!idValid(model.id)) throw Error('CREATOR_MODEL_ID_INVALID');
    const fromCatalog = model.source === 'catalog/models.json';
    const fromRuntime = model.source === 'registry/leeway-model-hub-runtime-manifest.v1.json';
    if (!fromCatalog && !fromRuntime) throw Error('CREATOR_MODEL_SOURCE_UNAPPROVED');
    const sourceModel = registered(fromCatalog ? catalog.models : runtimeManifest.models, model.id);
    if (!sourceModel) throw Error('CREATOR_MODEL_ID_NOT_IN_ORIGINAL_REGISTRY:' + model.id);
    return Object.freeze({
      id: model.id, source: model.source, role: model.role,
      sourceRegistered: true,
      actualWeightIntegrity: 'NOT_INDEPENDENTLY_VERIFIED',
      installedOnCurrentHost: 'NOT_ESTABLISHED',
      residentMemory: 'NOT_ESTABLISHED',
      leeWayGpuInference: 'NOT_EXECUTED',
      executionAuthority: 'NOT_CONFERRED'
    });
  });
  return Object.freeze({
    authority: 'LEEWAY_MODEL_HUB_SELECTION_ONLY',
    status: 'FIVE_SOURCE_IDENTITIES_FOUND_PHYSICAL_ADMISSION_PENDING',
    modelCount: recognized.length, models: Object.freeze(recognized),
    mutation: 'NOT_EXECUTED', actualInference: 'NOT_EXECUTED',
    schedulerStarted: false
  });
}

export function planCreatorFactoryTask({
  application, task, sourceIds = [],
  catalog, runtimeManifest, contract = loadCreatorFiveModelContract()
} = {}) {
  const inspected = inspectCreatorFiveModelRoster({catalog, runtimeManifest, contract});
  if (typeof application !== 'string' || typeof task !== 'string') throw Error('CREATOR_FACTORY_TASK_REQUIRED');
  const entry = contract.appTasks.find(item => item.application === application && item.task === task);
  if (!entry) throw Error('CREATOR_FACTORY_TASK_NOT_REGISTERED');
  if (!Array.isArray(sourceIds) || sourceIds.length > 20 ||
      sourceIds.some(id => !idValid(id))) throw Error('CREATOR_FACTORY_SOURCES_INVALID');
  if (entry.requiresSources && sourceIds.length === 0) {
    return Object.freeze({
      status: 'BLOCKED', reason: 'CREATOR_FACTORY_APPROVED_SOURCE_REQUIRED',
      application, task, mutation: 'NOT_EXECUTED', inferenceStarted: false
    });
  }
  if (!Array.isArray(entry.models) || entry.models.length === 0 ||
      entry.models.some(id => !inspected.models.some(model => model.id === id))) {
    throw Error('CREATOR_FACTORY_TASK_REFERENCES_UNKNOWN_MODEL');
  }
  return Object.freeze({
    status: 'CANDIDATE_PLAN_REQUIRES_ORIGINAL_RUNTIME_ADMISSION',
    application, task, candidateModels: Object.freeze([...entry.models]),
    sourceIds: Object.freeze([...sourceIds]),
    outputOwner: entry.outputOwner, dataPolicy: entry.dataPolicy,
    deterministicOutputRequired: entry.deterministicOutputRequired,
    sourceRegisteredNotExecutionReady: true,
    nextAuthority: 'EXISTING_LEEWAY_RUNTIME_FABRIC_AND_MACHINE_CONSCIOUSNESS',
    formulaGate: 'NOT_EVALUATED', leeWayGpuGate: 'NOT_EXECUTED',
    independentVeritasGate: 'NOT_EVALUATED',
    actionApproval: 'REQUIRED_FROM_ORIGINAL_AUTHORITY',
    mutation: 'NOT_EXECUTED', inferenceStarted: false, contentPublished: false
  });
}

export function describeCreatorLearningReview({contract = loadCreatorFiveModelContract()} = {}) {
  if (contract?.schemaVersion !== declaredSchema || contract.threeHourReview?.cadenceHours !== 3 ||
      contract.threeHourReview.scheduleState !== 'UNSCHEDULED_UNTIL_ACTUAL_RUNTIME_ADMISSION') {
    throw Error('CREATOR_FACTORY_REVIEW_CONTRACT_INVALID');
  }
  return Object.freeze({
    cadenceHours: 3,
    schedulerOwner: contract.threeHourReview.schedulerOwner,
    curriculumOwner: contract.threeHourReview.curriculumOwner,
    scheduleState: contract.threeHourReview.scheduleState,
    reviewStages: Object.freeze([...contract.threeHourReview.reviewStages]),
    modelWeightTraining: 'NOT_AUTHORIZED_OR_EXECUTED',
    independentVerification: 'NOT_PERFORMED',
    learningAdmission: 'NOT_EXECUTED',
    mutation: 'NOT_EXECUTED'
  });
}
