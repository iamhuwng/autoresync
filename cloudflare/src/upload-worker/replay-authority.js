import { GrantAuthorityError } from './grant-authority.js';

export const consumeGrantNonce = async ({ env, payload }) => {
  const ledger = env.UPLOAD_GRANT_REPLAY_LEDGER;
  if (!ledger || typeof ledger.consume !== 'function') {
    throw new GrantAuthorityError('replay_protection_unavailable', 500);
  }

  const key = `grant:${payload.uid}:${payload.kind}:${payload.nonce}`;
  const result = await ledger.consume({ key, expiresAt: payload.expiresAt });
  if (!result?.consumed) {
    throw new GrantAuthorityError('replay_detected', 409);
  }
  return result;
};
