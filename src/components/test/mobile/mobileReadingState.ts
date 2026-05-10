import type { SavedMobileState, ReadingSavedMobileState } from '@/types/practice.types';

export interface HydratedMobileReadingState {
  activePassageId?: string;
  questionSheetOpen: boolean;
  reviewSummaryOpen: boolean;
  passageScrollByPassage: Record<string, number>;
  activeQuestionGroupByPassage: Record<string, number>;
  questionSheetScrollByPassage: Record<string, number>;
  textSize: number;
}

interface SerializeMobileReadingStateInput {
  activePassageId?: string | null;
  questionSheetOpen: boolean;
  reviewSummaryOpen: boolean;
  passageScrollByPassage: Record<string, number>;
  activeQuestionGroupByPassage: Record<string, number>;
  questionSheetScrollByPassage: Record<string, number>;
  textSize: number;
}

export function getReadingTextSizeStorageKey(studentId: string): string {
  return `reading_text_size_${studentId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceScrollMap(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [key, entryValue]) => {
    if (typeof entryValue === 'number' && Number.isFinite(entryValue)) {
      acc[key] = entryValue;
    }
    return acc;
  }, {});
}

export function hydrateMobileReadingState(
  savedMobileState: SavedMobileState | null | undefined,
  fallbackTextSize: number,
): HydratedMobileReadingState {
  // Narrow: only process if we have a reading-kind state (or legacy data without 'kind')
  const rs: ReadingSavedMobileState | undefined =
    savedMobileState && (savedMobileState.kind === 'reading' || !('kind' in savedMobileState))
      ? savedMobileState as ReadingSavedMobileState
      : undefined;

  const textSize = typeof rs?.textSize === 'number' && Number.isFinite(rs.textSize)
    ? rs.textSize
    : fallbackTextSize;

  return {
    activePassageId: typeof rs?.activePassageId === 'string' ? rs.activePassageId : undefined,
    questionSheetOpen: rs?.questionSheetOpen === true,
    reviewSummaryOpen: rs?.reviewSummaryOpen === true,
    passageScrollByPassage: coerceScrollMap(rs?.passageScrollByPassage),
    activeQuestionGroupByPassage: coerceScrollMap(rs?.activeQuestionGroupByPassage),
    questionSheetScrollByPassage: coerceScrollMap(rs?.questionSheetScrollByPassage),
    textSize,
  };
}

export function serializeMobileReadingState({
  activePassageId,
  questionSheetOpen,
  reviewSummaryOpen,
  passageScrollByPassage,
  activeQuestionGroupByPassage,
  questionSheetScrollByPassage,
  textSize,
}: SerializeMobileReadingStateInput): ReadingSavedMobileState {
  return {
    kind: 'reading',
    ...(activePassageId ? { activePassageId } : {}),
    questionSheetOpen,
    reviewSummaryOpen,
    passageScrollByPassage,
    activeQuestionGroupByPassage,
    questionSheetScrollByPassage,
    textSize,
  };
}
