"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readingV2Submit = void 0;
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const readingV2SubmitCore_1 = require("./readingV2SubmitCore");
// Deprecated wrapper only. Reading V2 production submit uses the Cloudflare
// Worker route; Cloud Functions are off-limit for new Reading V2 work.
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.database();
const fs = admin.firestore();
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
const readFirestoreDoc = async (path) => {
    const snapshot = await fs.doc(path).get();
    return snapshot.exists ? snapshot.data() : null;
};
const isReadingPassageSetSubmit = (request, materialId) => {
    var _a;
    return ((_a = request.context) === null || _a === void 0 ? void 0 : _a.surface) === 'homework' &&
        materialId.startsWith('reading-passage-set:');
};
const loadReadingPassageSetRecords = async (input) => {
    var _a, _b, _c, _d;
    const homeworkId = (_a = input.request.context) === null || _a === void 0 ? void 0 : _a.homeworkId;
    if (!homeworkId) {
        throw Object.assign(new Error('Reading Passage set trusted submission requires homeworkId.'), { statusCode: 400 });
    }
    const homework = await readFirestoreDoc(`homework_assignments/${homeworkId}`);
    if (!homework) {
        throw Object.assign(new Error('Reading Passage set trusted submission could not load homework assignment.'), { statusCode: 404 });
    }
    if (homework.materialType !== 'reading-passage-set' ||
        homework.materialId !== input.materialId ||
        input.snapshotVersionId !== `homework-set:${(_b = homework.id) !== null && _b !== void 0 ? _b : homeworkId}`) {
        throw Object.assign(new Error('Reading Passage set trusted submission does not match the assigned homework.'), { statusCode: 409 });
    }
    const items = Array.isArray((_c = homework.readingPassageSet) === null || _c === void 0 ? void 0 : _c.items)
        ? [...homework.readingPassageSet.items].sort((left, right) => Number(left.order) - Number(right.order))
        : [];
    if (items.length === 0) {
        throw Object.assign(new Error('Reading Passage set trusted submission has no assigned passages.'), { statusCode: 400 });
    }
    const passageRecords = await Promise.all(items.map(async (item) => {
        const [snapshot, reviewProjection, metadata] = await Promise.all([
            readRtdbValue(`reading_v2/published_snapshots/${item.passageMaterialId}/${item.snapshotVersionId}`),
            readRtdbValue(`reading_v2/projections/review/${item.passageMaterialId}:${item.snapshotVersionId}`),
            readRtdbValue(`reading_v2/material_metadata/${item.passageMaterialId}`),
        ]);
        if (!snapshot || !reviewProjection) {
            throw Object.assign(new Error('Reading Passage set trusted submission could not load an assigned passage snapshot.'), { statusCode: 404 });
        }
        return {
            item,
            snapshot,
            reviewProjection,
            metadata,
        };
    }));
    return (0, readingV2SubmitCore_1.composeReadingPassageSetTrustedRecords)({
        homework: Object.assign(Object.assign({}, homework), { id: (_d = homework.id) !== null && _d !== void 0 ? _d : homeworkId }),
        passageRecords,
        generatedAt: input.generatedAt,
    });
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
        const now = new Date();
        const trustedRecordsPromise = isReadingPassageSetSubmit(submitRequest, materialId)
            ? loadReadingPassageSetRecords({
                request: submitRequest,
                materialId,
                snapshotVersionId,
                generatedAt: now.toISOString(),
            })
            : Promise.all([
                readRtdbValue(`reading_v2/published_snapshots/${materialId}/${snapshotVersionId}`),
                readRtdbValue(`reading_v2/projections/review/${materialId}:${snapshotVersionId}`),
                readRtdbValue(`reading_v2/material_metadata/${materialId}`),
            ]).then(([snapshot, reviewProjection, metadata]) => ({
                snapshot: snapshot !== null && snapshot !== void 0 ? snapshot : {},
                reviewProjection: reviewProjection !== null && reviewProjection !== void 0 ? reviewProjection : {},
                metadata,
            }));
        const [trustedRecords, studentProfile, session,] = await Promise.all([
            trustedRecordsPromise,
            readRtdbValue(`users/${decodedToken.uid}`),
            sessionCode ? readRtdbValue(`game_sessions/${sessionCode}`) : Promise.resolve(null),
        ]);
        if (!trustedRecords.snapshot || Object.keys(trustedRecords.snapshot).length === 0) {
            throw Object.assign(new Error('Reading V2 trusted submission could not load the published snapshot.'), { statusCode: 404 });
        }
        if (!trustedRecords.reviewProjection || Object.keys(trustedRecords.reviewProjection).length === 0) {
            throw Object.assign(new Error('Reading V2 trusted submission could not load the review projection.'), { statusCode: 404 });
        }
        const plan = (0, readingV2SubmitCore_1.buildReadingV2TrustedSubmissionPlan)({
            request: submitRequest,
            auth: {
                uid: decodedToken.uid,
                name: decodedToken.name,
                email: decodedToken.email,
            },
            records: Object.assign(Object.assign({}, trustedRecords), { studentProfile,
                session }),
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