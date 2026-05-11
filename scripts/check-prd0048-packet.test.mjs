import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIRED_PACKET_FILES,
  REQUIRED_TASK_TYPE_PACKET_FILES,
  findMissingPacketFiles,
  findStalePacketReferences,
  runPrd0048PacketCheck,
} from './check-prd0048-packet.mjs';

async function seedRequiredFiles(rootDir) {
  await Promise.all(
    REQUIRED_PACKET_FILES.map(async (relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, '# Seeded packet file\n', 'utf8');
    }),
  );
}

test('findMissingPacketFiles reports absent packet docs', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'prd0048-missing-'));

  await seedRequiredFiles(rootDir);

  const removedPath = REQUIRED_PACKET_FILES[0];
  const missing = await findMissingPacketFiles(path.join(rootDir, 'missing-subdir'));

  assert.ok(missing.includes(removedPath));
});

test('required packet files include one contract doc for each official task type', () => {
  assert.equal(REQUIRED_TASK_TYPE_PACKET_FILES.length, 16);

  REQUIRED_TASK_TYPE_PACKET_FILES.forEach((relativePath) => {
    assert.ok(
      REQUIRED_PACKET_FILES.includes(relativePath),
      `Missing task-type packet from required file list: ${relativePath}`,
    );
  });
});

test('findStalePacketReferences catches deleted page-schema references', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'prd0048-stale-'));

  await seedRequiredFiles(rootDir);

  const scannedPacketPath = path.join(
    rootDir,
    'documentation/tasks/PRD0048/reading-v2-page-schema-studio.md',
  );
  await mkdir(path.dirname(scannedPacketPath), { recursive: true });
  await writeFile(
    scannedPacketPath,
    'Old packet reference: reading-v2-page-schema-teacher-result-review.md\n',
    'utf8',
  );

  const violations = await findStalePacketReferences(rootDir);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].label, 'deleted-teacher-result-review-page-schema');
});

test('runPrd0048PacketCheck passes against the current repo packet', async () => {
  const result = await runPrd0048PacketCheck(process.cwd());

  assert.equal(result.ok, true);
  assert.equal(result.missingFiles.length, 0);
  assert.equal(result.staleReferences.length, 0);
});
