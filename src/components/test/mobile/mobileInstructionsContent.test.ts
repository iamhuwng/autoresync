import { describe, expect, it } from 'vitest';
import { getMobileInstructionsContent } from './mobileInstructionsContent';

describe('mobileInstructionsContent', () => {
  it('returns live-mode rules and controls help', () => {
    const content = getMobileInstructionsContent('live');

    expect(content.rules).toContain('This is a timed session managed by your teacher.');
    expect(content.controlsHelp.some((item) => item.includes('overflow menu'))).toBe(true);
  });

  it('returns homework-mode rules derived from resolved settings', () => {
    const content = getMobileInstructionsContent('homework', undefined, {
      timerMinutes: 45,
      maxAttempts: 2,
      allowPause: false,
    } as any);

    expect(content.rules).toContain('You have 45 minutes to complete this test.');
    expect(content.rules).toContain('You have up to 2 attempts.');
    expect(content.rules).toContain('Your progress is saved automatically as you work.');
  });

  it('returns solo-mode feedback and pause rules from resolved settings', () => {
    const content = getMobileInstructionsContent('solo', undefined, {
      timerMinutes: null,
      allowPause: true,
      feedbackTiming: 'after_completion',
    } as any);

    expect(content.rules).toContain('There is no time limit. Take as long as you need.');
    expect(content.rules).toContain('You can pause and resume at any time.');
    expect(content.rules).toContain('You will see your results after submitting the test.');
  });
});
