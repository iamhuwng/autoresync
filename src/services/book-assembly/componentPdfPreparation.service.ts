import {
  COMPONENT_PDF_ROTATIONS,
  type ComponentPdfPreparationArtifact,
  type ComponentPdfPreparationComponent,
  type ComponentPdfPreparationInput,
  type ComponentPdfPreparationMapping,
  type ComponentPdfPreparationPageGroup,
  type ComponentPdfPreparationComponentInput,
  type SourceQualifiedPageIdentity,
  type ComponentPdfSourceCandidate,
} from '../../types/bookAssembly.types';
import { ACTIVITY_PRESENTATION_MODES } from '../../types/bookActivity.types';
import { normalizeBookSourceDisplayFilename } from '../book-source-delivery/sourceDisplayFilename.service';
import { validateSourceSetCandidate } from './sourceSet.service';
import { resolveSourceQualifiedPage } from './sourcePageAuthority.service';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const PRINTED_LABEL_MAX_LENGTH = 255;
const PROVENANCE_MAX_LENGTH = 256;

export class ComponentPdfPreparationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ComponentPdfPreparationError';
  }
}

const fail: (code: string) => never = (code) => {
  throw new ComponentPdfPreparationError(code);
};

const freezeArtifact = (artifact: ComponentPdfPreparationArtifact): ComponentPdfPreparationArtifact => {
  const components = artifact.components.map((component) => Object.freeze({ ...component }));
  const pageGroups = artifact.pageGroups.map((group) => Object.freeze({
    ...group,
    pages: Object.freeze([...group.pages]),
    activityKeys: Object.freeze([...group.activityKeys]),
  }));
  const mappings = artifact.mappings.map((mapping) => Object.freeze({
    ...mapping,
    pages: Object.freeze(mapping.pages.map((page) => Object.freeze({ ...page }))),
  }));
  const citations = artifact.citations.map((citation) => Object.freeze({ ...citation }));
  return Object.freeze({
    ...artifact,
    components: Object.freeze(components),
    pageGroups: Object.freeze(pageGroups),
    mappings: Object.freeze(mappings),
    citations: Object.freeze(citations),
    provenance: Object.freeze([...artifact.provenance]),
  });
};

const normalizePrintedLabel = (value: unknown): string => {
  if (typeof value !== 'string') fail('invalid-printed-label');
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0
    || normalized.length > PRINTED_LABEL_MAX_LENGTH
    || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    fail('invalid-printed-label');
  }
  return normalized;
};

const normalizeProvenance = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0) fail('missing-provenance');
  const provenance = value.map((entry) => {
    if (typeof entry !== 'string') fail('invalid-provenance');
    const normalized = entry.normalize('NFKC').trim();
    if (normalized.length === 0
      || normalized.length > PROVENANCE_MAX_LENGTH
      || /[\u0000-\u001F\u007F]/u.test(normalized)) {
      fail('invalid-provenance');
    }
    return normalized;
  });
  return Object.freeze(provenance);
};

const componentInputByKey = (
  value: readonly ComponentPdfPreparationComponentInput[],
): Map<string, ComponentPdfPreparationComponentInput> => {
  const result = new Map<string, ComponentPdfPreparationComponentInput>();
  for (const component of value) {
    if (!component || typeof component.sourceKey !== 'string' || !ID.test(component.sourceKey)) {
      fail('invalid-component-source-key');
    }
    if (result.has(component.sourceKey)) fail('duplicate-component-source-key');
    result.set(component.sourceKey, component);
  }
  return result;
};

const validateComponentMetadata = (
  component: ComponentPdfPreparationComponentInput,
): ComponentPdfPreparationComponentInput => {
  let displayFilename: string;
  try {
    displayFilename = normalizeBookSourceDisplayFilename(component.displayFilename);
  } catch {
    fail('invalid-display-filename');
  }
  const printedLabel = normalizePrintedLabel(component.printedLabel);
  if (!COMPONENT_PDF_ROTATIONS.includes(component.rotation)
    || !ACTIVITY_PRESENTATION_MODES.includes(component.presentationMode)) {
    fail('invalid-presentation-or-rotation');
  }
  return { ...component, displayFilename, printedLabel };
};

const validatePageGroups = (
  input: ComponentPdfPreparationInput,
  components: ReadonlyMap<string, ComponentPdfPreparationComponentInput>,
): {
  readonly pageGroups: readonly ComponentPdfPreparationPageGroup[];
  readonly mappings: readonly ComponentPdfPreparationMapping[];
  readonly citations: readonly ComponentPdfPreparationArtifact['citations'][number][];
} => {
  if (!Array.isArray(input.pageGroups)) fail('invalid-page-groups');
  const sourceSet = input.sourceSet;
  const sourceByKey = new Map(sourceSet.sources.map((source): [string, ComponentPdfSourceCandidate] => [source.sourceKey, source]));
  const groupKeys = new Set<string>();
  const prepared = input.pageGroups.map((group, index) => {
    const path = `pageGroups[${index}]`;
    if (!group || typeof group.pageGroupKey !== 'string' || !ID.test(group.pageGroupKey)) {
      fail(`${path}:invalid-page-group-key`);
    }
    if (groupKeys.has(group.pageGroupKey)) fail(`${path}:duplicate-page-group-key`);
    groupKeys.add(group.pageGroupKey);
    const source = sourceByKey.get(group.sourceKey);
    if (!source) fail(`${path}:unknown-source-key`);
    if (!Array.isArray(group.pages) || group.pages.length === 0) fail(`${path}:invalid-pages`);
    const pages = group.pages.map((page, pageIndex) => {
      if (!Number.isSafeInteger(page) || page < 1) fail(`${path}.pages[${pageIndex}]:invalid-page`);
      if (group.pages.indexOf(page) !== pageIndex) fail(`${path}.pages[${pageIndex}]:duplicate-page`);
      try {
        return resolveSourceQualifiedPage(
          sourceSet,
          { bookId: input.bookId, sourceVersionAuthority: input.sourceVersionAuthority },
          { sourceKey: group.sourceKey, physicalPageNumber: page },
          `${path}.pages[${pageIndex}]`,
        );
      } catch (error) {
        if (error instanceof Error) throw error;
        fail(`${path}.pages[${pageIndex}]:unresolved-page`);
      }
    });
    if (group.mode !== 'activity' && group.mode !== 'reference_only') {
      fail(`${path}:invalid-mode`);
    }
    if (!Array.isArray(group.activityKeys)) fail(`${path}:invalid-activity-keys`);
    const activityKeys = [...group.activityKeys];
    if (activityKeys.some((key) => typeof key !== 'string' || !ID.test(key))) {
      fail(`${path}:invalid-activity-key`);
    }
    if (new Set(activityKeys).size !== activityKeys.length) fail(`${path}:duplicate-activity-key`);
    if (group.mode === 'activity' && activityKeys.length === 0) fail(`${path}:missing-activity-key`);
    if (group.mode === 'reference_only' && activityKeys.length > 0) fail(`${path}:reference-group-activity`);
    if (group.defaultPhysicalPageNumber !== undefined
      && (!Number.isSafeInteger(group.defaultPhysicalPageNumber)
        || !group.pages.includes(group.defaultPhysicalPageNumber))) {
      fail(`${path}:invalid-default-page`);
    }
    const pageGroup: ComponentPdfPreparationPageGroup = {
      pageGroupKey: group.pageGroupKey,
      sourceKey: group.sourceKey,
      sourceVersionId: source.sourceVersionId,
      pages: [...group.pages],
      activityKeys,
      mode: group.mode,
      ...(group.defaultPhysicalPageNumber === undefined
        ? {}
        : { defaultPhysicalPageNumber: group.defaultPhysicalPageNumber }),
    };
    const mapping: ComponentPdfPreparationMapping = {
      pageGroupKey: group.pageGroupKey,
      sourceKey: group.sourceKey,
      sourceVersionId: source.sourceVersionId,
      pages: pages as readonly SourceQualifiedPageIdentity[],
    };
    const printedLabel = components.get(group.sourceKey)?.printedLabel;
    if (typeof printedLabel !== 'string') fail(`${path}:missing-component-label`);
    const citations = pages.map((page) => ({
      sourceKey: page.sourceKey,
      sourceVersionId: page.sourceVersionId,
      physicalPageNumber: page.physicalPageNumber,
      printedLabel: normalizePrintedLabel(printedLabel),
    }));
    return { pageGroup, mapping, citations };
  });
  const pageGroups = prepared
    .slice()
    .sort((left, right) => left.pageGroup.pageGroupKey.localeCompare(right.pageGroup.pageGroupKey))
    .map((entry) => entry.pageGroup);
  const mappings = prepared
    .slice()
    .sort((left, right) => left.mapping.pageGroupKey.localeCompare(right.mapping.pageGroupKey))
    .map((entry) => entry.mapping);
  const citations = prepared
    .slice()
    .sort((left, right) => left.mapping.pageGroupKey.localeCompare(right.mapping.pageGroupKey))
    .flatMap((entry) => entry.citations);
  return { pageGroups, mappings, citations };
};

export const prepareComponentPdfArtifact = (
  input: ComponentPdfPreparationInput,
): ComponentPdfPreparationArtifact => {
  if (!input || typeof input.bookId !== 'string' || !ID.test(input.bookId)
    || typeof input.ownerId !== 'string' || !ID.test(input.ownerId)) {
    fail('invalid-book-or-owner');
  }
  if (input.sourceSet?.sourceStrategy !== 'component_pdfs') fail('invalid-source-strategy');
  const sourceValidation = validateSourceSetCandidate(input.sourceSet, {
    bookId: input.bookId,
    sourceVersionAuthority: input.sourceVersionAuthority,
  });
  if (!sourceValidation.valid) fail(`invalid-source-set:${sourceValidation.errors[0]?.code ?? 'invalid'}`);
  if (!Array.isArray(input.components)
    || input.components.length !== input.sourceSet.sources.length) {
    fail('component-cardinality-mismatch');
  }
  const inputComponents = componentInputByKey(input.components);
  const preparedComponents = input.sourceSet.sources.map((source) => {
    const component = inputComponents.get(source.sourceKey);
    if (!component || component.sourceKey !== source.sourceKey) fail('component-identity-mismatch');
    const metadata = validateComponentMetadata(component);
    return {
      sourceKey: metadata.sourceKey,
      sourceVersionId: source.sourceVersionId,
      sourceOrder: source.sourceOrder,
      ownerNodeKey: source.ownerNodeKey,
      displayFilename: metadata.displayFilename,
      rotation: metadata.rotation,
      presentationMode: metadata.presentationMode,
    };
  }) satisfies readonly ComponentPdfPreparationComponent[];
  const pageGroups = validatePageGroups(input, inputComponents);
  return freezeArtifact({
    schemaVersion: 1,
    kind: 'component-pdf-preparation',
    bookId: input.bookId,
    ownerId: input.ownerId,
    sourceStrategy: 'component_pdfs',
    components: preparedComponents,
    pageGroups: pageGroups.pageGroups,
    mappings: pageGroups.mappings,
    citations: pageGroups.citations,
    provenance: normalizeProvenance(input.provenance),
  });
};
