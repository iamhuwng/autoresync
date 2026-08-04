import type {
  BookResultAttemptDetail as ProjectedBookResultDetail,
  BookResultAttemptSummary as ProjectedBookResultAttemptSummary,
  BookResultGroupSummary as ProjectedBookResultGroupSummary,
  BookResultFeedbackRelease as ProjectedFeedbackRelease,
  BookResultProjection as ProjectedBookResult,
  BookResultScore,
  BookResultSourceAvailability,
  BookResultSourceProjection,
  BookResultSurface,
} from '../../../../src/services/book-activity/results/bookResult.types.ts';
import { bookResultGroupKey } from '../../../../src/services/book-activity/results/bookResult.types.ts';
export { bookResultGroupKey };

/**
 * The result reader deliberately has its own wire model.  Runtime terminal
 * records are trusted-service records and must never be returned directly to
 * a browser.  Keeping the two types separate makes it difficult to leak an
 * answer key, private source authority, or storage identity by accident.
 */
export type BookResultContextKind = 'solo' | 'homework';
export type BookResultFeedbackRelease = ProjectedFeedbackRelease;
export type BookResultSafeScore = BookResultScore;
export type BookResultSourceState = BookResultSourceAvailability;
export type BookResultSource = BookResultSourceProjection;
export type BookResultSurfaceKind = BookResultSurface;

/** Exact summary/detail records are owned by the pure projection service. */
export type BookResultAttemptSummary = ProjectedBookResultAttemptSummary & {
  /** Publication metadata is supplied by the trusted Delivery adapter. */
  readonly bookId: string;
};
export type BookResultDetail = ProjectedBookResultDetail & { readonly bookId: string };
export interface BookResultReadProjection {
  readonly schemaVersion: ProjectedBookResult['schemaVersion'];
  readonly bookId: string;
  readonly summary: BookResultAttemptSummary;
  readonly detail: BookResultDetail;
}

/** Indexed group row. It intentionally contains no attempt/detail payload. */
export interface BookResultGroupSummary {
  readonly schemaVersion: 1;
  readonly groupKey: string;
  readonly studentId: string;
  readonly recipientId: string;
  readonly activityId: string;
  readonly homeworkId?: string;
  readonly bookId: string;
  readonly attemptCount: number;
  readonly latestAttemptId: string;
  readonly latestResultId: string;
  readonly latestAttemptNumber: number;
  readonly latestSubmittedAt: string;
  readonly latestCreatedAt: string;
  readonly latestEvaluationStatus: string;
  readonly latestFeedbackRelease: BookResultFeedbackRelease;
  readonly contexts: readonly {
    readonly contextId: string;
    readonly deliveryId: string;
    readonly surface: BookResultSurface;
    readonly attemptCount: number;
  }[];
}

/** Group detail is assembled from one indexed attempt query; no detail rows are fetched. */
export type BookResultGroupDetail = ProjectedBookResultGroupSummary;

/** Input accepted by the projection persistence seam. */
export interface BookResultProjectionInput {
  readonly projection: BookResultReadProjection;
}

export type BookResultViewerRole = 'student' | 'teacher';

export interface BookResultViewer {
  readonly uid: string;
  readonly role: BookResultViewerRole;
}

export interface BookHomeworkReadAuthority {
  readonly homeworkId: string;
  readonly ownerId: string;
  readonly studentIds?: readonly string[];
  /** Only `current` authority can authorize a teacher result read. */
  readonly status: 'current' | 'replaced' | 'archived' | 'unresolved';
}

export interface BookResultReadScope {
  readonly bookId: string;
  readonly studentId: string;
  readonly homeworkId?: string;
  readonly contextKind?: BookResultContextKind;
}

export interface BookResultQueryInput extends BookResultReadScope {
  readonly groupKey?: string;
  readonly limit?: number;
}

export interface BookResultQueryEvent {
  readonly operation: 'groups' | 'attempts' | 'detail' | 'persist';
  readonly path: string;
  readonly rows: number;
  readonly limit: number;
}

export interface BookResultQueryMetrics {
  readonly groups: number;
  readonly attempts: number;
  readonly details: number;
  readonly persists: number;
  readonly events: readonly BookResultQueryEvent[];
}

export type BookResultQueryObserver = (event: BookResultQueryEvent) => void;

export const BOOK_RESULT_MAX_GROUP_LIMIT = 25;
export const BOOK_RESULT_MAX_ATTEMPT_LIMIT = 50;

export const decodeBookResultGroupKey = (value: string): readonly [string, string] | null => {
  if (!/^g_[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const encoded = value.slice(2).replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    if (typeof atob !== 'function') return null;
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return Array.isArray(decoded)
      && decoded.length === 2
      && typeof decoded[0] === 'string'
      && typeof decoded[1] === 'string'
      ? [decoded[0], decoded[1]]
      : null;
  } catch {
    return null;
  }
};

export const isBookResultViewerRole = (value: unknown): value is BookResultViewerRole => (
  value === 'student' || value === 'teacher'
);
