"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createListeningAuthoringHttpHandlers = exports.createListeningAuthoringHttpHandler = void 0;
const constants_1 = require("./constants");
const service_1 = require("./service");
const createHttpError = (statusCode, message, extraBody = {}) => Object.assign(new Error(message), {
    statusCode,
    responseBody: Object.assign({ message }, extraBody),
});
const setCorsHeaders = (response, origin) => {
    response.set('Access-Control-Allow-Origin', origin || '*');
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.set('Vary', 'Origin');
};
const sendJson = (response, status, body) => {
    response.status(status).json(body);
};
const readBearerToken = (header) => {
    const match = /^Bearer\s+(.+)$/i.exec(header !== null && header !== void 0 ? header : '');
    if (!(match === null || match === void 0 ? void 0 : match[1])) {
        throw createHttpError(401, 'Firebase ID token is required.');
    }
    return match[1];
};
const readString = (value) => typeof value === 'string' && value.trim().length > 0 ? value : undefined;
const tokenUid = (token) => {
    const uid = readString(token.sub);
    if (!uid) {
        throw createHttpError(401, 'Firebase ID token subject is required.');
    }
    return uid;
};
const readAllowedRole = (value) => {
    if (value === 'super_admin') {
        return 'super_admin';
    }
    if (value === 'teacher') {
        return 'teacher';
    }
    return null;
};
const profileRecord = (profile) => profile !== null && typeof profile === 'object' && !Array.isArray(profile)
    ? profile
    : null;
const assertProfileCanMutate = (profile) => {
    const record = profileRecord(profile);
    if (record === null) {
        return;
    }
    if (record.forceReauth === true) {
        throw createHttpError(403, 'Listening authoring account must re-authenticate.');
    }
    if (record.status === 'blocked' ||
        record.status === 'inactive' ||
        record.status === 'suspended') {
        throw createHttpError(403, 'Listening authoring account is not active.');
    }
};
const roleFromProfile = (profile) => {
    const record = profileRecord(profile);
    if (record === null) {
        return null;
    }
    const primary = readAllowedRole(record.role);
    if (primary !== null) {
        return primary;
    }
    return null;
};
const resolveAuthContext = async (verifiedToken, dependencies) => {
    const uid = tokenUid(verifiedToken);
    const profile = await dependencies.readDatabaseValue(`users/${uid}`);
    if (profileRecord(profile) === null) {
        throw createHttpError(403, 'Listening authoring requires a current user profile.');
    }
    assertProfileCanMutate(profile);
    const profileRole = roleFromProfile(profile);
    if (profileRole !== null) {
        return { uid, role: profileRole };
    }
    throw createHttpError(403, 'Listening authoring requires a teacher or super-admin account.');
};
const assertWritesAllowed = async (dependencies) => {
    const writesEnabled = await dependencies.readDatabaseValue(constants_1.LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH);
    if (writesEnabled !== true) {
        throw createHttpError(503, 'Listening authoring writes are disabled.', {
            status: 'writes-disabled',
        });
    }
    const restoreInProgress = await dependencies.readDatabaseValue(constants_1.LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH);
    const restoreIsActive = restoreInProgress === true || (typeof restoreInProgress === 'object'
        && restoreInProgress !== null
        && 'active' in restoreInProgress
        && restoreInProgress.active === true);
    if (restoreIsActive) {
        throw createHttpError(503, 'Listening authoring writes are blocked during restore.', {
            status: 'restore-in-progress',
        });
    }
};
const statusForResult = (result) => {
    switch (result.status) {
        case 'conflict':
        case 'idempotency-conflict':
            return 409;
        case 'not-found':
            return 404;
        case 'blocked':
        case 'invalid-state':
            return 422;
        default:
            return 200;
    }
};
const statusForThrown = (error) => {
    const statusCode = error === null || error === void 0 ? void 0 : error.statusCode;
    if (typeof statusCode === 'number') {
        return statusCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('required') ||
        message.includes('unsupported') ||
        message.includes('unknown') ||
        message.includes('server-derived') ||
        message.includes('must be')) {
        return 400;
    }
    return 500;
};
const bodyForThrown = (error, status) => {
    const responseBody = error === null || error === void 0 ? void 0 : error.responseBody;
    if (responseBody !== null &&
        typeof responseBody === 'object' &&
        !Array.isArray(responseBody)) {
        return responseBody;
    }
    if (status >= 500) {
        return { message: 'Listening authoring mutation failed.' };
    }
    return {
        message: error instanceof Error
            ? error.message
            : 'Listening authoring mutation failed.',
    };
};
const runMutation = async (mutation, auth, body, repo, idempotencySecret) => {
    switch (mutation) {
        case 'save-draft':
            return (0, service_1.saveListeningDraftCore)({ auth, body, repo, idempotencySecret });
        case 'publish':
            return (0, service_1.publishListeningDraftCore)({ auth, body, repo, idempotencySecret });
        case 'lifecycle':
            return (0, service_1.mutateListeningAuthoringLifecycleCore)({ auth, body, repo, idempotencySecret });
    }
};
const createListeningAuthoringHttpHandler = (mutation, dependencies) => async (request, response) => {
    var _a;
    setCorsHeaders(response, request.get('origin'));
    if (request.method === 'OPTIONS') {
        response.status(204).send('');
        return;
    }
    if (request.method !== 'POST') {
        sendJson(response, 405, { message: 'Method not allowed.' });
        return;
    }
    try {
        const verifiedToken = await dependencies.verifyIdToken(readBearerToken(request.get('authorization')));
        const auth = await resolveAuthContext(verifiedToken, dependencies);
        await assertWritesAllowed(dependencies);
        const idempotencySecret = dependencies.getIdempotencySecret();
        if (!idempotencySecret) {
            throw createHttpError(500, 'Listening authoring idempotency secret is not configured.');
        }
        const result = await runMutation(mutation, auth, request.body, dependencies.createRepository(), idempotencySecret);
        sendJson(response, statusForResult(result), result);
    }
    catch (error) {
        const status = statusForThrown(error);
        const responseBody = bodyForThrown(error, status);
        dependencies.logError('Listening authoring mutation failed', {
            status,
            message: (_a = readString(responseBody.message)) !== null && _a !== void 0 ? _a : 'Listening authoring mutation failed.',
            mutation,
        });
        sendJson(response, status, responseBody);
    }
};
exports.createListeningAuthoringHttpHandler = createListeningAuthoringHttpHandler;
const createListeningAuthoringHttpHandlers = (dependencies) => ({
    saveListeningDraft: (0, exports.createListeningAuthoringHttpHandler)('save-draft', dependencies),
    publishListeningDraft: (0, exports.createListeningAuthoringHttpHandler)('publish', dependencies),
    mutateListeningAuthoringLifecycle: (0, exports.createListeningAuthoringHttpHandler)('lifecycle', dependencies),
});
exports.createListeningAuthoringHttpHandlers = createListeningAuthoringHttpHandlers;
//# sourceMappingURL=http.js.map