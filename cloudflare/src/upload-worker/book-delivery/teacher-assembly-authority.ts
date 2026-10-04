import { BOOK_SOURCE_MAX_PDF_BYTES, STUDENT_DOCUMENT_MAX_PDF_BYTES } from '../../../../src/types/bookSource.types.ts';
import type {
  BookAssemblyCandidateRecord,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import { sourceMayBeUsedByNode } from '../../../../src/services/book-assembly/sourceSet.service.ts';
import type {
  BookAssemblyManifestCandidate,
  SourceSetCandidate,
} from '../../../../src/types/bookAssembly.types.ts';
import type { BookSourceVersionStorageIdentity } from '../../../../src/types/bookSource.types.ts';
import { isActiveBookSourceAuthorityProfile } from '../book-source/trusted-source-contract.ts';

const SAFE_ID = /^[A-Za-z0-9._~-]{1,160}$/u;
const SAFE_OBJECT_KEY = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/u;

/** Exact non-capability route tuple consumed by the trusted 09C seam. */
export interface TeacherAssemblyDocumentRoute {
  readonly kind: 'teacher-assembly';
  readonly bookId: string;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly studentDocument?: boolean;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
}

export interface TeacherAssemblyIdentity {
  readonly uid: string;
  readonly role: 'teacher' | 'super_admin';
  readonly status: 'active';
  readonly forceReauth?: false;
}

/** Current Book-management authority. This is not a student publication record. */
export interface TeacherAssemblyBookAuthority {
  readonly bookId: string;
  readonly ownerId: string;
  readonly bookMode: 'pdf';
  readonly status: 'active' | 'archived';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
}

export interface TeacherAssemblyCurrentCandidatePointer {
  readonly candidateId: string;
  readonly candidateRevision: number;
}

export interface TeacherAssemblyCandidateLookup {
  readonly candidate: BookAssemblyCandidateRecord | null;
  readonly current: TeacherAssemblyCurrentCandidatePointer | null;
}

export type TeacherAssemblySourceLifecycle =
  | 'verified-usable'
  | 'reserved'
  | 'replaced'
  | 'released'
  | 'deleted'
  | 'unusable';

/** Trusted source projection. Storage identity is server-only and immutable. */
export interface TeacherAssemblySourceVersion {
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly bookId: string;
  readonly ownerId: string;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly lifecycle: TeacherAssemblySourceLifecycle;
  readonly storage: TeacherAssemblyAuthorizedSource | null;
}

/** Provider coordinates for 09B only. Never serialize this object to a browser. */
export interface TeacherAssemblyAuthorizedSource extends BookSourceVersionStorageIdentity {
  readonly provider: 'b2';
  readonly bucket: string;
  readonly objectKey: string;
}

export interface TeacherAssemblyAuthorityPorts {
  /** Must verify Firebase token, issuer/audience/expiry, disabled state, and active profile. */
  readonly verifyFirebaseIdentity: (request: Request) => Promise<unknown>;
  readonly readBookAuthority: (bookId: string) => Promise<TeacherAssemblyBookAuthority | null>;
  readonly readCandidate: (
    input: Pick<TeacherAssemblyDocumentRoute, 'bookId' | 'unitKey' | 'candidateId'>,
  ) => Promise<TeacherAssemblyCandidateLookup | null>;
  readonly readSourceVersion: (
    input: Pick<TeacherAssemblyDocumentRoute, 'bookId' | 'sourceVersionId'>,
  ) => Promise<TeacherAssemblySourceVersion | null>;
  readonly readStudentDocument?: (
    input: Pick<TeacherAssemblyDocumentRoute, 'bookId' | 'unitKey' | 'candidateId' | 'candidateRevision' | 'bookRevision' | 'sourceSetRevision'>,
  ) => Promise<TeacherAssemblyAuthorizedSource | null>;
}

export type TeacherAssemblyAuthorizationFailureCode =
  | 'unauthorized'
  | 'not-found'
  | 'forbidden'
  | 'stale-book'
  | 'stale-candidate'
  | 'discarded-candidate'
  | 'source-mismatch'
  | 'unsafe-source'
  | 'authorization-unavailable';

/** Separate from student Delivery authority by design. */
export interface TeacherAssemblyDocumentAuthorizationDecision {
  readonly kind: 'teacher-assembly-authorized';
  readonly serverOnly: true;
  readonly uid: string;
  readonly bookId: string;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  /** Single exact source location for in-process 09B consumption. */
  readonly sourceLocations: readonly [TeacherAssemblyAuthorizedSource];
}

export type TeacherAssemblyAuthorizationResult =
  | {
      readonly ok: true;
      readonly decision: TeacherAssemblyDocumentAuthorizationDecision;
    }
  | {
      readonly ok: false;
      readonly code: TeacherAssemblyAuthorizationFailureCode;
    };

const safeId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);
const safeObjectKey = (value: unknown): value is string => typeof value === 'string' && SAFE_OBJECT_KEY.test(value);

const safeRevision = (value: unknown, minimum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const plain = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const validIdentity = (value: unknown): value is TeacherAssemblyIdentity => {
  const record = plain(value);
  return !!record
    && safeId(record.uid)
    && (isActiveBookSourceAuthorityProfile(record, 'teacher')
      || isActiveBookSourceAuthorityProfile(record, 'super_admin'));
};

const validRoute = (value: TeacherAssemblyDocumentRoute | null): value is TeacherAssemblyDocumentRoute =>
  !!value
  && value.kind === 'teacher-assembly'
  && safeId(value.bookId)
  && safeId(value.unitKey)
  && safeId(value.candidateId)
  && safeRevision(value.candidateRevision, 1)
  && safeId(value.sourceKey)
  && safeId(value.sourceVersionId)
  && (value.studentDocument === undefined || typeof value.studentDocument === 'boolean')
  && safeRevision(value.bookRevision, 0)
  && safeRevision(value.sourceSetRevision, 0);

const exactRouteNumber = (value: string, minimum: number): number | null => {
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return safeRevision(parsed, minimum) && String(parsed) === value ? parsed : null;
};

/**
 * Parse one exact route shape. Query strings, extra ancestors, missing segments,
 * encoded separators, and non-canonical revisions are rejected before authority
 * or provider lookup.
 */
export const parseTeacherAssemblyDocumentRoute = (request: Request): TeacherAssemblyDocumentRoute | null => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length > 0) return null;
  const pathSegments = url.pathname.split('/');
  if ((pathSegments.length !== 12 && pathSegments.length !== 11) || pathSegments[0] !== '') return null;
  const rawSegments = pathSegments.slice(1);
  if (rawSegments.some((segment) => segment === '')
    || rawSegments[0] !== 'v1'
    || rawSegments[1] !== 'book-delivery'
    || rawSegments[2] !== 'teacher-assembly') return null;
  let segments: string[];
  try {
    segments = rawSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (segments.some((segment) => !safeId(segment))) return null;
  const combined = segments.length === 10 && segments[7] === 'student-document';
  const candidateRevision = exactRouteNumber(segments[6]!, 1);
  const sourceSetRevision = exactRouteNumber(segments[combined ? 8 : 9]!, 0);
  const bookRevision = exactRouteNumber(segments[combined ? 9 : 10]!, 0);
  if (candidateRevision === null || sourceSetRevision === null || bookRevision === null) return null;
  const route: TeacherAssemblyDocumentRoute = {
    kind: 'teacher-assembly',
    bookId: segments[3]!,
    unitKey: segments[4]!,
    candidateId: segments[5]!,
    candidateRevision,
    sourceKey: combined ? 'student-document' : segments[7]!,
    sourceVersionId: combined ? 'student-document' : segments[8]!,
    studentDocument: combined,
    sourceSetRevision,
    bookRevision,
  };
  return validRoute(route) ? route : null;
};

const validStorage = (
  source: TeacherAssemblyAuthorizedSource,
  route: TeacherAssemblyDocumentRoute,
): boolean => source.provider === 'b2'
  && source.providerKind === 'backblaze-b2-s3'
  && source.bookId === route.bookId
  && (route.studentDocument || source.sourceVersionId === route.sourceVersionId)
  && safeId(source.storageLocationId)
  && safeId(source.privateBucketId)
  && safeId(source.providerFileId)
  && safeId(source.providerFileVersionId)
  && safeId(source.bucket)
  && safeObjectKey(source.objectKey)
  && source.providerObjectKey === source.objectKey
  && source.checksum.algorithm === 'sha-256'
  && /^[a-f0-9]{64}$/u.test(source.checksum.value)
  && Number.isSafeInteger(source.byteSize)
  && source.byteSize > 0
  && source.byteSize <= (route.studentDocument ? STUDENT_DOCUMENT_MAX_PDF_BYTES : BOOK_SOURCE_MAX_PDF_BYTES);

const sourceUsedByUnit = (
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  sourceKey: string,
): boolean => {
  const unit = manifest.units.find((candidate) => candidate.unitKey === unitKey);
  if (!unit) return false;
  return unit.pageGroups.some((group) => group.sourceKey === sourceKey)
    && manifest.sourceSet.sources.some((source) => source.sourceKey === sourceKey)
    && sourceMayBeUsedByNode(
      manifest.sourceSet.sources.find((source) => source.sourceKey === sourceKey)!,
      manifest.nodes,
      unitKey,
    );
};

const authorizedSource = (source: TeacherAssemblyAuthorizedSource): TeacherAssemblyAuthorizedSource => Object.freeze({
  ...source,
  checksum: Object.freeze({ ...source.checksum }),
});

const deny = (code: TeacherAssemblyAuthorizationFailureCode): TeacherAssemblyAuthorizationResult => ({
  ok: false,
  code,
});

/**
 * Per-request teacher Assembly authority. No provider operation, Delivery row,
 * browser credential, signed URL, or document session is created here.
 */
export const authorizeTeacherAssemblyDocumentRequest = async (input: {
  readonly request: Request;
  readonly ports: TeacherAssemblyAuthorityPorts;
}): Promise<TeacherAssemblyAuthorizationResult> => {
  const route = parseTeacherAssemblyDocumentRoute(input.request);
  if (!route) return deny('not-found');

  let identity: unknown;
  try {
    if (!/^Bearer\s+\S+$/iu.test(input.request.headers.get('authorization') ?? '')) {
      return deny('unauthorized');
    }
    identity = await input.ports.verifyFirebaseIdentity(input.request);
  } catch {
    return deny('authorization-unavailable');
  }
  if (!validIdentity(identity)) return deny('unauthorized');

  let book: TeacherAssemblyBookAuthority | null;
  try {
    book = await input.ports.readBookAuthority(route.bookId);
  } catch {
    return deny('authorization-unavailable');
  }
  if (!book || book.bookId !== route.bookId) return deny('not-found');
  if (book.ownerId !== identity.uid || book.bookMode !== 'pdf' || book.status !== 'active') {
    return deny('forbidden');
  }
  if (book.bookRevision !== route.bookRevision || book.sourceSetRevision !== route.sourceSetRevision) {
    return deny('stale-book');
  }

  let lookup: TeacherAssemblyCandidateLookup | null;
  try {
    lookup = await input.ports.readCandidate({
      bookId: route.bookId,
      unitKey: route.unitKey,
      candidateId: route.candidateId,
    });
  } catch {
    return deny('authorization-unavailable');
  }
  if (!lookup || !lookup.candidate || !lookup.current || lookup.candidate.ownerId !== identity.uid) return deny('not-found');
  const candidate = lookup.candidate;
  if (lookup.current.candidateId !== route.candidateId
    || lookup.current.candidateRevision !== route.candidateRevision) return deny('stale-candidate');
  if (candidate.candidateId !== route.candidateId
    || candidate.bookId !== route.bookId
    || candidate.unitKey !== route.unitKey
    || candidate.revision !== route.candidateRevision
    || candidate.bookRevision !== route.bookRevision
    || candidate.sourceSetRevision !== route.sourceSetRevision) return deny('stale-candidate');
  if (candidate.lifecycle === 'discarded') return deny('discarded-candidate');
  if (candidate.lifecycle !== 'draft' && candidate.lifecycle !== 'validated') return deny('stale-candidate');
  const manifest = candidate.manifest;
  if (!manifest
    || manifest.bookId !== route.bookId
    || stable(manifest.sourceSet) !== stable(book.sourceSet)
    || (!route.studentDocument && !sourceUsedByUnit(manifest, route.unitKey, route.sourceKey))) return deny('source-mismatch');

  if (route.studentDocument) {
    let storage: TeacherAssemblyAuthorizedSource | null;
    try {
      storage = await input.ports.readStudentDocument?.(route) ?? null;
    } catch {
      return deny('authorization-unavailable');
    }
    if (!storage || !validStorage(storage, { ...route, sourceVersionId: storage.sourceVersionId })) {
      return deny('unsafe-source');
    }
    return { ok: true, decision: Object.freeze({
      kind: 'teacher-assembly-authorized', serverOnly: true, uid: identity.uid,
      bookId: route.bookId, bookRevision: route.bookRevision,
      sourceSetRevision: route.sourceSetRevision, unitKey: route.unitKey,
      candidateId: route.candidateId, candidateRevision: route.candidateRevision,
      sourceKey: 'student-document', sourceVersionId: storage.sourceVersionId,
      sourceLocations: Object.freeze([authorizedSource(storage)]) as readonly [TeacherAssemblyAuthorizedSource],
    }) };
  }

  const sourceEntry = book.sourceSet.sources.find((source) => source.sourceKey === route.sourceKey);
  if (!sourceEntry || sourceEntry.sourceVersionId !== route.sourceVersionId) return deny('source-mismatch');
  let source: TeacherAssemblySourceVersion | null;
  try {
    source = await input.ports.readSourceVersion({
      bookId: route.bookId,
      sourceVersionId: route.sourceVersionId,
    });
  } catch {
    return deny('authorization-unavailable');
  }
  if (!source
    || source.sourceVersionId !== route.sourceVersionId
    || source.sourceKey !== route.sourceKey
    || source.bookId !== route.bookId
    || source.ownerId !== book.ownerId
    || source.bookRevision !== route.bookRevision
    || source.sourceSetRevision !== route.sourceSetRevision
    || source.lifecycle !== 'verified-usable'
    || !source.storage
    || !validStorage(source.storage, route)) return deny('unsafe-source');

  const storage = authorizedSource(source.storage);
  const decision: TeacherAssemblyDocumentAuthorizationDecision = Object.freeze({
    kind: 'teacher-assembly-authorized',
    serverOnly: true,
    uid: identity.uid,
    bookId: route.bookId,
    bookRevision: route.bookRevision,
    sourceSetRevision: route.sourceSetRevision,
    unitKey: route.unitKey,
    candidateId: route.candidateId,
    candidateRevision: route.candidateRevision,
    sourceKey: route.sourceKey,
    sourceVersionId: route.sourceVersionId,
    sourceLocations: Object.freeze([storage]) as readonly [TeacherAssemblyAuthorizedSource],
  });
  return { ok: true, decision };
};
