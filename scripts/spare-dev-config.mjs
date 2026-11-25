import { requiredProductionModes } from './deploy-live.mjs';

export const spareFirebaseProject = 'luyentap-pdf-qa-20261021';
export const spareHostingOrigin = `https://${spareFirebaseProject}.web.app`;
export const spareUploadWorker = 'https://luyentap-qualification-upload-signer.iamhuwng.workers.dev';
export const spareMediaOrigin = 'https://luyentap-qualification-media.r2.dev';
export const spareBookSourceB2UploadOrigin = 'https://axgsodluzsdz.compat.objectstorage.ap-singapore-1.oraclecloud.com';
export const spareFeatureFlags = Object.freeze({
  ...requiredProductionModes,
  VITE_BOOK_ACTIVITY_CREATE_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION: 'enabled',
  VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'enabled',
  VITE_BOOK_COURSE_PLACEMENT_PRESENTATION: 'enabled',
});

const metadataUrl = `${spareHostingOrigin}/__/firebase/init.json`;
const firebaseKeys = {
  apiKey: 'API_KEY',
  authDomain: 'AUTH_DOMAIN',
  databaseURL: 'DATABASE_URL',
  projectId: 'PROJECT_ID',
  storageBucket: 'STORAGE_BUCKET',
  messagingSenderId: 'MESSAGING_SENDER_ID',
  appId: 'APP_ID',
};

export function spareDevelopmentEnv(browserConfig, inherited = process.env) {
  if (
    browserConfig?.projectId !== spareFirebaseProject
    || browserConfig.authDomain !== `${spareFirebaseProject}.firebaseapp.com`
    || browserConfig.databaseURL !== `https://${spareFirebaseProject}-default-rtdb.asia-southeast1.firebasedatabase.app`
    || browserConfig.storageBucket !== `${spareFirebaseProject}.firebasestorage.app`
    || Object.keys(firebaseKeys).some(key => typeof browserConfig[key] !== 'string' || !browserConfig[key].trim())
  ) {
    throw new Error('The spare Firebase site did not return the expected browser configuration.');
  }
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !/^VITE_/iu.test(key)));
  for (const [key, suffix] of Object.entries(firebaseKeys)) {
    env[`VITE_FIREBASE_${suffix}`] = browserConfig[key];
  }
  return {
    ...env,
    ...spareFeatureFlags,
    VITE_SPARE_ENV_VALIDATED: 'true',
    VITE_R2_UPLOAD_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_AUTHORING_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_UPLOAD_SESSION_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_LIVE_DELIVERY_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_SOLO_DELIVERY_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL: spareUploadWorker,
    VITE_BOOK_SOURCE_CONTROL_WORKER_URL: spareUploadWorker,
    // Placeholder pointing at qualification upload-signer for spare QA; interrupted-upload /reconcile recovery is deferred out of V1 spare QA.
    VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL: spareUploadWorker,
    VITE_BOOK_ASSEMBLY_WORKER_URL: spareUploadWorker,
    VITE_BOOK_ACTIVITY_AUTHORING_WORKER_URL: spareUploadWorker,
    VITE_BOOK_DELIVERY_WORKER_URL: spareUploadWorker,
    VITE_BOOK_HOMEWORK_WORKER_URL: spareUploadWorker,
    VITE_BOOK_RUNTIME_WORKER_URL: spareUploadWorker,
    VITE_BOOK_RESULT_WORKER_URL: spareUploadWorker,
    VITE_BOOK_EVALUATION_WORKER_URL: spareUploadWorker,
    VITE_BOOK_SUBMISSION_WORKER_URL: spareUploadWorker,
    VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN: spareBookSourceB2UploadOrigin,
    VITE_R2_PUBLIC_ORIGIN: spareMediaOrigin,
  };
}

export async function loadSpareDevelopmentEnv() {
  const response = await fetch(metadataUrl, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Could not load spare Firebase configuration (HTTP ${response.status}).`);
  return spareDevelopmentEnv(await response.json());
}
