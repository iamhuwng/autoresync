# PRD-0041: Result Visibility Ownership Governance and Teacher History Standardization

> **Status:** Draft v1
> **Created:** 2026-03-26
> **Audience:** Junior developer implementing result visibility, ownership normalization, teacher history completeness, and teacher-facing result-shell consistency without inventing policy
> **Related PRDs:** `0015-prd-academic-record-and-profile-system.md`, `0040-prd-unified-result-view-architecture-and-governance.md`
> **Related Architecture:** `architecture/results-academic-record`, `architecture/homework-solo-practice-architecture`, `architecture/course-class-management`, `architecture/ui-design-standards`
> **Required Follow-up Docs:** architecture doc, producer/consumer contract, reviewer checklist, decision matrix

---

## 1. Introduction / Overview

The application currently has a system-wide result visibility problem, not just a page bug.

Teacher-facing result/history pages do not share one canonical rule for determining whether a result belongs to a teacher's teaching context. Multiple result producers persist incompatible ownership signals. Some use the original test creator, some use session data, some leave teacher ownership blank, and some omit normalized context entirely. As a result:

- teacher-owned results can be falsely hidden
- results from the wrong teaching context can be falsely included
- public-library authorship can leak into teacher visibility decisions
- live quiz results can be missing from canonical result history entirely
- consumers implement ad hoc filters instead of shared policy
- teacher-facing full pages drift from the Teacher view shell standard

This PRD standardizes result visibility and ownership system-wide across producers and consumers, while also fixing the first concrete consumer path:

- Teacher Students -> Analytics -> Teacher student history
- Result detail opened from that history

This is a **master PRD**. It covers the full product/architecture program and defines mandatory later phases, while Phase 1 is the first implementation-locked delivery slice.

### 1.1 Absolute Rule

> Result visibility is determined by teaching context ownership and permitted solo-practice policy, never by original test authorship alone.

### 1.2 Problem Statement

Today the app has four distinct classes of failure:

1. **False exclusion**
   - Teacher A assigns or runs a test built from public/shared material created by Teacher C.
   - The saved result inherits Teacher C as `teacherId`.
   - Teacher A cannot see a result that belongs to Teacher A's teaching context.

2. **False inclusion risk**
   - Consumers use weak fields such as `result.teacherId` or original test creator as if they were authoritative.
   - This can expose a result to the wrong teacher.

3. **Storage fragmentation**
   - Some flows, especially live quiz, do not persist to canonical result history.
   - Even a correct filter cannot show data that was never written into canonical storage.

4. **Governance drift**
   - Each producer/consumer interprets ownership differently.
   - Pages implement policy ad hoc instead of calling shared visibility logic.

### 1.3 Product Outcome

After this PRD is implemented:

- every teacher-facing result consumer uses the same shared visibility policy
- every result producer persists the ownership/context fields required by that policy
- original test authorship is no longer a visibility signal by itself
- solo practice remains visible but clearly differentiated from teacher-owned work
- teacher-owned analytics exclude solo practice by default
- unresolved or ambiguous rows are hidden from teacher views and surfaced only through admin reconciliation/reporting
- teacher-facing history/detail pages use the Teacher full-page shell standard

---

## 2. Goals

| ID | Goal | Target |
|----|------|--------|
| G1 | Eliminate cross-teacher leakage | No teacher can see a result unless the system can prove it belongs to that teacher's permitted visibility context |
| G2 | Eliminate false exclusion of teacher-owned results | Teacher-owned results from session, homework, class/course material, and permitted solo practice appear consistently in teacher history surfaces |
| G3 | Standardize ownership semantics | Every result producer writes the normalized ownership/context contract |
| G4 | Standardize consumer behavior | Every result consumer uses the shared visibility resolver instead of ad hoc filtering |
| G5 | Preserve historical correctness | Visibility is based on submission-time ownership snapshot, not retroactive drift from current ownership |
| G6 | Separate solo practice from teacher-owned work | Solo practice is visible under the agreed policy but never treated as teacher-owned analytics or assignment work |
| G7 | Keep teacher UI coherent | Teacher history/detail pages opened from Teacher view use the Teacher shell standard |
| G8 | Make the system junior-safe | No critical policy decision is left implicit or delegated to local engineering judgment |

---

## 3. Definitions

### 3.1 Access Gate

The **access gate** is the active teacher-student relationship stored in `student_teacher_assignments`.

- It decides whether a teacher may access the student's protected result surfaces at all.
- It is **not** itself a result ownership context.
- It must remain the outer permission check before per-result visibility is evaluated.

### 3.2 Visibility Context

A **visibility context** is the teaching or student-owned context that explains why a result is visible.

Canonical visibility contexts for this PRD:

- `homework`
- `class_session`
- `course_material`
- `solo_practice` / `self_study`

### 3.3 Secondary Assignment Metadata

The app has two unrelated "assignment" concepts:

1. `student_teacher_assignment`
   - Access gate only

2. class/test assignment (`assignmentId`, `classAssignmentId`)
   - Secondary metadata for class drill-down/progress
   - Not a first-class visibility context in this PRD
   - Must remain subordinate to `class_session` until the app has authoritative assignment ownership, normalized snapshots, assignment indexes, and explicit precedence rules

### 3.4 Authoritative Source Record

An **authoritative source record** is the domain record used to prove teacher ownership for a result context.

Examples:

- homework -> `homework_assignments/{homeworkId}`
- session -> `game_sessions/{sessionCode}`
- class-linked course material -> `classes/{classId}`
- standalone course material -> `courses/{courseId}`
- writing homework/live flows -> `writing_submissions/{resultId}` plus the linked authoritative source

### 3.5 Submission-Time Snapshot

A **submission-time snapshot** is the normalized ownership/context data persisted when the result is saved. It is the historical truth used for visibility after submission.

### 3.6 Unresolved Result

An **unresolved result** is a result that was saved for the student but could not be assigned authoritative teacher ownership at write time or read time.

Rules for unresolved results in this PRD:

- visible to the student if the student is otherwise entitled to see the result
- excluded from teacher-owned views
- excluded from teacher analytics
- surfaced in admin reconciliation/reporting only

---

## 4. User Stories

### Teacher

- As a teacher, I want to see every result that truly belongs to my teaching context, even when the underlying test came from a public/shared library.
- As a teacher, I want results from other teachers, other classes, and other sessions to stay hidden.
- As a teacher, I want solo practice to remain visible but clearly marked so I do not mistake it for teacher-assigned work.
- As a teacher, I want teacher-facing result/history pages to look and behave like normal Teacher view pages.
- As a teacher, I want access to disappear immediately if the student-teacher assignment is revoked.

### Student

- As a student, I want my result to be saved even if ownership metadata is incomplete, so my submission is not lost.
- As a student, I want solo practice to remain my own work and not be converted into teacher-owned analytics.
- As a student, I want my historical results to remain understandable even if the source class/course/session is later renamed or deleted.

### Super Admin

- As a super admin, I want to see which results were excluded from teacher views because ownership could not be proven.
- As a super admin, I want ambiguity to be diagnosable without granting admins broad manual ownership-edit powers by default.

### Developer / Reviewer

- As a developer, I want one shared policy, one decision matrix, and one producer/consumer contract so I do not invent visibility rules locally.
- As a reviewer, I want a clear rule and checklist that let me block any result-related change that bypasses the standard.

---

## 5. Functional Requirements

### 5.1 Canonical Visibility Policy

| ID | Requirement |
|----|-------------|
| FR-001 | The system must implement one canonical result visibility policy shared by all result producers and consumers. |
| FR-002 | A teacher must pass the active `student_teacher_assignment` access gate before any per-result visibility rule is evaluated. |
| FR-003 | The access gate must remain separate from result ownership context. |
| FR-004 | Original test authorship must never grant teacher visibility by itself. |
| FR-005 | Public-library/shared-template creators must receive no visibility unless they also satisfy the same ownership policy through session/homework/course/class context. |
| FR-006 | Canonical visibility contexts in this PRD are `homework`, `class_session`, `course_material`, and `solo_practice/self_study`. |
| FR-007 | `student_teacher_assignment` must remain an outer access gate only, not a result context tier. |
| FR-008 | class/test assignment metadata (`assignmentId`, `classAssignmentId`) must remain secondary metadata under `class_session`, not a separate visibility tier. |
| FR-009 | A result that cannot be proven to belong to one of the canonical visibility contexts must be treated as unresolved. |
| FR-010 | Unresolved results must be excluded from all teacher-owned views and teacher-owned analytics. |

### 5.2 Visibility Source Precedence

The canonical visibility source precedence for this PRD is:

1. `homework`
2. `class_session`
3. `class-linked course_material`
4. `standalone course_material`
5. `solo_practice/self_study`

| ID | Requirement |
|----|-------------|
| FR-011 | The shared resolver must evaluate result ownership using the canonical precedence order above. |
| FR-012 | If a result has authoritative homework context, homework ownership must win over session or course/class container signals. |
| FR-013 | If a result has authoritative session context and no authoritative homework context, session ownership must win over course/class container signals. |
| FR-014 | If a result is linked to class-owned course material and no higher-priority context applies, class ownership must determine visibility. |
| FR-015 | If a result is linked to standalone course material and no higher-priority context applies, course ownership must determine visibility. |
| FR-016 | Solo practice must only be evaluated after all teacher-owned contexts above have failed or been ruled out. |

### 5.3 Authoritative Source Rules

| Context | Authoritative Source | Authoritative Owner Field | Notes |
|---------|----------------------|---------------------------|-------|
| Homework | `homework_assignments/{homeworkId}` | `createdBy` | Homework always beats weaker result fields |
| Class session | `game_sessions/{sessionCode}` | `createdByUserId`, fallback `createdBy` | `session.teacherId` is not authoritative unless it literally stores the real teacher UID |
| Class-linked course material | `classes/{classId}` | `createdBy` | Used when result belongs to class/course material rather than a live session |
| Standalone course material | `courses/{courseId}` | `ownerId` | Applies only when no stronger context exists |
| Writing homework/live | `writing_submissions/{resultId}` plus linked authoritative source | depends on linked source | Writing metadata is part of the authoritative layer, not a replacement for it |
| Solo practice | result context + submission snapshot | no teacher owner | Student-owned, not teacher-owned |

| ID | Requirement |
|----|-------------|
| FR-017 | The system must resolve teacher-owned visibility from authoritative source records, not from producer-local convenience fields. |
| FR-018 | For session-based visibility, the canonical owner field must prefer `createdByUserId`, then `createdBy`, and only treat `session.teacherId` as valid if it contains the real teacher UID. |
| FR-019 | `result.teacherId` must never be treated as authoritative by itself. |
| FR-020 | `result.context` and submission snapshots may support resolution only after authoritative linked-source evaluation or when the linked source is no longer available. |
| FR-021 | Writing flows must use `writing_submissions` as part of the authoritative resolution layer, not as an excuse to trust raw RTDB writing result rows. |
| FR-022 | Solo practice must never infer teacher ownership from selected reviewer metadata, `selectedTeacherId`, or original test authorship. |

### 5.4 Historical Ownership and Display Rules

| ID | Requirement |
|----|-------------|
| FR-023 | Result visibility must use submission-time ownership snapshot, not retroactive drift from current ownership changes. |
| FR-024 | Historical display metadata must prefer submission-time snapshots so result history remains historically accurate. |
| FR-025 | Current source names may be shown only as supplemental metadata, not as the primary historical label. |
| FR-026 | If the linked source is later deleted but submission-time ownership was proven, the result must remain visible and be displayed as archived/deleted source metadata. |
| FR-027 | If the linked source is deleted and ownership was never proven, the result must remain excluded from teacher views. |
| FR-028 | Teacher history list rows must not display a generic `teacher-owned` badge; teacher ownership is the default meaning of the page. |
| FR-029 | Teacher history list rows must display a visible `Solo Practice` tag only for student-owned solo practice results. |
| FR-030 | Teacher result detail views must display full source metadata, including source type and archived/deleted source status when applicable. |
| FR-031 | Teacher history list rows must not display `legacy/unverified` badges because unresolved rows are excluded from teacher view in this PRD. |

### 5.5 Solo Practice Policy

| ID | Requirement |
|----|-------------|
| FR-032 | Any currently assigned teacher may see a student's solo-practice results. |
| FR-033 | The same solo-practice result may therefore be visible to multiple currently assigned teachers. |
| FR-034 | Solo-practice rows must always be labeled `Solo Practice` in the teacher history list. |
| FR-035 | Solo-practice detail views may show full source metadata, but the result must remain classified as student-owned. |
| FR-036 | Visible solo-practice results in teacher view are view-only. Teachers may not regrade, claim ownership, add teacher-owned feedback flows, or otherwise treat them as assigned work in this PRD. |
| FR-037 | Solo-practice results must be excluded from all teacher-owned analytics, charts, averages, rankings, alerts, and performance summaries. |

### 5.6 Access Revocation and Reassignment

| ID | Requirement |
|----|-------------|
| FR-038 | If a teacher loses assignment/access while viewing history or result detail, access must be revoked immediately and the UI must show an access-lost state. |
| FR-039 | Teachers must not retain access to teacher-facing result/history pages after unassignment unless a different role-based path explicitly allows it. |
| FR-040 | If a teacher is later reassigned to the same student, previously eligible teacher-owned results must become visible again automatically. |
| FR-041 | If a teacher is later reassigned to the same student, previously eligible solo-practice visibility must also return automatically under the current solo-practice policy. |

### 5.7 New-Write Normalization Contract

| ID | Requirement |
|----|-------------|
| FR-042 | All new result writes must persist a normalized ownership/context snapshot sufficient for the shared visibility policy. |
| FR-043 | The normalized snapshot must include at minimum: `contextType`, `sourceType`, `sourceId`, `sourceNameSnapshot`, `visibilityOwnerTeacherId` when teacher-owned, `ownerResolutionSource`, `ownershipResolved`, `unresolvedReason` when unresolved, `homeworkId` when applicable, `courseId`, `classId`, `sessionCode`, and secondary assignment metadata when present. |
| FR-044 | Producers may overwrite weak/conflicting ownership fields only after resolving authoritative ownership from the linked teaching context. |
| FR-045 | If authoritative ownership is successfully resolved at write time, the canonical writer must overwrite weak/conflicting producer-supplied ownership fields with the authoritative owner and persist the normalized snapshot. |
| FR-046 | If authoritative ownership cannot be resolved at write time, the result must still be saved for the student, but marked unresolved, excluded from teacher-owned views, and queued for safe reconciliation/backfill processes. |
| FR-047 | The canonical writer must not infer teacher ownership from original test creator, selected reviewer, or any other non-authoritative field. |
| FR-048 | Canonical teacher-owned indexes must be built from normalized ownership fields, not directly from raw producer `teacherId` values. |
| FR-049 | Session-based flows must normalize ownership from session records before writing teacher-owned visibility data. |
| FR-050 | Homework/course/class flows must perform authoritative ownership lookup before writing teacher-owned visibility data. |
| FR-051 | Writing homework flows must resolve homework ownership before persisting teacher-owned result visibility data. |
| FR-052 | Writing solo-practice flows must not convert `selectedTeacherId` or reviewer routing metadata into teacher ownership. |

### 5.8 Read-Time Enrichment and Legacy Handling

| ID | Requirement |
|----|-------------|
| FR-053 | All result consumers must use a shared read-time enrichment path for legacy results that lack normalized ownership/context data. |
| FR-054 | Read-time enrichment may use authoritative linked sources such as sessions, homework assignments, courses, classes, and writing submissions. |
| FR-055 | If read-time enrichment proves ownership safely, the consumer may include the result under the canonical policy. |
| FR-056 | If read-time enrichment cannot prove ownership safely, the result must remain excluded from teacher-owned views. |
| FR-057 | Legacy results excluded from teacher-owned views must remain visible in student history when the student is otherwise entitled to see them. |
| FR-058 | The system may perform safe backfill only after read-time enrichment or equivalent logic proves ownership without ambiguity. |
| FR-059 | Backfill must be optional and safe; unverifiable rows must not be backfilled into teacher-owned indexes. |

### 5.9 Admin Reconciliation and Reporting

| ID | Requirement |
|----|-------------|
| FR-060 | The system must provide an admin-only reconciliation/reporting view for results excluded from teacher-owned views because ownership could not be proven. |
| FR-061 | The admin reconciliation/reporting view must show the exclusion reason and the strongest known source clues. |
| FR-062 | In this PRD, admins are view-only in reconciliation; they may not manually edit or force ownership resolution from the admin UI. |
| FR-063 | Repair of excluded rows in this PRD must happen through engineering-safe enrichment/backfill processes, not through manual admin ownership edits. |

### 5.10 Quiz and Canonical History Completeness

| ID | Requirement |
|----|-------------|
| FR-064 | Live quiz results must be persisted into canonical result history. |
| FR-065 | Canonical quiz persistence must write to the same result store and student indexes used by other canonical result consumers. |
| FR-066 | Canonical quiz persistence must use the same ownership normalization rules as other result writers. |
| FR-067 | No teacher-facing result/history consumer may claim complete teacher-owned history until live quiz results are part of canonical storage. |

### 5.11 Consumer Adoption and UI Standardization

| ID | Requirement |
|----|-------------|
| FR-068 | All result consumers must call shared visibility resolution helpers instead of implementing local ownership/filter logic. |
| FR-069 | The Teacher Student History page must be the first teacher-facing consumer migrated to the shared visibility policy. |
| FR-070 | The result detail page opened from Teacher Student History must use the Teacher full-page shell standard. |
| FR-071 | Teacher-facing full pages opened from Teacher view must render under the teacher shell and not appear as detached generic full-screen pages. |
| FR-072 | The teacher history list must display only the `Solo Practice` tag in list view, while detail view displays full source metadata. |
| FR-073 | The Teacher Student History page and the teacher result detail page must not rely on `result.teacherId` filtering. |
| FR-074 | Teacher-owned analytics derived from teacher history must exclude solo practice by default in this PRD. |

### 5.12 Governance Deliverables

| ID | Requirement |
|----|-------------|
| FR-075 | This program must produce a dedicated architecture document for result visibility and ownership governance. |
| FR-076 | The architecture documentation must include a decision matrix covering contexts, authoritative sources, include/exclude rules, UI semantics, analytics treatment, and failure behavior. |
| FR-077 | The program must produce a shared producer/consumer contract document that defines required fields, authoritative lookup expectations, and unresolved-result handling. |
| FR-078 | The program must produce a reviewer checklist/rule document that blocks result-related changes from bypassing the shared policy. |
| FR-079 | Result-related producer or consumer changes must update the architecture doc, contract, and checklist in the same change set when the policy surface changes. |
| FR-080 | Reviewers must treat the absolute rule in Section 1.1 as binding review law, not as a suggestion. |

---

## 6. Design Considerations

### 6.1 Teacher History and Result Pages

Teacher-facing history and detail pages reached from Teacher view must follow the Teacher full-page standard:

- Teacher shell/header present
- consistent teacher layout and background treatment
- page title/introduction aligned with other teacher pages
- access-lost states inside Teacher view, not detached full-screen replacements

### 6.2 Labeling Rules

- History list view:
  - show `Solo Practice` tag only for solo-practice rows
  - do not show `Teacher-Owned` tags
  - do not show `Legacy/Unverified` tags because those rows are excluded from teacher views

- Detail view:
  - show full context metadata
  - show source type
  - show archived/deleted source note when relevant

### 6.3 Analytics Presentation

Solo-practice results are visible in history for teacher awareness, but must not be blended into teacher-owned performance analytics.

### 6.4 Admin Reconciliation UX

Admin reconciliation/reporting is diagnostic in this PRD. It is not an ownership-editing workspace.

---

## 7. Technical Considerations

### 7.1 Shared Service Contract

The implementation must introduce shared logic equivalent to the following responsibilities:

- `resolveResultVisibilityContext(result, linkedSources)`
- `resolveAuthoritativeOwner(result, linkedSources)`
- `canTeacherAccessStudentResult(result, teacherId, studentAssignmentState)`
- `normalizeResultOwnershipAtWriteTime(resultDraft, linkedSources)`
- `buildUnresolvedResultReportEntry(result, reason)`

Exact function names may vary, but the responsibilities may not be split into inconsistent local page logic.

### 7.2 Canonical Result Visibility Snapshot

The normalized result snapshot must separate visibility ownership from producer-specific workflow metadata.

Minimum conceptual shape:

```ts
visibility: {
  contextType: 'homework' | 'class_session' | 'course_material' | 'solo_practice'
  sourceType: 'homework' | 'session' | 'class' | 'course' | 'library' | 'writing_submission'
  sourceId: string | null
  sourceNameSnapshot: string | null
  visibilityOwnerTeacherId: string | null
  ownerResolutionSource: 'homework' | 'session' | 'class' | 'course' | 'writing_submission' | 'solo' | 'unresolved'
  ownershipResolved: boolean
  unresolvedReason?: string
  homeworkId?: string
  sessionCode?: string
  courseId?: string
  classId?: string
  assignmentId?: string
}
```

Exact field names may be adapted, but the PRD intent may not be weakened.

### 7.3 Authority Matrix

| Context | Required Write-Time Lookup | Safe Write-Time Override? | If Lookup Fails |
|---------|----------------------------|---------------------------|-----------------|
| Homework | `homework_assignments/{homeworkId}` | Yes, overwrite weak ownership with homework owner | Save for student as unresolved; exclude teacher views |
| Live session/test | `game_sessions/{sessionCode}` | Yes, using authoritative session owner precedence | Save for student as unresolved only if session owner cannot be proven |
| Class-linked course material | `classes/{classId}` and linked course/class context | Yes | Save for student as unresolved |
| Standalone course material | `courses/{courseId}` | Yes | Save for student as unresolved |
| Writing homework | `writing_submissions/{resultId}` plus homework lookup | Yes | Save for student as unresolved |
| Writing live session | `writing_submissions/{resultId}` plus session lookup | Yes | Save for student as unresolved |
| Solo practice | No teacher ownership lookup | No teacher-owner override allowed | Save as student-owned solo practice |
| Live quiz | Canonical session lookup plus canonical write | Yes, after canonicalization | Must not be considered complete until canonicalized |

### 7.4 Testing Expectations

At minimum, the implementation program must cover:

- public-library test assigned by Teacher A, authored by Teacher C
- teacher-owned live session
- teacher-owned homework
- class-linked course material
- standalone course material
- solo practice visible and tagged
- solo practice excluded from analytics
- live quiz canonical persistence
- writing homework fallback through writing submissions
- unresolved result excluded from teacher views
- access revoked mid-view
- reassignment restores eligible visibility
- deleted source with proven snapshot stays visible as archived/deleted source

---

## 8. Non-Goals (Out of Scope)

| Item | Reason |
|------|--------|
| Manual admin ownership editing in this PRD | Too risky; this PRD uses reporting + safe engineering repair instead |
| Treating class/test assignment as a top-level visibility context | Ownership model is not mature enough yet |
| Using original test authorship as fallback teacher ownership | This is the problem being removed |
| Counting solo practice in teacher-owned analytics | Conflicts with student-owned classification |
| Adding teacher feedback/regrade flows to visible solo practice in this PRD | Would blur the student-owned vs teacher-owned boundary |
| Broad RBAC redesign unrelated to result visibility | This PRD uses existing assignment gate patterns and only tightens result visibility behavior |
| Forcing all later phases to have speculative exact file-level engineering locks equal to Phase 1 | Later phases are product/architecture-complete and near-implementation detail, but only Phase 1 is exact-file locked |

---

## 9. Edge Cases and Required Preventions

| Edge Case | Required Prevention |
|----------|---------------------|
| Public-library/shared-template test authored by another teacher | Never use original test authorship as visibility owner; resolve from homework/session/class/course context |
| Result contains conflicting `teacherId` and context signals | Use authoritative source lookup; overwrite only after authoritative resolution |
| Source lookup fails at write time | Save for student as unresolved; exclude from teacher-owned views |
| Legacy row lacks normalized context | Use shared read-time enrichment; exclude if ownership still cannot be proven |
| Live quiz result exists only in session player state | Canonicalize quiz persistence into result history before claiming completeness |
| Teacher loses assignment while viewing history/detail | Immediately revoke and show access-lost state |
| Teacher is later reassigned | Restore previously eligible teacher-owned and solo-practice visibility automatically |
| Student has multiple assigned teachers and does solo practice | Same solo-practice result may appear to multiple teachers, always labeled `Solo Practice` |
| Deleted source after submission | Keep visible only if submission-time ownership was proven; show archived/deleted source metadata |
| Writing RTDB row lacks normalized context | Use writing submission and linked source fallback; unresolved if still ambiguous |
| Homework owner differs from test creator | Homework owner always wins |
| Session `teacherId` contains synthetic/legacy tracking data | Prefer `createdByUserId`, then `createdBy`; do not trust `teacherId` blindly |
| Admin sees unresolved rows | Admin reconciliation is diagnostic only in this PRD; no manual ownership editing |
| Junior developer adds a local filter because it "works for this page" | Blocked by shared policy requirement and review checklist |
| Future assignment feature is partially deployed | Keep assignment as secondary metadata under `class_session` until ownership model matures |

---

## 10. Implementation Phases

This PRD is complete across all phases at the product/architecture level. Only Phase 1 is exact implementation-locked.

### Phase 1: Policy Core, Canonicalization, and First Teacher Consumer Slice

#### Goal

Deliver the first fully working, implementation-locked slice of the system-wide policy:

- shared visibility resolver
- producer normalization for current critical result writers
- canonical live quiz persistence
- Teacher Student History migration
- teacher result detail page shell alignment
- required documentation/governance artifacts

#### Exact Scope Lock

The implementation may only expand beyond this file scope if the PRD is amended explicitly.

Minimum exact file scope:

- `src/pages/TeacherStudentHistoryPage.tsx`
- `src/pages/ResultDetailPage.tsx`
- `src/services/testResults.service.ts`
- `src/hooks/test/useTestSubmission.ts`
- `src/hooks/solo/useSoloSubmission.ts`
- `src/components/practice/THCSPracticeView.tsx`
- `src/components/thcs-student/THCSTestLayout.tsx`
- `src/components/writing-practice/WritingPracticeView.tsx`
- `src/services/writingSubmissionService.ts`
- `src/pages/StudentQuizPageNew.jsx`
- new shared visibility/normalization helper(s)
- tests covering visibility resolution and canonicalization
- required architecture/contract/checklist docs

#### Mandatory Deliverables

- shared visibility resolver used by Teacher Student History
- write-time normalization for session/homework/course/class/solo/writing flows in scope
- canonical live quiz persistence into result history
- teacher shell layout for Teacher Student History
- teacher shell layout for result detail page opened from teacher history
- detail-view source metadata section
- `Solo Practice` tag in teacher history list
- required docs: architecture, decision matrix, producer/consumer contract, review checklist
- tests for the authority matrix and first consumer slice

#### Mandatory Non-Goals

- admin ownership editing
- first-class assignment context
- solo-practice analytics inclusion
- broad result-consumer rollout beyond the scoped teacher path

#### Acceptance Gate

Phase 1 is complete only when:

- Teacher Student History uses shared visibility resolution instead of local `teacherId` filtering
- teacher-owned results from homework/session/course/class contexts are included correctly under the policy
- solo-practice rows are visible, tagged, view-only, and excluded from analytics
- unresolved rows are hidden from teacher view and visible in admin reconciliation/reporting
- live quiz results persist into canonical result history
- teacher result detail opened from history stays within the Teacher shell standard
- submission-time ownership snapshots drive historical display
- access-lost behavior works immediately
- public-library authorship no longer affects teacher visibility incorrectly
- required docs and tests are included in the same change set

#### Forbidden Moves

- Do not use original test creator as a fallback owner.
- Do not use raw `result.teacherId` as a page-level filter.
- Do not treat class/test assignment as a new top-level context.
- Do not silently count solo practice in teacher analytics.
- Do not allow unresolved rows into teacher view "temporarily".

### Phase 2: Consumer Rollout Across Result Surfaces and Analytics

#### Goal

Apply the shared visibility policy across all remaining result-consuming surfaces and standardize analytics treatment.

#### Scope

- remaining teacher-facing result/history consumers
- student/admin/result-adjacent consumers that need consistent source metadata and unresolved handling
- teacher-owned analytics surfaces that currently derive from result history
- rule adoption across view models and route wrappers

#### Mandatory Deliverables

- consumer inventory and rollout plan
- removal of local ownership filters across result consumers
- consistent detail-view source metadata across migrated consumers
- explicit exclusion of solo practice from teacher analytics everywhere
- updated permission and UX docs for all migrated consumers

#### Acceptance Gate

Phase 2 is complete only when:

- no migrated result consumer relies on ad hoc ownership rules
- teacher-owned analytics consistently exclude solo practice
- migrated teacher pages follow the Teacher shell standard where applicable
- unresolved handling is consistent across all migrated surfaces
- consumer docs and checklist references are current

### Phase 3: Legacy Reconciliation, Safe Backfill, and Governance Hardening

#### Goal

Reduce legacy ambiguity without introducing unsafe ownership claims.

#### Scope

- safe read-time enrichment hardening
- optional backfill for provable rows
- admin reconciliation/reporting maturity
- governance enforcement adoption across more result-related work

#### Mandatory Deliverables

- documented safe-backfill criteria
- reconciliation/reporting data contract for unresolved rows
- closure report on excluded legacy row categories
- governance hardening updates to checklist/rules/process

#### Acceptance Gate

Phase 3 is complete only when:

- safe backfill touches only provable rows
- unresolved rows are explicitly classified, not silently ignored
- governance docs reflect ongoing legacy behavior accurately
- no unsafe ownership broadening was introduced in the name of cleanup

### Phase 4: Future Assignment Context Promotion and Policy Expansion

#### Goal

Reserve the path for making assignment a first-class result context only when the product is ready.

#### Scope

- only if the app later matures class/test assignment into a trustworthy visibility-bearing domain
- only after authoritative owner fields, normalized snapshots, assignment indexes, and explicit precedence rules exist

#### Mandatory Deliverables

- explicit readiness checklist for assignment-context promotion
- documented precedence relative to homework/session/course/class
- migration strategy for existing assignment-linked rows

#### Acceptance Gate

Phase 4 is complete only when:

- assignment has authoritative ownership fields
- assignment has normalized submission-time snapshots
- assignment has indexing and consumer support
- assignment precedence is documented and tested
- no existing context rule is broken by the promotion

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Cross-teacher leakage | 0 teacher-visible results that the policy cannot prove belong to that teacher's permitted visibility contexts |
| Teacher-owned completeness | 100% of teacher-owned results in scoped canonical flows appear in teacher history after canonicalization |
| New-write normalization | 100% of in-scope result producers persist normalized ownership/context snapshots |
| Unresolved leakage | 0 unresolved rows shown in teacher-owned views |
| Solo-practice separation | 100% of visible solo-practice rows labeled in history and excluded from teacher analytics |
| Canonical quiz coverage | 100% of live quiz submissions persist to canonical result history in migrated flows |
| Consumer standardization | 100% of migrated consumers use shared visibility helpers |
| UI consistency | Teacher Student History and teacher result detail from that flow render under Teacher shell |
| Governance compliance | 100% of result-related policy changes update the architecture doc, contract, and checklist in the same change set |

---

## 12. Open Questions

No blocking product questions remain for Phase 1.

Future follow-up questions, intentionally deferred beyond this PRD's blocking scope:

- whether a future PRD should allow teacher comment/feedback workflows on visible solo-practice results
- whether assignment can ever become a first-class visibility context after its ownership model matures
- whether admin reconciliation should eventually gain safe resolution tooling after the policy and backfill model stabilize

---

## 13. Final Recommendation

Proceed as follows:

1. Lock the shared visibility policy and authority matrix.
2. Implement Phase 1 exactly as scoped, including canonical quiz persistence and the first teacher consumer path.
3. Roll the same policy across other consumers and analytics only after the shared helpers and docs exist.
4. Treat unresolved rows as a controlled visibility denial plus admin reporting problem, not as a reason to guess ownership.
5. Keep assignment as secondary metadata until the product has a trustworthy ownership model for it.

This sequencing satisfies the product requirement for a system-wide standard while still giving the first implementation slice exact boundaries and no room for improvisation.

---

## Appendix A: Decision Summary

| Decision | Outcome |
|----------|---------|
| Master PRD scope | System-wide result visibility/filtering governance plus teacher-shell fixes for the first consumer path |
| Primary goal | Stop false exclusions, stop false inclusions, and create one shared visibility policy |
| Data scope | Filter logic, writer normalization for future results, and canonical quiz persistence |
| Solo practice policy | Visible to currently assigned teachers, labeled `Solo Practice`, excluded from teacher analytics |
| Legacy ambiguous teacher views | Exclude from teacher views; show in admin reconciliation/reporting only |
| Documentation | PRD + architecture updates + shared contract/checklist |
| Teacher UI scope in Phase 1 | Include teacher shell/full-page fixes for history/result pages in the first consumer path |
| Historical source of truth | Submission-time ownership governs visibility; current source may supplement display only |
| Unassignment | Revoke access by default; reassignment later restores eligible visibility automatically |
| Ownership precedence | Homework > session > class-linked course material > standalone course material > solo practice |
| Deleted source rule | Keep visible only if submission-time ownership was proven; otherwise exclude teacher view |
| Public-library rule | Original author gets no teacher visibility unless they also satisfy the normal ownership policy |
| Admin reconciliation | View-only diagnostics in this PRD |
| List-view labeling | Only `Solo Practice` is tagged in teacher history list |
| Detail-view labeling | Full source metadata shown in detail view |
| Assignment feature | Access gate for student-teacher assignment; secondary metadata only for class/test assignment |
