import { DEFAULT_R2_UPLOAD_WORKER_URL } from '../../../../services/r2WorkerEndpoint';

export interface ListeningAuthoringEndpointEnv {
  readonly DEV?: boolean;
  readonly VITE_LISTENING_AUTHORING_WORKER_URL?: string;
  readonly VITE_R2_UPLOAD_WORKER_URL?: string;
}

export const defaultListeningAuthoringEndpointEnv = (): ListeningAuthoringEndpointEnv =>
  (import.meta.env ?? {}) as ListeningAuthoringEndpointEnv;

export const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

const readBrowserHostname = (): string | undefined => {
  const browserGlobal = globalThis as typeof globalThis & {
    readonly location?: { readonly hostname?: unknown };
  };

  return typeof browserGlobal.location?.hostname === 'string'
    ? browserGlobal.location.hostname
    : undefined;
};

const isLocalDevHost = (hostname: string | undefined): boolean =>
  hostname === 'localhost'
  || hostname === '127.0.0.1'
  || hostname === '::1'
  || hostname === '[::1]';

export const readListeningAuthoringEndpointDiagnostics = (
  env: ListeningAuthoringEndpointEnv = defaultListeningAuthoringEndpointEnv(),
) => {
  const hostname = readBrowserHostname();
  return {
    dev: env.DEV === true,
    hasAuthoringWorkerUrl: Boolean(env.VITE_LISTENING_AUTHORING_WORKER_URL?.trim()),
    hasR2UploadWorkerUrl: Boolean(env.VITE_R2_UPLOAD_WORKER_URL?.trim()),
    hostname,
    isLocalDevHost: isLocalDevHost(hostname),
  };
};

export function resolveListeningAuthoringEndpoint(
  env: ListeningAuthoringEndpointEnv = defaultListeningAuthoringEndpointEnv(),
  hostname: string | undefined = readBrowserHostname(),
): string {
  const explicit = (
    env.VITE_LISTENING_AUTHORING_WORKER_URL?.trim()
    || env.VITE_R2_UPLOAD_WORKER_URL?.trim()
  );
  if (explicit) {
    return trimTrailingSlashes(explicit);
  }

  return DEFAULT_R2_UPLOAD_WORKER_URL;
}
