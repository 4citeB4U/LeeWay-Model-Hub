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


/**
 * Inspect the Creator's compact deployment selection without declaring that
 * candidate Qwen variants are catalog-admitted, installed, warmed or capable
 * of invoking any existing Agent Skills directly.
 */
export function inspectCreatorLightweightProfile({
  catalog, runtimeManifest, contract = loadCreatorFiveModelContract()
} = {}) {
  inspectCreatorFiveModelRoster({catalog, runtimeManifest, contract});
  const profile = contract.lightweightProfile;
  const skill = profile?.skillsBinding;
  if (profile?.profileId !== 'LEEWAY_QWEN3_COMPACT_CPU_FIRST' ||
      profile?.status !== 'CANDIDATE_SELECTION_NOT_INSTALLED_OR_RUNNING' ||
      !Array.isArray(profile?.candidateCore) || profile.candidateCore.length !== 3 ||
      skill?.canonicalRepository !== '4citeB4U/LeeWay-Agent-Skills' ||
      skill?.selectionOwner !== 'skills/leeway-skill-orchestrator/SKILL.md' ||
      skill?.authorityOwner !== 'skills/leeway-tool-gateway/SKILL.md' ||
      skill?.runtimeBindingState !== 'SOURCE_CONTRACT_ONLY_NOT_CONNECTED' ||
      skill?.modelOutputIsOnlySuggestion !== true || skill?.skillGrantFromModel !== false ||
      profile?.modelIntake?.automaticDownload !== false ||
      profile?.modelIntake?.automaticWeightDeletion !== false ||
      profile?.modelIntake?.automaticInference !== false ||
      profile?.githubCpu?.claimGitHubAsPersistentCpu !== false) {
    throw Error('CREATOR_LIGHTWEIGHT_AUTHORITY_CONTRACT_INVALID');
  }
  const expected = [
    'gemma-3-270m-q4km', 'qwen3-0.6b-q4km', 'qwen3-1.7b-q4km'
  ];
  if (profile.candidateCore.some((item, index) => item.modelId !== expected[index] ||
      !idValid(item.modelId) || !(item.publishedPackageMegabytes > 0) ||
      !Number.isFinite(item.publishedPackageMegabytes)) ||
      profile.candidateCore.reduce((sum, item) => sum + item.publishedPackageMegabytes, 0) !==
        profile.targetPublishedPackageMegabytes) {
    throw Error('CREATOR_LIGHTWEIGHT_MODEL_OR_SIZE_MISMATCH');
  }
  const selected = profile.candidateCore.map(item => {
    const registered = catalog.models.some(model => model.id === item.modelId) ||
      runtimeManifest.models.some(model => model.id === item.modelId);
    if ((item.sourceType === 'ALREADY_IN_CANONICAL_CATALOG') !== registered) {
      throw Error('CREATOR_LIGHTWEIGHT_SOURCE_CLASSIFICATION_INVALID:' + item.modelId);
    }
    return Object.freeze({
      modelId: item.modelId, role: item.role,
      publishedPackageMegabytes: item.publishedPackageMegabytes,
      registeredInModelHub: registered,
      intakeRequired: !registered,
      providerTag: item.providerTag,
      sourceStatus: item.status,
      installed: 'NOT_ESTABLISHED',
      loaded: 'NOT_ESTABLISHED',
      formulaEvaluated: false,
      leeWayGpuExecuted: false,
      skillsConnectedAtRuntime: false,
      inferenceStarted: false
    });
  });
  return Object.freeze({
    profileId: profile.profileId,
    status: profile.status,
    candidateCount: selected.length,
    nominalPackageMegabytes: profile.targetPublishedPackageMegabytes,
    nominalBytesAreNotRam: true,
    models: Object.freeze(selected),
    skillsRoute: Object.freeze([...skill.flow]),
    skillsConnection: skill.runtimeBindingState,
    retainedOnDemand: Object.freeze(profile.retainedOnDemand.map(model => model.modelId)),
    retainedCold: Object.freeze(profile.retainedCold.map(model => model.modelId)),
    automaticDownloads: false,
    productionCpuProvider: 'NOT_VERIFIED',
    mutation: 'NOT_EXECUTED'
  });
}

/**
 * Build only a skill graph request. The original Orchestrator/Formula/Tool
 * Gateway must independently resolve an actual skill and authority grant.
 */
export function planCreatorSkillAssistance({
  modelId, application, task, catalog, runtimeManifest,
  contract = loadCreatorFiveModelContract()
} = {}) {
  const profile = inspectCreatorLightweightProfile({catalog, runtimeManifest, contract});
  if (!idValid(modelId) ||
      !profile.models.some(m => m.modelId === modelId) &&
      !profile.retainedOnDemand.includes(modelId) &&
      !profile.retainedCold.includes(modelId)) {
    throw Error('CREATOR_LIGHTWEIGHT_MODEL_NOT_IN_APPROVED_PROFILE');
  }
  const taskEntry = contract.appTasks.find(t => t.application === application && t.task === task);
  if (!taskEntry) throw Error('CREATOR_FACTORY_TASK_NOT_REGISTERED');
  return Object.freeze({
    status: 'SKILL_GRAPH_DISCOVERY_REQUEST_NOT_DISPATCHED',
    requestedModelId: modelId,
    application, task,
    originalSkillRegistry: contract.lightweightProfile.skillsBinding.canonicalRepository,
    selectionOwner: contract.lightweightProfile.skillsBinding.selectionOwner,
    authorityOwner: contract.lightweightProfile.skillsBinding.authorityOwner,
    route: Object.freeze([...profile.skillsRoute]),
    boundedCapability: taskEntry.task,
    registeredSkillIdentity: 'NOT_RESOLVED',
    modelMayAuthorizeTools: false,
    toolGrant: 'NOT_CONFERRED',
    formulaAdmission: 'NOT_EVALUATED',
    runtimeSkillsList: 'NOT_CALLED',
    runtimeSkillInstructions: 'NOT_LOADED',
    physicalInference: 'NOT_EXECUTED',
    independentVeritas: 'NOT_EVALUATED',
    mutation: 'NOT_EXECUTED'
  });
}
