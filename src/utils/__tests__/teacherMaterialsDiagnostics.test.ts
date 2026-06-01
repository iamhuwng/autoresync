import { describe, expect, it, vi } from 'vitest';
import {
  TEACHER_MATERIALS_DIAGNOSTICS_KEYS,
  logTeacherMaterialsDiagnostic,
  readTeacherMaterialsDiagnosticFlag,
  sanitizeTeacherMaterialsDiagnosticPayload,
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

  it('removes sensitive Reading Passage and student fields from diagnostic payloads', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const unsafePayload = {
      scope: 'private',
      count: 2,
      passageText: 'full passage text',
      questions: [{ text: 'question text' }],
      answerKey: { 1: 'correct answer' },
      hiddenProvenance: { source: 'import trace' },
      importEvidence: ['raw import'],
      studentAnswers: { q1: 'student answer' },
      fullStudentName: 'Student One',
      nested: {
        safeCount: 1,
        correctAnswers: ['hidden'],
      },
    };

    expect(sanitizeTeacherMaterialsDiagnosticPayload(unsafePayload)).toEqual({
      scope: 'private',
      count: 2,
      nested: {
        safeCount: 1,
      },
    });

    logTeacherMaterialsDiagnostic('unsafe_probe', unsafePayload, { enabled: true });

    const emittedPayload = infoSpy.mock.calls[0]?.[1];
    expect(JSON.stringify(emittedPayload)).not.toContain('full passage text');
    expect(JSON.stringify(emittedPayload)).not.toContain('correct answer');
    expect(JSON.stringify(emittedPayload)).not.toContain('student answer');
    expect(JSON.stringify(emittedPayload)).not.toContain('Student One');

    infoSpy.mockRestore();
  });
});
