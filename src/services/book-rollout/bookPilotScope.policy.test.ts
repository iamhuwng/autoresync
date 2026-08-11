import { describe, expect, it } from 'vitest';
import {
  BOOK_PILOT_MAX_STUDENTS,
  evaluateBookPilotScope,
  type BookPilotScopeConfigV1,
} from './bookPilotScope.policy';
import { evaluateBookRolloutGate } from './bookRolloutGate.policy';

const students = Array.from({ length: BOOK_PILOT_MAX_STUDENTS }, (_, index) => `student-${index + 1}`);
const config: BookPilotScopeConfigV1 = {
  schemaVersion: 'v1', environment: 'test', revision: 'policy-test-1',
  issuedAt: '2026-08-12T00:00:00.000Z', expiresAt: '2026-08-12T01:00:00.000Z',
  teacherId: 'teacher-1', bookId: 'book-1', assignmentId: 'assignment-1',
  studentIds: students, maxStudents: BOOK_PILOT_MAX_STUDENTS,
};
const input = (overrides: Partial<Parameters<typeof evaluateBookPilotScope>[0]> = {}) =>
  evaluateBookPilotScope({
    operation: 'mutation', expectedEnvironment: 'test', actorId: 'teacher-1', actorKind: 'teacher',
    now: new Date('2026-08-12T00:30:00.000Z'), configReader: { read: () => config }, ...overrides,
  });

describe('Book Pilot Scope fixed bounded policy', () => {
  it('allows only exact configured subjects and the fixed action set', () => {
    expect(input({ operation: 'create' }).allowed).toBe(true);
    expect(input({ operation: 'upload', bookId: 'book-1', requireBook: true }).allowed).toBe(true);
    expect(input({ operation: 'publish', bookId: 'book-1', requireBook: true }).allowed).toBe(true);
    expect(input({
      operation: 'assign-place', bookId: 'book-1', assignmentId: 'assignment-1',
      selectedStudentIds: ['student-1'], requireBook: true, requireAssignment: true, requireStudents: true,
    }).allowed).toBe(true);
    expect(input({
      operation: 'launch-delivery', actorId: 'student-1', actorKind: 'student',
      assignmentId: 'assignment-1', studentId: 'student-1', selectedStudentIds: ['student-1'],
      requireAssignment: true, requireStudents: true,
    }).allowed).toBe(true);
  });

  it('fails closed for identity, count, context, expiry, and unresolved slots', () => {
    expect(input({ actorId: 'teacher-2' }).reason).toBe('teacher_denied');
    expect(input({ bookId: 'book-2', requireBook: true }).reason).toBe('book_denied');
    expect(input({ assignmentId: 'assignment-2', requireAssignment: true }).reason).toBe('assignment_denied');
    expect(input({
      actorId: 'student-2', actorKind: 'student', studentId: 'student-2', selectedStudentIds: ['student-31'],
    }).reason).toBe('student_denied');
    expect(input({ selectedStudentIds: [...students, 'student-31'], count: 31 }).reason).toBe('count_exceeded');
    expect(input({ contextKind: 'course', requireAssignment: true, assignmentId: 'assignment-1' }).reason).toBe('assignment_denied');
    expect(input({ now: new Date('2026-08-12T01:00:00.000Z') }).reason).toBe('expired');
    expect(input({ configReader: { read: () => ({ ...config, teacherId: null }) } }).reason).toBe('identity_unresolved');
    expect(input({ configReader: { read: () => undefined } }).reason).toBe('config_missing');
  });

  it('rehearses rollback-to-all-deny while recovery remains side-effect-free', () => {
    const allDeny = {
      schemaVersion: 'v1', environment: 'test', revision: 'rollback-all-deny',
      issuedAt: '2026-08-12T00:00:00.000Z', expiresAt: '2026-08-12T01:00:00.000Z',
      actions: {
        create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny',
        'launch-delivery': 'deny', mutation: 'deny',
      },
    } as const;
    expect(evaluateBookRolloutGate({
      operation: 'mutation', expectedEnvironment: 'test', now: new Date('2026-08-12T00:30:00.000Z'),
      configReader: { read: () => allDeny },
    }).allowed).toBe(false);
    expect(evaluateBookRolloutGate({
      operation: 'recovery', expectedEnvironment: 'test', now: new Date('2026-08-12T00:30:00.000Z'),
      configReader: { read: () => undefined },
    }).allowed).toBe(true);
  });
});
