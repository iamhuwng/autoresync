# Course Class Management

Canonical result visibility governance for course and class contexts lives in:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`

Canonical join-by-code approval behavior now lives in:
- `documentation/architecture/class-code-join-approval-gating.md`

## Class-Linked Course Material

- When a result belongs to class-linked course material and no stronger context exists, ownership resolves from `classes/{classId}`.
- The authoritative owner field is `createdBy`.
- Unsafe placeholders such as `unknown` do not prove ownership.

## Standalone Course Material

- When a result belongs to standalone course material and no stronger context exists, ownership resolves from `courses/{courseId}`.
- The authoritative owner field is `ownerId`.

## Assignment Boundary

- `student_teacher_assignments` remains the outer access gate only.
- `assignmentId` remains secondary metadata under the canonical snapshot.
- Assignment metadata must never become a top-level visibility tier in Phase 1.

## Student Enrollment Read Contract

Student shell course and class surfaces follow the shared shell ownership rules in `documentation/architecture/student-shell-data-loading.md`.

Required rules:
- the shell provider owns the canonical student class membership summary for shell routes
- only student-visible memberships may enter that canonical summary; `pending_approval` must stay teacher-visible only
- enrollment-oriented page helpers must accept shell-owned class membership summaries when available instead of rereading the same membership set
- top-level `classes` scans remain legacy fallback only when the canonical `student_classes/{studentId}` projection is unavailable
- page mount and tab switch must not perform hidden membership backfill or duplicate class scans

Current repo anchor:
- enrollment enrichment accepts `getEnrollmentsByStudent(studentId, { studentClasses })`

## Class-Code Enrollment Approval Contract

Authenticated students joining a class by code are no longer immediately active.

Required rules:
- self-service class-code joins write `pending_approval` membership records first
- `pending_approval` must not grant student shell class visibility
- `pending_approval` must not auto-enroll linked class courses
- teacher approval is the point where linked course inheritance becomes active
- teacher/admin manual add-to-class remains the explicit immediate path and uses active enrollment directly

Current repo anchors:
- `src/services/classManager.ts`
- `src/pages/StudentDashboardPage.jsx`
- `src/pages/TeacherStudentsPage.tsx`
- `src/pages/AdminUserManagementPage.jsx`
- `src/pages/TeacherClassDetailPage.tsx`

## Teacher Class Homework Tab Contract

`TeacherClassDetailPage` owns a class-scoped homework surface inside the class management route instead of redirecting teachers to a generic homework page with no class context.

Required rules:
- the homework tab must load homework through the shared homework read path with `classId` filtering instead of rendering a placeholder stub
- class-scoped homework reads should only activate while the homework tab is selected, so the student and course tabs do not pay for hidden homework loads
- the primary action from the tab must open homework creation pre-targeted to the current class
- homework cards rendered in the class tab must navigate to teacher homework detail for the selected homework row
- the empty-state fallback may link to the homework dashboard, but the main tab experience must remain class-scoped
- class homework tab interactions must register feature tracking actions under the `classes` feature, not as unregistered page events

Current repo anchors:
- `src/pages/TeacherClassDetailPage.tsx`
- `src/hooks/useHomeworkList.ts`
- `src/components/homework/HomeworkCreateModal.tsx`
- `src/config/featureRegistry.ts`
