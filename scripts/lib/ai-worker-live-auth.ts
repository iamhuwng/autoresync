const canaryUrl = 'https://thcs-gemma-deno-canary.iamhuwng.workers.dev';

export async function signInLiveTeacher() {
  const workerUrl = process.env.VITE_THCS_GEMMA_WORKER_URL?.replace(/\/+$/, '');
  const password = process.env.AI_WORKER_LIVE_TEACHER_PASSWORD;
  if (process.env.AI_WORKER_LIVE !== '1' || workerUrl !== canaryUrl) {
    throw new Error('Live AI checks require AI_WORKER_LIVE=1 and the approved canary URL.');
  }
  if (!password) throw new Error('Set AI_WORKER_LIVE_TEACHER_PASSWORD for the live teacher account.');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? input : input.url;
    if (new URL(url).hostname !== 'identitytoolkit.googleapis.com') {
      return originalFetch(input, init);
    }

    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    headers.set('Origin', 'http://localhost:5173');
    headers.set('Referer', 'http://localhost:5173/');
    return originalFetch(input, { ...init, headers });
  };

  try {
    const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([
      import('../../src/services/firebaseCore.js'),
      import('firebase/auth'),
    ]);
    await signInWithEmailAndPassword(auth, 'teacher@test.com', password);
    return auth;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
