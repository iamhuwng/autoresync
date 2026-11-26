import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;

beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    throw new Error('FIREBASE_DATABASE_EMULATOR_HOST is required for teacher roster isolation rules tests.');
  }

  env = await initializeTestEnvironment({
    projectId: 'demo-teacher-roster-isolation-20261127',
    database: { rules: readFileSync('database.rules.json', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref().set({
      users: {
        'teacher-a': { role: 'teacher', status: 'active' },
        'teacher-b': { role: 'teacher', status: 'active' },
        'student-1': { role: 'student', status: 'active' },
        'student-2': { role: 'student', status: 'active' },
        'admin-1': { role: 'super_admin', status: 'active' },
      },
      student_teacher_assignments: {
        'assign-a': {
          id: 'assign-a',
          studentId: 'student-1',
          teacherId: 'teacher-a',
          assignedBy: 'admin-1',
          assignedAt: 1000,
          unassignedAt: null,
          status: 'active',
          coursesEnrolled: [],
        },
        'assign-b': {
          id: 'assign-b',
          studentId: 'student-2',
          teacherId: 'teacher-b',
          assignedBy: 'admin-1',
          assignedAt: 2000,
          unassignedAt: null,
          status: 'active',
          coursesEnrolled: [],
        },
        'assign-legacy-a': {
          id: 'assign-legacy-a',
          studentId: 'student-2',
          teacherId: 'teacher-a',
          status: 'active',
        },
      },
      student_requests: {
        'req-a': {
          id: 'req-a',
          teacherId: 'teacher-a',
          studentEmail: 'student1@test.com',
          requestedAt: 1000,
          status: 'pending',
        },
        'req-b': {
          id: 'req-b',
          teacherId: 'teacher-b',
          studentEmail: 'student2@test.com',
          requestedAt: 2000,
          status: 'pending',
        },
      },
      classes: {
        'class-a': {
          id: 'class-a',
          classCode: 'CLASSA',
          name: 'Teacher A Class',
          createdBy: 'teacher-a',
          status: 'active',
          students: {
            'student-1': { id: 'student-1', uid: 'student-1', status: 'active', joinedAt: 1000 },
          },
        },
        'class-b': {
          id: 'class-b',
          classCode: 'CLASSB',
          name: 'Teacher B Class',
          createdBy: 'teacher-b',
          status: 'active',
          settings: { maxStudents: 50 },
          stats: { totalStudents: 1 },
          students: {
            'student-2': {
              id: 'student-2',
              uid: 'student-2',
              email: 'student2@test.com',
              status: 'active',
              joinedAt: 2000,
            },
          },
        },
        'class-legacy-owner': {
          id: 'class-legacy-owner',
          classCode: 'LEGCYA',
          name: 'Legacy Teacher A Class',
          teacherId: 'teacher-a',
          status: 'active',
          students: {},
        },
        'class-b-archived': {
          id: 'class-b-archived',
          classCode: 'ARCHVB',
          name: 'Teacher B Archived',
          createdBy: 'teacher-b',
          status: 'archived',
          students: {
            'student-2': { id: 'student-2', uid: 'student-2', status: 'active', joinedAt: 2000 },
          },
        },
      },
    });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('RTDB Teacher Roster Isolation Rules', () => {
  it('restricts student_teacher_assignments reads to teacher-bound, student-bound, or super_admin access', async () => {
    const teacherA = env.authenticatedContext('teacher-a').database();
    const student1 = env.authenticatedContext('student-1').database();
    const admin = env.authenticatedContext('admin-1').database();

    // Allowed teacher-bound query and own assignment read
    const ownSnap = await assertSucceeds(
      teacherA.ref('student_teacher_assignments').orderByChild('teacherId').equalTo('teacher-a').get()
    );
    expect(Object.keys(ownSnap.val() || {}).sort()).toEqual(['assign-a', 'assign-legacy-a']);
    await assertSucceeds(teacherA.ref('student_teacher_assignments/assign-a').get());

    // Denied unfiltered root read, cross-teacher query, and cross-teacher item read
    await assertFails(teacherA.ref('student_teacher_assignments').get());
    await assertFails(
      teacherA.ref('student_teacher_assignments').orderByChild('teacherId').equalTo('teacher-b').get()
    );
    await assertFails(teacherA.ref('student_teacher_assignments/assign-b').get());

    // Student can only query or read own assignments
    const studentSnap = await assertSucceeds(
      student1.ref('student_teacher_assignments').orderByChild('studentId').equalTo('student-1').get()
    );
    expect(Object.keys(studentSnap.val() || {})).toEqual(['assign-a']);
    await assertFails(student1.ref('student_teacher_assignments').get());
    await assertFails(student1.ref('student_teacher_assignments/assign-b').get());

    // Super admin retains full read access
    await assertSucceeds(admin.ref('student_teacher_assignments').get());
  });

  it('prevents cross-teacher assignment mutations, hard deletes, and ownership tampering', async () => {
    const teacherA = env.authenticatedContext('teacher-a').database();
    const admin = env.authenticatedContext('admin-1').database();

    // Teacher A can soft-remove their own assignment (including legacy rows missing assignedBy/assignedAt)
    await assertSucceeds(
      teacherA.ref('student_teacher_assignments/assign-a').update({
        status: 'removed',
        unassignedAt: 5000,
      })
    );
    await assertSucceeds(
      teacherA.ref('student_teacher_assignments/assign-legacy-a').update({
        status: 'removed',
        unassignedAt: 5500,
      })
    );

    // Teacher A can create an active assignment for themselves
    await assertSucceeds(
      teacherA.ref('student_teacher_assignments/assign-new').set({
        id: 'assign-new',
        studentId: 'student-2',
        teacherId: 'teacher-a',
        assignedBy: 'teacher-a',
        assignedAt: 6000,
        unassignedAt: null,
        status: 'active',
        coursesEnrolled: [],
      })
    );

    // Teacher A cannot release or mutate Teacher B's assignment
    await assertFails(
      teacherA.ref('student_teacher_assignments/assign-b').update({
        status: 'removed',
        unassignedAt: 5000,
      })
    );

    // Teacher A cannot forge an assignment owned by Teacher B
    await assertFails(
      teacherA.ref('student_teacher_assignments/assign-forged').set({
        id: 'assign-forged',
        studentId: 'student-1',
        teacherId: 'teacher-b',
        assignedBy: 'teacher-a',
        assignedAt: 6000,
        unassignedAt: null,
        status: 'active',
        coursesEnrolled: [],
      })
    );

    // Teacher A cannot mutate immutable ownership fields on their own assignment
    await assertFails(
      teacherA.ref('student_teacher_assignments/assign-new').update({
        teacherId: 'teacher-b',
      })
    );
    await assertFails(
      teacherA.ref('student_teacher_assignments/assign-new').update({
        studentId: 'student-1',
      })
    );
    await assertFails(
      teacherA.ref('student_teacher_assignments/assign-new').update({
        assignedBy: 'admin-1',
      })
    );

    // Teacher A cannot hard-delete an assignment
    await assertFails(teacherA.ref('student_teacher_assignments/assign-new').remove());

    // Super admin can release any assignment
    await assertSucceeds(
      admin.ref('student_teacher_assignments/assign-b').update({
        status: 'removed',
        unassignedAt: 7000,
      })
    );
  });

  it('restricts student_requests reads to owning teacher or super_admin', async () => {
    const teacherA = env.authenticatedContext('teacher-a').database();
    const student1 = env.authenticatedContext('student-1').database();
    const admin = env.authenticatedContext('admin-1').database();

    const ownReqSnap = await assertSucceeds(
      teacherA.ref('student_requests').orderByChild('teacherId').equalTo('teacher-a').get()
    );
    expect(Object.keys(ownReqSnap.val() || {})).toEqual(['req-a']);
    await assertSucceeds(teacherA.ref('student_requests/req-a').get());

    await assertFails(teacherA.ref('student_requests').get());
    await assertFails(
      teacherA.ref('student_requests').orderByChild('teacherId').equalTo('teacher-b').get()
    );
    await assertFails(teacherA.ref('student_requests/req-b').get());

    await assertFails(student1.ref('student_requests').get());
    await assertFails(student1.ref('student_requests/req-a').get());

    await assertSucceeds(admin.ref('student_requests').get());
  });

  it('restricts classes reads so teachers cannot enumerate or read other teachers classes', async () => {
    const teacherA = env.authenticatedContext('teacher-a').database();
    const student1 = env.authenticatedContext('student-1').database();
    const student2 = env.authenticatedContext('student-2').database();
    const admin = env.authenticatedContext('admin-1').database();

    const ownClassesSnap = await assertSucceeds(
      teacherA.ref('classes').orderByChild('createdBy').equalTo('teacher-a').get()
    );
    expect(Object.keys(ownClassesSnap.val() || {})).toEqual(['class-a']);
    await assertSucceeds(teacherA.ref('classes/class-a').get());

    // Teacher A can check an unused class code (!data.exists()) when creating a new class
    const unusedSnap = await assertSucceeds(teacherA.ref('classes/NEWCD1').get());
    expect(unusedSnap.exists()).toBe(false);
    await assertSucceeds(
      teacherA.ref('classes/NEWCD1').set({
        id: 'NEWCD1',
        classCode: 'NEWCD1',
        name: 'New Teacher A Class',
        createdBy: 'teacher-a',
        status: 'active',
      })
    );

    await assertFails(teacherA.ref('classes').get());
    await assertFails(teacherA.ref('classes').orderByChild('createdBy').equalTo('teacher-b').get());
    await assertFails(teacherA.ref('classes/class-b').get());

    // Teacher A can read a legacy class owned via teacherId when createdBy is absent
    await assertSucceeds(teacherA.ref('classes/class-legacy-owner').get());

    // Unrelated student cannot scan all classes OR read another class's full record / roster PII
    await assertFails(student1.ref('classes').get());
    await assertFails(student1.ref('classes/class-b').get());
    await assertFails(student1.ref('classes/class-b/students').get());
    await assertFails(student1.ref('classes/class-b/students/student-2').get());
    await assertFails(student1.ref('classes/class-b-archived').get());

    // Non-member student CAN read only narrow non-PII join-by-code metadata + own membership slot
    await assertSucceeds(student1.ref('classes/class-b/status').get());
    await assertSucceeds(student1.ref('classes/class-b/settings/maxStudents').get());
    await assertSucceeds(student1.ref('classes/class-b/stats/totalStudents').get());
    await assertSucceeds(student1.ref('classes/class-b/students/student-1').get());
    await assertSucceeds(student1.ref('classes/class-b/membershipDecisions/student-1').get());

    // Enrolled student can read their own class (even when archived)
    await assertSucceeds(student1.ref('classes/class-a').get());
    await assertSucceeds(student2.ref('classes/class-b-archived').get());

    await assertSucceeds(admin.ref('classes').get());
  });
});
