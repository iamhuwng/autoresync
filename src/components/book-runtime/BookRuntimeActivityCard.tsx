import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BookRuntimeDeliveryProjection } from '../../services/book-delivery/bookDelivery.types';
import { createBookRuntimeClient } from '../../services/book-activity/activityRuntime.browser';
import type { ActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import { useBookActivityRuntime, type BookRuntimeTerminalRead } from '../../hooks/book-runtime/useBookActivityRuntime';
import { ActivityRendererHost } from './interactions/ActivityRendererHost';
import type { BookRuntimeAction, ResolvedRuntimeActivity, BookRuntimeActivitySummary } from './BookRuntimeShell';
import { toast } from '../modern';
import { normalizeSavedActivityResponse } from '../../services/book-activity/activityRuntimeAttempt.service';

export const BookRuntimeActivityCard = ({ activity, projection, registry, onAction, registerFlush, onSummary, questionTools }: {
  readonly activity: ResolvedRuntimeActivity & { readonly placement: BookRuntimeDeliveryProjection['activities'][number] };
  readonly projection: BookRuntimeDeliveryProjection;
  readonly registry: ActivityRendererRegistry;
  readonly onAction?: (action: BookRuntimeAction, metadata?: Record<string, unknown>) => void;
  readonly registerFlush: (id: string, flush: (() => Promise<void>) | null) => void;
  readonly onSummary: (id: string, summary: BookRuntimeActivitySummary) => void;
  readonly questionTools: (interactionId: string, index: number) => React.ReactNode;
}) => {
  const placement = activity.placement;
  const runtimeKey = activity.runtimeKey;
  const client = useMemo(() => createBookRuntimeClient(), []);
  const context = useMemo(() => ({ mode: 'editable' as const, sourceContext: placement.sourceContext, surface: 'student-runtime' as const }), [placement.sourceContext]);
  const resolution = useMemo(() => registry.resolve(activity.projection, context), [activity.projection, context, registry]);
  const interactionIds = useMemo(() => resolution.supported ? resolution.projection.interactions.map((item) => item.interactionId) : [], [resolution]);
  const readTerminal = useCallback(async (): Promise<BookRuntimeTerminalRead> => {
    try {
      const terminal = await client.readTerminal({ bindingId: projection.bindingId, bindingRevision: projection.bindingRevision,
        contextId: projection.context.contextId, placementId: placement.placementId, activityId: placement.activityId,
        activityVersion: placement.activityVersion, interactionId: interactionIds[0] ?? '' });
      return terminal.status === 'absent' ? { status: 'confirmed-absent' } : { status: 'confirmed-present', resultStatus: terminal.resultStatus };
    } catch { return { status: 'unavailable' }; }
  }, [client, interactionIds, placement, projection.bindingId, projection.bindingRevision, projection.context.contextId]);
  const serializeResponse = useCallback((_id: string, value: unknown) => {
    if (!resolution.supported) throw new Error('Activity renderer unavailable.');
    return resolution.registration.codec.serialize(value);
  }, [resolution]);
  const pinKey = JSON.stringify([projection.recipientId, projection.context.contextId, placement.placementId, placement.activityId, placement.activityVersion]);
  const committed = useRef<{ pinKey: string; responses: Readonly<Record<string, unknown>> } | null>(null);
  const runtime = useBookActivityRuntime({ client, recipientId: projection.recipientId,
    address: { bindingId: projection.bindingId, bindingRevision: projection.bindingRevision, contextId: projection.context.contextId,
      placementId: placement.placementId, activityId: placement.activityId, activityVersion: placement.activityVersion },
    interactionIds, canAutosave: projection.actionFlags.canAutosave,
    canSubmit: projection.actionFlags.canSubmit, flushDeadlineMs: 15_000, readTerminal, serializeResponse,
    initialResponses: committed.current?.pinKey === pinKey ? committed.current.responses : {},
    ...(placement.scheduleWindow ? { windowDecision: placement.scheduleWindow } : {}),
    onMetric: (metric) => onAction?.('bookRuntimeMetricRecorded', { activityId: activity.activityId, ...metric }),
  });
  useLayoutEffect(() => { committed.current = { pinKey, responses: runtime.responses }; }, [pinKey, runtime.responses]);
  const summary = useMemo<BookRuntimeActivitySummary>(() => {
    const answered = resolution.supported ? interactionIds.filter((id) => {
      const codec = resolution.registration.codec;
      const decoded = codec.decode(normalizeSavedActivityResponse(id,
        runtime.responses[id] ?? codec.createEmpty(), resolution.registration.responseCodec));
      if (!decoded.valid || !codec.validate(decoded.value).valid) return false;
      const review = codec.toReviewProjection(decoded.value);
      return review.text.trim().length > 0 || Boolean(review.items?.length);
    }) : [];
    return { answered, status: runtime.message || runtime.status, dirty: runtime.isDirty,
      submitted: Boolean(runtime.terminalResult || runtime.terminalReadStatus === 'confirmed-present'),
      reviewRequired: (runtime.terminalResult?.resultStatus ?? runtime.terminalReadResultStatus) === 'pending_review',
      captureActive: runtime.terminalReadStatus === 'confirmed-absent' && !runtime.terminalResult };
  }, [interactionIds, resolution, runtime.isDirty, runtime.message, runtime.responses, runtime.status, runtime.terminalReadResultStatus, runtime.terminalReadStatus, runtime.terminalResult]);
  useEffect(() => onSummary(runtimeKey, summary), [runtimeKey, onSummary, summary]);
  useEffect(() => {
    registerFlush(runtimeKey, async () => {
      const saved = await runtime.flush('navigation');
      if (!saved.safeToLeave) throw new Error('An Activity response is not safely saved.');
    });
    return () => registerFlush(runtimeKey, null);
  }, [runtimeKey, registerFlush, runtime.flush]);
  const previousStatus = useRef('');
  useEffect(() => {
    const key = `${runtime.status}:${runtime.message}`;
    if (previousStatus.current === key) return;
    previousStatus.current = key;
    if (['conflict', 'error', 'unsafe-to-leave'].includes(runtime.status)) toast.error(runtime.message);
  }, [runtime.status, runtime.message]);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirming) return;
    const element = dialog.current;
    element?.showModal?.();
    return () => { element?.close?.(); submitButton.current?.focus(); };
  }, [confirming]);
  const cancel = () => { onAction?.('bookRuntimeSubmitCancelled', { activityId: activity.activityId }); setConfirming(false); };
  const terminalReady = runtime.terminalReadStatus === 'confirmed-absent';
  const canSubmit = projection.actionFlags.canSubmit && (placement.scheduleWindow?.permissions.canSubmit ?? true)
    && interactionIds.length > 0 && terminalReady && !summary.submitted && !submitting && runtime.status !== 'loading';
  const submit = async () => {
    if (!canSubmit) return;
    setConfirming(false);
    setSubmitting(true);
    onAction?.('bookRuntimeSubmitActivity', { activityId: activity.activityId });
    try {
      const result = await runtime.submitActivity(interactionIds[0]);
      if (result.resultStatus === 'pending_review') toast.info('Activity submitted for teacher review.');
      else toast.success(result.status === 'replayed' ? 'Activity submission already saved.' : 'Activity submitted.');
    } catch { toast.error('Could not confirm submission. Your saved response remains available; check the Activity status before retrying.'); }
    finally { setSubmitting(false); }
  };
  return <>
    <ActivityRendererHost registry={registry} projection={activity.projection}
      context={{ ...context, mode: summary.submitted || submitting || !projection.actionFlags.canAutosave || placement.scheduleWindow?.permissions.canAutosave === false || runtime.status === 'loading' || !terminalReady ? 'read-only' : 'editable' }}
      responses={runtime.responses} validationByInteractionId={{}} questionTools={questionTools}
      onResponseChange={(id, value) => { onAction?.('bookRuntimeResponseChanged', { activityId: activity.activityId, interactionId: id }); runtime.change(id, value); }} />
    <footer className="book-runtime-shell__card-footer">
      <div role={['conflict', 'error', 'unsafe-to-leave'].includes(runtime.status) ? 'alert' : 'status'} data-testid="book-runtime-persistence" data-status={runtime.status} data-dirty={runtime.isDirty}>
        <span>{summary.answered.length} of {interactionIds.length} answered · {summary.status}</span>
        {['conflict', 'error', 'offline', 'retrying', 'unsafe-to-leave'].includes(runtime.status) && <div className="book-runtime-shell__recovery">
          <button type="button" onClick={() => { onAction?.('bookRuntimeAutosaveRetry'); void runtime.retry(); }}>Retry save</button>
          {runtime.conflict && <button type="button" onClick={() => { onAction?.('bookRuntimeAutosaveReload'); void runtime.reload(); }}>Reload current</button>}
          <button type="button" onClick={() => { onAction?.('bookRuntimeAutosaveDiscard'); void runtime.discardLocal(); }}>Discard local</button>
        </div>}
        {runtime.terminalReadStatus === 'unavailable' && <button type="button" onClick={() => { onAction?.('bookRuntimeAutosaveReload'); void runtime.refreshTerminal(); }}>Reload status</button>}
      </div>
      <button ref={submitButton} type="button" data-testid="book-runtime-submit"
        aria-label={summary.reviewRequired ? `${activity.label ?? 'Activity'} submitted for review` : summary.submitted ? `${activity.label ?? 'Activity'} submitted` : `Submit ${activity.label ?? 'Activity'}`}
        disabled={!canSubmit} onClick={() => setConfirming(true)}>
        {summary.reviewRequired ? 'Submitted for review' : summary.submitted ? 'Activity submitted' : submitting ? 'Submitting…' : runtime.terminalReadStatus === 'unavailable' ? 'Submission status unavailable' : 'Submit Activity'}
      </button>
    </footer>
    {confirming && <dialog ref={dialog} className="book-runtime-shell__submit-dialog" aria-labelledby={`submit-${placement.placementId}`} onCancel={(event) => { event.preventDefault(); cancel(); }}
      onClick={(event) => { if (event.target === event.currentTarget) cancel(); }}>
      <h2 id={`submit-${placement.placementId}`}>Submit {activity.label ?? 'Activity'}</h2>
      <p>Submit this Activity now? Other Activities stay open and keep saving independently.</p>
      {placement.integrityCapture?.enabled && <p>This homework records focus, tab and paste events for teacher review. Recorded events never block completion.</p>}
      <div><button type="button" autoFocus onClick={cancel}>Keep working</button><button type="button" disabled={!canSubmit} onClick={() => void submit()}>Confirm submission</button></div>
    </dialog>}
  </>;
};
