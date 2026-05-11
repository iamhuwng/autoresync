const DIAG_PREFIX = '[Diag][TeacherMaterials]';
const QUERY_KEY = 'diagTeacherMaterials';

function readRuntimeSearch() {
  const runtime = typeof globalThis === 'undefined' ? undefined : globalThis;
  const locationLike = runtime && 'location' in runtime ? runtime.location : undefined;
  return typeof locationLike?.search === 'string' ? locationLike.search : '';
}

export function readTeacherMaterialsDiagnosticFlag({
  isDev = false,
  mode = 'production',
  search = '',
} = {}) {
  if (mode === 'test') {
    return false;
  }

  if (isDev) {
    return true;
  }

  try {
    const queryValue = new URLSearchParams(search).get(QUERY_KEY);
    return queryValue === '1' || queryValue === 'true';
  } catch {
    return false;
  }
}

export function isTeacherMaterialsDiagnosticsEnabled() {
  return readTeacherMaterialsDiagnosticFlag({
    isDev: import.meta.env.DEV,
    mode: import.meta.env.MODE,
    search: readRuntimeSearch(),
  });
}

export function getTeacherMaterialsDiagnosticTime() {
  const perf = typeof globalThis !== 'undefined' && 'performance' in globalThis
    ? globalThis.performance
    : undefined;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

export function getTeacherMaterialsElapsedMs(startTime) {
  const elapsed = getTeacherMaterialsDiagnosticTime() - startTime;
  return Math.max(0, Math.round(elapsed * 10) / 10);
}

export function logTeacherMaterialsDiagnostic(event, payload = {}, options = {}) {
  const enabled = options.enabled ?? isTeacherMaterialsDiagnosticsEnabled();
  if (!enabled) {
    return;
  }

  console.info(`${DIAG_PREFIX} ${event}`, payload);
}

export const TEACHER_MATERIALS_DIAGNOSTICS_KEYS = {
  prefix: DIAG_PREFIX,
  query: QUERY_KEY,
};
