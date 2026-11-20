import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spareFirebaseProject } from './spare-dev-config.mjs';

export const LIVE_FIREBASE_PROJECT = 'temp-a1437';
export const ALLOWED_SYNC_SCOPES = Object.freeze(['rtdb', 'firestore', 'auth']);
export const FORBIDDEN_STORAGE_TOKENS = Object.freeze(['storage', 'r2', 'b2', 'media', 'bucket', 'backblaze']);
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
export const DEFAULT_FIRESTORE_READ_CONCURRENCY = 12;
export const FIRESTORE_SYNC_SEMANTICS = 'upsert-only (existing spare-only documents are preserved)';

const firestoreApi = 'https://firestore.googleapis.com/v1';
const storageCopyError = 'R2/B2 object copy is forbidden; shared media URLs in RTDB/Firestore records remain read-only.';
const hasForbiddenToken = value => FORBIDDEN_STORAGE_TOKENS.some(token => String(value).toLowerCase().includes(token));

export function sanitizeAuthExportForSpare(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.users)) {
    throw new Error('Firebase Auth export must be an object with a users array.');
  }
  const sanitizedUsers = payload.users.map(user => {
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      throw new Error('Firebase Auth export users must be objects.');
    }
    const { passwordHash, salt, ...sanitizedUser } = user;
    return sanitizedUser;
  });
  const strippedPasswordHashes = payload.users.reduce((count, user) => count + (user && typeof user === 'object' && Object.hasOwn(user, 'passwordHash') ? 1 : 0), 0);
  return { payload: { ...payload, users: sanitizedUsers }, totalUsers: sanitizedUsers.length, strippedPasswordHashes };
}

export function parseSpareSyncArgs(argv) {
  let scopes;
  let targetProject = spareFirebaseProject;
  let dryRun = false;
  let confirmSpareOverwrite = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (hasForbiddenToken(flag)) throw new Error(storageCopyError);
    if (flag === '--only') {
      const value = argv[++index];
      if (!value) throw new Error('Missing value for --only.');
      const values = value.split(',').filter(Boolean);
      if (values.some(hasForbiddenToken)) throw new Error(storageCopyError);
      if (!values.length || values.some(scope => !ALLOWED_SYNC_SCOPES.includes(scope))) {
        throw new Error(`Scopes must be a comma-separated subset of ${ALLOWED_SYNC_SCOPES.join(', ')}.`);
      }
      scopes = [...new Set(values)];
    } else if (flag === '--target') {
      targetProject = argv[++index];
      if (!targetProject) throw new Error('Missing value for --target.');
    } else if (flag === '--dry-run') {
      dryRun = true;
    } else if (flag === '--confirm-spare-overwrite') {
      confirmSpareOverwrite = true;
    } else if (flag === '--json') {
      json = true;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return {
    scopes: scopes ?? ['rtdb', 'firestore'],
    targetProject,
    confirmSpareOverwrite,
    dryRun: dryRun || !confirmSpareOverwrite,
    json,
  };
}

export function assertSpareSyncTarget(targetProject, sourceProject = LIVE_FIREBASE_PROJECT) {
  if (targetProject === LIVE_FIREBASE_PROJECT || targetProject === sourceProject || targetProject !== spareFirebaseProject) {
    throw new Error(`Refusing unsafe spare sync target ${targetProject}. Only ${spareFirebaseProject} may receive this read-only copy.`);
  }
  return targetProject;
}

const responseBody = async (response, description) => {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${description} failed (HTTP ${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
};

const sanitizeUrl = value => {
  const parsed = new URL(value);
  parsed.search = '';
  return parsed.toString();
};

const requestNoRedirect = async (url, options, fetchImpl, { writeTargetProject, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) => {
  const requested = new URL(url);
  if (writeTargetProject) {
    const allowedFirestorePath = `/v1/projects/${writeTargetProject}/databases/(default)/documents:batchWrite`;
    const valid = requested.hostname === 'firestore.googleapis.com' && requested.pathname === allowedFirestorePath;
    if (!valid || writeTargetProject !== spareFirebaseProject || hasForbiddenToken(requested.hostname)) {
      throw new Error('Refusing a write outside the validated spare Firebase target.');
    }
  }
  const signal = options?.signal ?? AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal, redirect: 'error' });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error(`Firebase request timed out after ${timeoutMs}ms: ${sanitizeUrl(requested)}`, { cause: error });
    }
    throw error;
  }
  if (response.url && new URL(response.url).href !== requested.href) {
    throw new Error(`Refusing redirected Firebase request: ${sanitizeUrl(requested)} -> ${sanitizeUrl(response.url)}.`);
  }
  return response;
};

const tokenValue = async getAccessToken => String(await getAccessToken());

async function firestoreRequest(url, { fetchImpl, token, project, timeoutMs, ...requestOptions }) {
  return responseBody(await requestNoRedirect(url, {
    ...requestOptions,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project },
  }, fetchImpl, { timeoutMs }), url);
}

async function listCollectionIds(parent, context) {
  const endpoint = parent.startsWith('http') ? parent : `${firestoreApi}/${parent}`;
  const ids = [];
  let pageToken;
  do {
    const url = new URL(`${endpoint}:listCollectionIds`);
    const body = await firestoreRequest(url, {
      ...context, project: LIVE_FIREBASE_PROJECT, method: 'POST',
      body: JSON.stringify({ pageSize: 1000, ...(pageToken ? { pageToken } : {}) }),
    });
    ids.push(...(body.collectionIds || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return ids;
}

async function listDocuments(parent, collectionId, context) {
  const endpoint = parent.startsWith('http') ? parent : `${firestoreApi}/${parent}`;
  const documents = [];
  let pageToken;
  do {
    const url = new URL(`${endpoint}/${encodeURIComponent(collectionId)}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('showMissing', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const body = await firestoreRequest(url, { ...context, project: LIVE_FIREBASE_PROJECT });
    documents.push(...(body.documents || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return documents;
}

async function runBoundedQueue(initialTasks, concurrency, handleTask) {
  const limit = Number.isInteger(concurrency) && concurrency > 0 ? concurrency : DEFAULT_FIRESTORE_READ_CONCURRENCY;
  const queue = [...initialTasks];
  let active = 0;
  let stopped = false;

  await new Promise((resolve, reject) => {
    const pump = () => {
      if (stopped) return;
      if (queue.length === 0 && active === 0) {
        resolve();
        return;
      }
      while (!stopped && active < limit && queue.length > 0) {
        const task = queue.shift();
        active += 1;
        Promise.resolve()
          .then(() => handleTask(task, nextTask => {
            if (!stopped) queue.push(nextTask);
          }))
          .then(
            () => {
              active -= 1;
              pump();
            },
            error => {
              stopped = true;
              reject(error);
            },
          );
      }
    };
    pump();
  });
}

async function readFirestore({ fetchImpl, getAccessToken, timeoutMs, concurrency = DEFAULT_FIRESTORE_READ_CONCURRENCY }) {
  const token = await tokenValue(getAccessToken);
  const root = `${firestoreApi}/projects/${LIVE_FIREBASE_PROJECT}/databases/(default)/documents`;
  const documents = [];
  const rootCollections = await listCollectionIds(root, { fetchImpl, token, timeoutMs });
  await runBoundedQueue(
    rootCollections.map(collectionId => ({ kind: 'documents', parent: root, collectionId })),
    concurrency,
    async (task, enqueue) => {
      if (task.kind === 'documents') {
        const found = await listDocuments(task.parent, task.collectionId, { fetchImpl, token, timeoutMs });
        for (const document of found) {
          if (document.createTime) documents.push(document);
          if (document.name) enqueue({ kind: 'collections', parent: document.name });
        }
        return;
      }
      const childIds = await listCollectionIds(task.parent, { fetchImpl, token, timeoutMs });
      for (const collectionId of childIds) {
        enqueue({ kind: 'documents', parent: task.parent, collectionId });
      }
    },
  );
  documents.sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? '')));
  return { documents, token };
}

export function defaultGoogleAccessToken(exec = execFileSync, platform = process.platform) {
  const env = { ...process.env, CLOUDSDK_CORE_CHECK_GCE_METADATA: 'false' };
  const output = platform === 'win32'
    ? exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "& gcloud.cmd 'auth' 'print-access-token'"], {
      encoding: 'utf8',
      windowsHide: true,
      env,
    })
    : exec('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
      windowsHide: true,
      env,
    });
  return String(output).trim();
}

const execFirebaseDefault = (args, { cwd }) => {
  const tooling = fileURLToPath(new URL('./tooling-where.mjs', import.meta.url));
  try {
    return execFileSync(process.execPath, [tooling, '--exec', 'firebase', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const stdout = String(error.stdout ?? '').trim();
    const stderr = String(error.stderr ?? '').trim();
    const detail = stderr || stdout || error.message;
    throw new Error(`Firebase CLI failed: ${detail}`, { cause: error });
  }
};

export async function syncLiveToSpare(options = {}, deps = {}) {
  const targetProject = options.targetProject ?? spareFirebaseProject;
  const sourceProject = options.sourceProject ?? LIVE_FIREBASE_PROJECT;
  if (sourceProject !== LIVE_FIREBASE_PROJECT) throw new Error('Spare sync source must be the live Firebase project.');
  assertSpareSyncTarget(targetProject, sourceProject);
  const scopes = options.scopes ?? ['rtdb', 'firestore'];
  if (scopes.some(hasForbiddenToken)) throw new Error(storageCopyError);
  if (!scopes.length || scopes.some(scope => !ALLOWED_SYNC_SCOPES.includes(scope))) throw new Error('Invalid sync scope.');
  const dryRun = options.dryRun === true || options.confirmSpareOverwrite !== true;
  const timeoutMs = options.timeoutMs ?? deps.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const firestoreReadConcurrency = options.firestoreReadConcurrency ?? deps.firestoreReadConcurrency ?? DEFAULT_FIRESTORE_READ_CONCURRENCY;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getAccessToken = deps.getAccessToken ?? (() => defaultGoogleAccessToken());
  const execFirebase = deps.execFirebase ?? execFirebaseDefault;
  const cwd = deps.cwd ?? path.resolve(fileURLToPath(new URL('../', import.meta.url)));

  let tempDir;
  let rtdbFile;
  let sanitizedAuthFile;
  const completedScopes = [];
  let authSynced = false;
  let authUsersSanitized = 0;
  try {
    if (scopes.includes('rtdb') || (scopes.includes('auth') && !dryRun)) {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-spare-sync-'));
    }

    // Complete and validate all live source reads/exports before performing any spare writes.
    let rtdbBytes = 0;
    if (scopes.includes('rtdb')) {
      rtdbFile = path.join(tempDir, 'rtdb.json');
      await execFirebase(['database:get', '/', '--export', '--project', LIVE_FIREBASE_PROJECT, '--output', rtdbFile, '--non-interactive'], { cwd });
      const raw = await readFile(rtdbFile, 'utf8');
      try { JSON.parse(raw); } catch { throw new Error('Live RTDB export was not valid JSON.'); }
      rtdbBytes = Buffer.byteLength(raw, 'utf8');
    }

    let writes = null;
    if (scopes.includes('firestore')) {
      const firestore = await readFirestore({ fetchImpl, getAccessToken, timeoutMs, concurrency: firestoreReadConcurrency });
      const sourcePrefix = `projects/${sourceProject}/databases/(default)/documents/`;
      const targetPrefix = `projects/${targetProject}/databases/(default)/documents/`;
      writes = firestore.documents.map(document => {
        if (typeof document.name !== 'string' || !document.name.startsWith(sourcePrefix)) {
          throw new Error('Firestore document does not belong to the live source project.');
        }
        return { update: { name: `${targetPrefix}${document.name.slice(sourcePrefix.length)}`, fields: document.fields || {} } };
      });
    }
    const firestoreDocuments = writes ? writes.length : 0;

    if (scopes.includes('auth') && !dryRun) {
      const rawAuthFile = path.join(tempDir, 'auth-export.json');
      sanitizedAuthFile = path.join(tempDir, 'auth-sanitized.json');
      await execFirebase(['auth:export', rawAuthFile, '--format=json', '--project', LIVE_FIREBASE_PROJECT, '--non-interactive'], { cwd });
      const authRaw = await readFile(rawAuthFile, 'utf8');
      let parsedAuth;
      try { parsedAuth = JSON.parse(authRaw); } catch { throw new Error('Firebase Auth export was not valid JSON.'); }
      const sanitized = sanitizeAuthExportForSpare(parsedAuth);
      await writeFile(sanitizedAuthFile, JSON.stringify(sanitized.payload), { encoding: 'utf8', mode: 0o600 });
      authUsersSanitized = sanitized.totalUsers;
    }

    if (!dryRun) {
      const runWriteScope = async (scope, fn) => {
        try {
          await fn();
          completedScopes.push(scope);
        } catch (error) {
          Object.assign(error, {
            completedScopes: [...completedScopes],
            failedScope: scope,
            remainingScopes: scopes.filter(entry => !completedScopes.includes(entry)),
          });
          throw error;
        }
      };

      if (scopes.includes('rtdb')) {
        await runWriteScope('rtdb', async () => {
          assertSpareSyncTarget(targetProject, sourceProject);
          await execFirebase(['database:set', '/', rtdbFile, '--force', '--project', targetProject, '--non-interactive'], { cwd });
        });
      }

      if (writes) {
        await runWriteScope('firestore', async () => {
          const token = await tokenValue(getAccessToken);
          for (let index = 0; index < writes.length; index += 400) {
            const chunk = writes.slice(index, index + 400);
            const url = `${firestoreApi}/projects/${targetProject}/databases/(default)/documents:batchWrite`;
            const body = await responseBody(await requestNoRedirect(url, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': targetProject },
              body: JSON.stringify({ writes: chunk }),
            }, fetchImpl, { writeTargetProject: targetProject, timeoutMs }), 'Spare Firestore batch write');
            if (!Array.isArray(body?.status) || body.status.length !== chunk.length || body.status.some(status => status?.code)) {
              throw new Error('A spare Firestore batch write failed.');
            }
          }
        });
      }

      if (scopes.includes('auth')) {
        await runWriteScope('auth', async () => {
          await execFirebase(['auth:import', sanitizedAuthFile, '--project', targetProject, '--non-interactive'], { cwd });
          authSynced = true;
        });
      }
    }

    return {
      status: dryRun ? 'DRY_RUN' : 'SYNCED',
      dryRun,
      sourceProject: LIVE_FIREBASE_PROJECT,
      targetProject,
      scopes,
      completedScopes,
      storageCopyForbidden: true,
      rtdbBytes,
      firestoreDocuments,
      firestoreSemantics: FIRESTORE_SYNC_SEMANTICS,
      authSynced,
      authUsersSanitized,
      written: !dryRun,
    };
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parseSpareSyncArgs(argv);
  const result = await syncLiveToSpare(options, deps);
  if (options.json) console.log(JSON.stringify(result));
  else {
    let message = `${result.status}: ${result.scopes.join(', ')} from ${result.sourceProject} to ${result.targetProject}`;
    if (result.scopes.includes('firestore')) message += `; Firestore semantics: ${result.firestoreSemantics}`;
    if (result.authSynced) message += `; Auth users sanitized: ${result.authUsersSanitized}`;
    console.log(message);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
