import { describe, expect, it, vi } from 'vitest';
import {
  BookActivityLaunchBrowserError,
  createBookActivityLaunchBrowserClient,
} from './activityLaunch.browser';

const input = {
  bindingId: 'binding-1', bindingRevision: 4, contextId: 'course-material-1',
  activityPins: [
    { activityId: 'activity-1', activityVersionId: 'activity-1-v2' },
    { activityId: 'activity-2', activityVersionId: 'activity-2-v1' },
  ],
} as const;

const projection = (title: string) => ({
  schemaVersion: 1, title, taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] }, instructions: [], stimulus: null,
  assetRefs: [], interaction: { family: 'text-entry', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact' },
  interactions: [], scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
});
const response = (activities: unknown[], status = 200) => new Response(JSON.stringify({ activities }), {
  status, headers: { 'content-type': 'application/json' },
});

describe('Book Activity launch browser client', () => {
  it('authenticates one bounded exact batch and returns shell activities', async () => {
    const fetchImpl = vi.fn(async () => response([
      { activityId: 'activity-1', activityVersionId: 'activity-1-v2', projection: projection('One') },
      { activityId: 'activity-2', activityVersionId: 'activity-2-v1', projection: projection('Two') },
    ]));
    const client = createBookActivityLaunchBrowserClient({
      baseUrl: 'https://runtime.example', getIdToken: async () => 'token', fetchImpl,
    });
    await expect(client.readActivities(input)).resolves.toMatchObject([
      { activityId: 'activity-1', projection: { title: 'One' } },
      { activityId: 'activity-2', projection: { title: 'Two' } },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith('https://runtime.example/v1/book-runtime-launch/activities', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer token' }),
    }));
    expect(JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toEqual(input);
  });

  it('rejects a response with a missing, duplicate, or mismatched pin', async () => {
    const client = createBookActivityLaunchBrowserClient({
      baseUrl: 'https://runtime.example', getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => response([
        { activityId: 'activity-1', activityVersionId: 'wrong-version', projection: projection('One') },
        { activityId: 'activity-1', activityVersionId: 'activity-1-v2', projection: projection('Duplicate') },
      ])),
    });
    await expect(client.readBatch(input)).rejects.toMatchObject<BookActivityLaunchBrowserError>({ code: 'invalid_response' });
  });
});
