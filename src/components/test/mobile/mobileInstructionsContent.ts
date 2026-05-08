/**
 * mobileInstructionsContent.ts — Single source of truth for mode-specific rules
 * and controls-help copy used by both MobileStartScreen (Task 2A) and
 * MobileInstructionsModal (Task 8.3).
 *
 * Derives rules from existing product behavior/data only — does not hardcode
 * claims unsupported by existing code.
 *
 * @see PRD-0043 Tasks 2A.1, 8.3
 */

import type { PracticeContext } from '../../practice/IELTSPracticeView';
import type { ResolvedPracticeSettings } from '../../../types/practice.types';

export type ExamMode = 'live' | 'solo' | 'homework';

export interface InstructionsContent {
  rules: string[];
  controlsHelp: string[];
}

/**
 * Returns mode-specific rules and controls-help copy for the mobile exam interface.
 *
 * @param mode - The current exam mode ('live', 'solo', or 'homework')
 * @param practiceContext - Optional context for solo/homework modes
 * @param resolvedSettings - Optional resolved practice settings
 */
export function getMobileInstructionsContent(
  mode: ExamMode,
  _practiceContext?: PracticeContext,
  resolvedSettings?: ResolvedPracticeSettings,
): InstructionsContent {
  switch (mode) {
    case 'live':
      return getLiveContent();
    case 'homework':
      return getHomeworkContent(resolvedSettings);
    case 'solo':
      return getSoloContent(resolvedSettings);
    default:
      return getLiveContent();
  }
}

// ── Live Mode ─────────────────────────────────────────────────────────────────

function getLiveContent(): InstructionsContent {
  return {
    rules: [
      'This is a timed session managed by your teacher.',
      'The timer will start when your teacher begins the test.',
      'You cannot pause or restart the test.',
      'Your answers are saved automatically as you work.',
      'The test will be submitted automatically when time runs out.',
    ],
    controlsHelp: [
      'Swipe between passages using the tabs at the top.',
      'Tap the "Questions" button to open the answer sheet.',
      'Swipe down or tap the backdrop to close the answer sheet.',
      'Use the overflow menu (⋮) for text size, review, and submit options.',
    ],
  };
}

// ── Homework Mode ─────────────────────────────────────────────────────────────

function getHomeworkContent(
  resolvedSettings?: ResolvedPracticeSettings,
): InstructionsContent {
  const rules: string[] = [
    'Complete this homework assignment at your own pace.',
  ];

  if (resolvedSettings?.timerMinutes) {
    rules.push(`You have ${resolvedSettings.timerMinutes} minutes to complete this test.`);
  } else {
    rules.push('There is no time limit for this assignment.');
  }

  if (resolvedSettings?.maxAttempts) {
    rules.push(`You have up to ${resolvedSettings.maxAttempts} attempt${resolvedSettings.maxAttempts > 1 ? 's' : ''}.`);
  }

  if (resolvedSettings?.allowPause) {
    rules.push('You can pause and resume at any time. Your progress is saved.');
  } else {
    rules.push('Your progress is saved automatically as you work.');
  }

  rules.push('You can close the browser and return later to continue.');

  return {
    rules,
    controlsHelp: [
      'Swipe between passages using the tabs at the top.',
      'Tap the "Questions" button to open the answer sheet.',
      'Swipe down or tap the backdrop to close the answer sheet.',
      'Use the overflow menu (⋮) for text size, review, and submit options.',
    ],
  };
}

// ── Solo Mode ─────────────────────────────────────────────────────────────────

function getSoloContent(
  resolvedSettings?: ResolvedPracticeSettings,
): InstructionsContent {
  const rules: string[] = [
    'Practice at your own pace in solo mode.',
  ];

  if (resolvedSettings?.timerMinutes) {
    rules.push(`You have ${resolvedSettings.timerMinutes} minutes to complete this test.`);
  } else {
    rules.push('There is no time limit. Take as long as you need.');
  }

  if (resolvedSettings?.allowPause) {
    rules.push('You can pause and resume at any time.');
  }

  rules.push('Your progress is saved automatically. You can close and return later.');

  if (resolvedSettings?.feedbackTiming === 'immediate') {
    rules.push('You will see feedback immediately after answering each question.');
  } else if (resolvedSettings?.feedbackTiming === 'after_completion') {
    rules.push('You will see your results after submitting the test.');
  }

  return {
    rules,
    controlsHelp: [
      'Swipe between passages using the tabs at the top.',
      'Tap the "Questions" button to open the answer sheet.',
      'Swipe down or tap the backdrop to close the answer sheet.',
      'Use the overflow menu (⋮) for text size, review, and submit options.',
    ],
  };
}
