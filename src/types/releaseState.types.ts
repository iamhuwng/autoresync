/**
 * Release-State Types for Live-Session Review Governance
 * 
 * PRD-0040 Phase 2: Defines the three-state release model that controls
 * what students can see in post-test review surfaces while a live session
 * is still governed by the teacher monitor.
 * 
 * Storage: game_sessions/{sessionCode}/reviewReleaseState
 * Owner: Teacher monitor workflow (TeacherTestMonitorPage)
 * Default: 'locked-review' (most restrictive)
 * 
 * @module types/releaseState.types
 */

/**
 * The three valid release states for live-session student review.
 * 
 * Progression: locked-review → review-released → feedback-released
 * 
 * - `locked-review`: Student sees score, counts, status indicators, and their
 *   own answer text only. Correct answers, AI explanations, teacher feedback,
 *   question stems, and feedback-generation controls are hidden.
 * 
 * - `review-released`: Adds correct answers, answer comparison, and
 *   question-level scoring detail. AI explanations and teacher feedback
 *   remain hidden.
 * 
 * - `feedback-released`: Full access — everything in `review-released` plus
 *   AI formative feedback and teacher feedback. If feedback generation has
 *   not finished, students see the loading shimmer via the existing onValue
 *   listener pattern.
 */
export type ReviewReleaseState = 'locked-review' | 'review-released' | 'feedback-released';

/**
 * Default release state when the field is absent or null.
 * This ensures backwards compatibility — existing sessions that ended
 * before this feature default to the most restrictive state.
 */
export const DEFAULT_RELEASE_STATE: ReviewReleaseState = 'locked-review';

/**
 * Ordered release levels for comparison.
 * Higher index = more permissive.
 */
export const RELEASE_STATE_ORDER: readonly ReviewReleaseState[] = [
  'locked-review',
  'review-released',
  'feedback-released',
] as const;

export interface SessionReleaseStateSource {
  status?: string | null;
  reviewReleaseState?: string | null;
  completedAt?: number | null;
  lastTestCompletedAt?: number | null;
  lastTestId?: string | null;
}

/**
 * Returns the effective release state, defaulting to 'locked-review'
 * when the persisted value is absent, null, or invalid.
 */
export function getEffectiveReleaseState(
  raw: string | null | undefined
): ReviewReleaseState {
  if (
    raw === 'locked-review' ||
    raw === 'review-released' ||
    raw === 'feedback-released'
  ) {
    return raw;
  }
  return DEFAULT_RELEASE_STATE;
}

/**
 * Default release tier to persist when a teacher/admin explicitly ends a session.
 * Session end must always release answer review, but should never downgrade a
 * session that was already promoted to feedback release.
 */
export function getSessionEndReleaseState(
  raw: string | null | undefined
): ReviewReleaseState {
  const current = getEffectiveReleaseState(raw);
  return current === 'feedback-released' ? current : 'review-released';
}

/**
 * Derives the effective release state from a session snapshot.
 *
 * This is the canonical fallback for student-facing result surfaces when older
 * session-ending codepaths failed to persist `reviewReleaseState`.
 */
export function deriveSessionReleaseState(
  session: SessionReleaseStateSource | null | undefined
): ReviewReleaseState {
  const explicit = session?.reviewReleaseState;
  if (
    explicit === 'locked-review' ||
    explicit === 'review-released' ||
    explicit === 'feedback-released'
  ) {
    return explicit;
  }

  const status = String(session?.status || '').toLowerCase();
  const hasEndedMarkers =
    typeof session?.completedAt === 'number' ||
    typeof session?.lastTestCompletedAt === 'number' ||
    Boolean(session?.lastTestId);

  if (status === 'completed' || status === 'ended') {
    return 'review-released';
  }

  if (status === 'waiting' && hasEndedMarkers) {
    return 'review-released';
  }

  return DEFAULT_RELEASE_STATE;
}

/**
 * Returns true if the current release state is at least as permissive
 * as the required level.
 * 
 * @example
 * isReleasedAtLeast('review-released', 'locked-review') // true
 * isReleasedAtLeast('locked-review', 'review-released')  // false
 * isReleasedAtLeast('feedback-released', 'feedback-released') // true
 */
export function isReleasedAtLeast(
  current: ReviewReleaseState,
  required: ReviewReleaseState
): boolean {
  const currentIndex = RELEASE_STATE_ORDER.indexOf(current);
  const requiredIndex = RELEASE_STATE_ORDER.indexOf(required);
  return currentIndex >= requiredIndex;
}

/**
 * Visibility flags derived from the release state.
 * Used by student-facing result surfaces to determine what to render.
 */
export interface ReleaseVisibility {
  /** Student's own answer text */
  showStudentAnswer: true; // Always visible
  /** Score, percentage, band score */
  showScoreSummary: true; // Always visible
  /** Correct/incorrect/partial counts */
  showCounts: true; // Always visible
  /** Correct answer keys and comparison */
  showCorrectAnswers: boolean;
  /** Question-level scoring detail with correct/incorrect indicators */
  showQuestionScoring: boolean;
  /** AI formative feedback (formativeFeedback field) */
  showAIFeedback: boolean;
  /** Teacher feedback (overallFeedback, per-question teacherFeedback) */
  showTeacherFeedback: boolean;
  /** Question stems / question text */
  showQuestionText: boolean;
  /** Feedback generation controls (manual trigger buttons) */
  showFeedbackControls: boolean;
}

/**
 * Derives the visibility flags from the current release state.
 * This is the single source of truth for student-facing rendering decisions.
 */
export function getReleaseVisibility(state: ReviewReleaseState): ReleaseVisibility {
  const base: ReleaseVisibility = {
    showStudentAnswer: true,
    showScoreSummary: true,
    showCounts: true,
    showCorrectAnswers: false,
    showQuestionScoring: false,
    showAIFeedback: false,
    showTeacherFeedback: false,
    showQuestionText: false,
    showFeedbackControls: false,
  };

  if (isReleasedAtLeast(state, 'review-released')) {
    base.showCorrectAnswers = true;
    base.showQuestionScoring = true;
    base.showQuestionText = true;
  }

  if (isReleasedAtLeast(state, 'feedback-released')) {
    base.showAIFeedback = true;
    base.showTeacherFeedback = true;
    base.showFeedbackControls = true;
  }

  return base;
}
