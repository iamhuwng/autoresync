import { getAuth } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore as db } from './firebase';
import { notificationWorkerOrigin } from './notificationCommandClient';
import { reportingService } from './reportingService';
import { FEATURE_IDS } from '../config/featureRegistry';
import type { NotificationDeliveryResult } from './notificationProducerClient';

export type HomeworkNotice = 'homework-submitted' | 'thcs-homework-assigned' | 'homework-reminder' | 'homework-reset';
const activeProofs = new Map<string, Promise<void>>();

/** Internal bridge adapter; features use notifyCommittedEvent. Proof follows commit. */
export async function notifyHomeworkCommitted(kind: HomeworkNotice, eventId: string, studentId?: string,
    options: { workerOrigin?: string; getIdToken?: () => Promise<string>; fetchImpl?: typeof fetch } = {},
): Promise<NotificationDeliveryResult> {
    let started = false;
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const check = () => { if (expired) throw Error('homework_notification_timeout'); };
    const failure = (code: string, status: 'failed' | 'unknown' = started ? 'unknown' : 'failed'): NotificationDeliveryResult => {
        const outcome = { status, delivered: 0, failed: started && status === 'failed' ? 1 : 0,
            unknown: started && status === 'unknown' ? 1 : 0, unattempted: started ? 0 : 1, code };
        try { reportingService.reportNotificationFailure({
            eventId: `ordinary_${kind.replaceAll('-', '_')}_${eventId}`, feature: FEATURE_IDS.homework,
            action: 'notification_delivery_failed', route: 'firestore-do', ...outcome,
            occurredAt: 0, attemptedAt: Date.now(), recipientCount: 1,
        }); } catch { /* Reporting cannot reject the product commit. */ }
        return outcome;
    };
    const operation = async (): Promise<NotificationDeliveryResult> => { try {
        const origin = options.workerOrigin ?? import.meta.env.VITE_HOMEWORK_NOTIFICATION_URL;
        if (!origin?.trim()) return failure('homework_notification_not_qualified');
        if (!/^[A-Za-z0-9_-]{1,128}$/u.test(eventId)) throw Error('homework_event_invalid');
        const user = getAuth().currentUser;
        if (!user) throw Error('homework_notification_unauthenticated');
        if (kind === 'homework-submitted' || kind === 'thcs-homework-assigned') {
            const proofKey = `${user.uid}:${kind}:${eventId}`;
            let capture = activeProofs.get(proofKey);
            if (!capture) {
                capture = (async () => {
                    const collection = kind === 'homework-submitted' ? 'homework_submissions' : 'homework_assignments';
                    const saved = await getDoc(doc(db, collection, eventId));
                    check();
                    if (!saved.exists()) throw Error('homework_source_missing');
                    const source = saved.data();
                    const proofRef = doc(db, 'homework_notification_proofs', eventId);
                    const proof = { eventId, kind, actorUid: user.uid,
                        homeworkId: kind === 'homework-submitted' ? source.homeworkId : eventId,
                        occurredAt: kind === 'homework-submitted' ? source.submittedAt : source.createdAt,
                        ...(kind === 'homework-submitted' ? { studentId: source.studentId, resultId: source.resultId } : {}),
                    };
                    const prior = await getDoc(proofRef);
                    check();
                    if (!prior.exists()) await setDoc(proofRef, proof);
                    else if (Object.keys(prior.data()).length !== Object.keys(proof).length
                        || Object.entries(proof).some(([key, value]) => prior.data()[key] !== value)) throw Error('homework_proof_conflict');
                })().finally(() => { activeProofs.delete(proofKey); });
                activeProofs.set(proofKey, capture);
            }
            await capture;
            check();
        }
        const token = await (options.getIdToken ?? (() => user.getIdToken(false)))();
        check();
        if (getAuth().currentUser?.uid !== user.uid) throw Error('homework_actor_changed');
        started = true;
        const response = await (options.fetchImpl ?? fetch)(`${notificationWorkerOrigin(origin)}/events`, {
            method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, eventId, ...(kind === 'thcs-homework-assigned' ? { studentId } : {}) }),
        });
        const body = await response.json() as { status?: string };
        return response.ok && ['created', 'replayed'].includes(body.status ?? '')
            ? { status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 }
            : failure(body.status ?? 'homework_delivery_unknown', [400, 401, 403, 409].includes(response.status) ? 'failed' : 'unknown');
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'homework_delivery_unknown');
    } };
    return Promise.race([operation(), new Promise<NotificationDeliveryResult>(resolve => {
        timer = setTimeout(() => { expired = true; controller.abort(); resolve(failure('homework_notification_timeout')); }, 15000);
    })]).finally(() => clearTimeout(timer));
}
