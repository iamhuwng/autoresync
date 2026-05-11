import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
  buildReadingV2TrustedSubmissionPlan,
  getMaterialIdFromRequest,
  parseReadingV2TrustedSubmissionRequest,
} from './readingV2SubmitCore';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.database();

const setCorsHeaders = (response: any, origin?: string): void => {
  response.set('Access-Control-Allow-Origin', origin || '*');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Vary', 'Origin');
};

const sendJson = (
  response: any,
  status: number,
  body: Record<string, unknown>,
): void => {
  response.status(status).json(body);
};

const readBearerToken = (header: string | undefined): string => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match?.[1]) {
    throw Object.assign(new Error('Firebase ID token is required.'), { statusCode: 401 });
  }

  return match[1];
};

const toHttpStatus = (error: unknown): number => {
  const statusCode = (error as { statusCode?: unknown })?.statusCode;
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

const readRtdbValue = async <T = Record<string, any>>(path: string): Promise<T | null> => {
  const snapshot = await db.ref(path).get();
  return snapshot.exists() ? snapshot.val() as T : null;
};

const pushKey = (path: string, label: string): string => {
  const key = db.ref(path).push().key;
  if (!key) {
    throw new Error(`Could not allocate Reading V2 ${label} id.`);
  }

  return key;
};

export const readingV2Submit = functions.https.onRequest(async (request: any, response: any) => {
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
    const submitRequest = parseReadingV2TrustedSubmissionRequest(request.body);
    const materialId = getMaterialIdFromRequest(submitRequest);
    const snapshotVersionId = submitRequest.sourceSnapshotVersionId;
    const sessionCode = submitRequest.context?.sessionCode;
    const [
      snapshot,
      reviewProjection,
      metadata,
      studentProfile,
      session,
    ] = await Promise.all([
      readRtdbValue(`reading_v2/published_snapshots/${materialId}/${snapshotVersionId}`),
      readRtdbValue(`reading_v2/projections/review/${materialId}:${snapshotVersionId}`),
      readRtdbValue(`reading_v2/material_metadata/${materialId}`),
      readRtdbValue(`users/${decodedToken.uid}`),
      sessionCode ? readRtdbValue(`game_sessions/${sessionCode}`) : Promise.resolve(null),
    ]);

    if (!snapshot) {
      throw Object.assign(
        new Error('Reading V2 trusted submission could not load the published snapshot.'),
        { statusCode: 404 },
      );
    }

    if (!reviewProjection) {
      throw Object.assign(
        new Error('Reading V2 trusted submission could not load the review projection.'),
        { statusCode: 404 },
      );
    }

    const now = new Date();
    const plan = buildReadingV2TrustedSubmissionPlan({
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
  } catch (error) {
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
