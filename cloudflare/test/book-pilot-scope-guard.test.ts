import { describe, expect, it, vi } from 'vitest';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../src/book-pilot-scope.ts';
import { createBookActivityAuthoringWorkerHandlers } from '../src/upload-worker/book-activity-authoring/worker.ts';
import { createBookRuntimeLaunchWorkerHandlers } from '../src/upload-worker/book-runtime-launch/worker.ts';
import { createBookRolloutWorkerGate } from '../src/book-rollout-gate.ts';

const request = new Request('https://worker.test/v1/book/books/book-1', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bookId: 'book-1' }),
});

const scopeConfig = JSON.stringify({
  schemaVersion: 'v1',
  environment: 'test',
  revision: 'guard-test-1',
  issuedAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  teacherId: 'teacher-1',
  bookId: 'book-1',
  assignmentId: 'assignment-1',
  studentIds: ['student-1'],
  maxStudents: 30,
});

const environment = (overrides: Record<string, unknown> = {}) => ({
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_CONFIG_JSON: scopeConfig,
  BOOK_PILOT_SCOPE_AUDIT: vi.fn(),
  ...overrides,
});
const allowActivityRolloutGate = createBookRolloutWorkerGate({
  BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1', environment: 'test', revision: 'guard-rollout-1',
    issuedAt: '2026-08-11T23:00:00.000Z', expiresAt: '2026-08-12T23:00:00.000Z',
    actions: {
      create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny',
      'launch-delivery': 'deny', mutation: 'allow',
    },
  }),
  BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test',
}, { clock: () => new Date('2026-08-12T12:00:00.000Z'), audit: () => undefined });

describe('mandatory #126 pilot scope guard', () => {
  it('denies missing, disabled, and malformed enforcement before a direct handler can run', async () => {
    const handler = vi.fn();
    const invoke = async (env: Record<string, unknown>) => {
      try {
        await enforceBookPilotScopeIfConfigured({
          env,
          uid: 'teacher-1',
          request,
          operation: 'mutation',
          actorKind: 'teacher',
          bookId: 'book-1',
          requireBook: true,
        });
        handler();
        return 'handler_called';
      } catch (error) {
        if (error instanceof BookPilotScopeDeniedError) return error.decision.reason;
        throw error;
      }
    };
    const missingFlag = environment();
    Reflect.deleteProperty(missingFlag, 'BOOK_PILOT_SCOPE_ENFORCEMENT');

    expect(await invoke(missingFlag)).toBe('enforcement_disabled');
    const disabledAudit = vi.fn();
    expect(await invoke(environment({
      BOOK_PILOT_SCOPE_ENFORCEMENT: 'disabled',
      BOOK_PILOT_SCOPE_AUDIT: disabledAudit,
    }))).toBe('enforcement_disabled');
    expect(disabledAudit).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'denied',
      reason: 'enforcement_disabled',
    }));
    expect(await invoke(environment({
      BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
      BOOK_PILOT_SCOPE_CONFIG_JSON: '{ malformed',
    }))).toBe('invalid_config');
    expect(handler).not.toHaveBeenCalled();
  });

  it('requires a trusted exact Book and keeps unbound authoring side-effect free', async () => {
    const trustedHandler = vi.fn();
    await expect(enforceBookPilotScopeIfConfigured({
      env: environment({ BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled' }),
      uid: 'teacher-1',
      request,
      operation: 'mutation',
      actorKind: 'teacher',
      bookId: 'book-1',
      requireBook: true,
    })).resolves.toBeUndefined();
    trustedHandler();
    expect(trustedHandler).toHaveBeenCalledOnce();
    await expect(enforceBookPilotScopeIfConfigured({
      env: environment({ BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled' }),
      uid: 'teacher-1',
      request,
      operation: 'mutation',
      actorKind: 'teacher',
      bookId: 'book-2',
      requireBook: true,
    })).rejects.toMatchObject({ decision: { reason: 'book_denied' } });
    await expect(enforceBookPilotScopeIfConfigured({
      env: environment({ BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled' }),
      uid: 'teacher-1',
      request,
      operation: 'mutation',
      actorKind: 'teacher',
      requireBook: true,
    })).rejects.toMatchObject({ decision: { reason: 'subject_missing' } });

    const transaction = vi.fn(async () => ({ status: 'saved' }));
    const handlers = createBookActivityAuthoringWorkerHandlers({
      repository: {
        readValue: async () => ({ role: 'teacher' }),
        readOwnerRoot: async () => ({}),
        transaction,
      },
      rolloutGate: allowActivityRolloutGate,
    });
    for (const body of [{ bookId: 'book-1' }, { bookId: 'book-2' }, {}]) {
      const response = await handlers.stage({
        request: new Request('https://worker.test/book-activity-authoring/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        env: environment({ BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled' }),
        uid: 'teacher-1',
      });
      expect(response).toMatchObject({ init: { status: 503 }, body: { decision: { reason: 'subject_missing' } } });
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it('checks the server-resolved launch Book before projection reads', async () => {
    const projectionReads = vi.fn(async () => ({
      activityId: 'activity-1',
      activityVersionId: 'version-1',
      projection: {
        schemaVersion: 1,
        title: 'Practice',
        taskProfile: null,
        presentationMode: 'structured',
        contextRequirement: { mode: 'none', acceptedKinds: [] },
        instructions: [],
        stimulus: null,
        assetRefs: [],
        interaction: { family: 'text-entry', variant: 'generic' },
        interactions: [],
        answerRule: { defaultPoints: 1, normalization: 'exact' },
        scoring: { mode: 'auto-where-possible' },
      },
    }));
    const context = (bookId: unknown) => ({
      bindingId: 'binding-1',
      bindingRevision: 1,
      contextId: 'assignment-1',
      bookId,
      recipientId: 'student-1',
      activityPins: [{ activityId: 'activity-1', activityVersionId: 'version-1' }],
    });
    const launch = createBookRuntimeLaunchWorkerHandlers({
      resolveContext: async () => context('book-1') as never,
      projectionReader: { readExact: projectionReads },
    });
    const launchRequest = () => new Request('https://worker.test/book-runtime-launch/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bindingId: 'binding-1', bindingRevision: 1, contextId: 'assignment-1',
        activityPins: [{ activityId: 'activity-1', activityVersionId: 'version-1' }],
      }),
    });
    await expect(launch.launch({
      request: launchRequest(),
      env: environment({ BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled' }),
      uid: 'student-1',
    })).resolves.toMatchObject({ init: { status: 200 } });
    expect(projectionReads).toHaveBeenCalledOnce();

    for (const bookId of ['book-2', undefined]) {
      projectionReads.mockClear();
      const denied = createBookRuntimeLaunchWorkerHandlers({
        resolveContext: async () => context(bookId) as never,
        projectionReader: { readExact: projectionReads },
      });
      const response = await denied.launch({
        request: launchRequest(),
        env: environment({ BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled' }),
        uid: 'student-1',
      });
      expect(response.init.status).toBe(bookId === undefined ? 503 : 403);
      expect(projectionReads).not.toHaveBeenCalled();
    }
  });
});
