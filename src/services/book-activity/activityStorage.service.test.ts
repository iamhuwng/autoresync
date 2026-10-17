import { describe, expect, it } from 'vitest';
import {
  ActivityAuthoringHttpError,
  createActivityAuthoringTransport,
} from './activityStorage.service';

describe('Activity authoring transport response cap', () => {
  it('caps streaming response without Content-Length before buffering full payload', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(200 * 1024));
        if (pulls === 2) controller.enqueue(new Uint8Array(64 * 1024 + 1));
      },
    });
    const transport = createActivityAuthoringTransport({
      baseUrl: 'https://worker.test', getIdToken: async () => 'token',
      fetchImpl: async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
    });
    await expect(transport.read('/book-activity-authoring/candidates/candidate-1')).rejects.toThrow('response is too large');
    expect(pulls).toBe(2);
  });

  it('preserves bounded conflict status and current revision for caller recovery', async () => {
    const transport = createActivityAuthoringTransport({
      baseUrl: 'https://worker.test', getIdToken: async () => 'token',
      fetchImpl: async () => new Response(JSON.stringify({
        status: 'conflict', currentRevision: 4, ignored: 'not-exposed',
      }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
    });
    await expect(transport.read('/book-activity-authoring/candidates/candidate-1'))
      .rejects.toMatchObject(new ActivityAuthoringHttpError(409, {
        status: 'conflict', currentRevision: 4,
      }));
  });
});
