/**
 * Browser presentation hints for the Book Activity rollout.
 *
 * These values are never authorization. Trusted Book routes and services stay
 * default-deny independently of this module.
 */
const ACTIONS = Object.freeze({
  create: 'create',
  upload: 'upload',
  publish: 'publish',
  assignPlace: 'assign-place',
  launchDelivery: 'launch-delivery',
  mutation: 'mutation',
} as const);

export type BookActivityRolloutGate = (typeof ACTIONS)[keyof typeof ACTIONS];

export const BOOK_ACTIVITY_ROLLOUT_GATES = ACTIONS;

export const BOOK_ACTIVITY_ROLLOUT_GATE_MODES = {
  disabled: 'disabled',
  enabled: 'enabled',
} as const;

export type BookActivityRolloutGateMode =
  (typeof BOOK_ACTIVITY_ROLLOUT_GATE_MODES)[keyof typeof BOOK_ACTIVITY_ROLLOUT_GATE_MODES];

export const BOOK_ACTIVITY_ROLLOUT_GATE_ENV = {
  [BOOK_ACTIVITY_ROLLOUT_GATES.create]: 'VITE_BOOK_ACTIVITY_CREATE_PRESENTATION',
  [BOOK_ACTIVITY_ROLLOUT_GATES.upload]: 'VITE_BOOK_ACTIVITY_UPLOAD_PRESENTATION',
  [BOOK_ACTIVITY_ROLLOUT_GATES.publish]: 'VITE_BOOK_ACTIVITY_PUBLISH_PRESENTATION',
  [BOOK_ACTIVITY_ROLLOUT_GATES.assignPlace]: 'VITE_BOOK_ACTIVITY_ASSIGN_PLACE_PRESENTATION',
  [BOOK_ACTIVITY_ROLLOUT_GATES.launchDelivery]: 'VITE_BOOK_ACTIVITY_LAUNCH_DELIVERY_PRESENTATION',
  [BOOK_ACTIVITY_ROLLOUT_GATES.mutation]: 'VITE_BOOK_ACTIVITY_MUTATION_PRESENTATION',
} as const;

export type BookActivityRolloutGateModes = Record<
  BookActivityRolloutGate,
  BookActivityRolloutGateMode
>;

export const normalizeBookActivityRolloutGateMode = (
  value: unknown,
): BookActivityRolloutGateMode => (
  typeof value === 'string'
    && value.trim().toLowerCase() === BOOK_ACTIVITY_ROLLOUT_GATE_MODES.enabled
    ? BOOK_ACTIVITY_ROLLOUT_GATE_MODES.enabled
    : BOOK_ACTIVITY_ROLLOUT_GATE_MODES.disabled
);

export const getBookActivityRolloutGateModes = (
  env: Record<string, unknown> = import.meta.env,
): BookActivityRolloutGateModes => Object.values(BOOK_ACTIVITY_ROLLOUT_GATES).reduce(
  (modes, gate) => ({
    ...modes,
    [gate]: normalizeBookActivityRolloutGateMode(env[BOOK_ACTIVITY_ROLLOUT_GATE_ENV[gate]]),
  }),
  {} as BookActivityRolloutGateModes,
);

export const BOOK_ACTIVITY_ROLLOUT_GATE_MODES_BY_SURFACE = getBookActivityRolloutGateModes();

export const isBookActivityRolloutGateEnabled = (
  gate: BookActivityRolloutGate,
  modes: BookActivityRolloutGateModes = BOOK_ACTIVITY_ROLLOUT_GATE_MODES_BY_SURFACE,
): boolean => modes[gate] === BOOK_ACTIVITY_ROLLOUT_GATE_MODES.enabled;
