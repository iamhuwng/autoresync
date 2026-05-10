import { describe, expect, it } from 'vitest';
import {
  clearListeningTransientState,
  hydrateListeningMobileState,
  isCompatibleListeningMobileState,
  serializeListeningMobileState,
} from './mobileListeningState';
import type { ListeningSavedMobileState } from '@/types/practice.types';

const baseContext = {
  materialId: 'm1',
  partCount: 4,
  questionsByPart: {
    1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    2: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    3: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    4: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
  },
  scopeKey: 's1',
};

const validSaved: ListeningSavedMobileState = {
  kind: 'listening',
  version: 1,
  compat: {
    materialId: 'm1',
    scopeKey: 's1',
    partCount: 4,
    questionLayoutSignature: '1:1,2,3,4,5,6,7,8,9,10|2:11,12,13,14,15,16,17,18,19,20|3:21,22,23,24,25,26,27,28,29,30|4:31,32,33,34,35,36,37,38,39,40',
  },
  viewedPartNumber: 2,
  currentQuestionNumber: 15,
  textSize: 18,
  answerSheetScrollByPart: { '2': 120 },
  imageZoomByPart: { '2': { scale: 1.5, offsetX: 10, offsetY: 20 } },
};

describe('mobileListeningState helpers', () => {
  describe('isCompatibleListeningMobileState', () => {
    it('returns true for a valid ListeningSavedMobileState', () => {
      expect(isCompatibleListeningMobileState(validSaved, baseContext)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isCompatibleListeningMobileState(null, baseContext)).toBe(false);
    });

    it('returns false for a Reading state', () => {
      expect(isCompatibleListeningMobileState(
        { kind: 'reading', questionSheetOpen: false, reviewSummaryOpen: false, passageScrollByPassage: {}, activeQuestionGroupByPassage: {}, questionSheetScrollByPassage: {} },
        baseContext,
      )).toBe(false);
    });

    it('returns false for unknown version', () => {
      expect(isCompatibleListeningMobileState(
        { ...validSaved, version: 2 as any },
        baseContext,
      )).toBe(false);
    });

    it('returns false for incompatible part count metadata', () => {
      expect(isCompatibleListeningMobileState(
        {
          ...validSaved,
          compat: {
            ...validSaved.compat!,
            partCount: 3,
          },
        },
        baseContext,
      )).toBe(false);
    });

    it('returns false for incompatible question layout metadata', () => {
      expect(isCompatibleListeningMobileState(
        {
          ...validSaved,
          compat: {
            ...validSaved.compat!,
            questionLayoutSignature: '1:1,2|2:3,4',
          },
        },
        baseContext,
      )).toBe(false);
    });

    it('returns false for incompatible scope metadata', () => {
      expect(isCompatibleListeningMobileState(
        {
          ...validSaved,
          compat: {
            ...validSaved.compat!,
            scopeKey: 'other-scope',
          },
        },
        baseContext,
      )).toBe(false);
    });
  });

  describe('hydrateListeningMobileState', () => {
    it('hydrates a valid payload without clamping', () => {
      const hydrated = hydrateListeningMobileState(validSaved, baseContext, 16, false);

      expect(hydrated.viewedPartNumber).toBe(2);
      expect(hydrated.currentQuestionNumber).toBe(15);
      expect(hydrated.textSize).toBe(18);
      expect(hydrated.answerSheetScrollByPart).toEqual({ '2': 120 });
      expect(hydrated.imageZoomByPart).toEqual({ '2': { scale: 1.5, offsetX: 10, offsetY: 20 } });
      expect(hydrated.playback).toBeUndefined();
    });

    it('clamps viewedPartNumber to 1 when out of range', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        viewedPartNumber: 99,
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 16, false);
      expect(hydrated.viewedPartNumber).toBe(1);
    });

    it('clamps viewedPartNumber to 1 when zero', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        viewedPartNumber: 0 as any,
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 16, false);
      expect(hydrated.viewedPartNumber).toBe(1);
    });

    it('falls back currentQuestionNumber to first question of part when invalid', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        viewedPartNumber: 3,
        currentQuestionNumber: 999,
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 16, false);
      expect(hydrated.currentQuestionNumber).toBe(21); // first question of part 3
    });

    it('uses fallback text size when none is saved', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        textSize: undefined as any,
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 20, false);
      expect(hydrated.textSize).toBe(20);
    });

    it('strips playback when includingPlayback is false', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        playback: {
          currentAudioIndex: 1,
          audioPositionSeconds: 30.5,
          volume: 0.8,
          playbackSpeed: 1,
          audioIndicesCompleted: [0],
        },
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 16, false);
      expect(hydrated.playback).toBeUndefined();
    });

    it('hydrates playback when includingPlayback is true', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        playback: {
          currentAudioIndex: 1,
          audioPositionSeconds: 30.5,
          volume: 0.8,
          playbackSpeed: 1,
          audioIndicesCompleted: [0],
        },
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 16, true);
      expect(hydrated.playback).toEqual({
        currentAudioIndex: 1,
        audioPositionSeconds: 30.5,
        volume: 0.8,
        playbackSpeed: 1,
        audioIndicesCompleted: [0],
      });
    });

    it('drops invalid zoom entries in imageZoomByPart', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        imageZoomByPart: {
          '1': { scale: 2, offsetX: 5, offsetY: 10 },
          '2': 'invalid' as any,
        },
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 16, false);
      expect(hydrated.imageZoomByPart).toEqual({
        '1': { scale: 2, offsetX: 5, offsetY: 10 },
      });
    });

    it('resets scale to 1 when zoom scale is less than 1', () => {
      const saved: ListeningSavedMobileState = {
        ...validSaved,
        imageZoomByPart: {
          '1': { scale: 0.5, offsetX: 5, offsetY: 10 },
        },
      };
      const hydrated = hydrateListeningMobileState(saved, baseContext, 16, false);
      expect(hydrated.imageZoomByPart['1'].scale).toBe(1);
    });
  });

  describe('serializeListeningMobileState', () => {
    it('serializes with kind and version 1', () => {
      const result = serializeListeningMobileState({
        compatContext: baseContext,
        viewedPartNumber: 3,
        currentQuestionNumber: 25,
        textSize: 18,
        answerSheetScrollByPart: { '3': 200 },
        imageZoomByPart: { '3': { scale: 1.2, offsetX: 0, offsetY: 0 } },
      });

      expect(result).toEqual({
        kind: 'listening',
        version: 1,
        compat: {
          materialId: 'm1',
          scopeKey: 's1',
          partCount: 4,
          questionLayoutSignature: '1:1,2,3,4,5,6,7,8,9,10|2:11,12,13,14,15,16,17,18,19,20|3:21,22,23,24,25,26,27,28,29,30|4:31,32,33,34,35,36,37,38,39,40',
        },
        viewedPartNumber: 3,
        currentQuestionNumber: 25,
        textSize: 18,
        answerSheetScrollByPart: { '3': 200 },
        imageZoomByPart: { '3': { scale: 1.2, offsetX: 0, offsetY: 0 } },
      });
    });

    it('omits optional fields when not provided', () => {
      const result = serializeListeningMobileState({
        viewedPartNumber: 1,
        answerSheetScrollByPart: {},
        imageZoomByPart: {},
      });

      expect(result.currentQuestionNumber).toBeUndefined();
      expect(result.textSize).toBeUndefined();
      expect(result.playback).toBeUndefined();
    });
  });

  describe('clearListeningTransientState', () => {
    it('returns all transient states as false', () => {
      const cleared = clearListeningTransientState();

      expect(cleared).toEqual({
        questionSheetOpen: false,
        submitSheetOpen: false,
        overflowMenuOpen: false,
        textSizeControlOpen: false,
        instructionsOpen: false,
        showWaitPopup: false,
        isPaused: false,
        isSubmitting: false,
        testSubmitted: false,
      });
    });
  });
});
