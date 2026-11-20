import { requiredProductionModes } from './deploy-live.mjs';

export const spareFirebaseProject = 'luyentap-pdf-qa-20261021';
export const spareHostingOrigin = `https://${spareFirebaseProject}.web.app`;
export const spareUploadWorker = 'https://luyentap-qualification-upload-signer.iamhuwng.workers.dev';
export const spareMediaOrigin = 'https://luyentap-qualification-media.r2.dev';
export const spareFeatureFlags = requiredProductionModes;

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
    ...requiredProductionModes,
    VITE_SPARE_ENV_VALIDATED: 'true',
    VITE_R2_UPLOAD_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_AUTHORING_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_UPLOAD_SESSION_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_LIVE_DELIVERY_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_SOLO_DELIVERY_WORKER_URL: spareUploadWorker,
    VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL: spareUploadWorker,
    VITE_R2_PUBLIC_ORIGIN: spareMediaOrigin,
  };
}

export async function loadSpareDevelopmentEnv() {
  const response = await fetch(metadataUrl, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Could not load spare Firebase configuration (HTTP ${response.status}).`);
  return spareDevelopmentEnv(await response.json());
}
