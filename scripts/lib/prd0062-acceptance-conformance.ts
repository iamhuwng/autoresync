import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import activityCoverageMatrix from '../../documentation/architecture/data/prd0062-activity-coverage.matrix.json';
import { FEATURE_REGISTRY } from '../../src/config/featureRegistry';
import { getMaterialKindCapabilities, validateMaterialCapabilityRegistry } from '../../src/services/materialCatalog/materialCapabilityRegistry.service';
import { validateEditableActivity } from '../../src/services/book-activity/activitySchema.service';
import { makeTaskProfileRegistry } from './prd0062-activity-coverage/validator.mjs';
import { bookActivityAdapterRegistrations } from '../../src/services/book-activity/runtime/registrations/bookActivityAdapterRegistrations';
import { adaptReadingV2ProjectionToBookActivities } from '../../src/services/book-activity/adapters/reading/readingV2ActivityAdapter';
import { adaptListeningVersionToBookActivities } from '../../src/services/book-activity/adapters/listening/listeningActivityAdapter';
import { PRD0062_51A_ACCEPTANCE_FIXTURES } from '../fixtures/prd0062-51a-acceptance-fixtures.mjs';
import { validateHarnessContract } from './prd0062-harness-contract.mjs';

type AnyRecord = Record<string, any>;

const MATRIX_PATH = 'documentation/tasks/PRD0062/supporting/prd0062-v1-acceptance-matrix.json';
const ACCEPTED_MANIFEST_PATH = 'src/services/book-activity/runtime/activityRendererManifest.json';
const ACCEPTED_ADAPTER_COMMIT = 'a7522986597c816283c8fc68b1b251384b67ff91';
const ACCEPTED_TIMER_COMMIT = 'ba8b2d59d9ccaae2b6cc7a74a34b55b32e1b1c70';

const key = (entry: AnyRecord) => [
  entry.profile?.taxonomyId ?? '',
  entry.profile?.typeId ?? '',
  entry.profile?.taxonomyVersion ?? '',
  entry.family ?? entry.interaction?.family ?? '',
  entry.variant ?? entry.interaction?.variant ?? '',
  entry.presentationMode ?? '',
  entry.responseCodec ?? '',
].join('|');

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const issue = (issues: AnyRecord[], code: string, pathName: string, message: string) => {
  issues.push({ code, path: pathName, message });
};

const readJson = (filePath: string): AnyRecord => JSON.parse(fs.readFileSync(filePath, 'utf8')) as AnyRecord;

const acceptedManifest = (rootDir: string): { value: AnyRecord; raw: string } => {
  const raw = execFileSync(
    'git', ['-C', rootDir, 'show', `${ACCEPTED_ADAPTER_COMMIT}:${ACCEPTED_MANIFEST_PATH}`],
    { encoding: 'utf8' },
  ) as string;
  return { value: JSON.parse(raw) as AnyRecord, raw };
};

const gitSource = (rootDir: string, commit: string, sourcePath: string): string => execFileSync(
  'git', ['-C', rootDir, 'show', `${commit}:${sourcePath}`], { encoding: 'utf8' },
) as string;

const featureProfile = (matrix: AnyRecord, profileId: string) =>
  matrix.registryConformance?.featureRegistry?.profiles?.[profileId] as AnyRecord | undefined;

const walkCommandFields = (value: unknown, pathName: string, callback: (command: string, commandPath: string) => void) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkCommandFields(entry, `${pathName}[${index}]`, callback));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [keyName, child] of Object.entries(value as AnyRecord)) {
    const childPath = `${pathName}.${keyName}`;
    if (['command', 'cleanupCommand'].includes(keyName) && typeof child === 'string') callback(child, childPath);
    else walkCommandFields(child, childPath, callback);
  }
};

const assertHarnessCommand = (command: string, commandPath: string, issues: AnyRecord[]) => {
  const harnessTool = /^node scripts\/harness\/run-tool\.mjs\s+(?:playwright\s+\.\s+test|(?:vite|vitest|vite-node|wrangler)\s+\.)(?:\s|$)/u;
  if (/\bplaywright\b/iu.test(command) && !/^node scripts\/harness\/run-tool\.mjs playwright \. test(?:\s|$)/u.test(command)) {
    issue(issues, 'harness-command-drift', commandPath, 'Playwright commands must use node scripts/harness/run-tool.mjs playwright . test.');
  }
  if (/\bnpx\b|\b(?:vite|vitest|wrangler)\b/iu.test(command) && !harnessTool.test(command)) {
    issue(issues, 'harness-command-drift', commandPath, 'Direct npx, vite, vitest, or wrangler commands are not accepted; use the repository harness.');
  }
};

const sourceContext = (fixtureId: string) => ({
  available: true,
  description: `Book-owned source for ${fixtureId}`,
  sourceExerciseLabel: 'Exercise 1',
  sourcePartLabel: 'Part 1',
});

const readingStimulus = (row: AnyRecord) => {
  const typeId = row.profile.typeId as string;
  if (typeId.includes('table')) {
    return { stimulusId: 'stimulus-1', kind: 'table', content: { kind: 'table-content', rows: [[{ text: 'Book table cell' }]] }, anchorIds: [] };
  }
  if (typeId.includes('flowchart')) {
    return { stimulusId: 'stimulus-1', kind: 'flowchart', content: { kind: 'flowchart-content', steps: [{ stepId: 'step-1', text: 'Book flow step' }] }, anchorIds: [] };
  }
  if (typeId.includes('diagram')) {
    return { stimulusId: 'stimulus-1', kind: 'diagram', content: { kind: 'diagram-content', imageAlt: 'Book-owned labelled diagram.', imageUrl: 'https://private.example/source', hotspots: [] }, anchorIds: [] };
  }
  return { stimulusId: 'stimulus-1', kind: 'passage', content: { kind: 'passage-content', paragraphs: [{ paragraphId: 'paragraph-1', text: 'Book-owned passage context.' }] }, anchorIds: [] };
};

const readingResponseShape = (row: AnyRecord) => {
  const typeId = row.profile.typeId as string;
  if (row.interaction.family === 'text-entry') {
    if (typeId.includes('table')) return { kind: 'structured-entry', structure: 'table' };
    if (typeId.includes('flowchart')) return { kind: 'structured-entry', structure: 'flowchart' };
    if (typeId.includes('diagram')) return { kind: 'structured-entry', structure: 'diagram' };
    return { kind: 'free-text' };
  }
  if (row.interaction.family === 'matching') return { kind: 'matching', optionSetId: 'options-1', optionReuse: 'disallowed' };
  if (typeId === 'true-false-not-given' || typeId === 'yes-no-not-given') {
    return { kind: 'binary-judgement', vocabulary: typeId === 'true-false-not-given' ? 'TFNG' : 'YNNG' };
  }
  if (row.responseCodec === 'choice-multiple-v1') return { kind: 'multi-select', optionSetId: 'options-1', selectionLimit: 2 };
  return { kind: 'single-choice', optionSetId: 'options-1' };
};

const readingInput = (row: AnyRecord): AnyRecord => {
  const needsOptions = row.interaction.family === 'choice' || row.interaction.family === 'matching';
  const options = [
    { optionId: 'option-a', label: 'A', text: 'First option' },
    { optionId: 'option-b', label: 'B', text: 'Second option' },
    { optionId: 'option-c', label: 'C', text: 'Third option' },
  ];
  return {
    projection: {
      deliveryEngine: 'reading-v2', plane: 'projection', schemaVersion: 1, ownerId: 'owner-1',
      projectionKind: 'student-safe', sourceSnapshotVersionId: 'version-1', generatedAt: '2026-08-12T00:00:00.000Z',
      projectionId: `projection-${row.id}`, sourceDocumentId: `document-${row.id}`, runtimeContract: 'student-runtime',
      content: {
        title: `Reading ${row.id}`, sections: [], stimuli: [readingStimulus(row)], anchors: [],
        taskGroups: [{
          taskGroupId: 'group-1', officialTaskType: row.profile.typeId, engineeringFamily: row.interaction.family,
          instructionBlocks: [{ id: 'instruction-1', text: 'Complete this fixture.' }], stimulusRefs: [{ stimulusId: 'stimulus-1' }],
          interactions: [{ interactionId: 'interaction-1', taskGroupId: 'group-1', displayNumber: 1, promptText: `Prompt for ${row.id}`, responseShape: readingResponseShape(row) }],
        }],
        optionSets: needsOptions ? [{ optionSetId: 'options-1', taskGroupId: 'group-1', options }] : [],
      },
    },
    contextForTaskGroup: () => ({
      sourceContext: sourceContext(row.id),
      ...(row.profile.typeId.includes('diagram') ? { authorizedAssetRefs: [{ kind: 'image', assetId: `${row.id}-image`, sourceRef: `book-source:${row.id}` }] } : {}),
    }),
  };
};

const listeningInput = (row: AnyRecord): AnyRecord => {
  const needsOptions = row.interaction.family === 'choice' || row.interaction.family === 'matching';
  const needsImage = row.id.includes('map-plan') || row.id.includes('diagram');
  return {
    version: {
      path: 'listening_authoring/versions', versionId: `version-${row.id}`, draftId: 'draft-1', ownerId: 'owner-1', testId: 'test-1',
      state: 'published', versionNumber: 1, sourceDraftPath: 'drafts', documentHash: 'hash', retainedPins: {}, publishedAt: 1,
      document: {
        title: `Listening ${row.id}`, type: 'IELTS', skill: 'Listening', duration: 30, difficulty: 'Intermediate', questionCount: 1,
        isPublic: false, isComplete: true, displayMode: needsImage ? 'image' : 'text',
        metadata: { description: 'Conformance fixture', instructions: 'Listen and answer.', tags: [] },
        audioSections: [{ number: 1, name: 'Part 1', audioUrl: 'https://private.example/audio', assetId: `${row.id}-audio`, startQuestion: 1, endQuestion: 1 }],
        ...(needsImage ? { questionImages: [{ sectionNumber: 1, imageUrl: 'https://private.example/image', questionRange: { start: 1, end: 1 } }] } : {}),
        questions: [{
          number: 1, type: (row.profile.typeId as string).replace(/^ielts-listening-/u, ''), question: `Prompt for ${row.id}`,
          ...(needsOptions ? { options: ['Option A', 'Option B', 'Option C'] } : {}), answer: '__answer-redacted__', sectionNumber: 1, points: 1,
          ...(needsImage ? { imageUrl: 'https://private.example/image' } : {}),
        }],
        settings: { allowPause: false, showTimer: true, shuffleQuestions: false, showResults: 'after-submission', allowReview: true, passingScore: 1, allowReplay: false },
      },
    },
    contextForQuestion: () => ({
      sourceContext: sourceContext(row.id),
      ...(needsImage ? { authorizedAssetRefs: [{ kind: 'image', assetId: `${row.id}-image`, sourceRef: `book-source:${row.id}` }] } : {}),
      ...(row.responseCodec === 'choice-multiple-v1' ? { requiredSelectionCount: 2 } : {}),
      ...(row.interaction.family === 'matching' ? { allowOptionReuse: false } : {}),
    }),
  };
};

const assertAdapterConversion = (row: AnyRecord, issues: AnyRecord[]) => {
  try {
    const result = row.domain === 'reading'
      ? adaptReadingV2ProjectionToBookActivities(readingInput(row))
      : adaptListeningVersionToBookActivities(listeningInput(row));
    if (!result.ok) {
      issue(issues, 'adapter-conversion-failed', `$.capabilityRows.${row.id}`, `${result.code} ${result.path}`);
      return;
    }
    if (result.projections.length !== 1) issue(issues, 'adapter-cardinality-drift', `$.capabilityRows.${row.id}`, 'Expected one deterministic projection.');
    const projection = result.projections[0];
    if (!same(projection.taskProfile, row.profile)) issue(issues, 'adapter-profile-drift', `$.capabilityRows.${row.id}`, 'Adapter output profile differs from the accepted matrix row.');
    if (!same(projection.interaction, row.interaction)) issue(issues, 'adapter-interaction-drift', `$.capabilityRows.${row.id}`, 'Adapter output interaction differs from the accepted matrix row.');
    if (projection.presentationMode !== row.presentationMode) issue(issues, 'adapter-presentation-drift', `$.capabilityRows.${row.id}`, 'Adapter output presentation differs from the accepted matrix row.');
  } catch (error) {
    issue(issues, 'adapter-conformance-exception', `$.capabilityRows.${row.id}`, error instanceof Error ? error.message : String(error));
  }
};

const assertFixtureCorrespondence = (row: AnyRecord, coverage: AnyRecord, issues: AnyRecord[], registry: AnyRecord[]) => {
  const fixture = PRD0062_51A_ACCEPTANCE_FIXTURES[row.fixtureId] as AnyRecord | undefined;
  if (!fixture?.activity || !fixture.coverage) return;
  if (!same(fixture.coverage.stimulusNeeds, coverage.stimulus.needs) ||
    !same(fixture.coverage.assetKinds, coverage.stimulus.assetKinds) ||
    !same(fixture.coverage.contextRequirement, coverage.contextRequirement) ||
    !same(fixture.coverage.accessibilityRepresentations, coverage.accessibility.representations) ||
    !same(fixture.activity.taskProfile, coverage.profile) ||
    !same(fixture.activity.interaction, coverage.interaction) ||
    fixture.activity.presentationMode !== coverage.presentationMode ||
    fixture.activity.scoring.mode !== coverage.scoringReview.mode ||
    !same(fixture.activity.contextRequirement, coverage.contextRequirement)) {
    issue(issues, 'fixture-coverage-drift', `$.capabilityRows.${row.id}`, 'Deterministic fixture correspondence differs from Activity coverage.');
  }
  const validation = validateEditableActivity(fixture.activity, {
    taskProfileRegistry: registry,
    mappedBookPageRefs: row.presentationMode === 'source-assisted' ? ['fixture-page-1'] : undefined,
  });
  if (!validation.valid) issue(issues, 'fixture-schema-invalid', `$.capabilityRows.${row.id}`, validation.errors.join('; '));
};

export const validatePrd0062AcceptanceConformance = ({ rootDir = process.cwd(), matrixPath = path.join(rootDir, MATRIX_PATH) } = {}) => {
  const issues: AnyRecord[] = [];
  let matrix: AnyRecord;
  let manifest: AnyRecord;
  let manifestRaw = '';
  try {
    matrix = readJson(matrixPath);
    manifestRaw = fs.readFileSync(path.join(rootDir, matrix.fixtureManifest.path), 'utf8');
    manifest = JSON.parse(manifestRaw) as AnyRecord;
  } catch (error) {
    return { ok: false, issues: [{ code: 'authority-input-unreadable', path: '$', message: error instanceof Error ? error.message : String(error) }] };
  }

  if (crypto.createHash('sha256').update(manifestRaw).digest('hex') !== matrix.fixtureManifest?.sha256) {
    issue(issues, 'fixture-manifest-hash-drift', '$.fixtureManifest.sha256', 'Deterministic fixture manifest hash differs from the frozen authority hash.');
  }
  for (const harnessIssue of validateHarnessContract({ rootDir })) issues.push(harnessIssue);
  walkCommandFields(matrix, '$', (command, commandPath) => assertHarnessCommand(command, commandPath, issues));
  const manifestRoots = new Set<string>();
  for (const entry of manifest.entries ?? []) {
    if (manifestRoots.has(entry.cleanupRoot)) issue(issues, 'duplicate-fixture-cleanup-root', `$.fixtureManifest.entries.${entry.id}`, 'Fixture cleanup roots must be unique.');
    manifestRoots.add(entry.cleanupRoot);
    const expectedCleanupCommand = `node scripts/cleanup-prd0062-acceptance-fixtures.mjs --root ${entry.cleanupRoot} --apply`;
    if (entry.cleanupCommand !== expectedCleanupCommand) issue(issues, 'fixture-cleanup-command-drift', `$.fixtureManifest.entries.${entry.id}.cleanupCommand`, 'Fixture cleanup command differs from the exact manifest root command.');
    if (!entry.cleanupRoot?.startsWith('prd0062_acceptance/')) issue(issues, 'fixture-cleanup-scope-drift', `$.fixtureManifest.entries.${entry.id}.cleanupRoot`, 'Fixture cleanup root is outside the scoped workspace.');
  }

  if (matrix.sourceConformance?.acceptedAdapterCommit !== ACCEPTED_ADAPTER_COMMIT) issue(issues, 'accepted-adapter-commit-drift', '$.sourceConformance.acceptedAdapterCommit', 'Accepted adapter commit is not a7522986.');
  if (matrix.sourceConformance?.acceptedTimerCommit !== ACCEPTED_TIMER_COMMIT) issue(issues, 'accepted-timer-commit-drift', '$.sourceConformance.acceptedTimerCommit', 'Accepted timer commit is not ba8b2d59.');

  let accepted: AnyRecord;
  let acceptedRaw = '';
  try {
    const acceptedSource = acceptedManifest(rootDir);
    accepted = acceptedSource.value;
    acceptedRaw = acceptedSource.raw;
  } catch (error) {
    issue(issues, 'accepted-manifest-unreadable', '$.sourceConformance.acceptedAdapterManifest', error instanceof Error ? error.message : String(error));
    accepted = { registrations: [] };
  }
  if (acceptedRaw && crypto.createHash('sha256').update(acceptedRaw).digest('hex') !== matrix.sourceConformance?.acceptedAdapterManifestSha256) {
    issue(issues, 'accepted-manifest-hash-drift', '$.sourceConformance.acceptedAdapterManifestSha256', 'Accepted adapter manifest hash differs from the frozen source hash.');
  }
  const acceptedRegistrations = (accepted.registrations ?? []).filter((entry: AnyRecord) => entry.profile !== null);
  const expectedKeys = new Set(acceptedRegistrations.map(key));
  const rows = Array.isArray(matrix.capabilityRows) ? matrix.capabilityRows : [];
  const taskProfileRegistry = makeTaskProfileRegistry(activityCoverageMatrix.rows);
  if (rows.length !== expectedKeys.size) issue(issues, 'capability-cardinality-drift', '$.capabilityRows', `Expected ${expectedKeys.size} accepted profiled registrations.`);
  const rowKeys = new Set<string>();
  for (const row of rows) {
    const rowKey = row.sourceRegistrationKey;
    if (rowKeys.has(rowKey)) issue(issues, 'duplicate-capability-row', `$.capabilityRows.${row.id}`, 'Duplicate source registration key.');
    rowKeys.add(rowKey);
    if (!expectedKeys.has(rowKey)) issue(issues, 'source-registration-missing', `$.capabilityRows.${row.id}`, 'Capability row is not present in the accepted adapter manifest.');
    const currentRegistration = bookActivityAdapterRegistrations.find((entry) => key(entry) === rowKey);
    if (!currentRegistration) issue(issues, 'current-registration-missing', `$.capabilityRows.${row.id}`, 'Current adapter registry does not expose the accepted registration.');
    if (row.domain === 'listening' && row.supportState === 'explicitly-unsupported-release-blocking') issue(issues, 'stale-listening-status', `$.capabilityRows.${row.id}`, 'Listening row retains a stale release-blocking unsupported status.');
    if (row.domain === 'listening' && !['structurally-supported', 'source-assisted-supported'].includes(row.supportState)) issue(issues, 'listening-support-missing', `$.capabilityRows.${row.id}`, 'Listening row must map to accepted supported coverage.');

    const coverage = activityCoverageMatrix.rows.find((candidate) => candidate.fixtureId === row.activityCoverageFixtureId);
    if (!coverage) issue(issues, 'activity-coverage-missing', `$.capabilityRows.${row.id}`, 'Activity coverage row is absent.');
    else {
      if (!same(coverage.profile, row.profile) || !same(coverage.interaction, row.interaction) || coverage.presentationMode !== row.presentationMode || coverage.responseCodec !== row.responseCodec) {
        issue(issues, 'activity-coverage-drift', `$.capabilityRows.${row.id}`, 'Activity coverage profile, interaction, presentation, or codec differs.');
      }
      if (coverage.support.state !== row.supportState) issue(issues, 'activity-support-drift', `$.capabilityRows.${row.id}`, 'Activity support state differs.');
      assertFixtureCorrespondence(row, coverage, issues, taskProfileRegistry);
    }

    const fixtureEntry = (manifest.entries ?? []).find((entry: AnyRecord) => entry.id === row.fixtureId);
    if (!fixtureEntry) issue(issues, 'fixture-manifest-missing', `$.capabilityRows.${row.id}`, 'Deterministic fixture manifest entry is absent.');
    else if (fixtureEntry.cleanupCommand !== `node scripts/cleanup-prd0062-acceptance-fixtures.mjs --root ${fixtureEntry.cleanupRoot} --apply` || !fixtureEntry.cleanupRoot.startsWith('prd0062_acceptance/')) {
      issue(issues, 'fixture-cleanup-drift', `$.capabilityRows.${row.id}`, 'Fixture cleanup command is not exact and scoped.');
    }
    if (!PRD0062_51A_ACCEPTANCE_FIXTURES[row.fixtureId]) issue(issues, 'fixture-module-missing', `$.capabilityRows.${row.id}`, 'Deterministic fixture module export is absent.');
    const features = featureProfile(matrix, row.featureProfile);
    if (!features?.refs?.length) issue(issues, 'feature-profile-missing', `$.capabilityRows.${row.id}`, 'Feature registry profile is absent.');
    else for (const ref of features.refs) {
      const feature = FEATURE_REGISTRY.find((candidate) => candidate.id === ref.featureId);
      if (!feature) issue(issues, 'feature-id-missing', `$.capabilityRows.${row.id}`, `Feature ${ref.featureId} is not registered.`);
      else for (const action of ref.actions ?? []) if (!feature.actions.includes(action)) issue(issues, 'feature-action-missing', `$.capabilityRows.${row.id}`, `Feature ${ref.featureId} does not register ${action}.`);
    }
    assertAdapterConversion(row, issues);
  }
  for (const expectedKey of expectedKeys) if (!rowKeys.has(expectedKey)) issue(issues, 'accepted-registration-unmapped', '$.capabilityRows', `Accepted registration ${expectedKey} has no matrix capability row.`);

  try {
    const capabilities = getMaterialKindCapabilities('interactive-activity');
    validateMaterialCapabilityRegistry();
    const expected = matrix.registryConformance.materialCapabilityRegistry.expected;
    for (const [field, value] of Object.entries(expected)) if (capabilities[field as keyof typeof capabilities] !== value) issue(issues, 'material-capability-drift', `$.registryConformance.materialCapabilityRegistry.expected.${field}`, `Expected ${String(value)} in the live capability registry.`);
  } catch (error) {
    issue(issues, 'material-capability-registry-invalid', '$.registryConformance.materialCapabilityRegistry', error instanceof Error ? error.message : String(error));
  }

  const timer = matrix.retainedBehaviors?.find((entry: AnyRecord) => entry.id === 'personal-timer-ui-only');
  const timerFixture = PRD0062_51A_ACCEPTANCE_FIXTURES['personal-timer-ui-only'] as AnyRecord | undefined;
  if (!timer || !timerFixture) issue(issues, 'personal-timer-fixture-missing', '$.retainedBehaviors', 'Accepted personal timer fixture is missing.');
  else {
    if (timer.sourceCommit !== ACCEPTED_TIMER_COMMIT) issue(issues, 'personal-timer-source-commit-drift', '$.retainedBehaviors.personal-timer-ui-only.sourceCommit', 'PersonalTimer row must pin the accepted source commit.');
    if (timer.sourcePath !== matrix.sourceConformance.acceptedTimerSource) issue(issues, 'personal-timer-source-path-drift', '$.retainedBehaviors.personal-timer-ui-only.sourcePath', 'PersonalTimer row must pin the accepted source path.');
    const timerSource = gitSource(rootDir, ACCEPTED_TIMER_COMMIT, timer.sourcePath);
    const timerHash = crypto.createHash('sha256').update(timerSource).digest('hex');
    if (timerHash !== matrix.sourceConformance.acceptedTimerSourceSha256) issue(issues, 'personal-timer-source-drift', '$.sourceConformance.acceptedTimerSourceSha256', 'Accepted PersonalTimer source hash differs.');
    for (const invariant of matrix.sourceConformance.personalTimer.invariants ?? []) if (!timerFixture.invariants.includes(invariant)) issue(issues, 'personal-timer-invariant-drift', '$.retainedBehaviors.personal-timer-ui-only', `Fixture omits ${invariant}.`);
    if (timerFixture.timerKey !== timer.cleanupRoot.replace(/\/$/u, '')) issue(issues, 'personal-timer-cleanup-drift', '$.retainedBehaviors.personal-timer-ui-only.cleanupRoot', 'Timer fixture key and cleanup root differ.');
    const timerManifestEntry = (manifest.entries ?? []).find((entry: AnyRecord) => entry.id === timer.fixtureId);
    if (!timerManifestEntry) issue(issues, 'personal-timer-manifest-missing', '$.retainedBehaviors.personal-timer-ui-only.fixtureId', 'PersonalTimer fixture is absent from the deterministic manifest.');
    else if (timerManifestEntry.cleanupRoot !== timer.cleanupRoot || timerManifestEntry.cleanupCommand !== timer.cleanupCommand) issue(issues, 'personal-timer-manifest-drift', '$.retainedBehaviors.personal-timer-ui-only', 'PersonalTimer fixture cleanup does not match the authority row.');
    const timerFeatures = featureProfile(matrix, timer.featureProfile);
    if (!timerFeatures?.refs?.length) issue(issues, 'personal-timer-feature-profile-missing', '$.retainedBehaviors.personal-timer-ui-only.featureProfile', 'PersonalTimer feature profile is absent.');
    else for (const ref of timerFeatures.refs) {
      const feature = FEATURE_REGISTRY.find((candidate) => candidate.id === ref.featureId);
      if (!feature) issue(issues, 'personal-timer-feature-id-missing', '$.retainedBehaviors.personal-timer-ui-only.featureProfile', `Feature ${ref.featureId} is not registered.`);
      else for (const action of ref.actions ?? []) if (!feature.actions.includes(action)) issue(issues, 'personal-timer-feature-action-missing', '$.retainedBehaviors.personal-timer-ui-only.featureProfile', `Feature ${ref.featureId} does not register ${action}.`);
    }
  }

  const manifestIds = new Set((manifest.entries ?? []).map((entry: AnyRecord) => entry.id));
  if (manifest.entries?.length !== rows.length + 1) issue(issues, 'fixture-manifest-cardinality-drift', '$.fixtureManifest', 'Manifest must contain one fixture per capability plus the personal timer.');
  for (const row of rows) if (!manifestIds.has(row.fixtureId)) issue(issues, 'fixture-manifest-row-missing', '$.fixtureManifest.entries', `Missing fixture for ${row.id}.`);

  return {
    ok: issues.length === 0,
    issues: issues.sort((left, right) => `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)),
    counts: { capabilityRows: rows.length, acceptedRegistrations: expectedKeys.size, fixtureEntries: manifest.entries?.length ?? 0, activityRows: activityCoverageMatrix.rows.length },
  };
};

const rootDir = process.cwd();
const matrixArgument = process.argv.find((argument) => argument.endsWith('acceptance-matrix.json'));
const matrixPath = matrixArgument ? path.resolve(matrixArgument) : path.join(rootDir, MATRIX_PATH);
const result = validatePrd0062AcceptanceConformance({ rootDir, matrixPath });
console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;
