import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClosureUpdate,
  findActiveSessions,
} from '../end-active-sessions.mjs';

test('findActiveSessions returns only active statuses without exposing player data', () => {
  const sessions = findActiveSessions({
    WAIT1: {
      status: 'waiting',
      mode: 'test',
      testId: 'test-1',
      players: { student1: { name: 'Student One' } },
    },
    DONE1: {
      status: 'completed',
      mode: 'test',
    },
  });

  assert.deepEqual(sessions, [{
    sessionCode: 'WAIT1',
    status: 'waiting',
    mode: 'test',
    testId: 'test-1',
    quizId: null,
    linkedClassId: null,
    playerCount: 1,
    reviewReleaseState: null,
  }]);
});

test('buildClosureUpdate preserves feedback release and records completion', () => {
  assert.deepEqual(
    buildClosureUpdate(
      {
        testId: 'test-1',
        reviewReleaseState: 'feedback-released',
      },
      1234,
    ),
    {
      status: 'completed',
      completedAt: 1234,
      lastTestCompletedAt: 1234,
      lastTestId: 'test-1',
      reviewReleaseState: 'feedback-released',
      reviewReleaseStateUpdatedAt: 1234,
      updatedAt: 1234,
    },
  );
});

test('buildClosureUpdate releases review when feedback is not already released', () => {
  assert.equal(
    buildClosureUpdate({ reviewReleaseState: 'hidden' }, 1234).reviewReleaseState,
    'review-released',
  );
});
