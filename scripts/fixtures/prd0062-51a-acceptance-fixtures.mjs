import { ACTIVITY_SCHEMA_FIXTURES } from '../__tests__/fixtures/prd0062-activity-coverage/activity-schema-fixtures.mjs';

const personalTimerFixture = Object.freeze({
  kind: 'personal-timer-ui-only',
  seed: 'prd0062-51a:personal-timer-ui-only:v1',
  timerKey: 'prd0062_acceptance/personal-timer-ui-only',
  sourceCommit: 'ba8b2d59d9ccaae2b6cc7a74a34b55b32e1b1c70',
  sourcePath: 'src/components/book-runtime/PersonalTimer.tsx',
  invariants: Object.freeze([
    'no-teacher-enforcement-or-visibility',
    'no-telemetry-effect',
    'no-grade-effect',
    'no-deadline-effect',
    'no-submission-effect',
    'no-attempt-effect',
    'no-autosave-effect',
    'no-integrity-effect',
    'no-completion-effect',
  ]),
});

export const PRD0062_51A_ACCEPTANCE_FIXTURES = Object.freeze({
  ...ACTIVITY_SCHEMA_FIXTURES,
  'personal-timer-ui-only': personalTimerFixture,
});

export const getPrd0062AcceptanceFixture = (fixtureId) =>
  PRD0062_51A_ACCEPTANCE_FIXTURES[fixtureId];
