import { describe, it, expect, vi } from 'vitest';
import { deliverHomeworkNotice, type HomeworkKind } from '../homework-notification.ts';

const fixture = (kind: HomeworkKind = 'homework-submitted') => {
  const occurredAt = Date.now() - 1000;
  const actorUid = kind === 'homework-submitted' ? 'student' : 'teacher';
  const eventId = kind === 'thcs-homework-assigned' ? 'homework' : 'event';
  const docs: Record<string, Record<string, unknown>> = {
    homework_notification_proofs: { eventId, kind, actorUid, homeworkId: 'homework', occurredAt,
      ...(kind === 'homework-submitted' ? { studentId: 'student', resultId: 'result' } : {}) },
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
    : { data: docs[collection], createTime: new Date(occurredAt - 60_000).toISOString() });
  const deliver = (studentId = 'student') => deliverHomeworkNotice({ kind, eventId, actorUid, studentId: kind === 'thcs-homework-assigned' ? studentId : undefined, readSource, database: async () => database });
  return { docs, values, database, readSource, deliver, occurredAt };
};

const thcsFixture = () => {
  const f = fixture();
  const cutoff = '2026-10-02T02:22:09.862Z';
  f.docs.homework_assignments.materialType = 'thcs-test';
  Object.assign(f.values, {
    'test_results/result/testType': 'THCS-THPT', 'test_results/result/testSkill': 'Mixed',
    'test_results/result/isGuest': false, 'test_results/result/createdAt': f.occurredAt - 500,
    'test_results/result/submittedAt': f.occurredAt - 700,
    'test_results/result/sessionCode': 'homework_practice_event',
    'test_results/result/context/source/type': 'homework',
    'test_results/result/context/source/submissionId': 'event',
    'test_results/result/context/assignment/homeworkId': 'homework',
    'test_results/result/thcsData': { scaledScore: true },
  });
  const deliver = () => deliverHomeworkNotice({ kind: 'homework-submitted', eventId: 'event', actorUid: 'student',
    readSource: f.readSource, database: async () => f.database, sourceRulesCutoff: cutoff });
  return { ...f, deliver, cutoff };
};

describe('homework committed notice authority', () => {
  it('creates an exact THCS read receipt before its notice, and replays both without replacing read state', async () => {
    const f = thcsFixture();
    expect(await f.deliver()).toBe('created');
    const path = 'result_notification_authority/result';
    expect(f.values[path]).toEqual({ schemaVersion: 3, materialType: 'thcs-test', contextType: 'homework',
      resultId: 'result', studentId: 'student', ownerTeacherId: 'teacher', homeworkId: 'homework',
      homeworkSubmissionId: 'event', testId: 'test', submittedAt: f.occurredAt - 700,
      createdAt: f.occurredAt - 500, homeworkSubmittedAt: f.occurredAt, sourceRulesCutoff: f.cutoff });
    expect(f.database.create.mock.calls.map(([path]) => path)).toEqual([
      path, 'notifications/teacher/ordinary_homework_submitted_event_teacher',
    ]);
    (f.values['notifications/teacher/ordinary_homework_submitted_event_teacher'] as any).read = true;
    delete f.values[path]; // An existing notice must not bypass receipt repair.
    expect(await f.deliver()).toBe('replayed');
    expect(f.values[path]).toMatchObject({ schemaVersion: 3, ownerTeacherId: 'teacher' });
    expect((f.values['notifications/teacher/ordinary_homework_submitted_event_teacher'] as any).read).toBe(true);
  });
  it('rejects forged THCS identities and receipt collisions before delivering a notice', async () => {
    for (const [leaf, value] of [
      ['testType', 'homework'], ['testSkill', 'writing'], ['isGuest', true], ['createdAt', Date.now() + 1000],
      ['sessionCode', 'class-session'], ['context/source/type', 'class'], ['context/source/submissionId', 'foreign'],
      ['context/assignment/homeworkId', 'foreign'], ['classId', 'class'], ['courseId', 'course'],
      ['moduleId', 'module'], ['teacherId', 'foreign'], ['writingData', { submissionId: true }],
      ['context/selectedTeacherId', 'foreign'], ['context/source/classId', 'class'],
    ]) {
      const f = thcsFixture(); f.values[`test_results/result/${leaf}`] = value;
      await expect(f.deliver()).rejects.toThrow('homework_denied');
      expect(f.database.create).not.toHaveBeenCalled();
    }
    const f = thcsFixture(); await f.deliver();
    const prior = f.values['result_notification_authority/result'] as any;
    prior.ownerTeacherId = 'foreign';
    f.database.create.mockClear();
    await expect(f.deliver()).rejects.toThrow('homework_conflict');
    expect(f.database.create.mock.calls.map(([path]) => path)).toEqual(['result_notification_authority/result']);
    const extra = thcsFixture(); await extra.deliver();
    (extra.values['result_notification_authority/result'] as any).unexpected = true;
    await expect(extra.deliver()).rejects.toThrow('homework_conflict');
    const old = thcsFixture(); old.values['test_results/result/submittedAt'] = Date.parse(old.cutoff);
    await expect(old.deliver()).rejects.toThrow('homework_denied');
    const malformedMaterial = thcsFixture();
    malformedMaterial.docs.homework_assignments.materialId = malformedMaterial.values['test_results/result/testId'] = 'invalid/id';
    await expect(malformedMaterial.deliver()).rejects.toThrow('homework_denied');
  });
  it('keeps the receipt recoverable when notice delivery fails after its conditional create', async () => {
    const f = thcsFixture();
    f.database.create.mockImplementationOnce(async (path, value) => {
      f.values[path] = value; return true;
    }).mockRejectedValueOnce(Error('transport_unknown'));
    await expect(f.deliver()).rejects.toThrow('transport_unknown');
    expect(f.values['result_notification_authority/result']).toMatchObject({ schemaVersion: 3 });
    expect(await f.deliver()).toBe('created');
  });
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
  it('requires the immutable assignment proof before any recipient delivery', async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs = {}; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs.actorUid = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs.eventId = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs.kind = 'homework-submitted'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs.homeworkId = 'other'; },
      (f: ReturnType<typeof fixture>) => { f.docs.homework_notification_proofs.occurredAt = f.occurredAt - 1; },
    ]) {
      const f = fixture('thcs-homework-assigned'); change(f);
      await expect(f.deliver()).rejects.toThrow('homework_denied');
      expect(f.database.create).not.toHaveBeenCalled();
    }
  });
  it('shares one assignment proof across exact recipients while denying outsiders', async () => {
    const f = fixture('thcs-homework-assigned');
    f.docs.homework_assignments.target = { type: 'students', studentIds: ['student', 'second'] };
    f.values['users/second/role'] = 'student';
    f.values['users/outsider/role'] = 'student';
    expect(await f.deliver()).toBe('created');
    expect(await f.deliver('second')).toBe('created');
    await expect(f.deliver('outsider')).rejects.toThrow('homework_denied');
    expect(f.database.create.mock.calls.map(([path]) => path)).toEqual([
      'notifications/student/ordinary_thcs_homework_assigned_homework_student',
      'notifications/second/ordinary_thcs_homework_assigned_homework_second',
    ]);
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
