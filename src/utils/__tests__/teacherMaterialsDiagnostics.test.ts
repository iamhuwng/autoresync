import { describe, expect, it, vi } from 'vitest';
import {
  TEACHER_MATERIALS_DIAGNOSTICS_KEYS,
  logTeacherMaterialsDiagnostic,
  readTeacherMaterialsDiagnosticFlag,
} from '../teacherMaterialsDiagnostics';

describe('teacherMaterialsDiagnostics', () => {
  it('enables diagnostics in dev and via production query param', () => {
    expect(readTeacherMaterialsDiagnosticFlag({ isDev: true, mode: 'development' })).toBe(true);
    expect(readTeacherMaterialsDiagnosticFlag({ mode: 'production', search: '?diagTeacherMaterials=1' })).toBe(true);
    expect(readTeacherMaterialsDiagnosticFlag({ mode: 'production', search: '?diagTeacherMaterials=true' })).toBe(true);
    expect(readTeacherMaterialsDiagnosticFlag({ mode: 'production', search: '?diagTeacherMaterials=0' })).toBe(false);
    expect(readTeacherMaterialsDiagnosticFlag({ isDev: true, mode: 'test', search: '?diagTeacherMaterials=1' })).toBe(false);
  });

  it('emits the stable diagnostic prefix when enabled', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logTeacherMaterialsDiagnostic('probe', { scope: 'owned' }, { enabled: true });

    expect(infoSpy).toHaveBeenCalledWith(
      `${TEACHER_MATERIALS_DIAGNOSTICS_KEYS.prefix} probe`,
      { scope: 'owned' },
    );

    infoSpy.mockRestore();
  });
});
