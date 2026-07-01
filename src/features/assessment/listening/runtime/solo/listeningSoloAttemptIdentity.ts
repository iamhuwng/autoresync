import type { SoloProgressScopeContext } from '../../../../../types/practice.types';

export interface ListeningSoloAttemptIdentity {
  attemptId: string;
  submissionOperationId: string;
  resultId: string;
}

interface BuildListeningSoloAttemptIdentityOptions {
  materialId: string;
  studentId: string;
  scopeContext?: SoloProgressScopeContext;
  existingAttemptId?: string | null;
  existingSubmissionOperationId?: string | null;
  generatedAttemptSeed?: string | null;
}

const encodeSegment = (value: string): string =>
  encodeURIComponent(value).replace(/\./g, '%2E');

const buildGeneratedAttemptSeed = (): string =>
  `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const buildListeningSoloResultId = (submissionOperationId: string): string =>
  `listening_solo__${submissionOperationId}`;

export function buildListeningSoloAttemptIdentity({
  materialId,
  studentId,
  scopeContext,
  existingAttemptId,
  existingSubmissionOperationId,
  generatedAttemptSeed,
}: BuildListeningSoloAttemptIdentityOptions): ListeningSoloAttemptIdentity {
  const attemptId = existingAttemptId || (() => {
    const mode = scopeContext?.mode ?? 'self_study';
    const student = encodeSegment(studentId);
    const material = encodeSegment(materialId);

    if (mode === 'homework') {
      return [
        'homework',
        student,
        material,
        encodeSegment(scopeContext?.homeworkId || 'no-homework'),
        encodeSegment(scopeContext?.submissionId || 'no-submission'),
      ].join('__');
    }

    if (mode === 'course_material') {
      return [
        'course_material',
        student,
        material,
        encodeSegment(scopeContext?.courseId || 'no-course'),
        encodeSegment(scopeContext?.moduleId || 'no-module'),
        encodeSegment(generatedAttemptSeed || buildGeneratedAttemptSeed()),
      ].join('__');
    }

    return [
      'self_study',
      student,
      material,
      encodeSegment(generatedAttemptSeed || buildGeneratedAttemptSeed()),
    ].join('__');
  })();

  const submissionOperationId = existingSubmissionOperationId || `${attemptId}__submit`;

  return {
    attemptId,
    submissionOperationId,
    resultId: buildListeningSoloResultId(submissionOperationId),
  };
}
