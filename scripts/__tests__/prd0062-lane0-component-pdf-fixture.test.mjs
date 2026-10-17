import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PRD0062_LANE0_COMPONENT_PDF_ROOT,
  cleanupPrd0062Lane0ComponentPdfFixture,
  createPrd0062Lane0ComponentPdfFixture,
  validatePrd0062Lane0ComponentPdfFixture,
} from '../fixtures/prd0062-lane0-component-pdf-fixture.mjs';

const makeRoot = async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'prd0062-lane0-test-'));
  return { parent, root: path.join(parent, PRD0062_LANE0_COMPONENT_PDF_ROOT) };
};

const removeTemp = async (parent) => {
  await fs.rm(parent, { recursive: true, force: true });
};

test('creates deterministic two-component PDFs and validates exact local authority-free shape', async () => {
  const first = await makeRoot();
  const second = await makeRoot();
  try {
    const left = await createPrd0062Lane0ComponentPdfFixture({ root: first.root, environment: 'test' });
    const right = await createPrd0062Lane0ComponentPdfFixture({ root: second.root, environment: 'test' });
    assert.deepEqual(left, right);
    assert.equal(left.components.length, 2);
    assert.deepEqual(left.components.map((component) => component.sourceOrder), [1, 2]);
    assert.ok(left.components.every((component) => component.physicalPageCount === 1));
    assert.ok(left.components.every((component) => /^[a-f0-9]{64}$/u.test(component.checksum)));
    assert.ok(left.components.every((component) => component.byteSize > 0));
    assert.equal(left.allowlistedRoot, PRD0062_LANE0_COMPONENT_PDF_ROOT);
    assert.equal((await validatePrd0062Lane0ComponentPdfFixture({
      root: first.root,
      fixture: left,
      environment: 'test',
    })).valid, true);
  } finally {
    await removeTemp(first.parent);
    await removeTemp(second.parent);
  }
});

test('supports scoped dry-run/apply cleanup and preserves the test-owned parent and root', async () => {
  const { parent, root } = await makeRoot();
  try {
    const fixture = await createPrd0062Lane0ComponentPdfFixture({ root, environment: 'test' });
    await fs.writeFile(path.join(parent, 'parent-sentinel'), 'keep', 'utf8');
    await fs.writeFile(path.join(root, 'root-sentinel'), 'keep', 'utf8');
    const dryRun = await cleanupPrd0062Lane0ComponentPdfFixture({
      root,
      fixture,
      mode: 'dry-run',
      environment: 'test',
    });
    assert.equal(dryRun.mode, 'dry-run');
    assert.equal(dryRun.alreadyAbsent, false);
    await assert.doesNotReject(() => fs.access(path.join(root, fixture.fixtureId, 'components')));
    const applied = await cleanupPrd0062Lane0ComponentPdfFixture({
      root,
      fixture,
      mode: 'apply',
      environment: 'test',
    });
    assert.equal(applied.absent, true);
    await assert.rejects(() => fs.access(path.join(root, fixture.fixtureId)));
    assert.equal(await fs.readFile(path.join(parent, 'parent-sentinel'), 'utf8'), 'keep');
    assert.equal(await fs.readFile(path.join(root, 'root-sentinel'), 'utf8'), 'keep');
    const replay = await cleanupPrd0062Lane0ComponentPdfFixture({
      root,
      fixture,
      mode: 'apply',
      environment: 'test',
    });
    assert.equal(replay.absent, true);
    assert.equal(await fs.readFile(path.join(parent, 'parent-sentinel'), 'utf8'), 'keep');
    assert.equal(await fs.readFile(path.join(root, 'root-sentinel'), 'utf8'), 'keep');
    const absentDryRun = await cleanupPrd0062Lane0ComponentPdfFixture({
      root,
      fixture,
      mode: 'dry-run',
      environment: 'test',
    });
    assert.equal(absentDryRun.alreadyAbsent, true);
  } finally {
    await removeTemp(parent);
  }
});

test('rejects forged manifests before cleanup and preserves fixture sentinels', async () => {
  const { parent, root } = await makeRoot();
  try {
    const fixture = await createPrd0062Lane0ComponentPdfFixture({ root, environment: 'test' });
    await fs.writeFile(path.join(parent, 'parent-sentinel'), 'keep', 'utf8');
    await fs.writeFile(path.join(root, 'root-sentinel'), 'keep', 'utf8');
    const forged = structuredClone(fixture);
    forged.fixtureId = `fixture-${'0'.repeat(24)}`;
    forged.cleanupRoot = `${PRD0062_LANE0_COMPONENT_PDF_ROOT}/${forged.fixtureId}`;
    forged.components[0].checksum = '0'.repeat(64);
    await assert.rejects(
      () => cleanupPrd0062Lane0ComponentPdfFixture({ root, fixture: forged, mode: 'apply', environment: 'test' }),
      /fixture_shape_invalid/,
    );
    await assert.doesNotReject(() => fs.access(path.join(root, fixture.fixtureId, 'components')));
    assert.equal(await fs.readFile(path.join(parent, 'parent-sentinel'), 'utf8'), 'keep');
    assert.equal(await fs.readFile(path.join(root, 'root-sentinel'), 'utf8'), 'keep');
  } finally {
    await removeTemp(parent);
  }
});

test('rejects dry-run and creation when the deterministic fixture directory is a junction', async () => {
  const dryRunRoot = await makeRoot();
  const createRoot = await makeRoot();
  try {
    const dryRunFixture = await createPrd0062Lane0ComponentPdfFixture({ root: dryRunRoot.root, environment: 'test' });
    await cleanupPrd0062Lane0ComponentPdfFixture({ root: dryRunRoot.root, fixture: dryRunFixture, mode: 'apply', environment: 'test' });
    const dryRunOutside = path.join(dryRunRoot.parent, 'dry-run-outside');
    const dryRunTarget = path.join(dryRunRoot.root, dryRunFixture.fixtureId);
    await fs.mkdir(dryRunOutside);
    await fs.writeFile(path.join(dryRunOutside, 'sentinel'), 'keep', 'utf8');
    await fs.symlink(dryRunOutside, dryRunTarget, 'junction');
    await assert.rejects(
      () => cleanupPrd0062Lane0ComponentPdfFixture({ root: dryRunRoot.root, fixture: dryRunFixture, mode: 'dry-run', environment: 'test' }),
      /reparse_traversal_denied/,
    );
    assert.equal(await fs.readFile(path.join(dryRunOutside, 'sentinel'), 'utf8'), 'keep');

    const createFixture = await createPrd0062Lane0ComponentPdfFixture({ root: createRoot.root, environment: 'test' });
    await cleanupPrd0062Lane0ComponentPdfFixture({ root: createRoot.root, fixture: createFixture, mode: 'apply', environment: 'test' });
    const createOutside = path.join(createRoot.parent, 'create-outside');
    const createTarget = path.join(createRoot.root, createFixture.fixtureId);
    await fs.mkdir(createOutside);
    await fs.writeFile(path.join(createOutside, 'sentinel'), 'keep', 'utf8');
    await fs.symlink(createOutside, createTarget, 'junction');
    await assert.rejects(
      () => createPrd0062Lane0ComponentPdfFixture({ root: createRoot.root, environment: 'test' }),
      /reparse_traversal_denied/,
    );
    assert.equal(await fs.readFile(path.join(createOutside, 'sentinel'), 'utf8'), 'keep');
  } finally {
    await removeTemp(dryRunRoot.parent);
    await removeTemp(createRoot.parent);
  }
});

test('rejects a components junction before reading outside fixture data', async () => {
  const { parent, root } = await makeRoot();
  try {
    const fixture = await createPrd0062Lane0ComponentPdfFixture({ root, environment: 'test' });
    const componentsPath = path.join(root, fixture.fixtureId, 'components');
    const outside = path.join(parent, 'components-outside');
    await fs.rm(componentsPath, { recursive: true, force: false });
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'sentinel'), 'keep', 'utf8');
    await fs.writeFile(path.join(outside, '01-component-a.pdf'), '%PDF-1.4\n/Count 1\n', 'utf8');
    await fs.symlink(outside, componentsPath, 'junction');
    await assert.rejects(
      () => validatePrd0062Lane0ComponentPdfFixture({ root, fixture, environment: 'test' }),
      /reparse_traversal_denied/,
    );
    assert.equal(await fs.readFile(path.join(outside, 'sentinel'), 'utf8'), 'keep');
  } finally {
    await removeTemp(parent);
  }
});

test('fails closed for non-local, unlisted, traversal, and symlink roots', async () => {
  const { parent, root } = await makeRoot();
  const unlisted = path.join(parent, 'other-root');
  const symlink = path.join(parent, PRD0062_LANE0_COMPONENT_PDF_ROOT);
  try {
    await assert.rejects(
      () => createPrd0062Lane0ComponentPdfFixture({ root, environment: 'production' }),
      /local_only_required/,
    );
    await assert.rejects(
      () => createPrd0062Lane0ComponentPdfFixture({ root: unlisted, environment: 'test' }),
      /root_not_allowlisted/,
    );
    await assert.rejects(
      () => createPrd0062Lane0ComponentPdfFixture({ root: `${parent}${path.sep}..${path.sep}${PRD0062_LANE0_COMPONENT_PDF_ROOT}`, environment: 'test' }),
      /path_traversal_denied/,
    );
    await fs.symlink(parent, symlink, 'junction');
    await assert.rejects(
      () => createPrd0062Lane0ComponentPdfFixture({ root: symlink, environment: 'test' }),
      /reparse_traversal_denied/,
    );
  } finally {
    await removeTemp(parent);
  }
});
