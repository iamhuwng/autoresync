export function createFirebaseVerifier({ verifyToken } = {}) {
  return {
    verifyToken: verifyToken ?? (async () => null),
  };
}
