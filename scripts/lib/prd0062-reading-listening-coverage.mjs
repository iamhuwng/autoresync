import { readFileSync } from 'node:fs';
import path from 'node:path';

export const PRD0062_READING_LISTENING_COVERAGE_PATH =
  'scripts/fixtures/prd0062-reading-listening-coverage.json';

const EXPECTED_TASK_TYPE_IDS = [
  'reading-sentence-completion', 'reading-summary-completion-text', 'reading-summary-completion-list',
  'reading-note-completion', 'reading-table-completion', 'reading-flowchart-completion',
  'reading-diagram-label-completion', 'reading-true-false-not-given', 'reading-yes-no-not-given',
  'reading-matching-headings', 'reading-matching-information', 'reading-matching-features',
  'reading-matching-sentence-endings', 'reading-multiple-choice-single', 'reading-list-selection',
  'reading-short-answer', 'listening-multiple-choice-single', 'listening-multiple-choice-multiple',
  'listening-matching', 'listening-map-plan-labelling', 'listening-diagram-labelling',
  'listening-form-completion', 'listening-note-completion', 'listening-table-completion',
  'listening-flowchart-completion', 'listening-summary-completion', 'listening-sentence-completion',
  'listening-short-answer',
];

const FAMILIES = new Set(['choice', 'text-entry', 'matching', 'ordering', 'long-response']);
const STIMULUS_MODES = new Set(['embedded', 'existing-media-reference']);
const CONTEXT_REQUIREMENTS = new Set(['none', 'optional', 'required']);
const PRESENTATION_MODES = new Set(['structured', 'source-assisted']);
const SUPPORT_STATUSES = new Set([
  'structurally-supported',
  'supported-through-source-assisted',
  'separately-approved-deferral',
]);
export const ACCEPTED_ADAPTER_COMMIT = 'a7522986597c816283c8fc68b1b251384b67ff91';
const ACCEPTED_ADAPTER_MANIFEST_PATH = 'src/services/book-activity/runtime/activityRendererManifest.json';
const CANONICAL_TYPE_IDS = Object.freeze({
  'reading-diagram-label-completion': 'diagram-labeling',
  'reading-multiple-choice-single': 'multiple-choice',
  'reading-list-selection': 'multiple-select',
  'listening-multiple-choice-single': 'listening-multiple-choice-single',
  'listening-multiple-choice-multiple': 'listening-multiple-choice-multiple',
  'listening-matching': 'listening-matching',
  'listening-map-plan-labelling': 'listening-map-plan-labelling',
  'listening-diagram-labelling': 'listening-diagram-labelling',
  'listening-form-completion': 'listening-form-completion',
  'listening-note-completion': 'listening-note-completion',
  'listening-table-completion': 'listening-table-completion',
  'listening-flowchart-completion': 'listening-flowchart-completion',
  'listening-summary-completion': 'listening-summary-completion',
  'listening-sentence-completion': 'listening-sentence-completion',
  'listening-short-answer': 'listening-short-answer',
});

const canonicalRegistrationFor = (row) => ({
  taxonomyId: row.taskProfile?.taxonomyId,
  typeId: row.taskProfile?.typeId,
  family: row.interaction?.family,
  variant: row.interaction?.variant,
  presentationMode: row.presentationMode,
});

export const loadAcceptedAdapterRegistrations = (repoRoot = process.cwd()) => {
  try {
    const source = readFileSync(path.join(repoRoot, ACCEPTED_ADAPTER_MANIFEST_PATH), 'utf8');
    const parsed = JSON.parse(source);
    return Array.isArray(parsed.registrations) ? { registrations: parsed.registrations } : { error: 'accepted adapter manifest registrations missing.' };
  } catch {
    return { error: 'current adapter manifest could not be read from the selected source checkout.' };
  }
};

const required = (errors, value, label) => {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${label}: required.`);
};

export const loadPrd0062ReadingListeningCoverage = (repoRoot = process.cwd()) => JSON.parse(
  readFileSync(path.join(repoRoot, PRD0062_READING_LISTENING_COVERAGE_PATH), 'utf8'),
);

export const validatePrd0062ReadingListeningCoverage = (matrix, { repoRoot = process.cwd() } = {}) => {
  const errors = [];
  const accepted = loadAcceptedAdapterRegistrations(repoRoot);
  if (accepted.error) errors.push(accepted.error);
  if (matrix?.schemaVersion !== 1) errors.push('schemaVersion: expected 1.');
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/u.test(matrix?.matrixVersion ?? '')) errors.push('matrixVersion: invalid.');
  if (matrix?.scope !== 'ielts-reading-listening-v1') errors.push('scope: expected ielts-reading-listening-v1.');

  const foundIds = new Set();
  for (const row of matrix?.taskTypes ?? []) {
    required(errors, row.id, 'taskType.id');
    if (foundIds.has(row.id)) errors.push(`task type ${row.id}: duplicate id.`);
    foundIds.add(row.id);
    if (!['reading', 'listening'].includes(row.domain)) errors.push(`task type ${row.id}: invalid domain.`);
    required(errors, row.taskProfile?.taxonomyId, `task type ${row.id} taskProfile.taxonomyId`);
    required(errors, row.taskProfile?.taxonomyVersion, `task type ${row.id} taskProfile.taxonomyVersion`);
    required(errors, row.taskProfile?.typeId, `task type ${row.id} taskProfile.typeId`);
    if (!FAMILIES.has(row.interaction?.family)) errors.push(`task type ${row.id}: invalid interaction family.`);
    required(errors, row.interaction?.variant, `task type ${row.id} interaction.variant`);
    if (!STIMULUS_MODES.has(row.stimulus?.mode)) errors.push(`task type ${row.id}: invalid stimulus mode.`);
    required(errors, row.stimulus?.reference, `task type ${row.id} stimulus.reference`);
    if (!CONTEXT_REQUIREMENTS.has(row.contextRequirement)) errors.push(`task type ${row.id}: invalid context requirement.`);
    if (!PRESENTATION_MODES.has(row.presentationMode)) errors.push(`task type ${row.id}: invalid presentation mode.`);
    required(errors, row.scoringReviewMode, `task type ${row.id} scoringReviewMode`);
    required(errors, row.accessibilityRepresentation, `task type ${row.id} accessibilityRepresentation`);
    if (!SUPPORT_STATUSES.has(row.support?.status)) errors.push(`task type ${row.id}: invalid support status.`);

    if (row.presentationMode === 'source-assisted' &&
      (row.contextRequirement !== 'required' || !/correspondence/iu.test(row.accessibilityRepresentation ?? ''))) {
      errors.push(`task type ${row.id}: source-assisted coverage must require context and declare correspondence.`);
    }
    if (row.support?.status === 'structurally-supported' &&
      (row.presentationMode !== 'structured' || !['ielts-reading', 'ielts-listening'].includes(row.taskProfile?.taxonomyId))) {
      errors.push(`task type ${row.id}: false structural support claim.`);
    }
    if (row.support?.status === 'supported-through-source-assisted' && row.presentationMode !== 'source-assisted') {
      errors.push(`task type ${row.id}: source-assisted support must use source-assisted presentation.`);
    }
    if (row.support?.status === 'separately-approved-deferral') {
      required(errors, row.support.approvalId, `task type ${row.id} support.approvalId`);
    }
    if (row.domain === 'listening' && row.support?.status === 'explicitly-unsupported-release-blocking') {
      errors.push(`task type ${row.id}: stale unregistered Listening support status.`);
    }
    if (accepted.registrations) {
      const canonical = canonicalRegistrationFor(row);
      const matches = accepted.registrations.filter((registration) => (
        registration?.profile?.taxonomyId === canonical.taxonomyId
        && registration?.profile?.typeId === canonical.typeId
        && registration?.family === canonical.family
        && registration?.variant === canonical.variant
        && registration?.presentationMode === canonical.presentationMode
      ));
      if (matches.length === 0) {
        errors.push(`task type ${row.id}: canonical mapping is not registered by accepted adapters.`);
      } else {
        if (row.presentationMode === 'structured' && !matches.some((registration) => registration.presentationMode === 'structured')) errors.push(`task type ${row.id}: false structured support claim.`);
      }
    }
  }

  for (const id of EXPECTED_TASK_TYPE_IDS) if (!foundIds.has(id)) errors.push(`task type ${id}: unclassified.`);
  for (const id of foundIds) if (!EXPECTED_TASK_TYPE_IDS.includes(id)) errors.push(`task type ${id}: unknown researched type.`);
  return errors.sort();
};

export { EXPECTED_TASK_TYPE_IDS };
