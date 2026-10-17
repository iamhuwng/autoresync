import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, onValue, ref } from 'firebase/database';
import { acceptanceFirebaseBoundary } from './acceptanceFirebaseBoundary.mjs';

export const isTestEnvironment = import.meta.env.MODE === 'test';
export const shouldLogFirebaseBootstrap = import.meta.env.DEV && !isTestEnvironment;
// Acceptance builds may target disposable emulators while remaining production-like.
export const acceptanceEmulatorPorts = acceptanceFirebaseBoundary(import.meta.env);
export const isAcceptanceEmulatorBuild = acceptanceEmulatorPorts !== null;
export const isLocalDevelopment = import.meta.env.DEV && !isTestEnvironment && !isAcceptanceEmulatorBuild;
const localProjectId = 'demo-luyentap-local';
const localDatabaseUrl = 'http://localhost:9000?ns=demo-luyentap-local';
const localWorkerOrigin = 'http://localhost:8787';
const localEndpointValues = new Set([localWorkerOrigin, 'http://localhost:5001']);
const localWorkerKeys = [
  'VITE_BACKUP_WORKER_URL', 'VITE_BOOK_ACTIVITY_AUTHORING_WORKER_URL',
  'VITE_BOOK_ASSEMBLY_WORKER_URL', 'VITE_BOOK_DELIVERY_WORKER_URL',
  'VITE_BOOK_EVALUATION_WORKER_URL', 'VITE_BOOK_HOMEWORK_WORKER_URL',
  'VITE_BOOK_INTEGRITY_REPORT_WORKER_URL', 'VITE_BOOK_RESULT_WORKER_URL',
  'VITE_BOOK_RUNTIME_WORKER_URL', 'VITE_BOOK_SOURCE_CONTROL_WORKER_URL',
  'VITE_BOOK_SUBMISSION_WORKER_URL',
  'VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL', 'VITE_BOOK_SUCCESSOR_WORKER_URL',
  'VITE_COURSE_ENROLLMENT_APPROVAL_URL', 'VITE_HOMEWORK_NOTIFICATION_URL',
  'VITE_HOMEWORK_RESULT_AUTHORITY_URL', 'VITE_LISTENING_AUTHORING_WORKER_URL',
  'VITE_LISTENING_LIVE_DELIVERY_WORKER_URL', 'VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL',
  'VITE_LISTENING_SOLO_DELIVERY_WORKER_URL', 'VITE_LISTENING_UPLOAD_SESSION_WORKER_URL',
  'VITE_NOTIFICATION_COMMAND_WORKER_URL', 'VITE_R2_UPLOAD_WORKER_URL',
  'VITE_WRITING_NOTIFICATION_URL',
];

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value || !String(value).trim())
  .map(([key]) => key);

if (missingFirebaseConfigKeys.length > 0) {
  throw new Error(
    '[Firebase] Missing web config: '
    + missingFirebaseConfigKeys.join(', ')
    + '. This build was created without the required VITE_FIREBASE_* environment variables.'
  );
}

if (isLocalDevelopment && import.meta.env.VITE_FIREBASE_LOCAL_ONLY !== 'true') {
  throw new Error(
    '[Firebase] Local development requires VITE_FIREBASE_LOCAL_ONLY=true.'
  );
}

if (isLocalDevelopment && (
  firebaseConfig.authDomain !== 'localhost'
  || firebaseConfig.databaseURL !== localDatabaseUrl
  || firebaseConfig.projectId !== localProjectId
  || firebaseConfig.storageBucket !== `${localProjectId}.appspot.com`
)) {
  throw new Error(
    '[Firebase] Local development must use the demo-luyentap-local Firebase config and localhost Realtime Database.'
  );
}

if (isLocalDevelopment && import.meta.env.VITE_LOCAL_DEV_BOOTSTRAP !== 'true') {
  throw new Error(
    '[Firebase] Use npm run dev for local development so worker endpoints are isolated from live services.'
  );
}

if (isLocalDevelopment) {
  if (import.meta.env.VITE_THCS_GEMMA_WORKER_URL) {
    throw new Error('[Firebase] Local AI requires an isolated gateway runtime; live gateway configuration is forbidden.');
  }
  if (import.meta.env.VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN !== 'https://s3.us-west-004.backblazeb2.com') {
    throw new Error('[Firebase] Local Book uploads require the configured Backblaze origin.');
  }
  const nonLocalWorkerKeys = localWorkerKeys.filter((key) => !localEndpointValues.has(import.meta.env[key]));
  if (nonLocalWorkerKeys.length > 0) {
    throw new Error(
      `[Firebase] Local development worker endpoints must use ${localWorkerOrigin}: ${nonLocalWorkerKeys.join(', ')}.`
    );
  }
}

if (shouldLogFirebaseBootstrap) {
  console.log('[Firebase] Initializing Firebase...');
  console.log('[Firebase] Config check:');
  console.log('   - apiKey:', firebaseConfig.apiKey ? 'present' : 'missing');
  console.log('   - authDomain:', firebaseConfig.authDomain ? 'present' : 'missing');
  console.log('   - databaseURL:', firebaseConfig.databaseURL ?? 'missing');
  console.log('   - projectId:', firebaseConfig.projectId ?? 'missing');
}

export const app = initializeApp(firebaseConfig);

if (shouldLogFirebaseBootstrap) {
  console.log('[Firebase] App initialized:', app.name);
}

export const database = getDatabase(app);

const databaseEmulatorHost = import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_HOST;

if (isLocalDevelopment && !databaseEmulatorHost) {
  throw new Error(
    '[Firebase] Local development requires VITE_FIREBASE_DATABASE_EMULATOR_HOST.'
  );
}

export const parseEmulatorHost = (rawValue, expectedPort, label, strictLocal = isLocalDevelopment) => {
  const match = /^([^:]+):(\d+)$/u.exec(String(rawValue || ''));
  const port = Number(match?.[2]);
  if (!match || !Number.isInteger(port) || port <= 0 || (strictLocal && (match[1] !== 'localhost' || port !== expectedPort))) {
    throw new Error(
      `[Firebase] Invalid ${label}. Expected ${strictLocal ? `localhost:${expectedPort}` : 'host:port'}.`
    );
  }
  return { host: match[1], port };
};

if (databaseEmulatorHost && (import.meta.env.DEV || isTestEnvironment || isAcceptanceEmulatorBuild)) {
  const { host, port } = parseEmulatorHost(databaseEmulatorHost, 9000, 'VITE_FIREBASE_DATABASE_EMULATOR_HOST');
  if (host && port) {
    connectDatabaseEmulator(database, host, port);

    if (shouldLogFirebaseBootstrap) {
      console.log(`[Firebase] Database emulator connected at ${host}:${port}`);
    }
  }
}

if (shouldLogFirebaseBootstrap) {
  console.log('[Firebase] Database instance created');

  const connectedRef = ref(database, '.info/connected');
  onValue(connectedRef, (snap) => {
    console.log(
      snap.val() === true
        ? '[Firebase] Connected to Realtime Database'
        : '[Firebase] Disconnected from Realtime Database'
    );
  });
}

export const auth = getAuth(app);

const authEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;

if (isLocalDevelopment && !authEmulatorHost) {
  throw new Error(
    '[Firebase] Local development requires VITE_FIREBASE_AUTH_EMULATOR_HOST.'
  );
}

if (authEmulatorHost && (import.meta.env.DEV || isTestEnvironment || isAcceptanceEmulatorBuild)) {
  const { host, port } = parseEmulatorHost(authEmulatorHost, 9099, 'VITE_FIREBASE_AUTH_EMULATOR_HOST');
  if (host && port) {
    connectAuthEmulator(auth, `http://${host}:${port}`, { disableWarnings: true });

    if (shouldLogFirebaseBootstrap) {
      console.log(`[Firebase] Auth emulator connected at ${host}:${port}`);
    }
  }
}

export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'consent',
});
