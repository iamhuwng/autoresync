import { describe, expect, it } from 'vitest';
import { readBookRuntimeCommandPayload } from '../src/upload-worker/book-runtime/command-schema.ts';

const operationId = '00000000-0000-4000-8000-000000000074';

const request = (body: unknown, headers: Record<string, string> = {}) => new Request(
  'https://worker.test/book-runtime/commands',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  },
);

const command = () => ({
  operationId,
  commandKind: 'autosave',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  clientRevision: 0,
  response: { text: 'answer draft' },
});

describe('Ticket 28A runtime command schema', () => {
  it('accepts exact runtime command shape', async () => {
    await expect(readBookRuntimeCommandPayload(request(command()))).resolves.toMatchObject({
      operationId,
      commandKind: 'autosave',
      bindingId: 'binding-1',
      response: { text: 'answer draft' },
    });
  });

  it('rejects unknown fields, unsupported kinds, unsafe ids, and oversized bodies', async () => {
    await expect(readBookRuntimeCommandPayload(request({
      ...command(),
      extra: true,
    }))).rejects.toMatchObject({ code: 'runtime_command_unknown_field' });
    await expect(readBookRuntimeCommandPayload(request({
      ...command(),
      commandKind: 'delete',
    }))).rejects.toMatchObject({ code: 'runtime_command_unsupported_kind' });
    await expect(readBookRuntimeCommandPayload(request({
      ...command(),
      bindingId: '../binding',
    }))).rejects.toMatchObject({ code: 'runtime_command_invalid_binding' });
    await expect(readBookRuntimeCommandPayload(request(command(), {
      'content-length': `${65 * 1024}`,
    }))).rejects.toMatchObject({ code: 'runtime_command_body_too_large' });
  });

  it('rejects malformed nested response data and sensitive payload names', async () => {
    const deep = { value: 'leaf' } as Record<string, unknown>;
    let cursor = deep;
    for (let index = 0; index < 9; index += 1) {
      cursor.child = {};
      cursor = cursor.child as Record<string, unknown>;
    }
    await expect(readBookRuntimeCommandPayload(request({
      ...command(),
      response: deep,
    }))).rejects.toMatchObject({ code: 'runtime_command_invalid_response' });
    await expect(readBookRuntimeCommandPayload(request({
      ...command(),
      response: { answerKey: 'not allowed' },
    }))).rejects.toMatchObject({ code: 'runtime_command_forbidden_payload' });
  });
});
