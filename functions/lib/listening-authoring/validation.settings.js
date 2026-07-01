"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseStatistics = exports.parseSettings = void 0;
const validation_primitives_1 = require("./validation.primitives");
const parseSettings = (value) => {
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error('document.settings must be a record.');
    }
    const settings = (0, validation_primitives_1.cloneJsonCompatibleValue)(value);
    (0, validation_primitives_1.assertAllowedFields)(settings, 'document.settings', [
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
    if (settings.showResults !== 'immediate' &&
        settings.showResults !== 'after-submission' &&
        settings.showResults !== 'never') {
        throw new Error('document.settings.showResults must be immediate, after-submission, or never.');
    }
    const parsed = {
        allowPause: (0, validation_primitives_1.requireBoolean)(settings.allowPause, 'document.settings.allowPause'),
        showTimer: (0, validation_primitives_1.requireBoolean)(settings.showTimer, 'document.settings.showTimer'),
        shuffleQuestions: (0, validation_primitives_1.requireBoolean)(settings.shuffleQuestions, 'document.settings.shuffleQuestions'),
        showResults: settings.showResults,
        allowReview: (0, validation_primitives_1.requireBoolean)(settings.allowReview, 'document.settings.allowReview'),
        passingScore: (0, validation_primitives_1.requireNonNegativeInteger)(settings.passingScore, 'document.settings.passingScore'),
        allowReplay: (0, validation_primitives_1.requireBoolean)(settings.allowReplay, 'document.settings.allowReplay'),
    };
    const maxReplays = (0, validation_primitives_1.optionalNonNegativeInteger)(settings.maxReplays, 'document.settings.maxReplays');
    if (maxReplays !== undefined) {
        parsed.maxReplays = maxReplays;
    }
    if (settings.audioControls !== undefined) {
        if (!(0, validation_primitives_1.isPlainObject)(settings.audioControls)) {
            throw new Error('document.settings.audioControls must be a record.');
        }
        const audioControls = (0, validation_primitives_1.cloneJsonCompatibleValue)(settings.audioControls);
        (0, validation_primitives_1.assertAllowedFields)(audioControls, 'document.settings.audioControls', [
            'showPlayPause',
            'showProgressBar',
            'showSeekControl',
            'showSpeedControl',
            'showSkipSection',
            'showVolumeControl',
        ]);
        parsed.audioControls = {
            showPlayPause: (0, validation_primitives_1.requireBoolean)(audioControls.showPlayPause, 'document.settings.audioControls.showPlayPause'),
            showProgressBar: (0, validation_primitives_1.requireBoolean)(audioControls.showProgressBar, 'document.settings.audioControls.showProgressBar'),
            showSeekControl: (0, validation_primitives_1.requireBoolean)(audioControls.showSeekControl, 'document.settings.audioControls.showSeekControl'),
            showSpeedControl: (0, validation_primitives_1.requireBoolean)(audioControls.showSpeedControl, 'document.settings.audioControls.showSpeedControl'),
            showSkipSection: (0, validation_primitives_1.requireBoolean)(audioControls.showSkipSection, 'document.settings.audioControls.showSkipSection'),
            showVolumeControl: (0, validation_primitives_1.requireBoolean)(audioControls.showVolumeControl, 'document.settings.audioControls.showVolumeControl'),
        };
    }
    return parsed;
};
exports.parseSettings = parseSettings;
const parseStatistics = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error('document.statistics must be a record.');
    }
    const statistics = (0, validation_primitives_1.cloneJsonCompatibleValue)(value);
    (0, validation_primitives_1.assertAllowedFields)(statistics, 'document.statistics', [
        'attempts',
        'averageScore',
        'averageTime',
        'completionRate',
    ]);
    const parsed = {
        attempts: (0, validation_primitives_1.requireNonNegativeInteger)(statistics.attempts, 'document.statistics.attempts'),
        averageScore: (0, validation_primitives_1.requireNonNegativeInteger)(statistics.averageScore, 'document.statistics.averageScore'),
        averageTime: (0, validation_primitives_1.requireNonNegativeInteger)(statistics.averageTime, 'document.statistics.averageTime'),
        completionRate: (0, validation_primitives_1.requireNonNegativeInteger)(statistics.completionRate, 'document.statistics.completionRate'),
    };
    return parsed;
};
exports.parseStatistics = parseStatistics;
//# sourceMappingURL=validation.settings.js.map