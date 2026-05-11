"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readingV2Submit = void 0;
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const readingV2SubmitCore_1 = require("./readingV2SubmitCore");
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.database();
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
        throw Object.assign(new Error('Firebase ID token is required.'), { statusCode: 401 });
    }
    return match[1];
};
const toHttpStatus = (error) => {
    const statusCode = error === null || error === void 0 ? void 0 : error.statusCode;
    if (typeof statusCode === 'number') {
        return statusCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('missing') || message.includes('requires') || message.includes('unsupported')) {
        return 400;
    }
    if (message.includes('binding')) {
        return 409;
    }
    if (message.includes('could not load') || message.includes('not found')) {
        return 404;
    }
    return 500;
};
const readRtdbValue = async (path) => {
    const snapshot = await db.ref(path).get();
    return snapshot.exists() ? snapshot.val() : null;
};
const pushKey = (path, label) => {
    const key = db.ref(path).push().key;
    if (!key) {
        throw new Error(`Could not allocate Reading V2 ${label} id.`);
    }
    return key;
};
exports.readingV2Submit = functions.https.onRequest(async (request, response) => {
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
        const token = readBearerToken(request.get('authorization'));
        const decodedToken = await admin.auth().verifyIdToken(token);
        const submitRequest = (0, readingV2SubmitCore_1.parseReadingV2TrustedSubmissionRequest)(request.body);
        const materialId = (0, readingV2SubmitCore_1.getMaterialIdFromRequest)(submitRequest);
        const snapshotVersionId = submitRequest.sourceSnapshotVersionId;
        const sessionCode = (_a = submitRequest.context) === null || _a === void 0 ? void 0 : _a.sessionCode;
        const [snapshot, reviewProjection, metadata, studentProfile, session,] = await Promise.all([
            readRtdbValue(`reading_v2/published_snapshots/${materialId}/${snapshotVersionId}`),
            readRtdbValue(`reading_v2/projections/review/${materialId}:${snapshotVersionId}`),
            readRtdbValue(`reading_v2/material_metadata/${materialId}`),
            readRtdbValue(`users/${decodedToken.uid}`),
            sessionCode ? readRtdbValue(`game_sessions/${sessionCode}`) : Promise.resolve(null),
        ]);
        if (!snapshot) {
            throw Object.assign(new Error('Reading V2 trusted submission could not load the published snapshot.'), { statusCode: 404 });
        }
        if (!reviewProjection) {
            throw Object.assign(new Error('Reading V2 trusted submission could not load the review projection.'), { statusCode: 404 });
        }
        const now = new Date();
        const plan = (0, readingV2SubmitCore_1.buildReadingV2TrustedSubmissionPlan)({
            request: submitRequest,
            auth: {
                uid: decodedToken.uid,
                name: decodedToken.name,
                email: decodedToken.email,
            },
            records: {
                snapshot,
                reviewProjection,
                metadata,
                studentProfile,
                session,
            },
            identity: {
                resultId: pushKey('test_results', 'result'),
                attemptId: pushKey('reading_v2/attempts', 'attempt'),
                submittedAtIso: now.toISOString(),
                submittedAtMs: now.getTime(),
            },
        });
        await db.ref(plan.canonicalResultPath).set(plan.savedResult);
        await db.ref().update(plan.secondaryUpdates);
        sendJson(response, 200, plan.response);
    }
    catch (error) {
        const status = toHttpStatus(error);
        const message = error instanceof Error
            ? error.message
            : 'Trusted Reading V2 submission failed.';
        functions.logger.error('Reading V2 trusted submission failed', {
            status,
            message,
        });
        sendJson(response, status, { message });
    }
});
//# sourceMappingURL=index.js.map
