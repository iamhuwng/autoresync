import { useRef, useState } from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { toast } from '../modern';
import { isReplacementPlanExpired } from '../../services/book-source-delivery/replacementPlan.service';
import {
  type ReplacementConfirmationHandoff,
  type ReplacementPlanClient,
  type ReplacementPlanClientCreateRequest,
  type ReplacementPlanRecord,
} from '../../services/book-source-delivery/replacementPlan.types';
import './BookReplacementPlanPanel.css';

export interface BookReplacementPlanPanelProps {
  readonly bookTitle: string;
  readonly client: ReplacementPlanClient;
  readonly request: ReplacementPlanClientCreateRequest;
  readonly onConfirmationHandoff?: (handoff: ReplacementConfirmationHandoff) => void;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

type PanelState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'creating' }
  | { readonly kind: 'ready'; readonly plan: ReplacementPlanRecord }
  | { readonly kind: 'reviewing'; readonly plan: ReplacementPlanRecord }
  | { readonly kind: 'reviewed'; readonly plan: ReplacementPlanRecord; readonly reviewId: string }
  | { readonly kind: 'expired'; readonly plan: ReplacementPlanRecord }
  | { readonly kind: 'canceled'; readonly plan: ReplacementPlanRecord }
  | { readonly kind: 'error'; readonly message: string };

const operationId = (): string => globalThis.crypto?.randomUUID?.()
  ?? `replacement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const actionMetadata = (plan: ReplacementPlanRecord | undefined) => plan
  ? { planId: plan.planId, planFingerprint: plan.planFingerprint }
  : undefined;

const BookReplacementPlanPanel = ({
  bookTitle,
  client,
  request,
  onConfirmationHandoff,
  onAction,
}: BookReplacementPlanPanelProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const [state, setState] = useState<PanelState>({ kind: 'empty' });
  const handoffRef = useRef<ReplacementConfirmationHandoff | null>(null);
  const emit = (action: string, metadata?: Record<string, unknown>) => {
    trackAction(action, metadata);
    onAction?.(action, metadata);
  };

  const createPlan = async () => {
    emit('teacher_materials_book_replacement_plan_opened', { bookId: request.bookId });
    setState({ kind: 'creating' });
    try {
      const plan = await client.create({ ...request, idempotencyKey: operationId() });
      if (isReplacementPlanExpired(plan, new Date().toISOString())) {
        setState({ kind: 'expired', plan });
        emit('teacher_materials_book_replacement_plan_expired', actionMetadata(plan));
        return;
      }
      setState({ kind: 'ready', plan });
      toast.success(`Replacement plan for "${bookTitle}" is ready for review.`);
      emit('teacher_materials_book_replacement_plan_created', actionMetadata(plan));
    } catch {
      setState({ kind: 'error', message: 'Replacement plan could not be created. Retry with current source facts.' });
      toast.error('Replacement plan could not be created. The current Book remains unchanged.');
      emit('teacher_materials_book_replacement_plan_failed', { code: 'create' });
    }
  };

  const reviewPlan = async (plan: ReplacementPlanRecord) => {
    if (isReplacementPlanExpired(plan, new Date().toISOString())) {
      setState({ kind: 'expired', plan });
      toast.warning('This replacement plan expired. Replan before continuing.');
      emit('teacher_materials_book_replacement_plan_expired', actionMetadata(plan));
      return;
    }
    setState({ kind: 'reviewing', plan });
    try {
      const result = await client.review({
        bookId: plan.bookId,
        planId: plan.planId,
        planFingerprint: plan.planFingerprint,
        idempotencyKey: operationId(),
      });
      handoffRef.current = result.handoff;
      onConfirmationHandoff?.(result.handoff);
      handoffRef.current = null;
      setState({ kind: 'reviewed', plan: result.plan, reviewId: result.review.reviewId });
      toast.info('Replacement review is ready for the authorized replacement handoff.');
      emit('teacher_materials_book_replacement_plan_reviewed', actionMetadata(plan));
      emit('teacher_materials_book_replacement_plan_handoff_ready', { planId: plan.planId, reviewId: result.review.reviewId });
    } catch {
      setState({ kind: 'error', message: 'Replacement review could not be completed. Replan if source facts changed.' });
      toast.error('Replacement review could not be completed. The current Book remains unchanged.');
      emit('teacher_materials_book_replacement_plan_failed', { code: 'review', planId: plan.planId });
    }
  };

  const cancelPlan = async (plan: ReplacementPlanRecord) => {
    try {
      await client.cancel({
        bookId: plan.bookId,
        planId: plan.planId,
        planFingerprint: plan.planFingerprint,
        idempotencyKey: operationId(),
      });
      setState({ kind: 'canceled', plan });
      toast.info('Replacement planning canceled. The current Book and source lifecycle remain unchanged.');
      emit('teacher_materials_book_replacement_plan_canceled', actionMetadata(plan));
    } catch {
      toast.error('Replacement plan cancellation failed. Retry before making another plan.');
      emit('teacher_materials_book_replacement_plan_failed', { code: 'cancel', planId: plan.planId });
    }
  };

  const replan = () => {
    handoffRef.current = null;
    setState({ kind: 'empty' });
    emit('teacher_materials_book_replacement_plan_replanned', { bookId: request.bookId });
  };

  const plan = state.kind === 'ready' || state.kind === 'reviewing' || state.kind === 'reviewed'
    || state.kind === 'expired' || state.kind === 'canceled' ? state.plan : undefined;

  return (
    <section className="book-replacement-plan" aria-labelledby="book-replacement-plan-title">
      <div className="book-replacement-plan__heading">
        <div>
          <p className="book-replacement-plan__eyebrow">Read-only replacement planning</p>
          <h2 id="book-replacement-plan-title">Review Source-Set impact</h2>
          <p>Build an immutable plan for {bookTitle}. Publication, delivery, entitlements, and source bytes are not changed here.</p>
        </div>
        {state.kind === 'empty' && (
          <button type="button" onClick={() => void createPlan()}>
            Create plan
          </button>
        )}
      </div>

      {state.kind === 'creating' && <p role="status">Preparing the exact Source-Set delta and all-context impact matrix...</p>}
      {state.kind === 'error' && <p className="book-replacement-plan__error" role="alert">{state.message}</p>}
      {(state.kind === 'empty' || state.kind === 'error') && (
        <p className="book-replacement-plan__note">No contexts are selected automatically. Review choices belong to the later replacement saga.</p>
      )}
      {state.kind === 'expired' && (
        <div className="book-replacement-plan__state" role="alert">
          <strong>Plan expired</strong>
          <span>Source or impact revisions may have changed. Create a fresh plan.</span>
          <button type="button" onClick={replan}>Replan</button>
        </div>
      )}
      {state.kind === 'canceled' && (
        <div className="book-replacement-plan__state" role="status">
          <strong>Plan canceled</strong>
          <span>No publication, delivery, entitlement, checkpoint, notification, or source lifecycle state was changed.</span>
          <button type="button" onClick={replan}>Replan</button>
        </div>
      )}
      {plan && (state.kind === 'ready' || state.kind === 'reviewing' || state.kind === 'reviewed') && (
        <>
          <div className="book-replacement-plan__facts" aria-label="Replacement plan facts">
            <span>{plan.sourceSetDelta.mappings.length} explicit page mappings</span>
            <span>{plan.contexts.length} impacted contexts</span>
            <span>{plan.capacity.available ? 'Capacity available' : 'Capacity exceeded'}</span>
            <span>Expires {new Date(plan.expiresAt).toLocaleString()}</span>
          </div>
          <div className="book-replacement-plan__matrix" role="table" aria-label="All-context replacement impact matrix">
            <div className="book-replacement-plan__matrix-row book-replacement-plan__matrix-row--header" role="row">
              <span role="columnheader">Context</span>
              <span role="columnheader">Classification</span>
              <span role="columnheader">Scopes</span>
              <span role="columnheader">Counts</span>
            </div>
            {plan.contexts.map((context) => (
              <div className="book-replacement-plan__matrix-row" role="row" key={context.contextKey}>
                <span role="cell">{context.contextKind} - {context.contextKey}</span>
                <span role="cell">{context.classification} - {context.effects.join(', ') || 'none'}</span>
                <span role="cell">{context.sourceScopes.map((scope) => `${scope.sourceKey} (${scope.pageCount} pages)`).join(', ') || 'No source scope'}</span>
                <span role="cell">{context.activityCount} activities - {context.checkpointCount} checkpoints - {context.notificationCount} notifications</span>
              </div>
            ))}
          </div>
          <div className="book-replacement-plan__actions">
            {state.kind === 'ready' && <button type="button" onClick={() => void reviewPlan(plan)}>Review exact plan</button>}
            {state.kind === 'reviewing' && <span role="status">Creating a bounded confirmation handoff...</span>}
            {state.kind === 'reviewed' && <span role="status">Review complete. Confirmation handoff is in memory for the authorized next step.</span>}
            {state.kind !== 'reviewing' && state.kind !== 'reviewed' && <button type="button" onClick={() => void cancelPlan(plan)}>Cancel plan</button>}
          </div>
        </>
      )}
    </section>
  );
};

export default BookReplacementPlanPanel;
