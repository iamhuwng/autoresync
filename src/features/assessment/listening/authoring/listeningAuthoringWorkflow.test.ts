import { describe, expect, it, vi } from 'vitest';

import {
  createListeningAuthoringWorkflow,
  resolveListeningAuthoringEndpoint,
} from './listeningAuthoringWorkflow';
import type { ListeningAuthoringDocumentV1 } from '../types/listeningAuthoring.types';

const document: ListeningAuthoringDocumentV1 = {
  title: 'Draft Listening Test',
  type: 'IELTS',
  skill: 'Listening',
  duration: 30,
  difficulty: 'Intermediate',
  questionCount: 0,
  isPublic: false,
  isComplete: false,
  displayMode: 'text',
  metadata: {
    description: '',
    instructions: 'Listen and answer.',
    tags: ['IELTS', 'Listening'],
  },
  audioSections: [],
  questions: [],
  settings: {
    allowPause: true,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'after-submission',
    allowReview: true,
    passingScore: 60,
    allowReplay: false,
  },
};

const jsonResponse = (status: number, body: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

describe('Listening authoring HTTPS workflow facade', () => {
  it('resolves an explicit Worker endpoint and does not derive Firebase Functions URLs', () => {
    expect(resolveListeningAuthoringEndpoint({
      VITE_LISTENING_AUTHORING_WORKER_URL: 'https://worker.example/base/',
      VITE_R2_UPLOAD_WORKER_URL: 'https://upload.example/base/',
    })).toBe('https://worker.example/base');
    expect(resolveListeningAuthoringEndpoint({})).toBe('');
  });

  it('uses the local Worker fallback only in Vite local development', () => {
    expect(resolveListeningAuthoringEndpoint({ DEV: true }, 'localhost')).toBe('http://localhost:8787');
    expect(resolveListeningAuthoringEndpoint({ DEV: true }, '127.0.0.1')).toBe('http://localhost:8787');
    expect(resolveListeningAuthoringEndpoint({ DEV: false }, 'localhost')).toBe('');
    expect(resolveListeningAuthoringEndpoint({ DEV: true }, 'teacher.example.com')).toBe('');
  });

  it('sends save draft to the trusted Worker without browser-supplied owner authority', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      status: 'saved',
      draftId: 'draft-1',
      conflictToken: 1,
      warnings: [],
      blockers: [],
    }));
    const workflow = createListeningAuthoringWorkflow({
      endpoint: 'https://worker.example',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      fetchImpl,
    });

    const result = await workflow.saveDraft({
      idempotencyKey: 'save-key-1',
      document,
      trigger: 'explicit',
    });

    expect(result).toEqual({
      status: 'saved',
      draftId: 'draft-1',
      conflictToken: 1,
      warnings: [],
      blockers: [],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/listening-authoring/save-draft',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer firebase-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'save-key-1',
        },
        body: JSON.stringify({
          idempotencyKey: 'save-key-1',
          document,
          trigger: 'explicit',
        }),
      }),
    );
    expect(fetchImpl.mock.calls[0][1].body).not.toContain('ownerId');
  });

  it('returns typed conflict bodies from non-2xx publish responses', async () => {
    const conflict = {
      status: 'conflict',
      recoverable: true,
      draftId: 'draft-1',
      expectedConflictToken: 2,
      currentConflictToken: 3,
    };
    const workflow = createListeningAuthoringWorkflow({
      endpoint: 'https://worker.example',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(409, conflict)),
    });

    await expect(workflow.publishDraft({
      draftId: 'draft-1',
      expectedConflictToken: 2,
      idempotencyKey: 'publish-key-1',
    })).resolves.toEqual(conflict);
  });

  it('emits sanitized autosave failure observability without document or URL payloads', async () => {
    const onObservabilityEvent = vi.fn();
    const workflow = createListeningAuthoringWorkflow({
      endpoint: 'https://worker.example',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(409, {
        status: 'conflict',
        recoverable: true,
        draftId: 'draft-1',
        expectedConflictToken: 1,
        currentConflictToken: 2,
      })),
      onObservabilityEvent,
    });

    await workflow.saveDraft({
      idempotencyKey: 'autosave-key-1',
      document: {
        ...document,
        audioSections: [{
          number: 1,
          name: 'Section 1',
          audioUrl: 'https://signed.example/audio.mp3',
          streamUrl: 'https://signed.example/audio.mp3',
          startQuestion: 1,
          endQuestion: 10,
        }],
      },
      draftId: 'draft-1',
      expectedConflictToken: 1,
      trigger: 'autosave',
    });

    expect(onObservabilityEvent).toHaveBeenCalledWith('listeningAutosaveFailure', expect.objectContaining({
      source: 'listening_authoring_workflow',
      draftId: 'draft-1',
      status: 'conflict',
      recoverable: true,
    }));
    expect(JSON.stringify(onObservabilityEvent.mock.calls)).not.toContain('https://signed.example/audio.mp3');
    expect(JSON.stringify(onObservabilityEvent.mock.calls)).not.toContain('audioSections');
  });

  it('emits revision, legacy, archive, and restore observability with ID-only metadata', async () => {
    const onObservabilityEvent = vi.fn();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        status: 'published',
        draftId: 'draft-1',
        versionId: 'version-2',
        versionNumber: 2,
        conflictToken: 3,
        warnings: [],
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: 'published',
        draftId: 'revision-draft-legacy',
        versionId: 'legacy-version-1',
        versionNumber: 1,
        conflictToken: 1,
        warnings: [],
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: 'archived',
        versionId: 'version-2',
        versionNumber: 2,
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        status: 'restored',
        draftId: 'draft-1',
        conflictToken: 4,
      }));
    const workflow = createListeningAuthoringWorkflow({
      endpoint: 'https://worker.example',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      fetchImpl,
      onObservabilityEvent,
    });

    await workflow.publishDraft({
      draftId: 'draft-1',
      expectedConflictToken: 2,
      idempotencyKey: 'publish-revision-key',
    });
    await workflow.publishDraft({
      legacyTestId: 'legacy-test-1',
      idempotencyKey: 'legacy-key',
    });
    await workflow.archivePublishedVersion({
      versionId: 'version-2',
      expectedConflictToken: 3,
      idempotencyKey: 'archive-key',
    });
    await workflow.restoreDraft({
      draftId: 'draft-1',
      expectedConflictToken: 3,
      idempotencyKey: 'restore-key',
    });

    expect(onObservabilityEvent).toHaveBeenCalledWith('listeningRevisionCreated', expect.objectContaining({
      source: 'listening_authoring_workflow',
      draftId: 'draft-1',
      versionId: 'version-2',
      versionNumber: 2,
    }));
    expect(onObservabilityEvent).toHaveBeenCalledWith('listeningLegacyTransition', expect.objectContaining({
      source: 'listening_authoring_workflow',
      legacyTestId: 'legacy-test-1',
      status: 'published',
      versionId: 'legacy-version-1',
    }));
    expect(onObservabilityEvent).toHaveBeenCalledWith('archiveListeningPublishedVersion', expect.objectContaining({
      source: 'listening_authoring_workflow',
      versionId: 'version-2',
      versionNumber: 2,
      outcome: 'archived',
    }));
    expect(onObservabilityEvent).toHaveBeenCalledWith('restoreListeningDraft', expect.objectContaining({
      source: 'listening_authoring_workflow',
      draftId: 'draft-1',
      conflictToken: 4,
      outcome: 'restored',
    }));
    expect(JSON.stringify(onObservabilityEvent.mock.calls)).not.toContain('audioUrl');
    expect(JSON.stringify(onObservabilityEvent.mock.calls)).not.toContain('streamUrl');
  });

  it('routes lifecycle mutations through the single trusted lifecycle handler', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      status: 'archived',
      versionId: 'version-1',
      versionNumber: 1,
    }));
    const workflow = createListeningAuthoringWorkflow({
      endpoint: 'https://worker.example',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      fetchImpl,
    });

    await workflow.mutateLifecycle({
      operation: 'archive',
      targetId: 'version-1',
      expectedConflictToken: 1,
      idempotencyKey: 'archive-key-1',
      reasonCode: 'teacher-archive',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/listening-authoring/lifecycle',
      expect.objectContaining({
        body: JSON.stringify({
          operation: 'archive',
          targetId: 'version-1',
          expectedConflictToken: 1,
          idempotencyKey: 'archive-key-1',
          reasonCode: 'teacher-archive',
        }),
      }),
    );
  });

  it('requires lifecycle helpers to forward conflict tokens expected by the backend', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      status: 'archived',
      versionId: 'version-1',
      versionNumber: 2,
    }));
    const workflow = createListeningAuthoringWorkflow({
      endpoint: 'https://worker.example',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      fetchImpl,
    });

    await workflow.archivePublishedVersion({
      versionId: 'version-1',
      expectedConflictToken: 2,
      idempotencyKey: 'archive-key-2',
    });
    await workflow.discardDraft({
      draftId: 'draft-1',
      expectedConflictToken: 5,
      idempotencyKey: 'discard-key-1',
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toEqual({
      operation: 'archive',
      targetId: 'version-1',
      expectedConflictToken: 2,
      idempotencyKey: 'archive-key-2',
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body as string)).toEqual({
      operation: 'discard',
      targetId: 'draft-1',
      expectedConflictToken: 5,
      idempotencyKey: 'discard-key-1',
    });
  });

  it('rejects operational HTTP failures instead of treating them as typed save results', async () => {
    const workflow = createListeningAuthoringWorkflow({
      endpoint: 'https://worker.example',
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(503, {
        status: 'writes-disabled',
        message: 'Listening authoring writes are disabled.',
      })),
    });

    await expect(workflow.saveDraft({
      idempotencyKey: 'save-key-disabled',
      document,
      trigger: 'explicit',
    })).rejects.toThrow('Listening authoring writes are disabled.');
  });
});
