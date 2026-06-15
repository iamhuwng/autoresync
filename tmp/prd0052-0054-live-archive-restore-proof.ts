import { readFileSync } from 'node:fs';
import {
  archiveReadingV2PassageMaterial,
  restoreReadingV2PassageMaterial,
  type ReadingV2PassageArchiveMaterial,
} from '../src/services/reading-v2/readingV2PassageArchive.service';
import { getReadingV2DuplicateIndexPath } from '../src/services/reading-v2/readingV2PassageDuplicateGuard.service';

const parseEnv = (): Record<string, string> =>
  Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );

const env = parseEnv();
const referer = 'http://localhost:5173/';
const apiKey = env.VITE_FIREBASE_API_KEY;
const databaseUrl = env.VITE_FIREBASE_DATABASE_URL?.replace(/\/$/, '');

if (!apiKey || !databaseUrl) {
  throw new Error('Missing Firebase API key or database URL env.');
}

const authResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: referer,
    },
    body: JSON.stringify({
      email: 'teacher@test.com',
      password: 'password123',
      returnSecureToken: true,
    }),
  },
);

if (!authResponse.ok) {
  throw new Error(`Teacher auth failed: ${authResponse.status}`);
}

const authPayload = await authResponse.json() as { idToken: string; localId: string };
const idToken = authPayload.idToken;
const ownerId = authPayload.localId;

const withAuth = (path: string): string =>
  `${databaseUrl}/${path.replace(/^\/+/, '')}.json?auth=${encodeURIComponent(idToken)}`;

const read = async (path: string): Promise<unknown> => {
  const response = await fetch(withAuth(path), { headers: { Referer: referer } });
  if (!response.ok) {
    throw new Error(`RTDB read failed for ${path}: ${response.status}`);
  }
  return response.json();
};

const patchRoot = async (updates: Record<string, unknown | null>): Promise<void> => {
  const response = await fetch(`${databaseUrl}/.json?auth=${encodeURIComponent(idToken)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Referer: referer,
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RTDB patch failed: ${response.status} ${text.slice(0, 200)} pathCount=${Object.keys(updates).length}`);
  }
};

const pad = (value: number): string => String(value).padStart(2, '0');
const now = new Date();
const localStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const materialId = `e2e-prd0052-0054-${localStamp}`;
const versionId = `snapshot-${materialId}`;
const title = `${materialId} Reading Passage`;
const setupAt = now.toISOString();
const duplicateIndexPath = getReadingV2DuplicateIndexPath(ownerId, materialId);
const activeIndexPaths = [
  `material_catalog/material_indexes/by_owner/${ownerId}/${materialId}`,
  `material_catalog/material_indexes/by_visibility/private/${materialId}`,
  `material_catalog/material_indexes/by_material_kind/reading-passage/${materialId}`,
  `material_catalog/material_indexes/by_test_type/ielts/${materialId}`,
] as const;

const activeIndexRow = {
  materialId,
  ownerId,
  title,
  visibility: 'private',
  materialKind: 'reading-passage',
  testTypeIds: ['ielts'],
  testTypeMembership: { ielts: true },
  updatedAt: setupAt,
};

const fixtureUpdates = {
  [`reading_v2/material_metadata/${materialId}`]: {
    materialId,
    ownerId,
    deliveryEngine: 'reading-v2',
    materialKind: 'reading-passage',
    title,
    publishedSnapshotVersionId: versionId,
    state: 'published',
    visibility: 'private',
    testTypeIds: ['ielts'],
    questionCount: 0,
    updatedAt: setupAt,
  },
  [`reading_v2/reading_passage_materials/${materialId}`]: {
    passageMaterialId: materialId,
    ownerId,
    state: 'published',
    visibility: 'private',
    materialKind: 'reading-passage',
    currentSnapshotVersionId: versionId,
    currentVersionId: versionId,
    publishedSnapshotVersionId: versionId,
    title,
    testTypeIds: ['ielts'],
    primaryTestTypeId: 'ielts',
    questionCount: 0,
    updatedAt: setupAt,
  },
  [`reading_v2/reading_passage_material_versions/${materialId}/${versionId}`]: {
    passageMaterialId: materialId,
    currentSnapshotVersionId: versionId,
    ownerId,
    title,
    createdAt: setupAt,
  },
  [`reading_v2/projections/student_safe_tests/${materialId}:${versionId}`]: {
    ownerId,
    materialId,
    snapshotVersionId: versionId,
    materialKind: 'reading-passage',
    title,
    generatedAt: setupAt,
  },
  [`material_catalog/material_indexes/by_owner/${ownerId}/${materialId}`]: activeIndexRow,
  [`material_catalog/material_indexes/by_visibility/private/${materialId}`]: activeIndexRow,
  [`material_catalog/material_indexes/by_material_kind/reading-passage/${materialId}`]: activeIndexRow,
  [`material_catalog/material_indexes/by_test_type/ielts/${materialId}`]: activeIndexRow,
  [duplicateIndexPath]: {
    schemaVersion: 1,
    ownerId,
    passageMaterialId: materialId,
    currentVersionId: versionId,
    title,
    state: 'published',
    visibility: 'private',
    source: { sourceFullTestId: `${materialId}-source` },
    testType: { primaryTestTypeId: 'ielts', testTypeIds: ['ielts'] },
    questionCount: 0,
    updatedAt: setupAt,
    bodyShingleSize: 5,
    questionShingleSize: 3,
    bodyShingleHashes: ['a'.repeat(64)],
    questionShingleHashes: ['b'.repeat(64)],
  },
};

await patchRoot(fixtureUpdates);

const passage: ReadingV2PassageArchiveMaterial = {
  materialId,
  ownerId,
  title,
  visibility: 'private',
  materialKind: 'reading-passage',
  testTypeIds: ['ielts'],
  updatedAt: setupAt,
  currentVersionId: versionId,
  publishedSnapshotVersionId: versionId,
  questionCount: 0,
};

const repository = {
  read,
  update: patchRoot,
};

const isoAt = (offsetMs: number): string => new Date(now.getTime() + offsetMs).toISOString();
const archiveCorrelationId = `${materialId}:archive-retry`;
const restoreCorrelationId = `${materialId}:restore-retry`;

const archive1 = await archiveReadingV2PassageMaterial({
  actorUserId: ownerId,
  actorRole: 'teacher',
  passage,
  repository,
  now: isoAt(1000),
  correlationId: archiveCorrelationId,
  sourceFeatureId: 'packet_10_live_archive_restore_retry_proof',
  sourceRoute: '/teacher/materials',
  usageSummary: { usedElsewhere: false, usageCategories: [] },
});

const archive2 = await archiveReadingV2PassageMaterial({
  actorUserId: ownerId,
  actorRole: 'teacher',
  passage,
  repository,
  now: isoAt(2000),
  correlationId: archiveCorrelationId,
  sourceFeatureId: 'packet_10_live_archive_restore_retry_proof',
  sourceRoute: '/teacher/materials',
  usageSummary: { usedElsewhere: false, usageCategories: [] },
});

const afterArchive = {
  metadataState: await read(`reading_v2/material_metadata/${materialId}/state`),
  materialState: await read(`reading_v2/reading_passage_materials/${materialId}/state`),
  archiveIndexExists: Boolean(await read(`material_catalog/material_archive_indexes/by_owner/${ownerId}/reading-passage/${materialId}`)),
  activeOwnerIndex: await read(`material_catalog/material_indexes/by_owner/${ownerId}/${materialId}`),
  duplicateIndexState: await read(`${duplicateIndexPath}/state`),
};

const restore1 = await restoreReadingV2PassageMaterial({
  actorUserId: ownerId,
  actorRole: 'teacher',
  passage,
  repository,
  now: isoAt(3000),
  correlationId: restoreCorrelationId,
  sourceFeatureId: 'packet_10_live_archive_restore_retry_proof',
  sourceRoute: '/teacher/materials',
  restoreVisibility: 'private',
});

const restore2 = await restoreReadingV2PassageMaterial({
  actorUserId: ownerId,
  actorRole: 'teacher',
  passage,
  repository,
  now: isoAt(4000),
  correlationId: restoreCorrelationId,
  sourceFeatureId: 'packet_10_live_archive_restore_retry_proof',
  sourceRoute: '/teacher/materials',
  restoreVisibility: 'private',
});

const afterRestore = {
  metadataState: await read(`reading_v2/material_metadata/${materialId}/state`),
  materialState: await read(`reading_v2/reading_passage_materials/${materialId}/state`),
  archiveIndex: await read(`material_catalog/material_archive_indexes/by_owner/${ownerId}/reading-passage/${materialId}`),
  activeOwnerIndexExists: Boolean(await read(`material_catalog/material_indexes/by_owner/${ownerId}/${materialId}`)),
  duplicateIndexState: await read(`${duplicateIndexPath}/state`),
};

const auditPaths = [
  ...archive1.changedPaths,
  ...archive2.changedPaths,
  ...restore1.changedPaths,
  ...restore2.changedPaths,
].filter((path) => path.startsWith('reading_v2/audit_events/'));

const distinctAuditPaths = new Set(auditPaths);
const touchedImmutableSnapshotPaths = [
  ...archive1.changedPaths,
  ...archive2.changedPaths,
  ...restore1.changedPaths,
  ...restore2.changedPaths,
].filter((path) =>
  path.startsWith(`reading_v2/reading_passage_material_versions/${materialId}/`) ||
  path.startsWith(`reading_v2/published_snapshots/${materialId}/`),
);

console.log(JSON.stringify({
  fixtureId: materialId,
  archiveChangedPathCounts: [archive1.changedPaths.length, archive2.changedPaths.length],
  restoreChangedPathCounts: [restore1.changedPaths.length, restore2.changedPaths.length],
  distinctAuditPathCount: distinctAuditPaths.size,
  auditActions: {
    archive: auditPaths.filter((path) => path.includes(':reading_passage_archived:')).length,
    restore: auditPaths.filter((path) => path.includes(':reading_passage_restored:')).length,
  },
  afterArchive: {
    metadataState: afterArchive.metadataState,
    materialState: afterArchive.materialState,
    archiveIndexExists: afterArchive.archiveIndexExists,
    activeOwnerIndexRemoved: afterArchive.activeOwnerIndex === null,
    duplicateIndexState: afterArchive.duplicateIndexState,
    archiveFirstRemovedActiveIndexPaths: activeIndexPaths.filter((path) => archive1.changedPaths.includes(path)).length,
    archiveRetryRemovedActiveIndexPaths: activeIndexPaths.filter((path) => archive2.changedPaths.includes(path)).length,
  },
  afterRestore: {
    metadataState: afterRestore.metadataState,
    materialState: afterRestore.materialState,
    archiveIndexRemoved: afterRestore.archiveIndex === null,
    activeOwnerIndexRestored: afterRestore.activeOwnerIndexExists,
    duplicateIndexState: afterRestore.duplicateIndexState,
    restoreFirstWroteActiveIndexPaths: activeIndexPaths.filter((path) => restore1.changedPaths.includes(path)).length,
    restoreRetryWroteActiveIndexPaths: activeIndexPaths.filter((path) => restore2.changedPaths.includes(path)).length,
  },
  immutableSnapshotPathsTouched: touchedImmutableSnapshotPaths.length,
}, null, 2));

process.exit(0);
