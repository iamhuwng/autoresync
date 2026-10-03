import { getAuth } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FEATURE_IDS } from '../config/featureRegistry';
import { reportingService } from './reportingService';
import { firestore } from './firebase';
import { notificationWorkerOrigin } from './notificationCommandClient';
import type { NotificationDeliveryResult } from './notificationProducerClient';

type WritingEvent = { readonly eventKind: 'writing-submitted'; readonly submissionId: string; readonly occurredAt: number; readonly audience: 'student' | 'teacher' };

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const endpoint = () => import.meta.env.VITE_WRITING_NOTIFICATION_URL?.trim();

export async function notifyWritingCommitted(event: WritingEvent): Promise<NotificationDeliveryResult> {
    const actor = getAuth().currentUser;
    const origin = endpoint();
    const intended = 1;
    const eventId = `writing-${event.submissionId}-submitted-${event.audience}`;
    const result = (status: NotificationDeliveryResult['status'], code?: string,
        unattempted = status === 'skipped' ? intended : 0, failed = status === 'failed' ? 1 : 0): NotificationDeliveryResult => ({
        status, delivered: status === 'written' ? 1 : 0,
        failed, unknown: status === 'unknown' ? 1 : 0,
        unattempted,
        ...(code ? { code } : {}),
    });
    const report = (outcome: NotificationDeliveryResult): NotificationDeliveryResult => {
        if (outcome.status === 'failed' || outcome.status === 'unknown') {
            try { reportingService.reportNotificationFailure({
                eventId, feature: FEATURE_IDS.results, action: 'notification_delivery_failed', route: 'firestore-do',
                ...outcome, status: outcome.status as 'failed' | 'unknown',
                code: outcome.code || outcome.status, recipientCount: 1,
                occurredAt: 0, attemptedAt: Date.now(),
            }); } catch { /* Reporting cannot reverse the product commit. */ }
        }
        return outcome;
    };

    if (!origin) return result('skipped', 'writing_notification_not_qualified');
    if (!actor || !ID.test(event.submissionId) || !ID.test(actor.uid)
        || !Number.isSafeInteger(event.occurredAt)) {
        return report(result('failed', 'writing_notification_event_invalid', intended, 0));
    }

    let started = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const check = () => {
        if (stopped) throw new Error('writing_notification_timeout');
        if (getAuth().currentUser?.uid !== actor.uid) throw new Error('notification_actor_changed');
    };
    const operation = async (): Promise<NotificationDeliveryResult> => {
        const kind = `writing-submitted-${event.audience}`;
        const proofRef = doc(firestore, 'writing_notification_intents', eventId);
        const proof = {
            schemaVersion: 1, eventId, kind, authorityRecordId: event.submissionId,
            occurrenceId: eventId, actorUid: actor.uid, occurredAt: event.occurredAt,
        };
        try {
            check();
            await setDoc(proofRef, proof);
        } catch {
            check();
            const saved = await getDoc(proofRef);
            if (!saved.exists() || Object.entries(proof).some(([key, value]) => saved.data()[key] !== value)
                || Object.keys(saved.data()).some(key => !Object.hasOwn(proof, key))) {
                return result('failed', 'writing_notification_proof_conflict', intended, 0);
            }
        }
        check();
        const token = await actor.getIdToken(false);
        check();
        started = true;
        const response = await fetch(`${notificationWorkerOrigin(origin)}/events`, {
            method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, eventId }),
        });
        const body = await response.json() as { status?: string };
        if (response.ok && ['created', 'replayed'].includes(body.status ?? '')) return result('written');
        return result(started && ![400, 401, 403, 404, 409].includes(response.status) ? 'unknown' : 'failed',
            body.status || 'writing_notification_delivery_failed');
    };
    const operationResult = operation().catch(error => result(started ? 'unknown' : 'failed',
        error instanceof Error ? error.message : 'writing_notification_failed', started ? 0 : intended, 0));
    const timeoutResult = new Promise<NotificationDeliveryResult>(resolve => {
        timer = setTimeout(() => {
            stopped = true;
            controller.abort();
            resolve(result(started ? 'unknown' : 'failed', 'writing_notification_timeout', started ? 0 : intended, 0));
        }, 15_000);
    });
    return Promise.race([operationResult, timeoutResult]).then(report).finally(() => clearTimeout(timer));
}
