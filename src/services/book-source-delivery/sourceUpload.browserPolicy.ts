export interface BookSourceBrowserPolicyEnv {
  readonly VITE_BOOK_SOURCE_CONTROL_WORKER_URL?: string;
  readonly VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL?: string;
  readonly VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN?: string;
}

const exactHttpsOrigin = (value: string | undefined, label: string): string | null => {
  const candidate = value?.trim();
  if (!candidate) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${label} must be an exact HTTPS origin.`);
  }
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new Error(`${label} must be an exact HTTPS origin.`);
  }
  return url.origin;
};

export const createBookSourcePreviewCsp = (
  env: BookSourceBrowserPolicyEnv,
): string | undefined => {
  const controlOrigin = exactHttpsOrigin(
    env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL,
    'VITE_BOOK_SOURCE_CONTROL_WORKER_URL',
  );
  const reconciliationOrigin = exactHttpsOrigin(
    env.VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL,
    'VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL',
  );
  const b2Origin = exactHttpsOrigin(
    env.VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN,
    'VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN',
  );
  if (!controlOrigin && !b2Origin && !reconciliationOrigin) return undefined;
  if (!controlOrigin || !reconciliationOrigin || !b2Origin) {
    throw new Error(
      'Book Source preview CSP requires control Worker, reconciliation Worker, and B2 origins.',
    );
  }
  return [
    "connect-src 'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://*.firebasedatabase.app',
    'wss://*.firebasedatabase.app',
    'https://*.firebaseapp.com',
    'https://*.google.com',
    'https://*.gstatic.com',
    controlOrigin,
    reconciliationOrigin,
    b2Origin,
  ].join(' ');
};
