import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import type { FeedbackActionCommand, FeedbackNotificationIntent } from './feedback-notification-action.ts';

type Env = Readonly<Record<string, unknown>>;
const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';
const AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export interface FeedbackActionStorage {
  read(path: string): Promise<unknown>;
  commit(input: {
    command: FeedbackActionCommand;
    actorUid: string;
    actor: Record<string, unknown>;
    intent: FeedbackNotificationIntent;
    result: Record<string, unknown>;
  }): Promise<void>;
  updateIntent(intent: FeedbackNotificationIntent): Promise<void>;
  dueIntents(now: number, limit?: number): Promise<FeedbackNotificationIntent[]>;
  claimRetry(eventId: string, now: number): Promise<FeedbackNotificationIntent | null>;
}

export class FirebaseFeedbackActionStorage implements FeedbackActionStorage {
  private readonly admin: FirebaseRtdbRestClient;

  constructor(private readonly env: Env, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    }, fetchImpl });
  }

  read(path: string): Promise<unknown> { return this.admin.readValue(path); }

  private async firebaseToken(input: {
    command: FeedbackActionCommand;
    actorUid: string;
    intent: FeedbackNotificationIntent;
  }): Promise<string> {
    const key = JSON.parse(required(this.env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY')) as { client_email?: string; private_key?: string };
    const identity = required(this.env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY');
    if (key.client_email !== identity || !key.private_key) throw new Error('feedback_action_service_identity_mismatch');
    const privateKey = await importPKCS8(key.private_key, 'RS256');
    const issuedAt = Math.floor(Date.now() / 1000);
    const customToken = await new SignJWT({
      iss: identity, sub: identity, aud: AUDIENCE, iat: issuedAt, exp: issuedAt + 300,
      uid: `notification-feedback-action:${input.command.eventId}`,
      claims: {
        notificationFeedbackAction: true,
        eventId: input.command.eventId,
        resultId: input.command.resultId,
        actorUid: input.actorUid,
        studentId: input.intent.studentId,
        feedbackKind: input.command.feedbackKind,
        questionId: input.command.questionId ?? null,
        occurredAt: input.intent.occurredAt,
      },
    }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).sign(privateKey);
    const response = await this.fetchImpl(`${SIGN_IN_URL}?key=${encodeURIComponent(required(this.env, 'FIREBASE_WEB_API_KEY'))}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!response.ok) throw new Error(`feedback_action_token_failed:${response.status}`);
    const value = await response.json() as { idToken?: unknown };
    if (typeof value.idToken !== 'string' || !value.idToken) throw new Error('feedback_action_token_invalid');
    return value.idToken;
  }

  async commit(input: {
    command: FeedbackActionCommand;
    actorUid: string;
    actor: Record<string, unknown>;
    intent: FeedbackNotificationIntent;
    result: Record<string, unknown>;
  }): Promise<void> {
    const token = await this.firebaseToken(input);
    const client = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: required(this.env, 'FIREBASE_DB_URL'), FIREBASE_PROJECT_ID: required(this.env, 'FIREBASE_PROJECT_ID') },
      fetchImpl: this.fetchImpl, firebaseAuthToken: true, getFirebaseAuthToken: async () => token,
    });
    const { command, actorUid, actor, intent, result } = input;
    const resultPath = `test_results/${command.resultId}`;
    const displayName = [actor.displayName, actor.name, actor.fullName].find((value) => typeof value === 'string' && value.trim());
    const updatedByName = typeof displayName === 'string' ? displayName.trim().slice(0, 100) : '';
    const updatedBy = updatedByName || actorUid;
    const feedbackData = {
      ...(command.feedbackKind === 'question' ? { questionId: command.questionId } : {}),
      feedback: command.feedback,
      updatedAt: intent.occurredAt,
      updatedBy,
      updatedById: actorUid,
      ...(updatedByName ? { updatedByName, teacherName: updatedByName } : {}),
      eventId: command.eventId,
    };
    const history = {
      eventId: command.eventId,
      timestamp: intent.occurredAt,
      teacherId: actorUid,
      ...(updatedByName ? { teacherName: updatedByName } : {}),
      type: command.feedbackKind,
      ...(command.questionId === undefined ? {} : { questionId: command.questionId }),
      feedback: command.feedback,
    };
    const updates: { path: string; value: unknown }[] = [
      { path: `${resultPath}/feedbackHistory/${command.eventId}`, value: history },
      { path: `${resultPath}/feedbackUpdatedAt`, value: intent.occurredAt },
      { path: `${resultPath}/feedbackUpdatedBy`, value: updatedBy },
      { path: `${resultPath}/feedbackUpdatedByTeacherId`, value: actorUid },
      { path: `${resultPath}/feedbackUpdatedByTeacherName`, value: updatedByName || null },
      { path: `${resultPath}/hasFeedback`, value: true },
      { path: `feedback_notification_intents/${command.eventId}`, value: intent },
    ];
    if (command.feedbackKind === 'question') {
      const questionId = command.questionId!;
      const questions = Array.isArray(result.questionResults) ? result.questionResults : [];
      const questionIndex = questions.findIndex((item) => {
        const question = record(item);
        return question && (question.questionId === questionId || String(question.questionNumber ?? '') === questionId);
      });
      if (questionIndex < 0) throw new Error('feedback_question_not_found');
      updates.push(
        { path: `${resultPath}/questionFeedback/${questionId}`, value: feedbackData },
        { path: `${resultPath}/questionResults/${questionIndex}/teacherFeedback`, value: command.feedback },
      );
    } else {
      updates.push({ path: `${resultPath}/overallFeedback`, value: feedbackData });
    }
    await client.patchMultiLocation(updates);
  }

  async updateIntent(intent: FeedbackNotificationIntent): Promise<void> {
    const path = `feedback_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag<FeedbackNotificationIntent | null>(path);
      if (!current.data || current.data.eventId !== intent.eventId || current.data.resultId !== intent.resultId
        || current.data.actorUid !== intent.actorUid || current.data.kind !== intent.kind) throw new Error('feedback_intent_identity_changed');
      if (current.data.state === 'done' || current.data.state === 'failed') return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error('feedback_intent_cas_failed');
  }

  async dueIntents(now: number, limit = 2): Promise<FeedbackNotificationIntent[]> {
    const rows = await this.admin.readValue('feedback_notification_intents', { orderBy: 'dueAt', limitToFirst: limit });
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return [];
    return Object.values(rows as Record<string, FeedbackNotificationIntent>).filter((intent) =>
      intent && intent.dueAt <= now && (intent.state === 'retry_due' || intent.state === 'retrying'));
  }

  async claimRetry(eventId: string, now: number): Promise<FeedbackNotificationIntent | null> {
    const path = `feedback_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag<FeedbackNotificationIntent | null>(path);
    const intent = current.data;
    if (!intent || intent.eventId !== eventId || intent.state !== 'retry_due' || intent.attempts !== 1 || intent.dueAt > now) return null;
    const claimed: FeedbackNotificationIntent = { ...intent, state: 'retrying', attempts: 2, dueAt: now + 60 * 60 * 1000 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
}
