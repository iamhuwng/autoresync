import crypto from 'node:crypto';

export const PRD0062_ACCEPTANCE_CLEANUP_ROOT = 'prd0062_acceptance';

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

const hash = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

const scopedPath = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('prd0062_fixture_cleanup_scope_denied');
  }
  const normalized = value.replaceAll('\\', '/').replace(/\/+/gu, '/').replace(/\/$/u, '');
  const root = `${PRD0062_ACCEPTANCE_CLEANUP_ROOT}/`;
  if (!normalized.startsWith(root) || normalized.includes('/../') || normalized.endsWith('/..')) {
    throw new Error(`prd0062_fixture_cleanup_scope_denied:${label}`);
  }
  return normalized;
};

export const createPrd0062AcceptanceFixture = (input) => {
  const caseId = input?.caseId;
  const source = input?.source;
  if (!/^AC-[A-Z]{2}-\d{3}$/u.test(caseId ?? '') || !source?.id || !source?.title) {
    throw new Error('prd0062_acceptance_fixture_input_invalid');
  }
  const seed = `prd0062-51a:${caseId}:${source.id}:v1`;
  const checksum = hash({ seed, source });
  const cleanupRoot = `${PRD0062_ACCEPTANCE_CLEANUP_ROOT}/${caseId}`;
  return Object.freeze({
    seed,
    checksum,
    ids: Object.freeze({
      fixtureId: `fixture-${checksum.slice(0, 16)}`,
      cleanupRoot,
    }),
    source: Object.freeze({ id: source.id, title: source.title }),
  });
};

export const assertScopedPrd0062FixtureCleanup = ({ cleanupRoot, target }) => {
  const root = scopedPath(cleanupRoot, 'cleanupRoot');
  const candidate = scopedPath(target, 'target');
  if (candidate !== root && !candidate.startsWith(`${root}/`)) {
    throw new Error('prd0062_fixture_cleanup_scope_denied');
  }
  return target;
};
