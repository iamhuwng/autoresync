import { STUDENT_DOCUMENT_MAX_PDF_BYTES } from '../../types/bookSource.types';
import type { BookPageGroupCandidate } from '../../types/bookAssembly.types';
import type { BookRuntimePageGroupContext } from '../book-delivery/bookDelivery.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const HASH = /^[a-f0-9]{64}$/iu;
const MAX_COMPONENTS = 20;

export interface ComponentStudentDocumentComponent {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey: string;
  readonly localPageCount: number;
  readonly combinedStartPage: number;
  readonly combinedEndPage: number;
}

export interface ComponentStudentDocument {
  readonly schemaVersion: 1;
  readonly logicalSourceKey: 'student-document';
  readonly sourceVersionId: string;
  readonly descriptorRevision: number;
  readonly descriptorCasOwner: 'assembly-publication';
  readonly sha256Hex: string;
  readonly byteSize: number;
  readonly physicalPageCount: number;
  readonly studentSafeStatus: 'ready';
  readonly compositionFingerprint: string;
  readonly components: readonly ComponentStudentDocumentComponent[];
}

export class ComponentStudentDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentStudentDocumentError';
  }
}

const assertId: (value: unknown, field: string) => asserts value is string = (value, field) => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ComponentStudentDocumentError(`invalid_${field}`);
  }
};

const assertPositiveInteger: (value: unknown, field: string) => asserts value is number = (value, field) => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ComponentStudentDocumentError(`invalid_${field}`);
  }
};

const assertRevision: (value: unknown) => asserts value is number = (value) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ComponentStudentDocumentError('invalid_descriptorRevision');
  }
};

export const createComponentStudentDocument = (input: {
  readonly sourceVersionId: string;
  readonly descriptorRevision: number;
  readonly sha256Hex: string;
  readonly byteSize: number;
  readonly physicalPageCount: number;
  readonly compositionFingerprint: string;
  readonly components: readonly ComponentStudentDocumentComponent[];
}): ComponentStudentDocument => {
  assertId(input.sourceVersionId, 'sourceVersionId');
  assertRevision(input.descriptorRevision);
  if (typeof input.sha256Hex !== 'string' || !HASH.test(input.sha256Hex)) {
    throw new ComponentStudentDocumentError('invalid_sha256Hex');
  }
  if (!Number.isSafeInteger(input.byteSize)
    || input.byteSize < 1
    || input.byteSize > STUDENT_DOCUMENT_MAX_PDF_BYTES) {
    throw new ComponentStudentDocumentError('invalid_byteSize');
  }
  assertPositiveInteger(input.physicalPageCount, 'physicalPageCount');
  assertId(input.compositionFingerprint, 'compositionFingerprint');
  if (input.components.length < 2 || input.components.length > MAX_COMPONENTS) {
    throw new ComponentStudentDocumentError('invalid_components');
  }

  const sourceKeys = new Set<string>();
  const sourceVersions = new Set<string>();
  let nextPage = 1;
  const components = input.components.map((component, index) => {
    assertId(component.sourceKey, 'sourceKey');
    assertId(component.sourceVersionId, 'sourceVersionId');
    assertId(component.ownerNodeKey, 'ownerNodeKey');
    assertPositiveInteger(component.localPageCount, 'localPageCount');
    assertPositiveInteger(component.combinedStartPage, 'combinedStartPage');
    assertPositiveInteger(component.combinedEndPage, 'combinedEndPage');
    if (component.sourceOrder !== index + 1
      || sourceKeys.has(component.sourceKey)
      || sourceVersions.has(component.sourceVersionId)
      || component.combinedStartPage !== nextPage
      || component.combinedEndPage - component.combinedStartPage + 1 !== component.localPageCount) {
      throw new ComponentStudentDocumentError('invalid_component_identity');
    }
    sourceKeys.add(component.sourceKey);
    sourceVersions.add(component.sourceVersionId);
    nextPage = component.combinedEndPage + 1;
    return Object.freeze({ ...component });
  });
  if (nextPage - 1 !== input.physicalPageCount) {
    throw new ComponentStudentDocumentError('component_page_count_mismatch');
  }
  return Object.freeze({
    schemaVersion: 1,
    logicalSourceKey: 'student-document',
    sourceVersionId: input.sourceVersionId,
    descriptorRevision: input.descriptorRevision,
    descriptorCasOwner: 'assembly-publication',
    sha256Hex: input.sha256Hex.toLowerCase(),
    byteSize: input.byteSize,
    physicalPageCount: input.physicalPageCount,
    studentSafeStatus: 'ready',
    compositionFingerprint: input.compositionFingerprint,
    components: Object.freeze(components),
  });
};

export const projectCombinedPageContext = (
  descriptor: ComponentStudentDocument,
  pageGroups: readonly Pick<BookPageGroupCandidate, 'pageGroupKey' | 'sourceKey' | 'pages' | 'defaultPhysicalPageNumber'>[],
): readonly BookRuntimePageGroupContext[] => {
  if (new Set(pageGroups.map((group) => group.pageGroupKey)).size !== pageGroups.length) {
    throw new ComponentStudentDocumentError('duplicate_page_group');
  }
  return Object.freeze(pageGroups.map((group) => {
  assertId(group.pageGroupKey, 'pageGroupKey');
  const matches = descriptor.components.filter((component) => component.sourceKey === group.sourceKey);
  if (matches.length !== 1 || group.pages.length === 0) {
    throw new ComponentStudentDocumentError('invalid_page_group_component');
  }
  const component = matches[0]!;
  const combinedPhysicalPages = group.pages.map((page) => {
    if (!Number.isSafeInteger(page) || page < 1 || page > component.localPageCount) {
      throw new ComponentStudentDocumentError('invalid_page_group_page');
    }
    const combined = component.combinedStartPage + page - 1;
    if (combined > descriptor.physicalPageCount) {
      throw new ComponentStudentDocumentError('invalid_combined_page');
    }
    return combined;
  });
  if (group.defaultPhysicalPageNumber !== undefined && !group.pages.includes(group.defaultPhysicalPageNumber)) {
    throw new ComponentStudentDocumentError('invalid_page_group_page');
  }
  return Object.freeze({ pageGroupKey: group.pageGroupKey, combinedPhysicalPages: Object.freeze(combinedPhysicalPages),
    ...(group.defaultPhysicalPageNumber !== undefined && group.defaultPhysicalPageNumber !== group.pages[0]
      ? { defaultCombinedPhysicalPage: component.combinedStartPage + group.defaultPhysicalPageNumber - 1 } : {}),
  });
  }));
};
