import { describe, expect, it, vi } from 'vitest';
import {
  createBookRuntimeLaunchWorkerHandlers,
  type BookRuntimeLaunchContext,
} from '../src/upload-worker/book-runtime-launch/worker';
import type { StudentActivityProjection } from '../../src/types/bookActivity.types';

const pins = [
  { activityId: 'activity-1', activityVersionId: 'activity-1-v1' },
  { activityId: 'activity-2', activityVersionId: 'activity-2-v3' },
] as const;
const pilotEnv = {
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1', environment: 'test', revision: 'launch-worker-pilot',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    teacherId: 'teacher-1', bookId: 'book-1', assignmentId: 'context-1',
    studentIds: ['student-1'], maxStudents: 30,
  }),
} as const;

const projection = (title: string) => ({
  schemaVersion: 1, title, taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] }, instructions: [], stimulus: null,
  assetRefs: [], interaction: { family: 'text-entry', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact' },
  interactions: [], scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
});

const request = () => new Request('https://runtime.example/v1/book-runtime-launch/activities', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ bindingId: 'binding-1', bindingRevision: 2, contextId: 'context-1', activityPins: pins }),
});

const context: BookRuntimeLaunchContext = {
  bindingId: 'binding-1', bindingRevision: 2, contextId: 'context-1', bookId: 'book-1',
  recipientId: 'student-1', activityPins: pins,
};

describe('Book Runtime launch handlers', () => {
  it('authorizes once and performs bounded exact projection reads in parallel', async () => {
    const calls: string[] = [];
    const reader = {
      readExact: vi.fn(async (input: { activityId: string; activityVersionId: string }) => {
        calls.push(input.activityId);
        return { ...input, projection: projection(input.activityId) as unknown as StudentActivityProjection };
      }),
    };
    const handlers = createBookRuntimeLaunchWorkerHandlers({
      projectionReader: reader,
      resolveContext: async ({ uid, request: input }) => ({
        ...input, bookId: 'book-1', recipientId: uid, activityPins: pins,
      }),
    });
    const result = await handlers.launch({ request: request(), env: pilotEnv, uid: 'student-1' });
    expect(result.init.status).toBe(200);
    expect(result.body).toMatchObject({ activities: [{ activityId: 'activity-1' }, { activityId: 'activity-2' }] });
    expect(reader.readExact).toHaveBeenCalledTimes(2);
    expect(calls.sort()).toEqual(['activity-1', 'activity-2']);
  });

  it('rejects context identity or projection pin mismatches', async () => {
    const reader = { readExact: vi.fn(async () => ({ projection: projection('Nope') as unknown as StudentActivityProjection })) };
    const handlers = createBookRuntimeLaunchWorkerHandlers({
      projectionReader: reader,
      resolveContext: async () => ({ ...context, bindingRevision: 99 }),
    });
    const result = await handlers.handle({ request: request(), env: pilotEnv, uid: 'student-1' });
    expect(result.init.status).toBe(403);
    expect(reader.readExact).not.toHaveBeenCalled();
  });
});
