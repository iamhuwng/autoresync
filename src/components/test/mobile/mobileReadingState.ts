import type { SavedMobileState } from '@/types/practice.types';

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
  const textSize = typeof savedMobileState?.textSize === 'number' && Number.isFinite(savedMobileState.textSize)
    ? savedMobileState.textSize
    : fallbackTextSize;

  return {
    activePassageId: typeof savedMobileState?.activePassageId === 'string' ? savedMobileState.activePassageId : undefined,
    questionSheetOpen: savedMobileState?.questionSheetOpen === true,
    reviewSummaryOpen: savedMobileState?.reviewSummaryOpen === true,
    passageScrollByPassage: coerceScrollMap(savedMobileState?.passageScrollByPassage),
    activeQuestionGroupByPassage: coerceScrollMap(savedMobileState?.activeQuestionGroupByPassage),
    questionSheetScrollByPassage: coerceScrollMap(savedMobileState?.questionSheetScrollByPassage),
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
}: SerializeMobileReadingStateInput): SavedMobileState {
  return {
    ...(activePassageId ? { activePassageId } : {}),
    questionSheetOpen,
    reviewSummaryOpen,
    passageScrollByPassage,
    activeQuestionGroupByPassage,
    questionSheetScrollByPassage,
    textSize,
  };
}
