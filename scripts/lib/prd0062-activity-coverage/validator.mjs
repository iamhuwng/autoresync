import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CANONICAL_ACTIVITY_SCHEMA_SOURCE,
  readCanonicalActivitySchema,
  readCanonicalTaxonomyEvidence,
} from './canonical-taxonomy.mjs';
import {
  CANONICAL_COVERAGE_ROW_KEYS,
  CANONICAL_VARIANTS_BY_FAMILY,
  RESPONSE_CODECS,
  RUNTIME_IMPLEMENTATION_STATES,
  SUPPORT_STATES,
  SUPPORTED_STATES,
} from './types.mjs';

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const issue = (issues, code, pathName, message) => issues.push({ code, path: pathName, message });
const keyFor = (entry) => `${entry.profile.taxonomyId}/${entry.profile.typeId}@${entry.profile.taxonomyVersion}:${entry.interaction.family}:${entry.interaction.variant}:${entry.presentationMode}:${entry.responseCodec}`;
const genericKeyFor = (entry) => `${entry.interaction.family}:${entry.interaction.variant}:${entry.presentationMode}:${entry.responseCodec}`;
const profileKey = (profile) => `${profile.taxonomyId}/${profile.typeId}@${profile.taxonomyVersion}`;
const manifestSelectorKeyFor = (entry) =>
  `${entry.profile === null ? '*' : profileKey(entry.profile)}:${entry.family}:${entry.variant}`;
const manifestSelectorsOverlap = (left, right) =>
  left.family === right.family
  && left.variant === right.variant
  && (
    left.profile === null
    || right.profile === null
    || profileKey(left.profile) === profileKey(right.profile)
  );
const sameSet = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);
const isKnownProfile = (profile, taxonomy) =>
  (profile.taxonomyId === 'ielts-reading' && taxonomy.reading.includes(profile.typeId)) ||
  (profile.taxonomyId === 'ielts-listening' && taxonomy.listening.includes(profile.typeId));
const coverageRowKey = (row) =>
  `${row.profile.taxonomyId}|${row.profile.typeId}|${row.profile.taxonomyVersion}|${row.interaction.family}|${row.interaction.variant}`;
export const CANONICAL_RUNTIME_REGISTRY_MANIFEST =
  'src/services/book-activity/runtime/activityRendererManifest.json';

export async function loadJson(absolutePath) {
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

export function makeTaskProfileRegistry(rows) {
  const registrations = new Map();
  rows.forEach((row) => {
    const key = profileKey(row.profile);
    const current = registrations.get(key) ?? {
      ...row.profile,
      interactionFamilies: new Set(),
      variants: new Set(),
      presentationModes: new Set(),
      contextModes: new Set(),
    };
    current.interactionFamilies.add(row.interaction.family);
    current.variants.add(row.interaction.variant);
    current.presentationModes.add(row.presentationMode);
    current.contextModes.add(row.contextRequirement.mode);
    registrations.set(key, current);
  });
  return [...registrations.values()].map((entry) => ({
    ...entry,
    interactionFamilies: [...entry.interactionFamilies],
    variants: [...entry.variants],
    presentationModes: [...entry.presentationModes],
    contextModes: [...entry.contextModes],
  }));
}

function exactKeys(value, keys, pathName, issues) {
  if (!isRecord(value)) {
    issue(issues, 'invalid-record', pathName, 'Expected object.');
    return false;
  }
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !(key in value));
  unknown.forEach((key) => issue(issues, 'unknown-field', `${pathName}.${key}`, 'Field is not allowed.'));
  missing.forEach((key) => issue(issues, 'missing-field', `${pathName}.${key}`, 'Field is required.'));
  return unknown.length === 0 && missing.length === 0;
}

function validateRegistryManifest(manifest, issues) {
  if (!isRecord(manifest)) {
    issue(issues, 'invalid-registry-manifest', '$registry', 'Canonical runtime registry manifest is required.');
    return [];
  }
  exactKeys(manifest, ['schemaVersion', 'kind', 'registrations'], '$registry', issues);
  if (manifest.schemaVersion !== 1) issue(issues, 'invalid-registry-version', '$registry.schemaVersion', 'Registry schemaVersion must be 1.');
  if (manifest.kind !== 'prd0062-activity-runtime-registration-manifest') issue(issues, 'invalid-registry-kind', '$registry.kind', 'Unexpected registry manifest kind.');
  if (!Array.isArray(manifest.registrations)) {
    issue(issues, 'invalid-registry-registrations', '$registry.registrations', 'registrations must be an array.');
    return [];
  }
  const seen = new Set();
  const seenRegistrations = [];
  manifest.registrations.forEach((registration, index) => {
    const entryPath = `$registry.registrations[${index}]`;
    if (!exactKeys(registration, ['profile', 'family', 'variant', 'presentationMode', 'responseCodec', 'rendererId', 'codecId'], entryPath, issues)) return;
    if (registration.profile !== null && !isRecord(registration.profile)) {
      issue(issues, 'invalid-registration-profile', `${entryPath}.profile`, 'profile must be null or one namespaced Task Profile.');
      return;
    }
    if (
      !text(registration.family)
      || !text(registration.variant)
      || !text(registration.presentationMode)
      || !text(registration.responseCodec)
    ) {
      issue(issues, 'invalid-registration', entryPath, 'Registration family, variant, presentationMode, and responseCodec are required.');
      return;
    }
    const key = manifestSelectorKeyFor(registration);
    if (
      seen.has(key)
      || seenRegistrations.some((prior) => manifestSelectorsOverlap(prior, registration))
    ) {
      issue(
        issues,
        'duplicate-registration',
        entryPath,
        'Registration selector overlaps an existing registration.',
      );
    }
    seen.add(key);
    seenRegistrations.push(registration);
    if (!text(registration.rendererId) || !text(registration.codecId)) issue(issues, 'invalid-registration', entryPath, 'rendererId and codecId are required.');
  });
  return manifest.registrations;
}

export async function validateCoverageMatrix(matrix, options = {}) {
  const { rootDir = process.cwd(), registryManifest = null, release = false } = options;
  const issues = [];
  if (!isRecord(matrix)) {
    issue(issues, 'invalid-record', '$', 'Expected object.');
    return { ok: false, issues, rows: [], taskProfileRegistry: [] };
  }
  const [activitySchema, taxonomy] = await Promise.all([
    readCanonicalActivitySchema(rootDir),
    readCanonicalTaxonomyEvidence(rootDir),
  ]);
  exactKeys(matrix, ['schemaVersion', 'matrixId', 'matrixVersion', 'canonicalSchema', 'registryManifest', 'rows'], '$', issues);
  if (matrix.schemaVersion !== 1 || matrix.matrixVersion !== 1) issue(issues, 'invalid-matrix-version', '$', 'Matrix schemaVersion and matrixVersion must both be 1.');
  if (matrix.matrixId !== 'prd0062-ielts-activity-coverage') issue(issues, 'invalid-matrix-id', '$.matrixId', 'Unexpected matrixId.');
  if (!Array.isArray(matrix.rows) || matrix.rows.length === 0) {
    issue(issues, 'missing-rows', '$.rows', 'Matrix needs researched task rows.');
    return { ok: false, issues, rows: [] };
  }
  exactKeys(matrix.canonicalSchema, ['activitySchemaVersion', 'source'], '$.canonicalSchema', issues);
  if (matrix.canonicalSchema?.source !== CANONICAL_ACTIVITY_SCHEMA_SOURCE) issue(issues, 'schema-source-mismatch', '$.canonicalSchema.source', 'Matrix must declare canonical Activity schema source exactly.');
  if (matrix.canonicalSchema?.activitySchemaVersion !== activitySchema.schemaVersion) issue(issues, 'schema-version-mismatch', '$.canonicalSchema.activitySchemaVersion', 'Matrix disagrees with declared Activity schema source.');
  if (matrix.registryManifest !== CANONICAL_RUNTIME_REGISTRY_MANIFEST) {
    issue(
      issues,
      'invalid-registry-path',
      '$.registryManifest',
      `registryManifest must be ${CANONICAL_RUNTIME_REGISTRY_MANIFEST}.`,
    );
  }
  const seen = new Set();
  const profileVariant = new Set();
  matrix.rows.forEach((row, index) => {
    const rowPath = `$.rows[${index}]`;
    if (!exactKeys(row, ['profile', 'interaction', 'stimulus', 'contextRequirement', 'presentationMode', 'responseCodec', 'scoringReview', 'accessibility', 'support', 'runtimeImplementationState', 'fixtureId', 'evidenceRefs'], rowPath, issues)) return;
    if (!isRecord(row.profile) || !text(row.profile.taxonomyId) || !text(row.profile.typeId) || !Number.isSafeInteger(row.profile.taxonomyVersion) || row.profile.taxonomyVersion < 1) issue(issues, 'invalid-profile', `${rowPath}.profile`, 'Profile must be namespaced and versioned.');
    if (!isRecord(row.interaction) || !activitySchema.families.includes(row.interaction.family)) issue(issues, 'unknown-family-or-variant', `${rowPath}.interaction`, 'Interaction family must be declared by Activity schema.');
    if (
      !text(row.interaction?.variant)
      || !CANONICAL_VARIANTS_BY_FAMILY[row.interaction?.family]?.includes(row.interaction.variant)
    ) issue(issues, 'unknown-variant', `${rowPath}.interaction.variant`, 'Interaction variant is not declared by the canonical family allowlist.');
    if (!activitySchema.presentationModes.includes(row.presentationMode)) issue(issues, 'unsupported-presentation-mode', `${rowPath}.presentationMode`, 'Presentation mode is not supported by declared Activity schema.');
    if (RESPONSE_CODECS[row.responseCodec] !== row.interaction?.family) issue(issues, 'unknown-codec', `${rowPath}.responseCodec`, 'Response codec must exist and match interaction family.');
    const validContext = isRecord(row.contextRequirement)
      && activitySchema.contextModes.includes(row.contextRequirement.mode)
      && Array.isArray(row.contextRequirement.acceptedKinds);
    if (!validContext) issue(issues, 'invalid-context', `${rowPath}.contextRequirement`, 'Context requirement is incomplete or unsupported.');
    if (
      row.presentationMode === 'source-assisted'
      && (
        !validContext
        || row.contextRequirement.mode !== 'required'
        || !row.contextRequirement.acceptedKinds.includes('book-pages')
      )
    ) issue(issues, 'source-assisted-context', `${rowPath}.contextRequirement`, 'source-assisted requires required book-pages context.');
    if (!isRecord(row.stimulus) || !Array.isArray(row.stimulus.needs) || !Array.isArray(row.stimulus.assetKinds)) issue(issues, 'missing-stimulus-data', `${rowPath}.stimulus`, 'Stimulus and asset needs are required.');
    if (!isRecord(row.scoringReview) || !['auto-where-possible', 'review-required'].includes(row.scoringReview.mode) || !text(row.scoringReview.review)) issue(issues, 'missing-scoring-data', `${rowPath}.scoringReview`, 'Scoring and review behavior are required.');
    if (!isRecord(row.accessibility) || !Array.isArray(row.accessibility.representations) || row.accessibility.representations.length === 0 || !row.accessibility.representations.every(text)) issue(issues, 'missing-accessibility-data', `${rowPath}.accessibility`, 'Accessibility representation is required.');
    if (!isRecord(row.support) || !SUPPORT_STATES.includes(row.support.state) || !text(row.support.rationale)) issue(issues, 'invalid-support-state', `${rowPath}.support`, 'Exact support state and rationale are required.');
    if (row.support?.state === 'approved-deferral' && !text(row.support.approvalReference)) issue(issues, 'missing-approval-reference', `${rowPath}.support.approvalReference`, 'Approved deferral requires approval reference.');
    if (row.support?.state === 'structurally-supported' && row.presentationMode !== 'structured') issue(issues, 'false-approximation', rowPath, 'Structural support requires structured presentation.');
    if (row.support?.state === 'source-assisted-supported' && row.presentationMode !== 'source-assisted') issue(issues, 'false-approximation', rowPath, 'Source-assisted support requires source-assisted presentation.');
    if (!RUNTIME_IMPLEMENTATION_STATES.includes(row.runtimeImplementationState)) issue(issues, 'invalid-runtime-state', `${rowPath}.runtimeImplementationState`, 'Runtime state must be planned or registered.');
    if (SUPPORTED_STATES.has(row.support?.state) && !text(row.fixtureId)) issue(issues, 'missing-schema-fixture', `${rowPath}.fixtureId`, 'Supported row requires a schema fixture.');
    if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.length === 0 || !row.evidenceRefs.every(text)) issue(issues, 'missing-evidence', `${rowPath}.evidenceRefs`, 'Evidence reference is required.');
    if (isRecord(row.profile) && isRecord(row.interaction)) {
      if (!isKnownProfile(row.profile, taxonomy)) issue(issues, 'unknown-profile', `${rowPath}.profile`, 'Profile is absent from current researched taxonomy source.');
      const profileVariantKey = `${profileKey(row.profile)}:${row.interaction.family}:${row.interaction.variant}`;
      if (profileVariant.has(profileVariantKey)) issue(issues, 'duplicate-profile-variant', rowPath, 'Profile/family/variant key is duplicated.');
      profileVariant.add(profileVariantKey);
      const key = keyFor(row);
      if (seen.has(key)) issue(issues, 'duplicate-row', rowPath, 'Matrix registration key is duplicated.');
      seen.add(key);
    }
  });
  const validRows = matrix.rows.filter(isRecord);
  const usableRows = validRows.filter(
    (row) => isRecord(row.profile)
      && isRecord(row.interaction)
      && isRecord(row.contextRequirement),
  );
  const actualReading = [...new Set(usableRows.filter((row) => row.profile.taxonomyId === 'ielts-reading').map((row) => row.profile.typeId))].sort();
  const actualListening = [...new Set(usableRows.filter((row) => row.profile.taxonomyId === 'ielts-listening').map((row) => row.profile.typeId))].sort();
  if (!sameSet(taxonomy.reading, actualReading)) issue(issues, 'unclassified-reading-type', '$.rows', 'Matrix must classify every current canonical Reading task type.');
  if (!sameSet(taxonomy.listening, actualListening)) issue(issues, 'unclassified-listening-type', '$.rows', 'Matrix must classify every current researched Listening task type.');
  const actualCoverageKeys = usableRows.map(coverageRowKey).sort();
  if (!sameSet(CANONICAL_COVERAGE_ROW_KEYS.toSorted(), actualCoverageKeys)) {
    issue(issues, 'incomplete-canonical-row-set', '$.rows', 'Matrix must retain the exact researched profile/family/variant coverage set.');
  }
  const registrations = validateRegistryManifest(registryManifest, issues);
  const validRegistrations = registrations.filter(isRecord);
  const supportedEntries = matrix.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      isRecord(row)
      && isRecord(row.profile)
      && isRecord(row.interaction)
      && isRecord(row.contextRequirement)
      && SUPPORTED_STATES.has(row.support?.state));
  const supportedRows = supportedEntries.map(({ row }) => row);
  const matrixKeys = new Set(supportedRows.map(keyFor));
  const exactRegistrationKeys = new Set(
    validRegistrations
      .filter((entry) => isRecord(entry.profile))
      .map((entry) => keyFor({
        profile: entry.profile,
        interaction: { family: entry.family, variant: entry.variant },
        presentationMode: entry.presentationMode,
        responseCodec: entry.responseCodec,
      })),
  );
  const genericRegistrationKeys = new Set(
    validRegistrations
      .filter((entry) => entry.profile === null)
      .map((entry) => genericKeyFor({
        interaction: { family: entry.family, variant: entry.variant },
        presentationMode: entry.presentationMode,
        responseCodec: entry.responseCodec,
      })),
  );
  validRegistrations.forEach((entry, index) => {
    const hasSupportedRow = entry.profile === null
      ? supportedRows.some((row) => genericKeyFor(row) === genericKeyFor({
        interaction: { family: entry.family, variant: entry.variant },
        presentationMode: entry.presentationMode,
        responseCodec: entry.responseCodec,
      }))
      : isRecord(entry.profile) && matrixKeys.has(keyFor({
        profile: entry.profile,
        interaction: { family: entry.family, variant: entry.variant },
        presentationMode: entry.presentationMode,
        responseCodec: entry.responseCodec,
      }));
    if (!hasSupportedRow) issue(issues, 'registration-without-supported-row', `$registry.registrations[${index}]`, 'Runtime registration has no matching supported matrix row.');
  });
  supportedEntries.forEach(({ row, index }) => {
    const registryKey = keyFor(row);
    const hasRegistration = exactRegistrationKeys.has(registryKey)
      || genericRegistrationKeys.has(genericKeyFor(row));
    if (row.runtimeImplementationState === 'registered' && !hasRegistration) issue(issues, 'registration-mismatch', `$.rows[${index}]`, 'Registered matrix row is absent from runtime manifest.');
    if (release && row.runtimeImplementationState !== 'registered') issue(issues, 'release-planned-row', `$.rows[${index}]`, 'Release mode requires supported row to be registered.');
    if (release && !hasRegistration) issue(issues, 'release-missing-registration', `$.rows[${index}]`, 'Release mode requires matching runtime registration.');
  });
  if (release && validRows.some((row) => row.support?.state === 'release-blocking-unsupported')) issue(issues, 'release-blocking-unsupported', '$.rows', 'Release mode cannot include release-blocking unsupported rows.');
  return {
    ok: issues.length === 0,
    issues,
    rows: validRows,
    taskProfileRegistry: makeTaskProfileRegistry(usableRows),
  };
}

export async function loadAndValidateCoverageMatrix(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const matrixPath = options.matrixPath ?? path.join(rootDir, 'documentation/architecture/data/prd0062-activity-coverage.matrix.json');
  const matrix = await loadJson(matrixPath);
  let registryManifest = options.registryManifest ?? null;
  const rootPath = path.resolve(rootDir);
  const canonicalRegistryPath = path.resolve(rootPath, CANONICAL_RUNTIME_REGISTRY_MANIFEST);
  const relativeRegistryPath = path.relative(rootPath, canonicalRegistryPath);
  const registryPath = options.registryPath
    ? path.resolve(options.registryPath)
    : canonicalRegistryPath;
  if (!registryManifest) {
    if (
      relativeRegistryPath.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeRegistryPath)
      || registryPath !== canonicalRegistryPath
    ) {
      const result = await validateCoverageMatrix(matrix, {
        ...options,
        rootDir,
        registryManifest: null,
      });
      result.issues.push({
        code: 'invalid-registry-path',
        path: '$.registryManifest',
        message: 'Only the canonical runtime registry manifest may be loaded.',
      });
      result.ok = false;
      return result;
    }
    try {
      registryManifest = await loadJson(registryPath);
    } catch (error) {
      const result = await validateCoverageMatrix(matrix, { ...options, rootDir, registryManifest: null });
      result.issues.push({
        code: 'registry-manifest-unreadable',
        path: '$.registryManifest',
        message: error instanceof Error ? error.message : String(error),
      });
      result.ok = false;
      return result;
    }
  }
  return validateCoverageMatrix(matrix, { ...options, rootDir, registryManifest });
}
