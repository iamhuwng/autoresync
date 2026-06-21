import { GrantAuthorityError } from './grant-authority.js';

const fail = (reason, status = 403) => {
  throw new GrantAuthorityError(reason, status);
};

const requireReplayKey = (payload) => {
  if (!payload || typeof payload !== 'object') fail('invalid_grant');
  if (!Number.isSafeInteger(payload.expiresAt)) fail('invalid_grant');
  if (payload.expiresAt <= Date.now()) fail('grant_expired');
  if (typeof payload.uid !== 'string' || payload.uid.trim() === '') fail('invalid_grant');
  if (payload.kind !== 'upload' && payload.kind !== 'move') fail('invalid_grant');
  if (typeof payload.nonce !== 'string' || payload.nonce.trim() === '') fail('invalid_grant');
  return `grant:${payload.uid}:${payload.kind}:${payload.nonce}`;
};

const getReplayLedgerClient = (ledger, key) => {
  if (ledger && typeof ledger.getByName === 'function') {
    const stub = ledger.getByName(key);
    if (stub && typeof stub.consume === 'function') {
      return stub;
    }
    return null;
  }

  if (ledger && typeof ledger.consume === 'function') {
    return ledger;
  }

  return null;
};

export const consumeGrantNonce = async ({ env, payload }) => {
  const ledger = env.UPLOAD_GRANT_REPLAY_LEDGER;
  const key = requireReplayKey(payload);
  const client = getReplayLedgerClient(ledger, key);
  if (!client) fail('replay_protection_unavailable', 500);

  let result;
  try {
    result = await client.consume({ key, expiresAt: payload.expiresAt });
  } catch (error) {
    if (error instanceof GrantAuthorityError) throw error;
    if (error instanceof Error) {
      if (error.message === 'invalid_replay_key') fail('invalid_grant');
      if (error.message === 'grant_expired') fail('grant_expired');
    }
    fail('replay_protection_unavailable', 500);
  }

  if (!result?.consumed) {
    fail('replay_detected', 409);
  }
  return result;
};
