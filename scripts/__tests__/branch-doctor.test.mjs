import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildSafeWorktreeCommand,
  buildWarnings,
  parseAheadBehind,
  parseFirebaseHostingTargets,
} from '../branch-doctor.mjs';

test('parseAheadBehind reads git rev-list count output', () => {
  assert.deepEqual(parseAheadBehind('82\t4'), {
    leftAhead: 82,
    rightAhead: 4,
  });
});

test('parseFirebaseHostingTargets reports default project and hosting target', () => {
  const result = parseFirebaseHostingTargets(
    JSON.stringify({
      projects: { default: 'temp-a1437' },
      targets: {
        'temp-a1437': {
          hosting: { kahut1: ['kahut1'] },
        },
      },
    }),
    JSON.stringify({ hosting: { public: 'dist' } }),
  );

  assert.deepEqual(result, {
    project: 'temp-a1437',
    targets: [{ target: 'kahut1', sites: ['kahut1'] }],
    publicDir: 'dist',
  });
});

test('buildWarnings detects source drift, stale origin base, dirty WIP, and WIP branches', () => {
  const warnings = buildWarnings({
    currentBranch: 'wip/demo',
    dirtyCount: 2,
    localMainVsOriginMain: { leftAhead: 82, rightAhead: 4 },
    ancestry: {
      currentContainsOriginMain: true,
      currentContainsLocalMain: false,
    },
  });

  assert.deepEqual(warnings, [
    'local main and origin/main differ: local +82, origin +4',
    'current branch appears based on stale origin/main while local main has live-parity commits',
    'current branch wip/demo is archive/WIP scoped, not a base for new feature work',
    'worktree is dirty: 2 status entries',
  ]);
});

test('buildSafeWorktreeCommand changes recommendation when main drift exists', () => {
  assert.equal(
    buildSafeWorktreeCommand({ hasSourceDrift: true }),
    'resolve main drift first; temporary pre-reconcile base: git worktree add -b codex/<task-slug> ..\\luyentap-<task-slug> main',
  );
  assert.equal(
    buildSafeWorktreeCommand({ hasSourceDrift: false }),
    'git fetch origin main && git worktree add -b codex/<task-slug> ..\\luyentap-<task-slug> origin/main',
  );
});
