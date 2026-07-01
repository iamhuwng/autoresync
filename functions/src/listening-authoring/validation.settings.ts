import type { ListeningAuthoringDocumentV1 } from './contracts';
import {
  assertAllowedFields,
  cloneJsonCompatibleValue,
  isPlainObject,
  optionalNonNegativeInteger,
  requireBoolean,
  requireNonNegativeInteger,
} from './validation.primitives';

export const parseSettings = (value: unknown): ListeningAuthoringDocumentV1['settings'] => {
  if (!isPlainObject(value)) {
    throw new Error('document.settings must be a record.');
  }

  const settings = cloneJsonCompatibleValue(value);
  assertAllowedFields(settings, 'document.settings', [
    'allowPause',
    'showTimer',
    'shuffleQuestions',
    'showResults',
    'allowReview',
    'passingScore',
    'allowReplay',
    'maxReplays',
    'audioControls',
  ]);

  if (
    settings.showResults !== 'immediate' &&
    settings.showResults !== 'after-submission' &&
    settings.showResults !== 'never'
  ) {
    throw new Error('document.settings.showResults must be immediate, after-submission, or never.');
  }
  const parsed: ListeningAuthoringDocumentV1['settings'] = {
    allowPause: requireBoolean(settings.allowPause, 'document.settings.allowPause'),
    showTimer: requireBoolean(settings.showTimer, 'document.settings.showTimer'),
    shuffleQuestions: requireBoolean(
      settings.shuffleQuestions,
      'document.settings.shuffleQuestions',
    ),
    showResults: settings.showResults,
    allowReview: requireBoolean(settings.allowReview, 'document.settings.allowReview'),
    passingScore: requireNonNegativeInteger(settings.passingScore, 'document.settings.passingScore'),
    allowReplay: requireBoolean(settings.allowReplay, 'document.settings.allowReplay'),
  };
  const maxReplays = optionalNonNegativeInteger(settings.maxReplays, 'document.settings.maxReplays');
  if (maxReplays !== undefined) {
    parsed.maxReplays = maxReplays;
  }
  if (settings.audioControls !== undefined) {
    if (!isPlainObject(settings.audioControls)) {
      throw new Error('document.settings.audioControls must be a record.');
    }
    const audioControls = cloneJsonCompatibleValue(settings.audioControls);
    assertAllowedFields(audioControls, 'document.settings.audioControls', [
      'showPlayPause',
      'showProgressBar',
      'showSeekControl',
      'showSpeedControl',
      'showSkipSection',
      'showVolumeControl',
    ]);
    parsed.audioControls = {
      showPlayPause: requireBoolean(
        audioControls.showPlayPause,
        'document.settings.audioControls.showPlayPause',
      ),
      showProgressBar: requireBoolean(
        audioControls.showProgressBar,
        'document.settings.audioControls.showProgressBar',
      ),
      showSeekControl: requireBoolean(
        audioControls.showSeekControl,
        'document.settings.audioControls.showSeekControl',
      ),
      showSpeedControl: requireBoolean(
        audioControls.showSpeedControl,
        'document.settings.audioControls.showSpeedControl',
      ),
      showSkipSection: requireBoolean(
        audioControls.showSkipSection,
        'document.settings.audioControls.showSkipSection',
      ),
      showVolumeControl: requireBoolean(
        audioControls.showVolumeControl,
        'document.settings.audioControls.showVolumeControl',
      ),
    };
  }

  return parsed;
};

export const parseStatistics = (value: unknown): ListeningAuthoringDocumentV1['statistics'] => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new Error('document.statistics must be a record.');
  }

  const statistics = cloneJsonCompatibleValue(value);
  assertAllowedFields(statistics, 'document.statistics', [
    'attempts',
    'averageScore',
    'averageTime',
    'completionRate',
  ]);

  const parsed: NonNullable<ListeningAuthoringDocumentV1['statistics']> = {
    attempts: requireNonNegativeInteger(statistics.attempts, 'document.statistics.attempts'),
    averageScore: requireNonNegativeInteger(
      statistics.averageScore,
      'document.statistics.averageScore',
    ),
    averageTime: requireNonNegativeInteger(
      statistics.averageTime,
      'document.statistics.averageTime',
    ),
    completionRate: requireNonNegativeInteger(
      statistics.completionRate,
      'document.statistics.completionRate',
    ),
  };

  return parsed;
};
