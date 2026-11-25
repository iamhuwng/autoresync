import { decodeJwt } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import generatedRules from '../../database.rules.json';
import {
  composeGeneratedBookRules,
  FINAL_BOOK_RULE_FRAGMENT_IDS,
} from '../src/upload-worker/book-rules/generated-fragment-composer.ts';
import type { GeneratedBookRuleFragmentSource } from '../src/upload-worker/book-rules/generated-fragment-manifest.ts';
import type {
  BookRuntimeAttemptIndexRecord,
  BookRuntimeAttemptRecord,
  BookRuntimeCompletionRecord,
  BookRuntimeFeedbackPolicy,
  BookRuntimeResultRecord,
} from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookHomeworkManifest } from '../../src/types/homework.types.ts';
import {
  BOOK_HOMEWORK_COMPLETION_ROOT,
  FirebaseRestBookHomeworkCompletionRepository,
  InMemoryBookHomeworkCompletionRepository,
  type BookHomeworkCompletionProjectInput,
} from '../src/upload-worker/book-homework/completion-repository.ts';
import {
  buildStudentBookHomeworkSummary,
  STUDENT_BOOK_HOMEWORK_SUMMARIES_ROOT,
  writeStudentBookHomeworkSummary,
} from '../src/upload-worker/book-homework/student-summary-projection.ts';
import {
  createBookRuntimeProductionDependencies,
} from '../src/upload-worker/book-runtime/canonical.ts';

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQClFZANZJnKeRMA
sTwvl9czA5NOc7KHkDI0Cw+wFN0ACKDb5bRRBRw0JQwLbEMMiXC2bTxZZKU2mHqm
la3b4c/MpAt2669Vh+iVzA4gBHMp1l1Y647g8WHCl1b/DSmD2DEBLKK8krGCtRdH
4KVrVuYZCeXPnLfVSRg4qgZuBf8RDGZuJzV5fEmeLDc5EvS7KTh0Q9VpeU90nk/B
dI2h3aDgnpFZXqiNQ5Hlq5vy9YMGQGAE+tOcaKDu61GSbW2gODxUFeUyg5kL4GhJ
tJOmhUb/zvQdGFTmv4uJAIv42vUVDyqWiZLNnXlw0HnMBQBz7S5Lx1A2pAfujhbE
wExx+4/RAgMBAAECggEAIK9Bu50Y4+EP1ZnBqEygU13YWvaGONfgULSF8R9YWCrd
Klxy1H22BU72cQaIyeEmW0AKbEqEeWg8FGJbL0conMQ37t4f80e60Xm6rDUlVfm2
tqXAvqGb8OqE02+YMh3qKejb+Yjzs0TGbLk6FyP336o5gV7ueMCFlqZ3Km5uf0HL
PZdm3tPDBw7j2Ci+rMncHOy42zqXD46PciCXlpqYd6ntwNAO5OtWwXzDmHcziLMe
is0zK6uCJh3kwsdvFQosrj0jh9vj4CfvseNDqUno3rmlRVqBGcgUcm6ejkskb/r7
R0jCHqKkJ3VxpSUUYIsiP9FvYeKXWEOHJLjdhsbIiQKBgQDYSKFmMfB/1/of1bDr
IcvCbNVWSnpbBut5us5yMWy2vtJWbJU20mKKxc6AU1yGDlA0SJFzIOf1YnMzPwTt
fnuhFK7SenS9kTeJPNKJZ1s2UkCED9M73jM7iQ5km/9IVVjn6SaH2HqHgRJXGBmZ
bp1Vp4S7Zj7IAtDhDpqgxK42dQKBgQDDZhMkhCcFzgKauflTlYHdKMmfHQis/DFD
NxL66UpaFPc9+m79hhQLem55IHb8APOW0cEQreDa3g9HQtdpnvbxM24uJyL6Dxac
EnoiOhUjjnFTsNJryHkXalX8N08Y/gd2QTqmCJCdl0ia3Q+bCP3BhQZQSYZ1skoS
AY2XPojgbQKBgGbt4cm12IOu8D04QDMWaVcE3l5roWEyoNvUuC0GMnuhwo4YrMZj
RzxNuOG/SlgN9cN8CaRls55HFRX9VsYDnKhjJHPMjUQuGOT6CiQUCQeIC2YN9fQW
4gDiT/Q3fT0aSO5NOeYKcv2LwoOqV3x6dOvvhi59EUG0fV2tyo7aKyKFAoGAO0f9
qMd7O1ScD6s6jHRAeQOF4AMj/a9plrXfyUX768aOmDwhbkM+U5kqaQ9DagMz497x
TwkhveU/B2StC/tRei4bUF9JSkpHlsQ4T6gFf8sYcMaloFOrAUKeoa16DuALDYKO
s47HqTgbq/hDYsrgidS87KDR7WVQ+ZOFDIzJZCUCgYEArcyEmt+8rsswGJy/WFLE
D1scwJlf+K601qNt51NtkJKyPpzWv7eheqXT2XwxtvwVP9e3XDyxBOb4npbMm5y7
PhLctyYlWBhU6wcyo5Id4tzKF53JnCxVsYFRkTigHQoNiKGdiyuvqaJ+6k1knPA2
rO6VMkOay+SbMM9Gakxxa+g=
-----END PRIVATE KEY-----`;

const iso = (second: number) => `2026-08-01T00:00:${String(second).padStart(2, '0')}.000Z`;

const makeBinding = (activityCount = 2): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'delivery-binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: {
    kind: 'placements',
    nodeKeys: ['unit-1'],
    placementIds: Array.from({ length: activityCount }, (_, i) => `placement-${i + 1}`),
  },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: {
    contextId: 'homework-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-v1',
      lifecycle: 'verified-usable',
      localPageScope: {
        kind: 'pages',
        pages: Array.from({ length: activityCount }, (_, i) => i + 1),
      },
    }],
  },
  placements: Array.from({ length: activityCount }, (_, index) => {
    const number = index + 1;
    return {
      placementId: `placement-${number}`,
      activityId: `activity-${number}`,
      activityVersionId: `activity-version-${number}`,
      activityVersion: 1,
      nodeKey: 'unit-1',
      order: number,
      contextMode: 'required' as const,
      pageGroupKeys: [`page-group-${number}`],
      sourcePageScopes: [{ sourceKey: 'source-1', pages: [number] }],
    };
  }),
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: iso(0),
});

const makeManifest = (activityCount = 2): BookHomeworkManifest => ({
  schemaVersion: 1,
  assignmentKind: 'book_activity_bundle',
  manifestVersionId: 'manifest-1',
  ownerId: 'teacher-1',
  createdByCommandId: 'create-1',
  createdAt: iso(0),
  bindingRevision: 1,
  book: makeBinding(activityCount).book,
  context: {
    contextId: 'homework-1',
    recipientId: 'student-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  scheduleRules: [{ nodeKey: 'unit-1', dueAt: iso(59) }],
  bindings: Array.from({ length: activityCount }, (_, index) => {
    const number = index + 1;
    return {
      bindingId: `activity-binding-${number}`,
      placementId: `placement-${number}`,
      activityId: `activity-${number}`,
      nodeKey: 'unit-1',
      order: number,
      contextMode: 'required' as const,
      pageGroupKeys: [`page-group-${number}`],
      sourceReadiness: 'ready' as const,
      state: 'required' as const,
      activityVersion: 1,
      activityVersionId: `activity-version-${number}`,
      sourceContext: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', physicalPageNumbers: [number] }],
    };
  }),
  completion: {
    aggregation: 'required-activities-submitted-over-required-activities',
    requiredBindingCount: activityCount,
    excludedBindingCount: 0,
    legacyScoreFields: 'untouched',
  },
});

const makeTerminal = (
  number: number,
  options: {
    status?: 'pending_review' | 'submitted';
    feedbackPolicy?: BookRuntimeFeedbackPolicy;
    createdAt?: string;
    score?: {
      status: 'scored';
      earnedScore: number;
      maximumScore: number;
      displayScore: string;
    };
    attemptNumber?: number;
  } = {},
): NonNullable<BookHomeworkCompletionProjectInput['terminal']> => {
  const attemptNumber = options.attemptNumber ?? 1;
  const status = options.status ?? 'submitted';
  const feedbackPolicy = options.feedbackPolicy ?? 'immediate';
  const createdAt = options.createdAt ?? iso(number * 10);
  const attemptId = `attempt-${number}${attemptNumber === 1 ? '' : `-${attemptNumber}`}`;
  const resultId = `${attemptId}:result`;

  const base = {
    schemaVersion: 1 as const,
    attemptId,
    bindingId: 'delivery-binding-1',
    bindingRevision: 1,
    recipientId: 'student-1',
    contextId: 'homework-1',
    placementId: `placement-${number}`,
    activityId: `activity-${number}`,
    activityVersion: 1,
    activityVersionId: `activity-version-${number}`,
    interactionId: `interaction-${number}`,
    submissionScope: 'activity' as const,
    requiredInteractionIds: [`interaction-${number}`],
    submittedInteractionIds: [`interaction-${number}`],
    acknowledgedDraftRevision: 1,
    attemptNumber,
    pageGroupKeys: [`page-group-${number}`],
    sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', pages: [number] }],
    createdByOperationId: `operation-${number}-${attemptNumber}`,
    createdAt,
    terminalLate: {
      effectiveDeadline: { source: 'assignment' as const, nodeKey: 'unit-1', at: iso(59) },
      policyRevision: 1,
      authorityRevision: 1,
      evaluatedAt: createdAt,
      late: false,
    },
    feedbackPolicy,
  };

  const attempt: BookRuntimeAttemptRecord = {
    ...base,
    response: { answer: `secret-${number}` },
    feedbackRelease: feedbackPolicy === 'immediate' ? 'released' : 'pending',
  };
  const result: BookRuntimeResultRecord = {
    ...base,
    resultId,
    attemptId,
    feedbackRelease: feedbackPolicy === 'immediate' ? 'released' : 'pending',
    status,
    ...(status === 'submitted'
      ? {
        score: options.score ?? {
          status: 'scored' as const,
          earnedScore: number,
          maximumScore: 2,
          displayScore: `${number}/2`,
        },
      }
      : {}),
  };
  const completion: BookRuntimeCompletionRecord = {
    ...base,
    completionId: `${attemptId}:completion`,
    attemptId,
    resultId,
    status: 'completed',
  };
  const index: BookRuntimeAttemptIndexRecord = {
    ...base,
    resultId,
    attemptId,
  };

  return { attempt, result, completion, index };
};

const hasUndefinedValueDeep = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some((entry) => hasUndefinedValueDeep(entry));
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((entry) => hasUndefinedValueDeep(entry));
  }
  return false;
};

describe('student Book homework summary projection', () => {
  it('preserves auto-scored immediate feedback scores and parses submittedAt / latestSubmittedAt', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const binding = makeBinding(2);
    const manifest = makeManifest(2);

    await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(1, {
        status: 'submitted',
        feedbackPolicy: 'immediate',
        createdAt: iso(12),
        score: { status: 'scored', earnedScore: 3, maximumScore: 4, displayScore: '3/4' },
      }),
    });
    const second = await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(2, {
        status: 'submitted',
        feedbackPolicy: 'immediate',
        createdAt: iso(25),
        score: { status: 'scored', earnedScore: 4, maximumScore: 4, displayScore: '4/4' },
      }),
    });

    expect(second.facts).toBeDefined();
    expect(Object.keys(second.facts ?? {})).toEqual([
      'attempt-1:completion',
      'attempt-2:completion',
    ]);

    const summary = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      projection: second.projection,
      facts: second.facts ?? {},
      nowMs: 1_754_006_430_000,
    });

    expect(hasUndefinedValueDeep(summary)).toBe(false);
    expect(summary).toEqual({
      schemaVersion: 1,
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      status: 'completed',
      isComplete: true,
      submittedCount: 2,
      requiredCount: 2,
      scoredCount: 2,
      pendingReviewCount: 0,
      latestSubmittedAt: Date.parse(iso(25)),
      updatedAt: 1_754_006_430_000,
      activities: [
        {
          activityId: 'activity-1',
          order: 1,
          submitted: true,
          submittedAt: Date.parse(iso(12)),
          gradingState: 'scored',
          score: { earnedScore: 3, maximumScore: 4, displayScore: '3/4' },
        },
        {
          activityId: 'activity-2',
          order: 2,
          submitted: true,
          submittedAt: Date.parse(iso(25)),
          gradingState: 'scored',
          score: { earnedScore: 4, maximumScore: 4, displayScore: '4/4' },
        },
      ],
    });
  });

  it('enforces manual-feedback privacy invariant by omitting score, forcing ungraded, and counting only visible activities', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const binding = makeBinding(3);
    const manifest = makeManifest(3);

    // Activity 1: auto-scored immediate -> visible scored
    await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(1, {
        status: 'submitted',
        feedbackPolicy: 'immediate',
        createdAt: iso(10),
        score: { status: 'scored', earnedScore: 2, maximumScore: 2, displayScore: '2/2' },
      }),
    });
    // Activity 2: auto-scored manual -> withheld (ungraded, no score)
    await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(2, {
        status: 'submitted',
        feedbackPolicy: 'manual',
        createdAt: iso(20),
        score: { status: 'scored', earnedScore: 1, maximumScore: 2, displayScore: '1/2' },
      }),
    });
    // Activity 3: pending_review manual -> withheld (ungraded, not counted in pendingReviewCount)
    const third = await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(3, {
        status: 'pending_review',
        feedbackPolicy: 'manual',
        createdAt: iso(30),
      }),
    });

    // Underlying teacher/runtime projection has 2 scored and 1 pending review
    expect(third.projection.grading).toEqual({
      scoredCount: 2,
      pendingReviewCount: 1,
      ungradedSubmittedCount: 0,
    });

    const summary = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: undefined,
      projection: third.projection,
      facts: third.facts ?? {},
      nowMs: 1_754_006_440_000,
    });

    expect(hasUndefinedValueDeep(summary)).toBe(false);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    expect(summary).toEqual({
      schemaVersion: 1,
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: null,
      status: 'completed',
      isComplete: true,
      submittedCount: 3,
      requiredCount: 3,
      scoredCount: 1,
      pendingReviewCount: 0,
      latestSubmittedAt: Date.parse(iso(30)),
      updatedAt: 1_754_006_440_000,
      activities: [
        {
          activityId: 'activity-1',
          order: 1,
          submitted: true,
          submittedAt: Date.parse(iso(10)),
          gradingState: 'scored',
          score: { earnedScore: 2, maximumScore: 2, displayScore: '2/2' },
        },
        {
          activityId: 'activity-2',
          order: 2,
          submitted: true,
          submittedAt: Date.parse(iso(20)),
          gradingState: 'ungraded',
        },
        {
          activityId: 'activity-3',
          order: 3,
          submitted: true,
          submittedAt: Date.parse(iso(30)),
          gradingState: 'ungraded',
        },
      ],
    });
    expect('score' in summary.activities[1]!).toBe(false);
    expect('score' in summary.activities[2]!).toBe(false);
  });

  it('tracks partial in_progress vs completed status, isComplete, and replay facts without extra reads', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const binding = makeBinding(2);
    const manifest = makeManifest(2);

    const initialProjection = await repository.resolveCurrentProjection({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
    });
    const notStarted = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      projection: initialProjection,
      facts: {},
      nowMs: 1_000,
    });
    expect(notStarted).toMatchObject({
      status: 'not_started',
      isComplete: false,
      submittedCount: 0,
      requiredCount: 2,
      scoredCount: 0,
      pendingReviewCount: 0,
      latestSubmittedAt: 0,
    });

    const partial = await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(1, {
        status: 'pending_review',
        feedbackPolicy: 'after_completion',
        createdAt: iso(15),
      }),
    });
    const partialReplay = await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(1, {
        status: 'pending_review',
        feedbackPolicy: 'after_completion',
        createdAt: iso(15),
      }),
    });
    expect(partialReplay.status).toBe('replayed');
    expect(partialReplay.facts).toEqual(partial.facts);

    const inProgressSummary = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      projection: partialReplay.projection,
      facts: partialReplay.facts ?? {},
      nowMs: 2_000,
    });
    expect(inProgressSummary).toEqual({
      schemaVersion: 1,
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      status: 'in_progress',
      isComplete: false,
      submittedCount: 1,
      requiredCount: 2,
      scoredCount: 0,
      pendingReviewCount: 1,
      latestSubmittedAt: Date.parse(iso(15)),
      updatedAt: 2_000,
      activities: [
        {
          activityId: 'activity-1',
          order: 1,
          submitted: true,
          submittedAt: Date.parse(iso(15)),
          gradingState: 'review_required',
        },
        {
          activityId: 'activity-2',
          order: 2,
          submitted: false,
          submittedAt: 0,
          gradingState: 'ungraded',
        },
      ],
    });

    const complete = await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(2, {
        status: 'submitted',
        feedbackPolicy: 'immediate',
        createdAt: iso(40),
        score: { status: 'scored', earnedScore: 2, maximumScore: 2, displayScore: '2/2' },
      }),
    });
    const completedSummary = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      projection: complete.projection,
      facts: complete.facts ?? {},
      nowMs: 3_000,
    });
    expect(completedSummary).toMatchObject({
      status: 'completed',
      isComplete: true,
      submittedCount: 2,
      requiredCount: 2,
      scoredCount: 1,
      pendingReviewCount: 1,
      latestSubmittedAt: Date.parse(iso(40)),
    });
  });

  it('matches facts via placementId + activityId fallback when terminalId key is not directly indexed', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const binding = makeBinding(1);
    const manifest = makeManifest(1);

    const projected = await repository.project({
      authority: { assignmentId: 'homework-1', manifest },
      binding,
      terminal: makeTerminal(1, {
        status: 'submitted',
        feedbackPolicy: 'immediate',
        createdAt: iso(18),
      }),
    });
    const factValue = Object.values(projected.facts ?? {})[0]!;
    const strippedFact = {
      ...factValue,
      terminalId: undefined,
      completionId: undefined,
      resultId: undefined,
      attemptId: undefined,
    };

    const summary = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      projection: projected.projection,
      facts: { customFactSlot: strippedFact },
      nowMs: 5_000,
    });
    expect(summary.activities[0]?.submittedAt).toBe(Date.parse(iso(18)));
    expect(summary.latestSubmittedAt).toBe(Date.parse(iso(18)));
  });

  it('writes summary to student_book_homework_summaries/{studentId}/{homeworkId} with scoped book_runtime claims', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const projected = await repository.project({
      authority: { assignmentId: 'homework-1', manifest: makeManifest(2) },
      binding: makeBinding(2),
      terminal: makeTerminal(1, { createdAt: iso(20) }),
    });
    const summary = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      projection: projected.projection,
      facts: projected.facts ?? {},
      nowMs: 1_754_006_450_000,
    });

    const exchangedTokens: Array<Record<string, unknown>> = [];
    const rtdbRequests: Array<{ method: string; url: string; body: unknown; headers: Headers }> = [];
    let persistedSummary: unknown = null;
    let currentEtag = 'etag-0';

    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { token: string };
        exchangedTokens.push(decodeJwt(body.token) as Record<string, unknown>);
        return new Response(
          JSON.stringify({ idToken: 'scoped-runtime-id-token', expiresIn: '3600' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = new Headers(init?.headers);
      rtdbRequests.push({
        method,
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
        headers,
      });

      if (method === 'GET') {
        return new Response(JSON.stringify(persistedSummary), {
          status: 200,
          headers: { etag: currentEtag },
        });
      }
      if (method === 'PUT') {
        if (headers.get('if-match') !== currentEtag) {
          return new Response('', { status: 412 });
        }
        persistedSummary = JSON.parse(String(init?.body));
        currentEtag = 'etag-1';
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 405 });
    });

    await writeStudentBookHomeworkSummary({
      env: {
        FIREBASE_DB_URL: 'https://database.example.test',
        FIREBASE_PROJECT_ID: 'project-test',
        FIREBASE_WEB_API_KEY: 'web-api-key-test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@project-test.iam.gserviceaccount.com',
        BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'runtime@project-test.iam.gserviceaccount.com',
          private_key: TEST_PRIVATE_KEY,
        }),
      },
      summary,
      fetchImpl,
    });

    expect(exchangedTokens).toHaveLength(1);
    expect(exchangedTokens[0]).toMatchObject({
      iss: 'runtime@project-test.iam.gserviceaccount.com',
      sub: 'runtime@project-test.iam.gserviceaccount.com',
      uid: 'student-1',
      claims: {
        book_runtime_service: true,
        book_runtime_recipientId: 'student-1',
        book_runtime_contextId: 'homework-1',
      },
    });

    expect(rtdbRequests).toHaveLength(2);
    expect(rtdbRequests[0]?.method).toBe('GET');
    expect(rtdbRequests[0]?.url).toBe(
      `https://database.example.test/${STUDENT_BOOK_HOMEWORK_SUMMARIES_ROOT}/student-1/homework-1.json?auth=scoped-runtime-id-token`,
    );
    expect(rtdbRequests[1]?.method).toBe('PUT');
    expect(rtdbRequests[1]?.url).toBe(
      `https://database.example.test/${STUDENT_BOOK_HOMEWORK_SUMMARIES_ROOT}/student-1/homework-1.json?auth=scoped-runtime-id-token`,
    );
    expect(persistedSummary).toEqual(summary);
  });

  it('projects both homework_completion and student_book_homework_summaries in canonical projectHomeworkCompletion', async () => {
    const binding = makeBinding(2);
    const manifest = makeManifest(2);
    const terminalTuple = makeTerminal(1, {
      status: 'submitted',
      feedbackPolicy: 'manual',
      createdAt: iso(22),
      score: { status: 'scored', earnedScore: 2, maximumScore: 2, displayScore: '2/2' },
    });

    const authorityDoc = {
      assignmentId: 'homework-1--student-1--authority',
      assignmentKind: 'book_activity_bundle' as const,
      schemaVersion: 1 as const,
      ownerId: 'teacher-1',
      bookManifest: manifest,
      schedule: {
        schemaVersion: 1 as const,
        resolverVersion: 1 as const,
        finalDueAt: iso(59),
        scheduleRules: [{ nodeKey: 'unit-1', dueAt: iso(59) }],
      },
      studentExtensions: {},
      saga: { sagaId: 'homework-1', state: 'committed' as const, lastCommandId: 'create-1' },
      visibility: {
        status: 'committed' as const,
        pointerId: 'manifest-1',
        manifestVersionId: 'manifest-1',
        revision: 1,
      },
      revision: 1,
      createdAt: iso(0),
      updatedAt: iso(0),
    };

    const toFirestoreValue = (value: unknown): Record<string, unknown> => {
      if (value === null) return { nullValue: null };
      if (typeof value === 'boolean') return { booleanValue: value };
      if (typeof value === 'number') return { integerValue: String(value) };
      if (typeof value === 'string') return { stringValue: value };
      if (Array.isArray(value)) {
        return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
      }
      const fields: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (item !== undefined) fields[key] = toFirestoreValue(item);
      }
      return { mapValue: { fields } };
    };

    const rtdbStore = new Map<string, { value: unknown; etag: string }>();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'identitytoolkit.googleapis.com') {
        return Response.json({ idToken: 'id-token-1', expiresIn: '3600' });
      }
      if (url.hostname === 'firestore.googleapis.com') {
        const rootMap = toFirestoreValue(authorityDoc) as { mapValue: { fields: Record<string, unknown> } };
        return Response.json({
          name: 'projects/project-test/databases/(default)/documents/book_homework_authorities/homework-1--student-1--authority',
          fields: rootMap.mapValue.fields,
          updateTime: iso(0),
        });
      }
      if (url.hostname === 'database.example.test') {
        const cleanPath = url.pathname.replace(/^\//u, '').replace(/\.json$/u, '');
        const method = (init?.method ?? 'GET').toUpperCase();
        const existing = rtdbStore.get(cleanPath) ?? { value: null, etag: 'etag-0' };
        if (method === 'GET') {
          return new Response(JSON.stringify(existing.value), {
            status: 200,
            headers: { etag: existing.etag },
          });
        }
        if (method === 'PUT') {
          const headers = new Headers(init?.headers);
          if (headers.get('if-match') !== existing.etag) {
            return new Response('', { status: 412 });
          }
          const nextValue = JSON.parse(String(init?.body));
          rtdbStore.set(cleanPath, { value: nextValue, etag: `${existing.etag}-next` });
          return new Response('', { status: 200 });
        }
      }
      return new Response('', { status: 500 });
    });

    try {
      const runtimeEnv = {
        FIREBASE_DB_URL: 'https://database.example.test',
        FIREBASE_PROJECT_ID: 'project-test',
        FIREBASE_WEB_API_KEY: 'web-api-key-test',
        BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED: 'enabled',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@project-test.iam.gserviceaccount.com',
        BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'runtime@project-test.iam.gserviceaccount.com',
          private_key: TEST_PRIVATE_KEY,
        }),
        BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@project-test.iam.gserviceaccount.com',
        BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'delivery@project-test.iam.gserviceaccount.com',
          private_key: TEST_PRIVATE_KEY,
        }),
        BOOK_HOMEWORK_SERVICE_IDENTITY: 'homework@project-test.iam.gserviceaccount.com',
        BOOK_HOMEWORK_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'homework@project-test.iam.gserviceaccount.com',
          private_key: TEST_PRIVATE_KEY,
        }),
      };

      const dependencies = createBookRuntimeProductionDependencies(runtimeEnv, undefined, undefined);
      await dependencies.projectHomeworkCompletion!({
        binding,
        result: {
          status: 'accepted',
          attempt: terminalTuple.attempt,
          result: terminalTuple.result,
          completion: terminalTuple.completion,
          index: terminalTuple.index,
        },
        env: runtimeEnv,
      });

      expect(rtdbStore.has(`${BOOK_HOMEWORK_COMPLETION_ROOT}/student-1/homework-1`)).toBe(true);
      const writtenSummary = rtdbStore.get(
        `${STUDENT_BOOK_HOMEWORK_SUMMARIES_ROOT}/student-1/homework-1`,
      )?.value;
      expect(writtenSummary).toMatchObject({
        schemaVersion: 1,
        studentId: 'student-1',
        homeworkId: 'homework-1',
        bookId: 'book-1',
        status: 'in_progress',
        isComplete: false,
        submittedCount: 1,
        requiredCount: 2,
        scoredCount: 0,
        pendingReviewCount: 0,
        latestSubmittedAt: Date.parse(iso(22)),
        activities: [
          {
            activityId: 'activity-1',
            order: 1,
            submitted: true,
            submittedAt: Date.parse(iso(22)),
            gradingState: 'ungraded',
          },
          {
            activityId: 'activity-2',
            order: 2,
            submitted: false,
            submittedAt: 0,
            gradingState: 'ungraded',
          },
        ],
      });

      // Also verify FirebaseRestBookHomeworkCompletionRepository returns facts directly
      const restRepo = new FirebaseRestBookHomeworkCompletionRepository({
        env: runtimeEnv,
      });
      const replayed = await restRepo.project({
        authority: authorityDoc,
        binding,
        terminal: terminalTuple,
      });
      expect(replayed.status).toBe('replayed');
      expect(Object.keys(replayed.facts ?? {})).toEqual(['attempt-1:completion']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('prefers BOOK_HOMEWORK_COMPLETION_* credentials when configured and keeps generated Book rule composition idempotent', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const projected = await repository.project({
      authority: { assignmentId: 'homework-1', manifest: makeManifest(1) },
      binding: makeBinding(1),
      terminal: makeTerminal(1),
    });
    const summary = buildStudentBookHomeworkSummary({
      studentId: 'student-1',
      homeworkId: 'homework-1',
      bookId: 'book-1',
      projection: projected.projection,
      facts: projected.facts ?? {},
      nowMs: 1_754_006_500_000,
    });

    let mintedIssuer = '';
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { token: string };
        mintedIssuer = String((decodeJwt(body.token) as Record<string, unknown>).iss ?? '');
        return Response.json({ idToken: 'completion-id-token', expiresIn: '3600' });
      }
      if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
        return new Response('null', { status: 200, headers: { etag: 'etag-init' } });
      }
      return new Response('', { status: 200 });
    });

    await writeStudentBookHomeworkSummary({
      env: {
        FIREBASE_DB_URL: 'https://database.example.test',
        FIREBASE_PROJECT_ID: 'project-test',
        FIREBASE_WEB_API_KEY: 'web-api-key-test',
        BOOK_HOMEWORK_COMPLETION_SERVICE_IDENTITY: 'completion-override@project-test.iam.gserviceaccount.com',
        BOOK_HOMEWORK_COMPLETION_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'completion-override@project-test.iam.gserviceaccount.com',
          private_key: TEST_PRIVATE_KEY,
        }),
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@project-test.iam.gserviceaccount.com',
        BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'runtime@project-test.iam.gserviceaccount.com',
          private_key: TEST_PRIVATE_KEY,
        }),
      },
      summary,
      fetchImpl,
    });

    expect(mintedIssuer).toBe('completion-override@project-test.iam.gserviceaccount.com');

    const fragmentModules = import.meta.glob(
      '../src/upload-worker/book-rules/fragments/*.json',
      { eager: true, import: 'default' },
    ) as Record<string, unknown>;
    const sources: GeneratedBookRuleFragmentSource[] = Object.entries(fragmentModules).map(
      ([sourcePath, fragment]) => ({ sourcePath, fragment }),
    );
    const composed = composeGeneratedBookRules(sources, {
      baseRules: generatedRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
    });
    expect(
      (composed.rules as Record<string, unknown>).student_book_homework_summaries,
    ).toEqual(generatedRules.rules.student_book_homework_summaries);
    const recomposed = composeGeneratedBookRules(sources, {
      baseRules: composed.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
    });
    expect(recomposed.rules).toEqual(composed.rules);
  });
});
