/**
 * Essay Editor TipTap Extensions — Barrel Export
 *
 * Custom marks and plugins for the grading essay editor.
 *
 * @module extensions/index
 */

export { CommentMark } from './commentMark';
export type { CommentMarkOptions } from './commentMark';

export { CorrectionMark } from './correctionMark';
export type { CorrectionMarkOptions } from './correctionMark';

export { MarksOnlyMode } from './marksOnlyPlugin';
export type { MarksOnlyModeOptions } from './marksOnlyPlugin';

export { PendingCommentPreview, setPendingCommentPreview } from './pendingCommentPreview';
export type { PendingCommentPreviewRange } from './pendingCommentPreview';
