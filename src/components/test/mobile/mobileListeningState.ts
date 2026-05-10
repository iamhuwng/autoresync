/**
 * mobileListeningState — Listening mobile-state serialization, hydration,
 * clamping, compatibility checks, and transient-state clearing.
 *
 * Single source of truth for all Listening mobile payload manipulation.
 * Follows the same structural pattern as mobileReadingState.ts.
 *
 * @see PRD-0045 Sections 3, 5
 */

import type { ListeningSavedMobileState, SavedMobileState } from '@/types/practice.types';

// ── Default zoom entry ─────────────────────────────────────────────────────────

const DEFAULT_ZOOM = { scale: 1, offsetX: 0, offsetY: 0 } as const;

// ── Platform-storage key for text-size fallback ────────────────────────────────

export function getListeningTextSizeStorageKey(studentId: string): string {
  return `listening_text_size_${studentId}`;
}

// ── Type Guards ────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function getQuestionsByPartSignature(questionsByPart: Record<number, number[]>): string {
  return Object.keys(questionsByPart)
    .map(key => Number(key))
    .filter(partNumber => isPositiveInteger(partNumber))
    .sort((left, right) => left - right)
    .map(partNumber => `${partNumber}:${(questionsByPart[partNumber] ?? []).join(',')}`)
    .join('|');
}

function isValidCompatContext(context: ListeningCompatContext): boolean {
  if (!isPositiveInteger(context.partCount)) {
    return false;
  }

  for (let partNumber = 1; partNumber <= context.partCount; partNumber += 1) {
    const questionNumbers = context.questionsByPart[partNumber];
    if (!Array.isArray(questionNumbers) || questionNumbers.length === 0) {
      return false;
    }

    if (!questionNumbers.every(questionNumber => isPositiveInteger(questionNumber))) {
      return false;
    }
  }

  return true;
}

// ── Coercion Helpers ───────────────────────────────────────────────────────────

function coerceScrollMap(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((acc, [key, entryValue]) => {
    if (isFiniteNumber(entryValue)) {
      acc[key] = entryValue;
    }
    return acc;
  }, {});
}

function coerceZoomMap(
  value: unknown,
): Record<string, { scale: number; offsetX: number; offsetY: number }> {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<
    Record<string, { scale: number; offsetX: number; offsetY: number }>
  >((acc, [key, entryValue]) => {
    if (isPlainObject(entryValue)) {
      const scale = isFiniteNumber(entryValue.scale) && entryValue.scale >= 1
        ? entryValue.scale
        : DEFAULT_ZOOM.scale;
      const offsetX = isFiniteNumber(entryValue.offsetX) ? entryValue.offsetX : DEFAULT_ZOOM.offsetX;
      const offsetY = isFiniteNumber(entryValue.offsetY) ? entryValue.offsetY : DEFAULT_ZOOM.offsetY;
      acc[key] = { scale, offsetX, offsetY };
    }
    // Drop invalid entries rather than coercing them (per PRD Section 5)
    return acc;
  }, {});
}

// ── Hydrated State Shape ───────────────────────────────────────────────────────

export interface HydratedMobileListeningState {
  viewedPartNumber: number;
  currentQuestionNumber: number | undefined;
  textSize: number;
  answerSheetScrollByPart: Record<string, number>;
  imageZoomByPart: Record<string, { scale: number; offsetX: number; offsetY: number }>;
  playback?: {
    currentAudioIndex: number;
    audioPositionSeconds: number;
    volume: number;
    playbackSpeed: number;
    audioIndicesCompleted: number[];
  };
}

// ── Compatibility Check ────────────────────────────────────────────────────────

/**
 * Compat context describes the current test structure.
 * Used to determine if a saved payload is still compatible.
 */
export interface ListeningCompatContext {
  materialId: string;
  partCount: number;
  /** Map of 1-based part number to array of question numbers in that part */
  questionsByPart: Record<number, number[]>;
  /** For live: session scope. For homework: homework+submission scope. */
  scopeKey: string;
}

/**
 * Determine if a saved mobile payload is compatible with the current test.
 * Discards the entire payload when any incompatibility is found (PRD Section 5).
 */
export function isCompatibleListeningMobileState(
  saved: SavedMobileState | null | undefined,
  context: ListeningCompatContext,
): saved is ListeningSavedMobileState {
  if (!saved || !isPlainObject(saved)) return false;
  if ((saved as Record<string, unknown>).kind !== 'listening') return false;
  if ((saved as Record<string, unknown>).version !== 1) return false;

  if (!isValidCompatContext(context)) return false;

  const compat = (saved as Record<string, unknown>).compat;
  if (!compat) {
    return true;
  }

  if (!isPlainObject(compat)) {
    return false;
  }

  if (compat.materialId !== context.materialId) {
    return false;
  }
  if (compat.scopeKey !== context.scopeKey) {
    return false;
  }
  if (compat.partCount !== context.partCount) {
    return false;
  }
  if (compat.questionLayoutSignature !== getQuestionsByPartSignature(context.questionsByPart)) {
    return false;
  }

  return true;
}

// ── Hydrate ────────────────────────────────────────────────────────────────────

/**
 * Hydrate a saved Listening mobile payload.
 *
 * Clamps:
 * - `viewedPartNumber` to [1, partCount], falls back to 1.
 * - `currentQuestionNumber` to a valid question in the restored part; if invalid,
 *   falls back to the first question of that part.
 * - Drops invalid map entries.
 * - Resets all transient UI state to closed.
 */
export function hydrateListeningMobileState(
  saved: ListeningSavedMobileState,
  context: ListeningCompatContext,
  fallbackTextSize: number,
  includingPlayback: boolean,
): HydratedMobileListeningState {
  // Clamp viewedPartNumber
  let viewedPartNumber = isFiniteNumber(saved.viewedPartNumber) ? saved.viewedPartNumber : 1;
  if (viewedPartNumber < 1 || viewedPartNumber > context.partCount || !Number.isInteger(viewedPartNumber)) {
    viewedPartNumber = 1;
  }

  // Resolve questions for the restored part
  const partQuestions = context.questionsByPart[viewedPartNumber] ?? [];

  // Clamp currentQuestionNumber
  let currentQuestionNumber: number | undefined;
  if (isFiniteNumber(saved.currentQuestionNumber) && partQuestions.includes(saved.currentQuestionNumber)) {
    currentQuestionNumber = saved.currentQuestionNumber;
  } else if (partQuestions.length > 0) {
    currentQuestionNumber = partQuestions[0];
  }

  // Text size
  const textSize = isFiniteNumber(saved.textSize) ? saved.textSize : fallbackTextSize;

  // Coerce maps
  const answerSheetScrollByPart = coerceScrollMap(saved.answerSheetScrollByPart);
  const imageZoomByPart = coerceZoomMap(saved.imageZoomByPart);

  // Playback (solo/homework only)
  let playback: HydratedMobileListeningState['playback'];
  if (includingPlayback && saved.playback && isPlainObject(saved.playback)) {
    const p = saved.playback as Record<string, unknown>;
    if (
      isFiniteNumber(p.currentAudioIndex)
      && isFiniteNumber(p.audioPositionSeconds)
      && isFiniteNumber(p.volume)
      && isFiniteNumber(p.playbackSpeed)
      && Array.isArray(p.audioIndicesCompleted)
    ) {
      playback = {
        currentAudioIndex: p.currentAudioIndex as number,
        audioPositionSeconds: p.audioPositionSeconds as number,
        volume: p.volume as number,
        playbackSpeed: p.playbackSpeed as number,
        audioIndicesCompleted: (p.audioIndicesCompleted as unknown[]).filter(
          (v): v is number => isFiniteNumber(v),
        ),
      };
    }
  }

  return {
    viewedPartNumber,
    currentQuestionNumber,
    textSize,
    answerSheetScrollByPart,
    imageZoomByPart,
    ...(playback ? { playback } : {}),
  };
}

// ── Serialize ──────────────────────────────────────────────────────────────────

export interface SerializeListeningMobileStateInput {
  compatContext?: ListeningCompatContext;
  viewedPartNumber: number;
  currentQuestionNumber?: number;
  textSize?: number;
  answerSheetScrollByPart: Record<string, number>;
  imageZoomByPart: Record<string, { scale: number; offsetX: number; offsetY: number }>;
  playback?: {
    currentAudioIndex: number;
    audioPositionSeconds: number;
    volume: number;
    playbackSpeed: number;
    audioIndicesCompleted: number[];
  };
}

export function serializeListeningMobileState(
  input: SerializeListeningMobileStateInput,
): ListeningSavedMobileState {
  return {
    kind: 'listening',
    version: 1,
    ...(input.compatContext ? {
      compat: {
        materialId: input.compatContext.materialId,
        scopeKey: input.compatContext.scopeKey,
        partCount: input.compatContext.partCount,
        questionLayoutSignature: getQuestionsByPartSignature(input.compatContext.questionsByPart),
      },
    } : {}),
    viewedPartNumber: input.viewedPartNumber,
    ...(input.currentQuestionNumber !== undefined ? { currentQuestionNumber: input.currentQuestionNumber } : {}),
    ...(input.textSize !== undefined ? { textSize: input.textSize } : {}),
    answerSheetScrollByPart: input.answerSheetScrollByPart,
    imageZoomByPart: input.imageZoomByPart,
    ...(input.playback ? { playback: input.playback } : {}),
  };
}

// ── Transient State Clearing ───────────────────────────────────────────────────

/**
 * Returns an object with all transient UI states forced closed.
 * These values are NOT persisted (PRD Section 5) but must be explicitly
 * reset after restore to avoid stale overlay state.
 */
export interface ListeningTransientState {
  questionSheetOpen: boolean;
  submitSheetOpen: boolean;
  overflowMenuOpen: boolean;
  textSizeControlOpen: boolean;
  instructionsOpen: boolean;
  showWaitPopup: boolean;
  isPaused: boolean;
  isSubmitting: boolean;
  testSubmitted: boolean;
}

export function clearListeningTransientState(): ListeningTransientState {
  return {
    questionSheetOpen: false,
    submitSheetOpen: false,
    overflowMenuOpen: false,
    textSizeControlOpen: false,
    instructionsOpen: false,
    showWaitPopup: false,
    isPaused: false,
    isSubmitting: false,
    testSubmitted: false,
  };
}
