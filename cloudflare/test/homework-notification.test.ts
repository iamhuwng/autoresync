import { describe, it, expect, vi } from 'vitest';
import { deliverHomeworkNotice, type HomeworkKind } from '../homework-notification.ts';

const fixture = (kind: HomeworkKind = 'homework-submitted') => {
  const occurredAt = Date.now() - 1000;
  const actorUid = kind === 'homework-submitted' ? 'student' : 'teacher';
  const eventId = kind === 'thcs-homework-assigned' ? 'homework' : 'event';
  const docs: Record<string, Record<string, unknown>> = {
    homework_notification_proofs: { eventId, kind, actorUid, homeworkId: 'homework', studentId: 'student', resultId: 'result', occurredAt },
    homework_submissions: { id: eventId, studentId: 'student', teacherId: 'teacher', homeworkId: 'homework', resultId: 'result', submittedAt: occurredAt, status: 'submitted' },
    homework_manual_reminder_intents: { eventId, actorUid, homeworkId: 'homework', studentId: 'student', occurredAt },
    homework_reset_notification_intents: { eventId, actorUid, homeworkId: 'homework', studentId: 'student', occurredAt, sourceSubmissionId: 'removed-source', resultId: 'removed' },
    homework_assignments: { id: 'homework', createdBy: 'teacher', createdAt: occurredAt, materialId: 'test', materialType: kind === 'thcs-homework-assigned' ? 'thcs-test' : 'test', target: { type: 'students', studentIds: ['student'] } },
    student_groups: { id: 'group', teacherId: 'teacher', studentIds: ['student'] },
  };
  const values: Record<string, unknown> = {
    'users/teacher/role': 'teacher', 'users/student/role': 'student',
    'test_results/result/resultId': 'result', 'test_results/result/studentId': 'student',
    'test_results/result/context/type': 'homework', 'test_results/result/context/source/id': 'homework',
    'test_results/result/testId': 'test', 'test_results/result/submittedAt': occurredAt,
    'classes/class/createdBy': 'teacher', 'classes/class/status': 'active', 'classes/class/students/student/status': 'active',
  };
  const database = { read: vi.fn(async (path: string) => values[path] ?? null), create: vi.fn(async (path: string, value: unknown) => {
    if (Object.hasOwn(values, path)) return false; values[path] = value; return true;
  }) };
  const readSource = vi.fn(async (collection: string, id: string) => id === 'removed-source'
    ? { data: docs.homework_submissions, exists: docs.homework_submissions.id === id }
    : { data: docs[collection] });
  const deliver = () => deliverHomeworkNotice({ kind, eventId, actorUid, studentId: kind === 'thcs-homework-assigned' ? 'student' : undefined, readSource, database: async () => database });
  return { docs, values, database, readSource, deliver, occurredAt };
};

describe('homework committed notice authority', () => {
  it.each(['homework-submitted', 'thcs-homework-assigned', 'homework-reminder', 'homework-reset'] as const)('%s creates once and replay preserves read', async kind => {
    const f = fixture(kind);
    expect(await f.deliver()).toBe('created');
    const path = Object.keys(f.values).find(key => key.startsWith('notifications/'))!;
    (f.values[path] as Record<string, unknown>).read = true;
    expect(await f.deliver()).toBe('replayed');
    expect((f.values[path] as Record<string, unknown>).read).toBe(true);
    expect(f.database.create).toHaveBeenCalledTimes(2);
    expect(f.database.read.mock.calls.every(([path]) => !/essay|grading|answers/u.test(path))).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(f.values[path])).length).toBeLessThan(1024);
  });
  it('requires exact immutable actor proof and source result/material binding', async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs.actorUid = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs.resultId = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_submissions.teacherId = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_submissions.administrativeImport = {}; },
      (f: ReturnType<typeof fixture>) => { f.values['test_results/result/testId'] = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.values['test_results/result/studentId'] = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.values['test_results/result/context/source/id'] = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_assignments.target = { type: 'course', courseId: 'course' }; },
    ]) { const f = fixture(); change(f); await expect(f.deliver()).rejects.toThrow('homework_denied'); expect(f.database.create).not.toHaveBeenCalled(); }
  });
  it('checks exact current class owner and active roster and group owner', async () => {
    for (const field of ['classes/class/createdBy', 'classes/class/status', 'classes/class/students/student/status']) {
      const f = fixture(); f.docs.homework_assignments.target = { type: 'class', classId: 'class' };
      f.values[field] = 'revoked'; await expect(f.deliver()).rejects.toThrow('homework_denied'); expect(f.database.create).not.toHaveBeenCalled();
    }
    const f = fixture('homework-reminder'); f.docs.homework_assignments.target = { type: 'group', groupId: 'group', studentIds: ['student'] };
    expect(await f.deliver()).toBe('created'); f.docs.student_groups.teacherId = 'other'; await expect(f.deliver()).rejects.toThrow('homework_denied');
  });
  it('notifies after Firestore attempt deletion when private canonical and student-index rows remain, preserving replay read state', async () => {
    const f = fixture('homework-reset');
    f.values['test_results/removed'] = { resultId: 'removed', studentId: 'student', answerData: 'private' };
    f.values['test_results_by_student/student/removed'] = { resultId: 'removed', studentId: 'student' };
    expect(await f.deliver()).toBe('created');
    const path = Object.keys(f.values).find(key => key.startsWith('notifications/'))!;
    expect(f.values[path]).toMatchObject({ message: 'Your teacher removed a homework attempt. Open Homework to check your current status.' });
    (f.values[path] as Record<string, unknown>).read = true;
    expect(await f.deliver()).toBe('replayed');
    expect((f.values[path] as Record<string, unknown>).read).toBe(true);
    expect(f.database.read.mock.calls.some(([readPath]) => readPath === 'test_results/removed' || readPath === 'test_results_by_student/student/removed')).toBe(false);
  });
  it('keeps reset intent, deleted-attempt, assignment, actor, and replay checks', async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => { f.docs.homework_reset_notification_intents.eventId = 'forged'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_reset_notification_intents.actorUid = 'foreign'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_reset_notification_intents.resultId = 'bad id'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_assignments.createdBy = 'foreign'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_assignments.target = { type: 'students', studentIds: ['foreign'] }; },
      (f: ReturnType<typeof fixture>) => { f.values['users/teacher/role'] = 'student'; },
      (f: ReturnType<typeof fixture>) => { f.values['users/student/role'] = 'teacher'; },
      (f: ReturnType<typeof fixture>) => { f.values['system_flags/restore_in_progress'] = true; },
    ]) {
      const f = fixture('homework-reset'); change(f);
      await expect(f.deliver()).rejects.toThrow('homework_denied');
      expect(f.database.create).not.toHaveBeenCalled();
    }
    const standalone = fixture('homework-reset');
    delete standalone.docs.homework_reset_notification_intents;
    standalone.values['test_results/removed'] = { resultId: 'removed', studentId: 'student' };
    await expect(standalone.deliver()).rejects.toThrow();
    expect(standalone.database.create).not.toHaveBeenCalled();
    const stillPresent = fixture('homework-reset');
    stillPresent.docs.homework_submissions.id = 'removed-source';
    await expect(stillPresent.deliver()).rejects.toThrow('homework_denied');
    expect(stillPresent.database.create).not.toHaveBeenCalled();
    const noResultId = fixture('homework-reset');
    delete noResultId.docs.homework_reset_notification_intents.resultId;
    expect(await noResultId.deliver()).toBe('created');
  });
  it('does not confirm collision or unknown write', async () => {
    const f = fixture(); expect(await f.deliver()).toBe('created');
    const path = Object.keys(f.values).find(key => key.startsWith('notifications/'))!;
    (f.values[path] as Record<string, unknown>).createdAt = 1;
    await expect(f.deliver()).rejects.toThrow('homework_conflict');
    const lost = fixture(); lost.database.create.mockRejectedValueOnce(Error('transport_unknown'));
    await expect(lost.deliver()).rejects.toThrow('transport_unknown'); expect(lost.database.create).toHaveBeenCalledTimes(1);
  });
});
