const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;

export class CourseBookAccessError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CourseBookAccessError';
  }
}

export interface DirectCourseEnrollmentFact {
  readonly legacyEnrollmentId: string;
  readonly courseId: string;
  readonly studentId: string;
  readonly enrollmentType: 'individual' | 'public';
  readonly status: 'active';
  readonly expiresAt: number;
  readonly revision: number;
}

export interface CourseModuleFact {
  readonly id: string;
  readonly courseId: string;
  readonly order: number;
  readonly accessType: 'open' | 'sequential';
}

const record = (value: unknown, code: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CourseBookAccessError(code);
  }
  return value as Record<string, unknown>;
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new CourseBookAccessError(code);
  return value;
};

const nonnegativeRevision = (value: unknown): number => {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new CourseBookAccessError('course_enrollment_invalid');
  }
  return Number(value);
};

/** Validates one exact legacy random-ID row; class-backed rows never qualify. */
export const requireActiveDirectCourseEnrollment = (input: {
  readonly legacyEnrollmentId: string;
  readonly value: unknown;
  readonly courseId: string;
  readonly studentId: string;
  readonly now: number;
}): DirectCourseEnrollmentFact => {
  const value = record(input.value, 'course_enrollment_not_found');
  const legacyEnrollmentId = id(input.legacyEnrollmentId, 'course_enrollment_invalid');
  const courseId = id(value.courseId, 'course_enrollment_invalid');
  const studentId = id(value.studentId, 'course_enrollment_invalid');
  if (courseId !== input.courseId || studentId !== input.studentId) {
    throw new CourseBookAccessError('course_enrollment_identity_mismatch');
  }
  if (value.enrollmentType !== 'individual' && value.enrollmentType !== 'public') {
    throw new CourseBookAccessError('course_enrollment_not_direct_course');
  }
  if (value.status !== 'active') throw new CourseBookAccessError('course_enrollment_inactive');
  const expiresAt = value.expiresAt === undefined ? 0 : Number(value.expiresAt);
  if (!Number.isFinite(input.now) || !Number.isFinite(expiresAt) || expiresAt < 0) {
    throw new CourseBookAccessError('course_enrollment_invalid');
  }
  if (expiresAt > 0 && expiresAt <= input.now) {
    throw new CourseBookAccessError('course_enrollment_expired');
  }
  return Object.freeze({
    legacyEnrollmentId,
    courseId,
    studentId,
    enrollmentType: value.enrollmentType,
    status: 'active',
    expiresAt,
    revision: nonnegativeRevision(value.revision),
  });
};

const moduleFact = (value: unknown): CourseModuleFact => {
  const source = record(value, 'course_module_invalid');
  const order = Number(source.order);
  if (!Number.isSafeInteger(order) || order < 0
    || (source.accessType !== 'open' && source.accessType !== 'sequential')) {
    throw new CourseBookAccessError('course_module_invalid');
  }
  return Object.freeze({
    id: id(source.id, 'course_module_invalid'),
    courseId: id(source.courseId, 'course_module_invalid'),
    order,
    accessType: source.accessType,
  });
};

/** Derives the direct-Course module release fact from canonical Course state. */
export const deriveDirectCourseModuleRelease = (input: {
  readonly courseId: string;
  readonly moduleId: string;
  readonly module: unknown;
  readonly courseModules: unknown;
  readonly progress: unknown;
}): boolean => {
  const target = moduleFact(input.module);
  if (target.id !== input.moduleId || target.courseId !== input.courseId) {
    throw new CourseBookAccessError('course_module_identity_mismatch');
  }
  if (target.accessType === 'open' || target.order === 0) return true;
  const rawModules = input.courseModules;
  if (!rawModules || typeof rawModules !== 'object' || Array.isArray(rawModules)) {
    throw new CourseBookAccessError('course_module_sequence_unavailable');
  }
  const modules = Object.values(rawModules as Record<string, unknown>)
    .map(moduleFact)
    .filter((candidate) => candidate.courseId === input.courseId);
  if (modules.filter((candidate) => candidate.id === target.id).length !== 1) {
    throw new CourseBookAccessError('course_module_sequence_invalid');
  }
  const preceding = modules.filter((candidate) => candidate.order < target.order);
  const progress = input.progress && typeof input.progress === 'object' && !Array.isArray(input.progress)
    ? input.progress as Record<string, unknown>
    : {};
  const completed = progress.completedModules && typeof progress.completedModules === 'object'
    && !Array.isArray(progress.completedModules)
    ? progress.completedModules as Record<string, unknown>
    : {};
  return preceding.every((candidate) => {
    const completion = completed[candidate.id];
    return Boolean(completion && typeof completion === 'object' && !Array.isArray(completion));
  });
};
