// Isolated QA setup; run with a node-environment Vitest config and this file included.
// Only external Firebase storage/auth are substituted. No Class or H producer is mocked.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'teacher-1' } },
  writes: [] as string[],
  pending: [] as Promise<unknown>[],
}));
const classCommandQa = process.env.CLASS_BOOK_COMMAND_QA_ENABLED === '1';
const origin = process.env.CLASS_PROVISIONING_ORIGIN ?? 'http://localhost:8792';
async function storage(method: string, fields: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${origin}/__homework-production/storage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, ...fields, uid: sdk.auth.currentUser.uid }),
  });
  if (!response.ok) throw new Error(`fixture_storage_${response.status}`);
  return response.json();
}

vi.mock('../../src/services/firebase', () => ({ database: {}, auth: sdk.auth }));
vi.mock('firebase/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/auth')>(), getAuth: () => sdk.auth,
}));
vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  type Target = { path: string; child?: string; expected?: unknown; key?: string };
  const write = async (path: string, value: unknown) => {
    sdk.writes.push(path);
    await storage('write', { path, value });
  };
  const snapshot = (value: unknown) => ({
    exists: () => value !== null && value !== undefined,
    val: () => value,
    forEach: (visit: (item: unknown) => void) => {
      for (const [key, child] of Object.entries((value ?? {}) as Record<string, unknown>)) {
        visit({ key, ...snapshot(child) });
      }
    },
  });
  return {
    ...actual,
    ref: (_database: unknown, path = '') => ({ path }),
    get: async (target: Target) => {
      // External provisioning-only recovery context. Never persist this flag in H storage.
      let value = target.path === 'system_flags/restore_in_progress'
        ? { active: true } : await storage('read', { path: target.path });
      if (target.child && value && typeof value === 'object') {
        value = Object.fromEntries(Object.entries(value).filter(([, row]) =>
          (row as Record<string, unknown>)[target.child!] === target.expected));
        if (Object.keys(value as object).length === 0) value = null;
      }
      return snapshot(value);
    },
    set: (target: Target, value: unknown) => write(target.path, value),
    update: async (target: Target, patch: Record<string, unknown>) => {
      const payload = Object.fromEntries(Object.entries(patch).map(([path, value]) =>
        [[target.path, path].filter(Boolean).join('/'), value]));
      sdk.writes.push(...Object.keys(payload));
      await storage('update', { payload });
    },
    query: (target: Target, ...constraints: object[]) => Object.assign({}, target, ...constraints),
    orderByChild: (child: string) => ({ child }), equalTo: (expected: unknown) => ({ expected }),
    push: (target: Target, value?: unknown) => {
      const key = randomUUID();
      const result = { key, path: `${target.path}/${key}` };
      if (value !== undefined) sdk.pending.push(write(result.path, value));
      return result;
    },
  };
});

it('provisions the external classroom through real Class create, join and approve services', async () => {
  const baselinePaths = ['book_homework', 'homework_assignments', 'book_delivery', 'book_runtime', 'book_activity_grading',
    'book_activity_evaluations', 'notifications', 'system_flags/restore_in_progress'];
  for (const path of baselinePaths) expect(await storage('read', { path })).toBeNull();
  const { createClass, enrollStudent, approveClassStudent, getClass } = await import('../../src/services/classManager');
  const { notifyCommittedEvent } = await import('../../src/services/notificationProducerClient');
  const created = await createClass({ name: 'Homework production prerequisite', description: 'Isolated external SDK provisioning' }, 'teacher-1');
  expect(created.success).toBe(true);
  expect(created.classId).toBeTruthy();
  const classId = created.classId!;
  sdk.auth.currentUser.uid = 'student-1';
  const joined = await enrollStudent(classId, 'student-1', 'Fixture Student', 'student@test.com');
  expect(joined).toEqual({ success: true, classId });
  const pendingClass = await getClass(classId);
  expect(pendingClass?.students['student-1'].status).toBe('pending_approval');
  sdk.auth.currentUser.uid = 'teacher-1';
  const approved = await approveClassStudent(classId, 'student-1', 'teacher-1');
  expect(approved).toEqual({ success: true });
  await Promise.all(sdk.pending);
  let coursePrerequisite: { courseId: string; moduleId: string; classCourseId: string } | undefined;
  if (classCommandQa) {
    const { createCourse, createModule } = await import('../../src/services/courseManager');
    const { linkCourseToClass } = await import('../../src/services/enrollmentManager');
    const course = await createCourse({ name: 'Canonical Class command source', type: 'IELTS', ownerId: 'teacher-1',
      code: `CC-${randomUUID().slice(0, 8)}`, visibility: 'private', duration: { value: 30, unit: 'days' } }, 'teacher-1');
    expect(course.success, course.error).toBe(true);
    const module = await createModule(course.courseId!, { name: 'Two units and two sources', accessType: 'open' });
    expect(module.success, module.error).toBe(true);
    const linked = await linkCourseToClass(classId, course.courseId!, undefined, false);
    expect(linked.success, linked.error).toBe(true);
    expect(linked.linkedCourseId).toBeTruthy();
    await Promise.all(sdk.pending);
    coursePrerequisite = { courseId: course.courseId!, moduleId: module.moduleId!, classCourseId: linked.linkedCourseId! };
  }
  const canonical = await storage('read', { path: `classes/${classId}` }) as Record<string, unknown>;
  const reverseMembership = await storage('read', { path: `student_classes/student-1/${classId}` });
  const studentProfile = await storage('read', { path: 'users/student-1' });
  const loaded = await getClass(classId);
  expect(loaded?.createdBy).toBe('teacher-1');
  expect(loaded?.status).toBe('active');
  expect(loaded?.students['student-1']).toMatchObject({ uid: 'student-1', status: 'active', approvedBy: 'teacher-1' });
  const approvedAt = (canonical.students as Record<string, { approvedAt: number }>)['student-1'].approvedAt;
  expect(await notifyCommittedEvent({ eventKind: 'class-membership', action: 'approve', classId,
    studentId: 'student-1', occurredAt: approvedAt })).toMatchObject({
    status: 'skipped', delivered: 0, code: 'restore_in_progress',
  });
  const baseline = Object.fromEntries(await Promise.all(baselinePaths.map(async path =>
    [path, await storage('read', { path })] as const)));
  for (const value of Object.values(baseline)) expect(value).toBeNull();
  // Parent values are imported first; exact descendant values then reproduce the recorded final state.
  const importOrder = [...new Set(sdk.writes)].sort((left, right) =>
    left.split('/').length - right.split('/').length || left.localeCompare(right));
  const owningWriteSnapshot = Object.fromEntries(await Promise.all(importOrder.map(async path =>
    [path, await storage('read', { path })] as const)));
  const report = {
    evidenceClass: 'local-real-Class-services-external-Firebase-SDK', fixtureOrigin: origin,
    producedAt: new Date().toISOString(), classId, ownerId: 'teacher-1', studentId: 'student-1',
    sourcePath: 'src/services/classManager.ts',
    ...(coursePrerequisite ? { coursePrerequisite,
      courseProducers: ['courseManager.createCourse', 'courseManager.createModule', 'enrollmentManager.linkCourseToClass'] } : {}),
    sourceSha256: createHash('sha256').update(await readFile('src/services/classManager.ts')).digest('hex'),
    producers: ['classManager.createClass', 'classManager.enrollStudent', 'classManager.approveClassStudent'],
    outcomes: { created, joined, approved }, canonical, reverseMembership, studentProfile,
    studentProfilePath: 'users/student-1', studentProfileOrigin: 'fixture external Firebase user prerequisite',
    membershipFacts: { intermediatePending: pendingClass?.students['student-1'].status,
      active: ['student-1'], pending: [], removed: [] },
    sha256: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
    classPath: `classes/${classId}`, rosterPath: `classes/${classId}/students/student-1`,
    membershipPath: `student_classes/student-1/${classId}`, writes: sdk.writes, baseline,
    importOrder, owningWriteSnapshot,
    notificationContext: 'external SDK restore flag={active:true} only during provisioning; no flag persisted',
    limits: ['No Firebase Rules enforcement', 'No real Class browser enrollment acceptance', 'No deployed Class flow'],
  };
  await mkdir('output', { recursive: true });
  await writeFile(classCommandQa ? 'output/prd0062-cc-class-course-provisioning.json'
    : 'output/prd0062-homework-class-provisioning.json', JSON.stringify(report, null, 2));
  console.info(`Class provisioning: ${classId}; sha256=${report.sha256}`);
}, 30_000);
