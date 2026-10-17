const productionR2UploadWorkerUrl = 'https://r2-upload-signer.iamhuwng.workers.dev';
const acceptanceR2UploadWorkerUrl = 'http://localhost:19087';
const configuredR2UploadWorkerUrl = import.meta.env.VITE_R2_UPLOAD_WORKER_URL;

if (import.meta.env.MODE === 'acceptance' && configuredR2UploadWorkerUrl !== acceptanceR2UploadWorkerUrl) {
  throw new Error('[R2] Acceptance builds require the disposable local R2 worker.');
}

export const DEFAULT_R2_UPLOAD_WORKER_URL = configuredR2UploadWorkerUrl || productionR2UploadWorkerUrl;

export const trimWorkerEndpoint = (value: string): string => value.replace(/\/+$/, '');
