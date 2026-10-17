import type { SourcePageReference } from '../../types/bookAssembly.types';
import {
  REPLACEMENT_SOURCE_DELTA_MAX_MAPPINGS,
  REPLACEMENT_SOURCE_DELTA_MAX_PAGE_GROUPS_PER_SOURCE,
  REPLACEMENT_SOURCE_DELTA_SCHEMA_VERSION,
  type ReplacementPageGroupDescriptor,
  type ReplacementPageMapping,
  type ReplacementSourceAssistedScope,
  type ReplacementSourceDeltaError,
  type ReplacementSourceDescriptor,
  type ReplacementSourceSetDelta,
  type ReplacementSourceSetDeltaInput,
  type ReplacementSourceSetDeltaResult,
  type ReplacementTrustedSourceSet,
} from './replacementSourceSetDelta.types';

export type { ReplacementSourceSetDeltaInput } from './replacementSourceSetDelta.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const LABEL = /^[^\u0000-\u001f\u007f]{1,160}$/u;
const HASH = /^[a-f0-9]{64}$/u;

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => deepFreeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const error = (
  code: ReplacementSourceDeltaError['code'],
  path: string,
  message: string,
): ReplacementSourceDeltaError => ({ code, path, message });

const sourcePageKey = (page: SourcePageReference): string =>
  `${page.sourceKey}:${page.physicalPageNumber}`;

const isSafePage = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validatePageGroup = (
  group: ReplacementPageGroupDescriptor,
  source: ReplacementSourceDescriptor,
  path: string,
  errors: ReplacementSourceDeltaError[],
): void => {
  if (!ID.test(group.pageGroupKey) || !LABEL.test(group.label)) {
    errors.push(error('invalid-page-group', path, 'Page Group key and label must be safe bounded strings.'));
  }
  if (group.sourceKey !== source.sourceKey) {
    errors.push(error('source-identity-mismatch', `${path}.sourceKey`, 'Page Group must name its owning source.'));
  }
  if (group.ownerNodeKey !== undefined && !ID.test(group.ownerNodeKey)) {
    errors.push(error('invalid-owner', `${path}.ownerNodeKey`, 'Page Group owner must be a safe bounded key.'));
  }
  if ((group.mode !== 'activity' && group.mode !== 'reference_only')
    || !Array.isArray(group.pages)
    || group.pages.length === 0) {
    errors.push(error('invalid-page-group', path, 'Page Group mode and pages are required.'));
    return;
  }
  const seen = new Set<number>();
  group.pages.forEach((page, index) => {
    if (!isSafePage(page) || page > source.physicalPageCount) {
      errors.push(error('out-of-range-page', `${path}.pages[${index}]`, 'Page is outside the trusted Source Version bounds.'));
    }
    if (seen.has(page)) errors.push(error('duplicate-page', `${path}.pages[${index}]`, 'Page Group pages must be unique.'));
    seen.add(page);
    if (index > 0 && page <= group.pages[index - 1]!) {
      errors.push(error('invalid-order', `${path}.pages`, 'Page Group pages must be strictly ascending.'));
    }
  });
};

const validateTrustedSourceSet = (
  value: ReplacementTrustedSourceSet,
  path: string,
  errors: ReplacementSourceDeltaError[],
): Map<string, ReplacementSourceDescriptor> => {
  const byKey = new Map<string, ReplacementSourceDescriptor>();
  if (!isRecord(value) || !isRecord(value.sourceSet) || !Array.isArray(value.sources)) {
    errors.push(error('invalid-record', path, 'Trusted Source Set must contain sourceSet and descriptors.'));
    return byKey;
  }
  const sourceSet = value.sourceSet;
  if (!Array.isArray(sourceSet.sources)) {
    errors.push(error('invalid-record', `${path}.sourceSet.sources`, 'Trusted Source Set sources must be an array.'));
    return byKey;
  }
  if (sourceSet.sourceStrategy !== 'full_pdf' && sourceSet.sourceStrategy !== 'component_pdfs') {
    errors.push(error('invalid-record', `${path}.sourceSet.sourceStrategy`, 'Unsupported Source Set strategy.'));
  }
  if (sourceSet.sourceStrategy === 'full_pdf' && sourceSet.sources.length !== 1) {
    errors.push(error('invalid-order', `${path}.sourceSet.sources`, 'Full PDF Source Set must contain exactly one source.'));
  }
  if (sourceSet.sourceStrategy === 'component_pdfs' && sourceSet.sources.length < 1) {
    errors.push(error('invalid-order', `${path}.sourceSet.sources`, 'Component Source Set must contain at least one source.'));
  }
  if (value.sources.length !== sourceSet.sources.length) {
    errors.push(error('source-identity-mismatch', `${path}.sources`, 'Every trusted Source Set source needs exactly one descriptor.'));
  }
  const sourceKeys = new Set<string>();
  sourceSet.sources.forEach((source, index) => {
    const sourcePath = `${path}.sourceSet.sources[${index}]`;
    const descriptor = value.sources[index];
    if (!descriptor) return;
    if (source.sourceOrder !== index + 1 || descriptor.sourceOrder !== source.sourceOrder) {
      errors.push(error('invalid-order', `${sourcePath}.sourceOrder`, 'Source order must be contiguous and match the descriptor.'));
    }
    if (!ID.test(source.sourceKey) || sourceKeys.has(source.sourceKey)) {
      errors.push(error(sourceKeys.has(source.sourceKey) ? 'duplicate-key' : 'invalid-id', `${sourcePath}.sourceKey`, 'Source keys must be unique safe identifiers.'));
    }
    sourceKeys.add(source.sourceKey);
    if (descriptor.sourceKey !== source.sourceKey || descriptor.sourceVersionId !== source.sourceVersionId) {
      errors.push(error('source-identity-mismatch', `${path}.sources[${index}]`, 'Descriptor identity must match the trusted Source Set.'));
    }
    if (!ID.test(descriptor.sourceVersionId) || !LABEL.test(descriptor.label)) {
      errors.push(error('invalid-label', `${path}.sources[${index}]`, 'Source Version identity and label must be safe bounded strings.'));
    }
    if (sourceSet.sourceStrategy === 'full_pdf' && (source.ownerNodeKey !== undefined || descriptor.ownerNodeKey !== undefined)) {
      errors.push(error('invalid-owner', `${sourcePath}.ownerNodeKey`, 'Full PDF sources cannot have a hierarchy owner.'));
    }
    if (sourceSet.sourceStrategy === 'component_pdfs'
      && (!source.ownerNodeKey || source.ownerNodeKey !== descriptor.ownerNodeKey || !ID.test(source.ownerNodeKey))) {
      errors.push(error('invalid-owner', `${sourcePath}.ownerNodeKey`, 'Component sources require one matching hierarchy owner.'));
    }
    if (![0, 90, 180, 270].includes(descriptor.rotation)) {
      errors.push(error('invalid-rotation', `${path}.sources[${index}].rotation`, 'Rotation must be 0, 90, 180, or 270 degrees.'));
    }
    if (!Number.isSafeInteger(descriptor.physicalPageCount) || descriptor.physicalPageCount < 1) {
      errors.push(error('invalid-page-count', `${path}.sources[${index}].physicalPageCount`, 'Physical page count must be positive.'));
    }
    if (!Number.isSafeInteger(descriptor.bounds.width) || descriptor.bounds.width <= 0
      || !Number.isSafeInteger(descriptor.bounds.height) || descriptor.bounds.height <= 0) {
      errors.push(error('invalid-bounds', `${path}.sources[${index}].bounds`, 'Source bounds must be positive safe integers.'));
    }
    if (descriptor.pageGroups.length > REPLACEMENT_SOURCE_DELTA_MAX_PAGE_GROUPS_PER_SOURCE) {
      errors.push(error('too-large', `${path}.sources[${index}].pageGroups`, 'Page Group count exceeds the planner bound.'));
    }
    const groupKeys = new Set<string>();
    descriptor.pageGroups.forEach((group, groupIndex) => {
      if (groupKeys.has(group.pageGroupKey)) errors.push(error('duplicate-key', `${path}.sources[${index}].pageGroups[${groupIndex}]`, 'Page Group keys must be unique per Source Version.'));
      groupKeys.add(group.pageGroupKey);
      validatePageGroup(group, descriptor, `${path}.sources[${index}].pageGroups[${groupIndex}]`, errors);
    });
    byKey.set(source.sourceKey, descriptor);
  });
  return byKey;
};

const validatePageReference = (
  page: SourcePageReference | null,
  sourceMap: Map<string, ReplacementSourceDescriptor>,
  path: string,
  errors: ReplacementSourceDeltaError[],
): void => {
  if (page === null) return;
  if (!isRecord(page) || !ID.test(page.sourceKey) || !isSafePage(page.physicalPageNumber)) {
    errors.push(error('invalid-mapping', path, 'Page reference must contain a safe source key and one-based page.'));
    return;
  }
  const source = sourceMap.get(page.sourceKey);
  if (!source) {
    errors.push(error('missing-source', `${path}.sourceKey`, 'Mapping references an unknown Source Set key.'));
    return;
  }
  if (page.physicalPageNumber > source.physicalPageCount) {
    errors.push(error('out-of-range-page', `${path}.physicalPageNumber`, 'Mapping page is outside the trusted Source Version bounds.'));
  }
};

const validateScope = (
  scope: ReplacementSourceAssistedScope,
  sourceMap: Map<string, ReplacementSourceDescriptor>,
  path: string,
  errors: ReplacementSourceDeltaError[],
  seen: Set<string>,
): void => {
  if (!ID.test(scope.scopeKey) || seen.has(scope.scopeKey)) {
    errors.push(error(seen.has(scope.scopeKey) ? 'duplicate-key' : 'invalid-scope', path, 'Affected scope keys must be unique safe identifiers.'));
  }
  seen.add(scope.scopeKey);
  const source = sourceMap.get(scope.sourceKey);
  if (!source) errors.push(error('missing-source', `${path}.sourceKey`, 'Affected scope references an unknown source.'));
  if (scope.pageGroupKey !== undefined
    && !source?.pageGroups.some((group) => group.pageGroupKey === scope.pageGroupKey)) {
    errors.push(error('invalid-scope', `${path}.pageGroupKey`, 'Affected scope references an unknown Page Group.'));
  }
  if (!Number.isSafeInteger(scope.affectedPageCount) || scope.affectedPageCount < 1) {
    errors.push(error('invalid-scope', `${path}.affectedPageCount`, 'Affected page count must be positive.'));
  }
};

export const planReplacementSourceSetDelta = async (
  input: ReplacementSourceSetDeltaInput,
): Promise<ReplacementSourceSetDeltaResult> => {
  const errors: ReplacementSourceDeltaError[] = [];
  if (!isRecord(input) || (input.schemaVersion !== undefined && input.schemaVersion !== REPLACEMENT_SOURCE_DELTA_SCHEMA_VERSION)) {
    errors.push(error('invalid-record', '$', 'Replacement Source-Set delta has an unsupported schema.'));
    return { valid: false, errors: Object.freeze(errors), delta: null };
  }
  const oldMap = validateTrustedSourceSet(input.old, '$.old', errors);
  const nextMap = validateTrustedSourceSet(input.next, '$.next', errors);
  if (!Array.isArray(input.mappings) || input.mappings.length > REPLACEMENT_SOURCE_DELTA_MAX_MAPPINGS) {
    errors.push(error('too-large', '$.mappings', 'Mapping count exceeds the planner bound.'));
  }
  const mappings = Array.isArray(input.mappings) ? input.mappings : [];
  const mappingIds = new Set<string>();
  const pairKeys = new Set<string>();
  const oldCoverage = new Set<string>();
  const nextCoverage = new Set<string>();
  mappings.forEach((mapping: ReplacementPageMapping, index) => {
    const path = `$.mappings[${index}]`;
    if (!isRecord(mapping) || !ID.test(mapping.mappingId)) {
      errors.push(error('invalid-mapping', path, 'Mapping identity is required.'));
      return;
    }
    if (mappingIds.has(mapping.mappingId)) errors.push(error('duplicate-mapping', `${path}.mappingId`, 'Mapping identities must be unique.'));
    mappingIds.add(mapping.mappingId);
    validatePageReference(mapping.from, oldMap, `${path}.from`, errors);
    validatePageReference(mapping.to, nextMap, `${path}.to`, errors);
    if (mapping.from === null && mapping.to === null) {
      errors.push(error('invalid-mapping', path, 'Mapping must retain, add, remove, or reassign a page.'));
    }
    const expectedKind = mapping.from === null
      ? 'added'
      : mapping.to === null
        ? 'removed'
        : mapping.from.sourceKey === mapping.to.sourceKey
          && input.old.sourceSet.sources.find((source) => source.sourceKey === mapping.from?.sourceKey)?.sourceVersionId
            === input.next.sourceSet.sources.find((source) => source.sourceKey === mapping.to?.sourceKey)?.sourceVersionId
          && mapping.from.physicalPageNumber === mapping.to.physicalPageNumber
          ? 'retained'
          : 'reassigned';
    if (mapping.kind !== expectedKind) errors.push(error('invalid-mapping', `${path}.kind`, `Mapping kind must be ${expectedKind}.`));
    const pair = `${mapping.from ? sourcePageKey(mapping.from) : '-'}>${mapping.to ? sourcePageKey(mapping.to) : '-'}`;
    if (pairKeys.has(pair)) errors.push(error('duplicate-mapping', path, 'The same page pair may be mapped only once.'));
    pairKeys.add(pair);
    if (mapping.from) {
      const key = sourcePageKey(mapping.from);
      if (oldCoverage.has(key)) errors.push(error('duplicate-mapping', `${path}.from`, 'Each old page may be mapped only once.'));
      oldCoverage.add(key);
    }
    if (mapping.to) {
      const key = sourcePageKey(mapping.to);
      if (nextCoverage.has(key)) errors.push(error('duplicate-mapping', `${path}.to`, 'Each replacement page may be mapped only once.'));
      nextCoverage.add(key);
    }
    if (!Array.isArray(mapping.sourceAssistedScopes)) {
      errors.push(error('invalid-scope', `${path}.sourceAssistedScopes`, 'Affected scopes must be an array.'));
    } else {
      const scopes = new Set<string>();
      mapping.sourceAssistedScopes.forEach((scope, scopeIndex) => {
        validateScope(scope, oldMap.has(scope.sourceKey) ? oldMap : nextMap, `${path}.sourceAssistedScopes[${scopeIndex}]`, errors, scopes);
      });
    }
  });
  const requireCoverage = (map: Map<string, ReplacementSourceDescriptor>, coverage: Set<string>, path: string) => {
    map.forEach((source) => {
      for (let page = 1; page <= source.physicalPageCount; page += 1) {
        if (!coverage.has(`${source.sourceKey}:${page}`)) {
          errors.push(error('incomplete-mapping', path, `Page ${source.sourceKey}:${page} has no explicit mapping.`));
        }
      }
    });
  };
  requireCoverage(oldMap, oldCoverage, '$.mappings.from');
  requireCoverage(nextMap, nextCoverage, '$.mappings.to');
  if (errors.length > 0) return { valid: false, errors: Object.freeze(errors), delta: null };
  const unsigned = {
    schemaVersion: REPLACEMENT_SOURCE_DELTA_SCHEMA_VERSION,
    old: clone(input.old),
    next: clone(input.next),
    mappings: clone(mappings),
  } as const;
  const fingerprint = await sha256Hex(stable(unsigned));
  if (!HASH.test(fingerprint)) throw new Error('replacement_source_delta_fingerprint_failed');
  const delta = deepFreeze({ ...unsigned, fingerprint });
  return { valid: true, errors: Object.freeze([]), delta };
};

export const replacementSourceSetDeltaFingerprint = async (
  input: ReplacementSourceSetDeltaInput,
): Promise<string> => {
  const result = await planReplacementSourceSetDelta(input);
  if (!result.delta) throw new Error(result.errors[0]?.message ?? 'invalid_replacement_source_set_delta');
  return result.delta.fingerprint;
};
