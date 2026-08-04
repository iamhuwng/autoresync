import { describe, expect, it } from 'vitest';
import {
  authorizeHistoricalAttemptDocument,
  type HistoricalAttemptHomeworkAuthority,
} from '../src/upload-worker/book-delivery/document-worker';
import type { BookAttemptSourceContextProjection } from '../../src/services/book-delivery/attemptSourceContextProjection.types';
import type { BookDocumentAuthorizedSource } from '../src/upload-worker/book-delivery/documentAuthorization';

const projection: BookAttemptSourceContextProjection = {
  schemaVersion: 1,
  state: 'available',
  metadata: {
    attemptId: 'attempt-1',
    resultId: 'result-1',
    bookId: 'book-1',
    studentId: 'student-1',
    surface: 'homework',
    contextId: 'homework-1',
    ownerId: 'teacher-1',
    componentId: 'component-a',
    sourceKey: 'component-a',
    sourceVersionId: 'source-version-4',
    physicalPageNumber: 7,
    pageGroupId: 'page-group-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-3',
    activityVersion: 3,
    interactionFocusId: 'interaction-1',
    correspondence: 'source-assisted',
  },
  documentResource: {
    sourceKey: 'component-a',
    sourceVersionId: 'source-version-4',
    opaqueRouteKey: 'opaque-attempt-1',
    localPageScope: { kind: 'pages', pages: [7] },
  },
};

const source: BookDocumentAuthorizedSource = {
  bookId: 'book-1',
  sourceVersionId: 'source-version-4',
  storageLocationId: 'location-historical',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'private-bucket',
  providerObjectKey: 'private/book-1/source-version-4.pdf',
  providerFileId: 'private-file-id',
  providerFileVersionId: 'private-file-version-id',
  checksum: {
    algorithm: 'sha-256',
    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  byteSize: 1024,
  provider: 'b2',
  bucket: 'book-source',
  objectKey: 'private/book-1/source-version-4.pdf',
};

const request = {
  attemptId: 'attempt-1',
  resultId: 'result-1',
  bookId: 'book-1',
  componentId: 'component-a',
  sourceVersionId: 'source-version-4',
  physicalPageNumber: 7,
  pageGroupId: 'page-group-1',
  placementId: 'placement-1',
  activityVersionId: 'activity-version-3',
  interactionFocusId: 'interaction-1',
  opaqueRouteKey: 'opaque-attempt-1',
};

const homeworkAuthority: HistoricalAttemptHomeworkAuthority = {
  homeworkId: 'homework-1',
  ownerId: 'teacher-1',
  studentIds: ['student-1'],
  status: 'current',
};

const authorize = (overrides: Partial<Parameters<typeof authorizeHistoricalAttemptDocument>[0]> = {}) =>
  authorizeHistoricalAttemptDocument({
    viewer: { uid: 'student-1', role: 'student', status: 'active' },
    projection,
    source,
    sourceAvailability: 'available',
    request,
    ...overrides,
  });

describe('historical attempt document authorization', () => {
  it('authorizes the student from immutable attempt provenance', () => {
    expect(authorize()).toMatchObject({
      ok: true,
      decision: {
        viewerRole: 'student',
        attemptId: 'attempt-1',
        sourceVersionIds: ['source-version-4'],
        sourceLocations: [source],
      },
    });
  });

  it('authorizes only the current owning Homework teacher', () => {
    expect(authorize({
      viewer: { uid: 'teacher-1', role: 'teacher', status: 'active' },
      homeworkAuthority,
    })).toMatchObject({ ok: true, decision: { viewerRole: 'teacher' } });
    expect(authorize({
      viewer: { uid: 'teacher-2', role: 'teacher', status: 'active' },
      homeworkAuthority,
    })).toEqual({ ok: false, status: 403, code: 'forbidden' });
    expect(authorize({
      viewer: { uid: 'teacher-1', role: 'teacher', status: 'active' },
      homeworkAuthority: { ...homeworkAuthority, ownerId: 'teacher-2' },
    })).toEqual({ ok: false, status: 403, code: 'forbidden' });
  });

  it('prevents teachers from reading private Solo attempt sources', () => {
    const soloProjection: BookAttemptSourceContextProjection = {
      ...projection,
      metadata: { ...projection.metadata, surface: 'solo', contextId: 'solo-1' },
    };
    expect(authorize({
      viewer: { uid: 'teacher-1', role: 'teacher', status: 'active' },
      projection: soloProjection,
      homeworkAuthority,
    })).toEqual({ ok: false, status: 403, code: 'forbidden' });
  });

  it.each([
    ['attemptId', 'attempt-current'],
    ['resultId', 'result-neighbor'],
    ['bookId', 'book-2'],
    ['componentId', 'component-b'],
    ['sourceVersionId', 'source-version-current'],
    ['physicalPageNumber', 8],
    ['pageGroupId', 'page-group-2'],
    ['placementId', 'placement-2'],
    ['activityVersionId', 'activity-version-current'],
    ['interactionFocusId', 'interaction-2'],
    ['opaqueRouteKey', 'opaque-current'],
  ] as const)('fails closed for a crafted %s', (key, value) => {
    expect(authorize({ request: { ...request, [key]: value } })).toEqual({
      ok: false,
      status: 403,
      code: 'forbidden',
    });
  });

  it('never substitutes a current or copied source identity', () => {
    expect(authorize({ source: { ...source, sourceVersionId: 'source-version-current' } }))
      .toEqual({ ok: false, status: 403, code: 'forbidden' });
    expect(authorize({ source: { ...source, bookId: 'book-2' } }))
      .toEqual({ ok: false, status: 403, code: 'forbidden' });
  });

  it.each(['missing', 'deleted', 'replaced', 'revoked'] as const)(
    'keeps a %s historical PDF unavailable',
    (sourceAvailability) => {
      expect(authorize({ sourceAvailability })).toEqual({
        ok: false,
        status: 404,
        code: 'historical_source_unavailable',
      });
    },
  );

  it('rejects disabled and unrelated students', () => {
    expect(authorize({ viewer: { uid: 'student-1', role: 'student', status: 'disabled' } }))
      .toEqual({ ok: false, status: 401, code: 'unauthorized' });
    expect(authorize({ viewer: { uid: 'student-2', role: 'student', status: 'active' } }))
      .toEqual({ ok: false, status: 403, code: 'forbidden' });
  });
});
