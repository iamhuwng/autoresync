import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const liveProjectId = 'temp-a1437';
const localProjectId = 'demo-luyentap-local';
const localDatabaseUrl = 'http://localhost:9000/.json?ns=demo-luyentap-local';
const localFirestoreBase = `http://localhost:8080/v1/projects/${localProjectId}/databases/(default)/documents`;
const localFirestoreResourceBase = `projects/${localProjectId}/databases/(default)/documents`;
const liveFirestoreBase = `https://firestore.googleapis.com/v1/projects/${liveProjectId}/databases/(default)/documents`;
const firebaseCli = path.join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const snapshotDir = path.join(repoRoot, 'tmp', 'live-firebase');
const rtdbSnapshotPath = path.join(snapshotDir, 'rtdb-export.json');

let accessToken;

const requestNoRedirect = async (url, options = {}, fetchImpl = fetch) => {
  const requestedUrl = String(url);
  const response = await fetchImpl(requestedUrl, { ...options, redirect: 'error' });
  if (response.url && response.url !== requestedUrl) {
    throw new Error(`[Firebase] Refusing redirected Firebase request: ${requestedUrl} -> ${response.url}.`);
  }
  return response;
};

const getAccessToken = () => accessToken ??= execFileSync(
  process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud',
  ['auth', 'print-access-token'],
  { cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32' },
).trim();

const readJsonResponse = async (response, description) => {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${description} failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
};

const firestoreRequest = async (url, options = {}) => {
  const token = getAccessToken();
  return readJsonResponse(await requestNoRedirect(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }), url);
};

const listCollectionIds = async (parentName) => {
  const collectionIds = [];
  let pageToken;
  const endpoint = parentName.startsWith('http')
    ? parentName
    : `https://firestore.googleapis.com/v1/${parentName}`;

  do {
    const body = await firestoreRequest(`${endpoint}:listCollectionIds`, {
      method: 'POST',
      body: JSON.stringify({ pageSize: 1000, ...(pageToken ? { pageToken } : {}) }),
    });
    collectionIds.push(...(body.collectionIds || []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return collectionIds;
};

const listDocuments = async (parentName, collectionId) => {
  const documents = [];
  let pageToken;
  const endpoint = parentName.startsWith('http')
    ? parentName
    : `https://firestore.googleapis.com/v1/${parentName}`;

  do {
    const url = new URL(`${endpoint}/${encodeURIComponent(collectionId)}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('showMissing', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const body = await firestoreRequest(url);
    documents.push(...(body.documents || []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return documents;
};

const collectDocuments = async () => {
  const documents = [];
  const visitCollection = async (parentName, collectionId) => {
    const collectionDocuments = await listDocuments(parentName, collectionId);
    documents.push(...collectionDocuments.filter((document) => document.createTime));

    for (const document of collectionDocuments) {
      const subcollections = await listCollectionIds(document.name);
      for (const subcollection of subcollections) {
        await visitCollection(document.name, subcollection);
      }
    }
  };

  const rootCollections = await listCollectionIds(liveFirestoreBase);
  for (const collectionId of rootCollections) {
    await visitCollection(liveFirestoreBase, collectionId);
  }
  return documents;
};

export const importFirestoreDocuments = async (documents, fetchImpl = fetch) => {
  const sourcePrefix = `projects/${liveProjectId}/databases/(default)/documents/`;
  const writes = documents.map((document) => {
    assert.ok(document.name.startsWith(sourcePrefix), 'Firestore document must belong to the live source project.');
    return { update: { name: `${localFirestoreResourceBase}/${document.name.slice(sourcePrefix.length)}`, fields: document.fields || {} } };
  });

  for (let index = 0; index < writes.length; index += 400) {
    const chunk = writes.slice(index, index + 400);
    const result = await readJsonResponse(await requestNoRedirect(`${localFirestoreBase}:batchWrite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer owner',
      },
      body: JSON.stringify({ writes: chunk }),
    }, fetchImpl), 'Local Firestore batch import');
    assert.equal(result.status?.length, chunk.length, 'Firestore must report every local write.');
    assert.ok(result.status.every((status) => !status.code), 'A local Firestore write failed.');
    console.log(`[Firebase] Imported Firestore documents ${Math.min(index + chunk.length, writes.length)}/${writes.length}.`);
  }
};

export const assertLocalEmulators = async (fetchImpl = fetch) => {
  const checks = [
    {
      url: `http://localhost:9000/.json?ns=${localProjectId}&shallow=true`,
      options: { headers: { Authorization: 'Bearer owner' } },
      validate: (response) => response.headers?.get?.('x-firebase-project-id') === localProjectId,
    },
    {
      url: `http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/${localProjectId}/accounts:batchGet?maxResults=1`,
      options: { headers: { Authorization: 'Bearer owner' } },
      validateBody: (body) => body?.kind === 'identitytoolkit#DownloadAccountResponse',
    },
    {
      url: `http://localhost:8080/v1/projects/${localProjectId}/databases/(default)/documents:listCollectionIds`,
      options: { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ pageSize: 1 }) },
      validateBody: (body) => Array.isArray(body?.collectionIds)
        || (body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)
    },
  ];
  for (const { url, options, validate, validateBody } of checks) {
    let response;
    try {
      response = await requestNoRedirect(url, options, fetchImpl);
    } catch (error) {
      throw new Error(`[Firebase] Local emulator preflight failed for ${url}: ${error instanceof Error ? error.message : String(error)}.`);
    }
    if (!response.ok) {
      throw new Error(`[Firebase] Local emulator preflight rejected ${url} with HTTP ${response.status}.`);
    }
    if (validate && !validate(response)) {
      throw new Error(`[Firebase] Local emulator preflight found the wrong Realtime Database project at ${url}.`);
    }
    if (validateBody) {
      const body = await readJsonResponse(response, `Local emulator preflight for ${url}`);
      if (!validateBody(body)) {
        throw new Error(`[Firebase] Local emulator preflight received an unexpected emulator response at ${url}.`);
      }
    } else {
      await response.body?.cancel();
    }
  }
};

const main = async () => {
  await mkdir(snapshotDir, { recursive: true });
  try {
    await assertLocalEmulators();

    const databaseExport = spawnSync(process.execPath, [
      firebaseCli,
      'database:get',
      '/',
      '--project',
      liveProjectId,
      '--output',
      rtdbSnapshotPath,
    ], { cwd: repoRoot, stdio: 'inherit', windowsHide: true });

    if (databaseExport.error) throw databaseExport.error;
    if (databaseExport.status !== 0) {
      throw new Error(`Live RTDB export failed with exit code ${databaseExport.status ?? 'unknown'}.`);
    }

    const rtdbSnapshot = await readFile(rtdbSnapshotPath, 'utf8');
    JSON.parse(rtdbSnapshot);
    const localRtdbResponse = await requestNoRedirect(localDatabaseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: rtdbSnapshot,
    });
    await readJsonResponse(localRtdbResponse, 'Local RTDB import');
    console.log(`[Firebase] Imported live RTDB data into ${localProjectId}.`);

    const firestoreDocuments = await collectDocuments();
    console.log(`[Firebase] Read ${firestoreDocuments.length} live Firestore documents.`);
    await importFirestoreDocuments(firestoreDocuments);
    for (const command of ['seed', 'save']) {
      const result = spawnSync(process.execPath, [path.join(scriptDir, 'local-firebase.mjs'), command], {
        cwd: repoRoot, stdio: 'inherit', windowsHide: true,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`Local Firebase ${command} failed with exit code ${result.status ?? 'unknown'}.`);
    }
    console.log(`[Firebase] Live RTDB and Firestore copy complete: ${liveProjectId} -> ${localProjectId}; local Auth accounts were reseeded.`);
  } finally {
    await rm(rtdbSnapshotPath, { force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
