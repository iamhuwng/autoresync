import type {
  BookAssemblyManifestCandidate,
  BookAssemblyValidationError,
  BookSourceStrategy,
  BookSourceVersionAuthority,
  SourcePageReference,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';
import { validateBookAssemblyManifestCandidate } from './manifestCandidate.service';
import { validateSourceSetCandidate } from './sourceSet.service';
import { analyzeBookAssemblyReconciliation } from './reconciliation.service';

export type SourceStrategyMigrationErrorCode =
  | 'book-mode-required' | 'published-state' | 'stale-book-revision'
  | 'stale-source-set-revision' | 'stale-candidate-revision'
  | 'target-source-set-invalid' | 'candidate-manifest-invalid'
  | 'missing-remap' | 'malformed-remap' | 'duplicate-remap'
  | 'source-identity-mismatch' | 'ambiguous-remap' | 'duplicate-page'
  | 'out-of-range-page' | 'invalid-component-owner' | 'component-order-invalid'
  | 'incomplete-mapping' | 'reconciliation-blocked';

export interface SourceStrategyMigrationRemap {
  readonly pageGroupKey: string;
  readonly pages: readonly {
    readonly from: SourcePageReference;
    readonly to: SourcePageReference;
  }[];
}

export interface SourceStrategyMigrationInput {
  readonly bookId: string;
  readonly bookMode: 'pdf' | string;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
  readonly candidate: {
    readonly candidateId?: string;
    readonly revision: number;
    readonly bookRevision: number;
    readonly sourceSetRevision: number;
    readonly manifest: BookAssemblyManifestCandidate;
  };
  readonly target: {
    readonly sourceSetRevision: number;
    readonly sourceSet: SourceSetCandidate;
  };
  readonly remaps?: readonly SourceStrategyMigrationRemap[];
  /** Either flag blocks planning when a publication already exists. */
  readonly published?: boolean;
  readonly hasPublication?: boolean;
  readonly expectedBookRevision?: number;
  readonly expectedSourceSetRevision?: number;
  readonly expectedCandidateRevision?: number;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
}

export interface SourceStrategyMigrationError {
  readonly code: SourceStrategyMigrationErrorCode;
  readonly path: string;
  readonly message: string;
}

export interface SourceStrategyMigrationImpact {
  readonly fromStrategy: BookSourceStrategy;
  readonly toStrategy: BookSourceStrategy;
  readonly strategyChanged: boolean;
  readonly preservedHierarchyCount: number;
  readonly preservedActivityCount: number;
  readonly preservedPageGroupCount: number;
  readonly remappedPageGroupCount: number;
  readonly affectedPageGroupCount: number;
  readonly clearedComponentOwnership: boolean;
  readonly reorderedComponents: boolean;
}

export interface SourceStrategyMigrationPlan {
  readonly valid: boolean;
  readonly canApply: boolean;
  readonly errors: readonly SourceStrategyMigrationError[];
  readonly impact: SourceStrategyMigrationImpact;
  readonly targetSourceSet: SourceSetCandidate;
  readonly targetManifest: BookAssemblyManifestCandidate;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => deepFreeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};
const error = (code: SourceStrategyMigrationErrorCode, path: string, message: string): SourceStrategyMigrationError => ({ code, path, message });
const pageKey = (page: SourcePageReference): string => `${page.sourceKey}:${page.physicalPageNumber}`;
const samePage = (left: SourcePageReference, right: SourcePageReference): boolean => pageKey(left) === pageKey(right);
const validationError = (code: SourceStrategyMigrationErrorCode, entry: BookAssemblyValidationError): SourceStrategyMigrationError => error(code, entry.path, entry.message);

export const planSourceStrategyMigration = (input: SourceStrategyMigrationInput): SourceStrategyMigrationPlan => {
  const errors: SourceStrategyMigrationError[] = [];
  const sourceSet = clone(input.target.sourceSet);
  const sourceStrategy = input.sourceSet.sourceStrategy;
  const targetStrategy = sourceSet.sourceStrategy;
  const manifest = clone(input.candidate.manifest);
  const remaps = new Map<string, SourceStrategyMigrationRemap>();
  const remapList = input.remaps ?? [];

  if (input.bookMode !== 'pdf') errors.push(error('book-mode-required', '$.bookMode', 'Source-strategy migration requires unpublished Mode 2 PDF Book.'));
  if (input.published || input.hasPublication) errors.push(error('published-state', '$', 'Published Book cannot use unpublished source-strategy migration.'));
  if (input.expectedBookRevision !== undefined && input.bookRevision !== input.expectedBookRevision) errors.push(error('stale-book-revision', '$.bookRevision', 'Book revision changed; reload before migrating.'));
  if (input.candidate.bookRevision !== input.bookRevision) errors.push(error('stale-book-revision', '$.candidate.bookRevision', 'Candidate Book revision is stale.'));
  if (input.expectedSourceSetRevision !== undefined && input.sourceSetRevision !== input.expectedSourceSetRevision) errors.push(error('stale-source-set-revision', '$.sourceSetRevision', 'Source Set revision changed; reload before migrating.'));
  if (input.candidate.sourceSetRevision !== input.sourceSetRevision) errors.push(error('stale-source-set-revision', '$.candidate.sourceSetRevision', 'Candidate Source Set revision is stale.'));
  if (input.target.sourceSetRevision <= input.sourceSetRevision) errors.push(error('stale-source-set-revision', '$.target.sourceSetRevision', 'Target Source Set revision must be newer than current revision.'));
  if (input.expectedCandidateRevision !== undefined && input.candidate.revision !== input.expectedCandidateRevision) errors.push(error('stale-candidate-revision', '$.candidate.revision', 'Candidate revision changed; reload before migrating.'));

  validateSourceSetCandidate(sourceSet, { bookId: input.bookId, sourceVersionAuthority: input.sourceVersionAuthority }).errors.forEach((entry) => errors.push(validationError('target-source-set-invalid', entry)));
  validateBookAssemblyManifestCandidate(manifest, input.sourceVersionAuthority).errors.forEach((entry) => errors.push(validationError('candidate-manifest-invalid', entry)));
  if (stable(manifest.sourceSet) !== stable(input.sourceSet)) {
    errors.push(error('source-identity-mismatch', '$.candidate.manifest.sourceSet', 'Candidate Source Set must match the current trusted Source Set exactly.'));
  }

  remapList.forEach((remap, index) => {
    const path = `$.remaps[${index}]`;
    if (remaps.has(remap?.pageGroupKey)) errors.push(error('duplicate-remap', `${path}.pageGroupKey`, 'Page Group remap must be unique.'));
    else if (!remap || typeof remap.pageGroupKey !== 'string' || !Array.isArray(remap.pages) || remap.pages.length === 0) errors.push(error('malformed-remap', path, 'Remap requires Page Group key and non-empty explicit page pairs.'));
    else remaps.set(remap.pageGroupKey, remap);
  });

  const targetSources = new Map(sourceSet.sources.map((entry) => [entry.sourceKey, entry]));
  const sourcePages = (sourceKey: string): number | null => {
    const source = targetSources.get(sourceKey);
    return source ? input.sourceVersionAuthority.getSourceVersion(source.sourceVersionId)?.physicalPageCount ?? null : null;
  };
  const affected = new Set<string>();
  let remappedCount = 0;
  const migratedUnits = manifest.units.map((unit, unitIndex) => ({
    ...unit,
    pageGroups: unit.pageGroups.map((group, groupIndex) => {
      const path = `$.targetManifest.units[${unitIndex}].pageGroups[${groupIndex}]`;
      const remap = remaps.get(group.pageGroupKey);
      let sourceKey = group.sourceKey;
      let pages = [...group.pages];
      if (remap) {
        remappedCount += 1;
        affected.add(group.pageGroupKey);
        const seenFrom = new Set<string>();
        const expected = group.pages.map((page) => ({ sourceKey: group.sourceKey, physicalPageNumber: page }));
        if (remap.pages.length !== expected.length) errors.push(error('incomplete-mapping', `${path}.pages`, 'Remap must explicitly resolve every existing local page exactly once.'));
        remap.pages.forEach((pair, pairIndex) => {
          if (!pair?.from || !pair.to || typeof pair.from.sourceKey !== 'string' || typeof pair.to.sourceKey !== 'string' || !Number.isSafeInteger(pair.from.physicalPageNumber) || !Number.isSafeInteger(pair.to.physicalPageNumber)) {
            errors.push(error('malformed-remap', `${path}.remap.pages[${pairIndex}]`, 'Remap page identity requires sourceKey and local physicalPageNumber.'));
            return;
          }
          const fromKey = pageKey(pair.from);
          if (seenFrom.has(fromKey)) errors.push(error('ambiguous-remap', `${path}.remap.pages[${pairIndex}].from`, 'Each source-qualified page may be remapped once.'));
          seenFrom.add(fromKey);
          if (!expected.some((entry) => samePage(entry, pair.from))) errors.push(error('source-identity-mismatch', `${path}.remap.pages[${pairIndex}].from`, 'Remap source page does not match existing Page Group identity.'));
        });
        const ordered = remap.pages.map((pair) => pair.to);
        if (ordered.length > 0) { sourceKey = ordered[0].sourceKey; pages = ordered.map((page) => page.physicalPageNumber); }
        if (ordered.some((page) => page.sourceKey !== sourceKey)) errors.push(error('ambiguous-remap', `${path}.remap.pages`, 'One Page Group must resolve to one target source.'));
      } else if (!targetSources.has(sourceKey) || sourceStrategy !== targetStrategy) {
        errors.push(error('missing-remap', `${path}.remap`, 'Affected Page Group requires explicit source-qualified remap.'));
        affected.add(group.pageGroupKey);
      }
      const seenPages = new Set<number>();
      pages.forEach((page, pageIndex) => {
        if (seenPages.has(page)) errors.push(error('duplicate-page', `${path}.pages[${pageIndex}]`, 'Target local page must be unique within Page Group.'));
        seenPages.add(page);
        const count = sourcePages(sourceKey);
        if (!targetSources.has(sourceKey)) errors.push(error('source-identity-mismatch', `${path}.sourceKey`, 'Target sourceKey does not exist in target Source Set.'));
        else if (count !== null && (page < 1 || page > count)) errors.push(error('out-of-range-page', `${path}.pages[${pageIndex}]`, 'Target local page is outside trusted Source Version range.'));
      });
      return { ...group, sourceKey, pages, defaultPhysicalPageNumber: pages.includes(group.defaultPhysicalPageNumber ?? -1) ? group.defaultPhysicalPageNumber : pages[0] };
    }),
  }));

  if (targetStrategy === 'full_pdf' && sourceSet.sources.length !== 1) errors.push(error('component-order-invalid', '$.target.sourceSet.sources', 'full_pdf requires exactly one source.'));
  if (targetStrategy === 'component_pdfs') {
    const orders = sourceSet.sources.map((source) => source.sourceOrder);
    if (new Set(orders).size !== orders.length || orders.some((order) => !Number.isSafeInteger(order) || order < 1)) errors.push(error('component-order-invalid', '$.target.sourceSet.sources', 'Component sourceOrder values must be unique positive integers.'));
    sourceSet.sources.forEach((source, index) => {
      if (!('ownerNodeKey' in source) || !source.ownerNodeKey) errors.push(error('invalid-component-owner', `$.target.sourceSet.sources[${index}].ownerNodeKey`, 'Component source requires ownerNodeKey.'));
      else if (!manifest.nodes.some((node) => node.nodeKey === source.ownerNodeKey && ['section', 'chapter', 'unit', 'test'].includes(node.nodeType))) errors.push(error('invalid-component-owner', `$.target.sourceSet.sources[${index}].ownerNodeKey`, 'Component owner must be an existing structural node.'));
    });
  }

  const targetManifest: BookAssemblyManifestCandidate = { ...manifest, sourceSet, units: migratedUnits };
  validateBookAssemblyManifestCandidate(targetManifest, input.sourceVersionAuthority).errors.forEach((entry) => errors.push(validationError('target-source-set-invalid', entry)));
  const reconciliation = analyzeBookAssemblyReconciliation({ manifest: targetManifest, sourceVersionAuthority: input.sourceVersionAuthority });
  reconciliation.issues.filter((issue) => issue.severity === 'blocker').forEach((issue) => errors.push(error('reconciliation-blocked', issue.path, issue.message)));

  const hierarchyCount = manifest.nodes.length;
  const activityCount = manifest.units.reduce((sum, unit) => sum + unit.activitySlots.length, 0);
  const groupCount = manifest.units.reduce((sum, unit) => sum + unit.pageGroups.length, 0);
  const impact: SourceStrategyMigrationImpact = {
    fromStrategy: sourceStrategy, toStrategy: targetStrategy, strategyChanged: sourceStrategy !== targetStrategy,
    preservedHierarchyCount: hierarchyCount, preservedActivityCount: activityCount,
    preservedPageGroupCount: groupCount - affected.size, remappedPageGroupCount: remappedCount,
    affectedPageGroupCount: affected.size, clearedComponentOwnership: sourceStrategy === 'component_pdfs' && targetStrategy === 'full_pdf',
    reorderedComponents: targetStrategy === 'component_pdfs' && sourceSet.sources.some((source, index) => source.sourceOrder !== input.sourceSet.sources[index]?.sourceOrder),
  };
  const uniqueErrors = Array.from(new Map(
    errors.map((entry) => [`${entry.code}|${entry.path}|${entry.message}`, entry] as const),
  ).values()).sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  const valid = uniqueErrors.length === 0;
  return deepFreeze({ valid, canApply: valid, errors: uniqueErrors, impact, targetSourceSet: sourceSet, targetManifest });
};

export const createSourceStrategyMigrationPlan = planSourceStrategyMigration;
