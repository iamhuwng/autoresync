export interface TeacherMaterialsDiagnosticFlagInput {
  isDev?: boolean;
  mode?: string;
  search?: string;
}

export interface TeacherMaterialsDiagnosticLogOptions {
  enabled?: boolean;
}

export function readTeacherMaterialsDiagnosticFlag(input?: TeacherMaterialsDiagnosticFlagInput): boolean;

export function isTeacherMaterialsDiagnosticsEnabled(): boolean;

export function getTeacherMaterialsDiagnosticTime(): number;

export function getTeacherMaterialsElapsedMs(startTime: number): number;

export function sanitizeTeacherMaterialsDiagnosticPayload(payload: unknown, depth?: number): unknown;

export function logTeacherMaterialsDiagnostic(
  event: string,
  payload?: Record<string, unknown>,
  options?: TeacherMaterialsDiagnosticLogOptions,
): void;

export const TEACHER_MATERIALS_DIAGNOSTICS_KEYS: {
  prefix: string;
  query: string;
};
