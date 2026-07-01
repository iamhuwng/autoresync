"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const repository_1 = require("./repository");
const http_1 = require("./http");
const document = {
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
const createRequest = (input = {}) => {
    var _a;
    return ({
        method: (_a = input.method) !== null && _a !== void 0 ? _a : 'POST',
        body: input.body,
        get(name) {
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
};
const createResponse = () => ({
    headers: {},
    set(name, value) {
        this.headers[name] = value;
        return this;
    },
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
    },
    send(body) {
        this.sent = body;
    },
});
const createDependencies = (overrides = {}) => {
    const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
        now: () => 1700000000000,
    });
    const calls = {
        verifiedTokens: [],
        readPaths: [],
        repositoryCreates: 0,
    };
    const dependencies = Object.assign({ verifyIdToken: async (token) => {
            calls.verifiedTokens.push(token);
            return { sub: 'teacher-1' };
        }, readDatabaseValue: async (path) => {
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
        }, createRepository: () => {
            calls.repositoryCreates += 1;
            return repo;
        }, getIdempotencySecret: () => 'test-secret', logError: () => undefined }, overrides);
    return { dependencies, repo, calls };
};
const runHandler = async (handler, request) => {
    const response = createResponse();
    await handler(request, response);
    return response;
};
(0, vitest_1.describe)('Listening authoring HTTPS handlers', () => {
    (0, vitest_1.it)('sets CORS headers and answers OPTIONS before auth or flag reads', async () => {
        const { dependencies, calls } = createDependencies();
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            method: 'OPTIONS',
            origin: 'https://teacher.example.test',
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(204);
        (0, vitest_1.expect)(response.headers).toEqual({
            'Access-Control-Allow-Origin': 'https://teacher.example.test',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            Vary: 'Origin',
        });
        (0, vitest_1.expect)(calls.verifiedTokens).toEqual([]);
        (0, vitest_1.expect)(calls.readPaths).toEqual([]);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('rejects missing bearer token before flag reads or repository creation', async () => {
        const { dependencies, calls } = createDependencies();
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(401);
        (0, vitest_1.expect)(response.body).toEqual({ message: 'Firebase ID token is required.' });
        (0, vitest_1.expect)(calls.readPaths).toEqual([]);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('requires verified token sub and does not accept uid as owner authority', async () => {
        const { dependencies, calls } = createDependencies({
            verifyIdToken: async () => ({ uid: 'teacher-1' }),
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'uid-only-token',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(401);
        (0, vitest_1.expect)(response.body).toEqual({ message: 'Firebase ID token subject is required.' });
        (0, vitest_1.expect)(calls.readPaths).toEqual([]);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('fails closed when writes-enabled flag is absent or false and never creates repository', async () => {
        const { dependencies, calls } = createDependencies({
            readDatabaseValue: async (path) => {
                calls.readPaths.push(path);
                if (path === 'users/teacher-1') {
                    return { role: 'teacher' };
                }
                return null;
            },
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(503);
        (0, vitest_1.expect)(response.body).toEqual({
            message: 'Listening authoring writes are disabled.',
            status: 'writes-disabled',
        });
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    vitest_1.it.each([
        true,
        { active: true, startedAt: 1700000000000, backupId: 'backup-1' },
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
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(503);
        (0, vitest_1.expect)(response.body).toEqual({
            message: 'Listening authoring writes are blocked during restore.',
            status: 'restore-in-progress',
        });
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('denies non-teacher profiles before flag reads or repository creation', async () => {
        const { dependencies, calls } = createDependencies({
            readDatabaseValue: async (path) => {
                calls.readPaths.push(path);
                if (path === 'users/teacher-1') {
                    return { role: 'student', status: 'active' };
                }
                throw new Error(`unexpected read ${path}`);
            },
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(403);
        (0, vitest_1.expect)(response.body).toEqual({
            message: 'Listening authoring requires a teacher or super-admin account.',
        });
        (0, vitest_1.expect)(calls.readPaths).toEqual(['users/teacher-1']);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('denies missing profile even when the token carries a teacher role', async () => {
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
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(403);
        (0, vitest_1.expect)(response.body).toEqual({
            message: 'Listening authoring requires a current user profile.',
        });
        (0, vitest_1.expect)(calls.readPaths).toEqual(['users/teacher-1']);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('denies demoted profile even when the token still carries a teacher role', async () => {
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
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(403);
        (0, vitest_1.expect)(response.body).toEqual({
            message: 'Listening authoring requires a teacher or super-admin account.',
        });
        (0, vitest_1.expect)(calls.readPaths).toEqual(['users/teacher-1']);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('denies stale roles array when primary profile role is not teacher authority', async () => {
        const { dependencies, calls } = createDependencies({
            readDatabaseValue: async (path) => {
                calls.readPaths.push(path);
                if (path === 'users/teacher-1') {
                    return { role: 'student', roles: ['teacher'], status: 'active' };
                }
                throw new Error(`unexpected read ${path}`);
            },
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(403);
        (0, vitest_1.expect)(response.body).toEqual({
            message: 'Listening authoring requires a teacher or super-admin account.',
        });
        (0, vitest_1.expect)(calls.readPaths).toEqual(['users/teacher-1']);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('denies blocked profile even when the token carries a teacher role', async () => {
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
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(403);
        (0, vitest_1.expect)(response.body).toEqual({ message: 'Listening authoring account is not active.' });
        (0, vitest_1.expect)(calls.readPaths).toEqual(['users/teacher-1']);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    vitest_1.it.each(['inactive', 'suspended'])('denies %s profile before flag reads or repository creation', async (status) => {
        const { dependencies, calls } = createDependencies({
            readDatabaseValue: async (path) => {
                calls.readPaths.push(path);
                if (path === 'users/teacher-1') {
                    return { role: 'teacher', status };
                }
                throw new Error(`unexpected read ${path}`);
            },
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(403);
        (0, vitest_1.expect)(response.body).toEqual({ message: 'Listening authoring account is not active.' });
        (0, vitest_1.expect)(calls.readPaths).toEqual(['users/teacher-1']);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('denies force-reauth profile before flag reads or repository creation', async () => {
        const { dependencies, calls } = createDependencies({
            readDatabaseValue: async (path) => {
                calls.readPaths.push(path);
                if (path === 'users/teacher-1') {
                    return { role: 'teacher', status: 'active', forceReauth: true };
                }
                throw new Error(`unexpected read ${path}`);
            },
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(403);
        (0, vitest_1.expect)(response.body).toEqual({ message: 'Listening authoring account must re-authenticate.' });
        (0, vitest_1.expect)(calls.readPaths).toEqual(['users/teacher-1']);
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('fails closed when idempotency secret is missing and never creates repository', async () => {
        const { dependencies, calls } = createDependencies({
            getIdempotencySecret: () => undefined,
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(500);
        (0, vitest_1.expect)(response.body).toEqual({
            message: 'Listening authoring idempotency secret is not configured.',
        });
        (0, vitest_1.expect)(calls.repositoryCreates).toBe(0);
    });
    (0, vitest_1.it)('does not return or log raw internal error messages', async () => {
        const logCalls = [];
        const { dependencies } = createDependencies({
            createRepository: () => {
                throw new Error('internal test-secret save-key Bearer token-1');
            },
            logError: (message, data) => {
                logCalls.push({ message, data });
            },
        });
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save-key', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(500);
        (0, vitest_1.expect)(response.body).toEqual({ message: 'Listening authoring mutation failed.' });
        (0, vitest_1.expect)(logCalls).toEqual([{
                message: 'Listening authoring mutation failed',
                data: {
                    status: 500,
                    message: 'Listening authoring mutation failed.',
                    mutation: 'save-draft',
                },
            }]);
        (0, vitest_1.expect)(JSON.stringify(response.body)).not.toContain('test-secret');
        (0, vitest_1.expect)(JSON.stringify(logCalls)).not.toContain('save-key');
        (0, vitest_1.expect)(JSON.stringify(logCalls)).not.toContain('token-1');
    });
    (0, vitest_1.it)('derives owner from verified token and rejects browser-supplied owner authority without mutation', async () => {
        const { dependencies, repo } = createDependencies();
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { ownerId: 'attacker', idempotencyKey: 'save', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(400);
        (0, vitest_1.expect)(response.body).toEqual({ message: 'ownerId is server-derived' });
        (0, vitest_1.expect)(repo.listOperationClaims()).toEqual([]);
        (0, vitest_1.expect)(repo.listVersions()).toEqual([]);
    });
    (0, vitest_1.it)('saves through trusted repository with token-derived owner and never echoes raw idempotency secret', async () => {
        const { dependencies, repo } = createDependencies();
        const handler = (0, http_1.createListeningAuthoringHttpHandler)('save-draft', dependencies);
        const response = await runHandler(handler, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save-key', document },
        }));
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        (0, vitest_1.expect)(response.body).toEqual({
            status: 'saved',
            draftId: vitest_1.expect.stringMatching(/^draft-/),
            conflictToken: 1,
            warnings: [],
            blockers: [],
        });
        const [operation] = repo.listOperationClaims();
        (0, vitest_1.expect)(operation).toEqual(vitest_1.expect.objectContaining({
            ownerId: 'teacher-1',
            operationType: 'save-draft',
            status: 'succeeded',
        }));
        (0, vitest_1.expect)(JSON.stringify(response.body)).not.toContain('test-secret');
        (0, vitest_1.expect)(JSON.stringify(operation)).not.toContain('save-key');
        (0, vitest_1.expect)(JSON.stringify(operation)).not.toContain('test-secret');
    });
    (0, vitest_1.it)('exports all three handler names with distinct mutations', async () => {
        var _a;
        const { dependencies, repo } = createDependencies();
        const handlers = (0, http_1.createListeningAuthoringHttpHandlers)(dependencies);
        const saveResponse = await runHandler(handlers.saveListeningDraft, createRequest({
            token: 'token-1',
            body: { idempotencyKey: 'save', document },
        }));
        const draftId = saveResponse.body.draftId;
        const publishResponse = await runHandler(handlers.publishListeningDraft, createRequest({
            token: 'token-1',
            body: { draftId, expectedConflictToken: 1, idempotencyKey: 'publish' },
        }));
        const lifecycleResponse = await runHandler(handlers.mutateListeningAuthoringLifecycle, createRequest({
            token: 'token-1',
            body: {
                operation: 'archive',
                targetId: publishResponse.body.versionId,
                expectedConflictToken: 1,
                idempotencyKey: 'archive',
                reasonCode: 'teacher-archive',
            },
        }));
        (0, vitest_1.expect)(saveResponse.statusCode).toBe(200);
        (0, vitest_1.expect)(publishResponse.body).toEqual(vitest_1.expect.objectContaining({ status: 'published', versionNumber: 1 }));
        (0, vitest_1.expect)(lifecycleResponse.body).toEqual(vitest_1.expect.objectContaining({ status: 'archived', versionNumber: 1 }));
        (0, vitest_1.expect)((_a = repo.listVersions()[0]) === null || _a === void 0 ? void 0 : _a.archive).toEqual(vitest_1.expect.objectContaining({
            state: 'archived',
            reasonCode: 'teacher-archive',
        }));
    });
});
//# sourceMappingURL=http.test.js.map