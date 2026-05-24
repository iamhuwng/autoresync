import { describe, expect, it } from 'vitest';
import { READING_V2_CANONICAL_TASK_TYPES } from '../../types/readingV2Taxonomy';
import {
  READING_V2_TASK_COMPONENT_CONTRACTS,
  assertReadingV2TaskComponentContractsComplete,
  getReadingV2TaskComponentContract,
  readingV2TaskCanUseHeuristicReferenceBank,
  readingV2TaskNeedsOptionSet,
  readingV2TaskUsesBlankMarkers,
  readingV2TaskUsesImportedLabeledOptions,
  readingV2TaskUsesImportedSectionReferences,
  readingV2TaskUsesPerQuestionLabeledOptions,
  readingV2TaskUsesReferenceLabelRange,
  readingV2TaskRequiresBankEvidence,
  readingV2TaskUsesSharedLabeledOptionBank,
} from './readingV2TaskComponentContracts.service';

describe('readingV2TaskComponentContracts.service', () => {
  it('defines one component contract for every canonical task type', () => {
    assertReadingV2TaskComponentContractsComplete();
    expect(Object.keys(READING_V2_TASK_COMPONENT_CONTRACTS).sort()).toEqual(
      [...READING_V2_CANONICAL_TASK_TYPES].sort(),
    );
  });

  it('separates free-text completion from visible-bank completion', () => {
    expect(getReadingV2TaskComponentContract('summary-completion-text')).toMatchObject({
      answerSurface: 'free-text',
      bankSource: 'none',
      bankStrictness: 'forbidden',
      needsOptionSet: false,
    });
    expect(getReadingV2TaskComponentContract('summary-completion-list')).toMatchObject({
      answerSurface: 'visible-choice-bank',
      bankSource: 'labeled-options',
      bankStrictness: 'source-visible',
      needsOptionSet: true,
    });
  });

  it('keeps matching-information range-authoritative and rejects heuristic reference banks', () => {
    expect(getReadingV2TaskComponentContract('matching-information')).toMatchObject({
      answerSurface: 'paragraph-reference-range',
      bankSource: 'reference-label-range',
      bankStrictness: 'range-authoritative',
      needsOptionSet: true,
      usesSectionReferences: false,
      usesReferenceLabelRange: true,
      allowsHeuristicReferenceBank: false,
    });
    expect(readingV2TaskCanUseHeuristicReferenceBank('matching-information')).toBe(false);
  });

  it('keeps feature/headings/endings matching on visible source reference banks', () => {
    expect(readingV2TaskUsesImportedSectionReferences('matching-features')).toBe(true);
    expect(readingV2TaskUsesImportedSectionReferences('matching-headings')).toBe(true);
    expect(readingV2TaskUsesImportedSectionReferences('matching-sentence-endings')).toBe(true);
    expect(readingV2TaskCanUseHeuristicReferenceBank('matching-features')).toBe(true);
  });

  it('distinguishes shared labeled banks from per-question choices', () => {
    expect(readingV2TaskUsesSharedLabeledOptionBank('summary-completion-list')).toBe(true);
    expect(readingV2TaskUsesSharedLabeledOptionBank('multiple-select')).toBe(true);
    expect(readingV2TaskUsesPerQuestionLabeledOptions('multiple-choice')).toBe(true);
    expect(readingV2TaskUsesImportedLabeledOptions('sentence-completion')).toBe(false);
  });

  it('reports option-set and blank-marker needs through task contracts', () => {
    expect(readingV2TaskNeedsOptionSet('multiple-choice')).toBe(true);
    expect(readingV2TaskNeedsOptionSet('short-answer')).toBe(false);
    expect(readingV2TaskRequiresBankEvidence('matching-information')).toBe(true);
    expect(readingV2TaskRequiresBankEvidence('summary-completion-text')).toBe(false);
    expect(readingV2TaskUsesReferenceLabelRange('matching-information')).toBe(true);
    expect(readingV2TaskUsesReferenceLabelRange('matching-features')).toBe(false);
    expect(readingV2TaskUsesBlankMarkers('table-completion')).toBe(true);
    expect(readingV2TaskUsesBlankMarkers('true-false-not-given')).toBe(false);
  });
});
