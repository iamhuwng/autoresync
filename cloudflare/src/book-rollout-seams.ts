import type { BookRolloutWorkerGate } from './book-rollout-gate.ts';

export { BookRolloutDeniedError } from './book-rollout-gate.ts';

/**
 * Keep the existing worker adapters on one immutable trusted seam.  This is
 * deliberately a small adapter, not a second rollout abstraction: every
 * action still delegates to the fixed gate created from the request env.
 */
export const createBookRolloutTrustedSeamGate = (
  gate: BookRolloutWorkerGate,
): BookRolloutWorkerGate => Object.freeze({
  evaluate: gate.evaluate,
  assert: gate.assert,
  create: gate.create,
  upload: gate.upload,
  publish: gate.publish,
  assignPlace: gate.assignPlace,
  launchDelivery: gate.launchDelivery,
  mutation: gate.mutation,
  homeworkMutation: gate.homeworkMutation,
});

export default createBookRolloutTrustedSeamGate;
