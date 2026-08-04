import assert from 'node:assert/strict';
import test from 'node:test';

import { collectExistingPaths } from '../run-security-tests.js';

test('collectExistingPaths fails closed when a required security test is missing', () => {
  const missingPath = 'scripts/__tests__/definitely-missing-required-security-test.mjs';

  assert.throws(
    () => collectExistingPaths([missingPath], new Set([missingPath])),
    /Required security test path not found/,
  );
  assert.deepEqual(collectExistingPaths([missingPath]), []);
});
