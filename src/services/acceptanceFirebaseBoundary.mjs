// Acceptance-only backend boundary; production keeps provider defaults unchanged.
export function acceptanceFirebaseBoundary(env) {
  if (env.MODE !== 'acceptance') return null;
  const project = 'demo-luyentap-acceptance';
  if (env.VITE_FIREBASE_ACCEPTANCE_EMULATORS !== 'true'
    || env.VITE_FIREBASE_PROJECT_ID !== project
    || env.VITE_FIREBASE_DATABASE_URL !== `http://localhost:19000?ns=${project}`) {
    throw new Error('[Firebase] Acceptance requires the disposable demo project and explicit emulator isolation.');
  }
  const ports = { AUTH: 19099, DATABASE: 19000, FIRESTORE: 19080 };
  for (const [service, port] of Object.entries(ports)) {
    if (env[`VITE_FIREBASE_${service}_EMULATOR_HOST`] !== `localhost:${port}`) {
      throw new Error(`[Firebase] Acceptance requires ${service} emulator at localhost:${port}.`);
    }
  }
  if (env.VITE_R2_UPLOAD_WORKER_URL !== 'http://localhost:19087') {
    throw new Error('[Firebase] Acceptance requires the disposable local R2 worker at http://localhost:19087.');
  }
  for (const [key, value] of Object.entries(env)) {
    if (/^VITE_.*(?:WORKER|UPLOAD|CONTROL|SUBMISSION).*?(?:URL|ORIGIN)$/u.test(key) && value) {
      const url = new URL(value);
      if (url.protocol !== 'http:' || url.hostname !== 'localhost') {
        throw new Error(`[Firebase] Acceptance forbids remote provider endpoint: ${key}.`);
      }
    }
  }
  return ports;
}
