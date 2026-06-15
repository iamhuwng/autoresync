const DIAG_PREFIX = '[Diag][TeacherMaterials]';
const QUERY_KEY = 'diagTeacherMaterials';
const MAX_DIAGNOSTIC_DEPTH = 4;
const MAX_DIAGNOSTIC_STRING_LENGTH = 180;

const SENSITIVE_DIAGNOSTIC_KEY_PATTERN = /passageText|passageContent|questionText|questions?$|answers?$|answerKeys?|correctAnswers?|studentAnswers?|studentResponses?|hiddenProvenance|provenance|importEvidence|fullStudentName|studentName|studentFullName|displayName/i;

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

function sanitizePrimitive(value) {
  if (typeof value === 'string' && value.length > MAX_DIAGNOSTIC_STRING_LENGTH) {
    return `${value.slice(0, MAX_DIAGNOSTIC_STRING_LENGTH)}...`;
  }

  return value;
}

export function sanitizeTeacherMaterialsDiagnosticPayload(payload, depth = 0) {
  if (payload == null || typeof payload !== 'object') {
    return sanitizePrimitive(payload);
  }

  if (payload instanceof Error) {
    return {
      name: payload.name,
      message: sanitizePrimitive(payload.message),
    };
  }

  if (Array.isArray(payload)) {
    return {
      count: payload.length,
    };
  }

  if (depth >= MAX_DIAGNOSTIC_DEPTH) {
    return '[truncated]';
  }

  return Object.entries(payload).reduce((safePayload, [key, value]) => {
    if (SENSITIVE_DIAGNOSTIC_KEY_PATTERN.test(key)) {
      return safePayload;
    }

    safePayload[key] = sanitizeTeacherMaterialsDiagnosticPayload(value, depth + 1);
    return safePayload;
  }, {});
}

export function logTeacherMaterialsDiagnostic(event, payload = {}, options = {}) {
  const enabled = options.enabled ?? isTeacherMaterialsDiagnosticsEnabled();
  if (!enabled) {
    return;
  }

  console.info(`${DIAG_PREFIX} ${event}`, sanitizeTeacherMaterialsDiagnosticPayload(payload));
}

export const TEACHER_MATERIALS_DIAGNOSTICS_KEYS = {
  prefix: DIAG_PREFIX,
  query: QUERY_KEY,
};
