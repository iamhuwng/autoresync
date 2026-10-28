import type { FirebaseRtdbQuery } from './listening-authoring/rtdb.ts';

type Row = Record<string, any>;
const row = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export async function readListeningCourseAccess(
  read: (path: string, query?: FirebaseRtdbQuery) => Promise<any>,
  scope: { testId: string; courseId?: string; moduleId?: string },
  studentId: string,
  versionOwnerId: string,
  now: number,
): Promise<{ course: Row; current: Row } | null> {
  if ([scope.testId, scope.courseId, scope.moduleId].some(id => typeof id !== 'string' || !id || /[.#$\[\]\/\u0000-\u001f]/u.test(id))) return null;
  const [course, module, enrollments, materials, current] = await Promise.all([
    read(`courses/${scope.courseId}`), read(`modules/${scope.moduleId}`),
    read('course_enrollments', { orderBy: 'studentId', equalTo: studentId }),
    read('course_materials', { orderBy: 'moduleId', equalTo: scope.moduleId }), read(`tests/${scope.testId}`),
  ]);
  if (!row(course) || course.archivedAt || typeof course.ownerId !== 'string' || !row(module)
    || module.courseId !== scope.courseId || !row(enrollments) || !row(materials)
    || !Object.values(enrollments).some(entry => row(entry) && entry.studentId === studentId && entry.courseId === scope.courseId
      && entry.status === 'active' && (entry.expiresAt === 0 || (typeof entry.expiresAt === 'number' && entry.expiresAt > now)))
    || !Object.values(materials).some(entry => row(entry) && entry.materialId === scope.testId && entry.courseId === scope.courseId
      && entry.moduleId === scope.moduleId && entry.materialKind !== 'book-delivery')
    || !row(current) || current.ownerId !== versionOwnerId) return null;
  return { course, current };
}
