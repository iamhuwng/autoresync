import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_TASK_TYPE_IDS,
  loadPrd0062ReadingListeningCoverage,
  validatePrd0062ReadingListeningCoverage,
} from '../lib/prd0062-reading-listening-coverage.mjs';

const matrix = () => structuredClone(loadPrd0062ReadingListeningCoverage());

test('accepts complete versioned Reading and Listening coverage registry', () => {
  const coverage = matrix();
  assert.equal(coverage.taskTypes.length, EXPECTED_TASK_TYPE_IDS.length);
  assert.deepEqual(validatePrd0062ReadingListeningCoverage(coverage), []);
});

test('maps every Listening type to accepted structured or source-assisted support', () => {
  const listening = matrix().taskTypes.filter((row) => row.domain === 'listening');
  assert.equal(listening.length, 12);
  for (const row of listening) {
    assert.equal(row.support.status, row.presentationMode === 'structured'
      ? 'structurally-supported'
      : 'supported-through-source-assisted');
    assert.equal(row.support.releaseBlocker, undefined);
  }
});

test('fails closed for unclassified, duplicated, falsely structural, stale, and unregistered types', () => {
  const invalid = matrix();
  invalid.taskTypes = invalid.taskTypes.filter((row) => row.id !== 'reading-matching-headings');
  invalid.taskTypes[1].id = invalid.taskTypes[0].id;
  invalid.taskTypes.find((row) => row.id === 'listening-note-completion').support.status = 'explicitly-unsupported-release-blocking';
  invalid.taskTypes.find((row) => row.id === 'listening-form-completion').taskProfile.taxonomyId = 'unknown-listening-profile';
  const errors = validatePrd0062ReadingListeningCoverage(invalid).join('\n');
  assert.match(errors, /reading-matching-headings: unclassified/);
  assert.match(errors, /duplicate id/);
  assert.match(errors, /stale unregistered Listening support status/);
  assert.match(errors, /canonical mapping is not registered by accepted adapters/);
});

test('fails source-assisted entries without required context or accessible correspondence', () => {
  const invalid = matrix();
  const diagram = invalid.taskTypes.find((row) => row.id === 'reading-diagram-label-completion');
  diagram.contextRequirement = 'optional';
  diagram.accessibilityRepresentation = 'labelled text input';
  assert.match(
    validatePrd0062ReadingListeningCoverage(invalid).join('\n'),
    /reading-diagram-label-completion: source-assisted coverage must require context and declare correspondence/,
  );
});
