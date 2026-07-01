import { describe, expect, it } from 'vitest';

import type { ListeningAuthoringDocumentV1 } from './contracts';
import { createInMemoryListeningAuthoringRepository } from './repository';
import {
  createListeningAuthoringHttpHandler,
  createListeningAuthoringHttpHandlers,
  type ListeningAuthoringHttpDependencies,
} from './http';

const document: ListeningAuthoringDocumentV1 = {
  title: 'HTTP draft',
  type: 'IELTS',
  skill: 'Listening',
  duration: 1200,
  difficulty: 'Intermediate',
  questionCount: 1,
  isPublic: false,
  isComplete: true,
  displayMode: 'text',
  metadata: {
    description: 'HTTP contract',
    instructions: 'Answer every question.',
    tags: [],
  },
  audioSections: [{
    number: 1,
    name: 'Section 1',
    assetId: 'asset-1',
    audioUrl: 'r2://asset-1',
    startQuestion: 1,
    endQuestion: 1,
  }],
  questions: [{
    number: 1,
    type: 'short-answer',
    question: 'Question 1',
    answer: 'A',
    sectionNumber: 1,
    points: 1,
  }],
  settings: {
    allowPause: true,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'after-submission',
    allowReview: true,
    passingScore: 60,
    allowReplay: true,
  },
};

interface MockRequest {
  method: string;
  body?: unknown;
  get(name: string): string | undefined;
}

interface MockResponse {
  headers: Record<string, string>;
  statusCode?: number;
  body?: unknown;
  sent?: unknown;
  set(name: string, value: string): MockResponse;
  status(code: number): MockResponse;
  json(body: unknown): void;
  send(body: unknown): void;
}

const createRequest = (input: {
  method?: string;
  token?: string;
  body?: unknown;
  origin?: string;
} = {}): MockRequest => ({
  method: input.method ?? 'POST',
  body: input.body,
  get(name: string): string | undefined {
    const key = name.toLowerCase();
    if (key === 'authorization' && input.token) {
      return `Bearer ${input.token}`;
    }
    if (key === 'origin') {
      return input.origin;
    }
    return undefined;
  },
});

const createResponse = (): MockResponse => ({
  headers: {},
  set(name: string, value: string): MockResponse {
    this.headers[name] = value;
    return this;
  },
  status(code: number): MockResponse {
    this.statusCode = code;
    return this;
  },
  json(body: unknown): void {
    this.body = body;
  },
  send(body: unknown): void {
    this.sent = body;
  },
});

const createDependencies = (overrides: Partial<ListeningAuthoringHttpDependencies> = {}) => {
  const repo = createInMemoryListeningAuthoringRepository({
    now: () => 1_700_000_000_000,
  });
  const calls = {
    verifiedTokens: [] as string[],
    readPaths: [] as string[],
    repositoryCreates: 0,
  };
  const dependencies: ListeningAuthoringHttpDependencies = {
    verifyIdToken: async (token) => {
      calls.verifiedTokens.push(token);
      return { sub: 'teacher-1' };
    },
    readDatabaseValue: async (path) => {
      calls.readPaths.push(path);
      if (path === 'system_flags/listening_authoring_writes_enabled') {
        return true;
      }
      if (path === 'system_flags/restore_in_progress') {
        return false;
      }
      if (path === 'users/teacher-1') {
        return { role: 'teacher' };
      }
      return null;
    },
    createRepository: () => {
      calls.repositoryCreates += 1;
      return repo;
    },
    getIdempotencySecret: () => 'test-secret',
    logError: () => undefined,
    ...overrides,
  };

  return { dependencies, repo, calls };
};

const runHandler = async (
  handler: ReturnType<typeof createListeningAuthoringHttpHandler>,
  request: MockRequest,
): Promise<MockResponse> => {
  const response = createResponse();
  await handler(request, response);
  return response;
};

describe('Listening authoring HTTPS handlers', () => {
  it('sets CORS headers and answers OPTIONS before auth or flag reads', async () => {
    const { dependencies, calls } = createDependencies();
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      method: 'OPTIONS',
      origin: 'https://teacher.example.test',
    }));

    expect(response.statusCode).toBe(204);
    expect(response.headers).toEqual({
      'Access-Control-Allow-Origin': 'https://teacher.example.test',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      Vary: 'Origin',
    });
    expect(calls.verifiedTokens).toEqual([]);
    expect(calls.readPaths).toEqual([]);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('rejects missing bearer token before flag reads or repository creation', async () => {
    const { dependencies, calls } = createDependencies();
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ message: 'Firebase ID token is required.' });
    expect(calls.readPaths).toEqual([]);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('requires verified token sub and does not accept uid as owner authority', async () => {
    const { dependencies, calls } = createDependencies({
      verifyIdToken: async () => ({ uid: 'teacher-1' }),
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'uid-only-token',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ message: 'Firebase ID token subject is required.' });
    expect(calls.readPaths).toEqual([]);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('fails closed when writes-enabled flag is absent or false and never creates repository', async () => {
    const { dependencies, calls } = createDependencies({
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'users/teacher-1') {
          return { role: 'teacher' };
        }
        return null;
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      message: 'Listening authoring writes are disabled.',
      status: 'writes-disabled',
    });
    expect(calls.repositoryCreates).toBe(0);
  });

  it.each([
    true,
    { active: true, startedAt: 1_700_000_000_000, backupId: 'backup-1' },
  ])('fails closed for restore flag %j and never creates repository', async (restoreFlag) => {
    const { dependencies, calls } = createDependencies({
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'system_flags/listening_authoring_writes_enabled') {
          return true;
        }
        if (path === 'system_flags/restore_in_progress') {
          return restoreFlag;
        }
        if (path === 'users/teacher-1') {
          return { role: 'teacher' };
        }
        return null;
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      message: 'Listening authoring writes are blocked during restore.',
      status: 'restore-in-progress',
    });
    expect(calls.repositoryCreates).toBe(0);
  });

  it('denies non-teacher profiles before flag reads or repository creation', async () => {
    const { dependencies, calls } = createDependencies({
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'users/teacher-1') {
          return { role: 'student', status: 'active' };
        }
        throw new Error(`unexpected read ${path}`);
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      message: 'Listening authoring requires a teacher or super-admin account.',
    });
    expect(calls.readPaths).toEqual(['users/teacher-1']);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('denies missing profile even when the token carries a teacher role', async () => {
    const { dependencies, calls } = createDependencies({
      verifyIdToken: async (token) => {
        calls.verifiedTokens.push(token);
        return { sub: 'teacher-1', role: 'teacher' };
      },
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'users/teacher-1') {
          return null;
        }
        throw new Error(`unexpected read ${path}`);
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      message: 'Listening authoring requires a current user profile.',
    });
    expect(calls.readPaths).toEqual(['users/teacher-1']);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('denies demoted profile even when the token still carries a teacher role', async () => {
    const { dependencies, calls } = createDependencies({
      verifyIdToken: async (token) => {
        calls.verifiedTokens.push(token);
        return { sub: 'teacher-1', role: 'teacher' };
      },
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'users/teacher-1') {
          return { role: 'student', status: 'active' };
        }
        throw new Error(`unexpected read ${path}`);
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      message: 'Listening authoring requires a teacher or super-admin account.',
    });
    expect(calls.readPaths).toEqual(['users/teacher-1']);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('denies stale roles array when primary profile role is not teacher authority', async () => {
    const { dependencies, calls } = createDependencies({
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'users/teacher-1') {
          return { role: 'student', roles: ['teacher'], status: 'active' };
        }
        throw new Error(`unexpected read ${path}`);
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      message: 'Listening authoring requires a teacher or super-admin account.',
    });
    expect(calls.readPaths).toEqual(['users/teacher-1']);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('denies blocked profile even when the token carries a teacher role', async () => {
    const { dependencies, calls } = createDependencies({
      verifyIdToken: async (token) => {
        calls.verifiedTokens.push(token);
        return { sub: 'teacher-1', role: 'teacher' };
      },
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'users/teacher-1') {
          return { role: 'teacher', status: 'blocked' };
        }
        throw new Error(`unexpected read ${path}`);
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: 'Listening authoring account is not active.' });
    expect(calls.readPaths).toEqual(['users/teacher-1']);
    expect(calls.repositoryCreates).toBe(0);
  });

  it.each(['inactive', 'suspended'])(
    'denies %s profile before flag reads or repository creation',
    async (status) => {
      const { dependencies, calls } = createDependencies({
        readDatabaseValue: async (path) => {
          calls.readPaths.push(path);
          if (path === 'users/teacher-1') {
            return { role: 'teacher', status };
          }
          throw new Error(`unexpected read ${path}`);
        },
      });
      const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

      const response = await runHandler(handler, createRequest({
        token: 'token-1',
        body: { idempotencyKey: 'save', document },
      }));

      expect(response.statusCode).toBe(403);
      expect(response.body).toEqual({ message: 'Listening authoring account is not active.' });
      expect(calls.readPaths).toEqual(['users/teacher-1']);
      expect(calls.repositoryCreates).toBe(0);
    },
  );

  it('denies force-reauth profile before flag reads or repository creation', async () => {
    const { dependencies, calls } = createDependencies({
      readDatabaseValue: async (path) => {
        calls.readPaths.push(path);
        if (path === 'users/teacher-1') {
          return { role: 'teacher', status: 'active', forceReauth: true };
        }
        throw new Error(`unexpected read ${path}`);
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: 'Listening authoring account must re-authenticate.' });
    expect(calls.readPaths).toEqual(['users/teacher-1']);
    expect(calls.repositoryCreates).toBe(0);
  });

  it('fails closed when idempotency secret is missing and never creates repository', async () => {
    const { dependencies, calls } = createDependencies({
      getIdempotencySecret: () => undefined,
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      message: 'Listening authoring idempotency secret is not configured.',
    });
    expect(calls.repositoryCreates).toBe(0);
  });

  it('does not return or log raw internal error messages', async () => {
    const logCalls: Array<{ message: string; data?: Record<string, unknown> }> = [];
    const { dependencies } = createDependencies({
      createRepository: () => {
        throw new Error('internal test-secret save-key Bearer token-1');
      },
      logError: (message, data) => {
        logCalls.push({ message, data });
      },
    });
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save-key', document },
    }));

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ message: 'Listening authoring mutation failed.' });
    expect(logCalls).toEqual([{
      message: 'Listening authoring mutation failed',
      data: {
        status: 500,
        message: 'Listening authoring mutation failed.',
        mutation: 'save-draft',
      },
    }]);
    expect(JSON.stringify(response.body)).not.toContain('test-secret');
    expect(JSON.stringify(logCalls)).not.toContain('save-key');
    expect(JSON.stringify(logCalls)).not.toContain('token-1');
  });

  it('derives owner from verified token and rejects browser-supplied owner authority without mutation', async () => {
    const { dependencies, repo } = createDependencies();
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { ownerId: 'attacker', idempotencyKey: 'save', document },
    }));

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ message: 'ownerId is server-derived' });
    expect(repo.listOperationClaims()).toEqual([]);
    expect(repo.listVersions()).toEqual([]);
  });

  it('saves through trusted repository with token-derived owner and never echoes raw idempotency secret', async () => {
    const { dependencies, repo } = createDependencies();
    const handler = createListeningAuthoringHttpHandler('save-draft', dependencies);

    const response = await runHandler(handler, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save-key', document },
    }));

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: 'saved',
      draftId: expect.stringMatching(/^draft-/),
      conflictToken: 1,
      warnings: [],
      blockers: [],
    });
    const [operation] = repo.listOperationClaims();
    expect(operation).toEqual(expect.objectContaining({
      ownerId: 'teacher-1',
      operationType: 'save-draft',
      status: 'succeeded',
    }));
    expect(JSON.stringify(response.body)).not.toContain('test-secret');
    expect(JSON.stringify(operation)).not.toContain('save-key');
    expect(JSON.stringify(operation)).not.toContain('test-secret');
  });

  it('exports all three handler names with distinct mutations', async () => {
    const { dependencies, repo } = createDependencies();
    const handlers = createListeningAuthoringHttpHandlers(dependencies);

    const saveResponse = await runHandler(handlers.saveListeningDraft, createRequest({
      token: 'token-1',
      body: { idempotencyKey: 'save', document },
    }));
    const draftId = (saveResponse.body as { draftId: string }).draftId;

    const publishResponse = await runHandler(handlers.publishListeningDraft, createRequest({
      token: 'token-1',
      body: { draftId, expectedConflictToken: 1, idempotencyKey: 'publish' },
    }));
    const lifecycleResponse = await runHandler(handlers.mutateListeningAuthoringLifecycle, createRequest({
      token: 'token-1',
      body: {
        operation: 'archive',
        targetId: (publishResponse.body as { versionId: string }).versionId,
        expectedConflictToken: 1,
        idempotencyKey: 'archive',
        reasonCode: 'teacher-archive',
      },
    }));

    expect(saveResponse.statusCode).toBe(200);
    expect(publishResponse.body).toEqual(expect.objectContaining({ status: 'published', versionNumber: 1 }));
    expect(lifecycleResponse.body).toEqual(expect.objectContaining({ status: 'archived', versionNumber: 1 }));
    expect(repo.listVersions()[0]?.archive).toEqual(expect.objectContaining({
      state: 'archived',
      reasonCode: 'teacher-archive',
    }));
  });
});
