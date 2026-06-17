# Universal Teacher Lobby Homework Assignment Design

Date: 2026-06-17
Status: Approved for implementation planning

## Goal

Give every Teacher Lobby item an explicit homework capability through one normalized contract. Supported published content exposes one shared assignment action. Unsupported, draft, deleted, unpublished, or intentionally blocked content carries a stable reason code instead of silently missing the action.

This change stays focused on Teacher Lobby assignment. It does not replace the homework dashboard, redesign the homework modal, or create a general backend platform rewrite.

## Current State

- `TeacherLobbyPage.jsx` owns `/lobby` and `/teacher-lobby/:sessionCode`.
- `/tests` rows use `materialListAdapter.js`. Assignment is currently hardcoded to `testType === "THCS-THPT"`.
- Reading Passage rows use a separate action builder and open `HomeworkCreateModal` with passage-specific props.
- IELTS Reading, Listening, and Writing records are already loadable by `HomeworkCreateModal`, but Teacher Lobby does not expose their assignment action.
- `homeworkManager.createHomework()` writes `homework_assignments` directly from the browser. Firestore rules verify the writer identity and Reading Passage payload shape, but do not validate the referenced content, its publish state, or the teacher-target relationship.
- Whole-Book assignment is intentionally unsupported. Drafts are not assignment candidates.

## Normalized Contract

```ts
type HomeworkContentRef = {
  contentKind:
    | 'thcs_test'
    | 'reading_passage'
    | 'ielts_reading'
    | 'ielts_listening'
    | 'ielts_writing';
  contentId: string;
  version?: string;
  title?: string;
  source?: string;
};

type TeacherLobbyAssignability = {
  contentRef?: HomeworkContentRef;
  assignable: boolean;
  reasonCode?: HomeworkAssignmentReasonCode;
  flow?: 'standard' | 'thcs';
};
```

Core reason codes:

- `CONTENT_NOT_FOUND`
- `CONTENT_NOT_ASSIGNABLE`
- `CONTENT_DRAFT`
- `TEACHER_NOT_ALLOWED`
- `UNSUPPORTED_CONTENT_KIND`
- `WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED`
- `CONTENT_UNPUBLISHED`
- `TARGET_NOT_ALLOWED`
- `INVALID_ASSIGNMENT_REQUEST`

Server records use canonical title, version, skill, and source values. Client-supplied display metadata is advisory only.

## Frontend Architecture

### Assignability resolver

Add one pure resolver/registry that accepts a Teacher Lobby item plus its listing family and returns `TeacherLobbyAssignability`.

Registered families:

| Lobby family | Result |
| --- | --- |
| THCS published test | `thcs_test`, assignable, `thcs` flow |
| Published Reading Passage with pinned projection | `reading_passage`, assignable |
| IELTS Reading | `ielts_reading`, assignable |
| IELTS Listening | `ielts_listening`, assignable |
| IELTS Writing | `ielts_writing`, assignable |
| Book | blocked with `WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED` |
| Draft | blocked with `CONTENT_DRAFT` |
| Incomplete, deleted, archived, or unpublished item | blocked with a specific reason |
| Unknown family | blocked with `UNSUPPORTED_CONTENT_KIND`; throw or fail a registry assertion in development/test |

Reading V2 full tests normalize as `ielts_reading` with `source: 'reading-v2'`. Their server adapter must validate the published projection contract before assignment.

### Shared action

Add one `TeacherLobbyAssignmentAction` component. `MaterialListRow` uses it for the `assign-homework` action key, preserving list slot 4 and current visual style. The resolver creates the action descriptor; card/list code does not inspect IELTS or THCS names.

`TeacherLobbyPage` owns one assignment request state and one handler. The handler receives resolved capability metadata:

- `flow: 'thcs'` keeps the existing THCS configuration experience.
- `flow: 'standard'` opens the existing `HomeworkCreateModal` with normalized preselected content.
- Reading Passage selection and single-item assignment use the same normalized request state.
- Books and drafts retain no active assignment control, but their adapters return explicit blocked metadata for tests and development diagnostics.

Future listing families must register metadata. A unit-level registry completeness assertion and development error prevent silent omission.

## Backend Architecture

Add one route to the existing Cloudflare Worker:

```text
POST /api/homework/assignments
```

The endpoint performs one bounded request and writes one homework assignment. It reuses existing Worker Firebase token verification, Google service-account access, RTDB access, and Firestore REST access.

### Request flow

1. Parse and validate the request shape.
2. Verify the Firebase ID token.
3. Load `users/{uid}` from RTDB and require `teacher` or `super_admin`.
4. Validate assignment target:
   - class target must name a class owned by the teacher;
   - student targets must resolve to students connected through teacher-owned classes or active teacher-student assignments;
   - compute `totalAssigned` server-side.
5. Resolve content through the content-kind registry.
6. Load canonical content and reject missing, draft, deleted, archived, incomplete, unpublished, inaccessible, unsupported, or projection-missing records.
7. Require teacher ownership or public assignment eligibility.
8. Derive canonical title, version, material type, skill, and content reference.
9. Create the Firestore `homework_assignments/{id}` document with existing compatibility fields plus normalized `contentRef`.
10. Return assignment id and normalized content metadata.

### Content adapters

- `thcs_test`: validates a published complete THCS test and preserves existing THCS config fields.
- `ielts_reading`, `ielts_listening`, `ielts_writing`: validates the test skill matches the submitted kind. Reading and Listening require their student-safe delivery projection. Writing uses its existing published delivery contract.
- `reading_passage`: validates published state, pinned version, accessibility, archive state, and student-safe projection; server builds the frozen passage snapshot.
- `ielts_reading` with `source: 'reading-v2'`: validates the canonical published Reading V2 projection. If composition-backed assignment freezing is required, the adapter creates the existing assignment payload and stores its pointer; it must not fall back to answer-bearing canonical data.

The endpoint never accepts Book or draft assignment. Unknown kinds return `UNSUPPORTED_CONTENT_KIND`. Whole-Book UI capability reports `WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED`.

### Compatibility and rollout

- Keep current assignment document fields so student homework consumers continue working.
- Add `contentRef` without requiring an immediate historical backfill.
- Route new Teacher Lobby assignments through the Worker client service.
- Preserve the THCS dialog and Reading Passage modal UX while changing their final persistence call to the normalized service.
- Do not disable unrelated client-side homework creation paths in this change. Tightening all Firestore writes is a separate migration after every producer uses the endpoint.

## Errors and Announcements

Worker responses use stable `reasonCode` plus safe teacher-facing message. The frontend maps known codes to shared announcements. Success and failure use the existing bottom-right announcement system; no `alert()`, page banner, or silent completion is added.

Blocked UI states follow existing Teacher Lobby style. Reading Passage may remain disabled with its reason. Books and drafts omit the action while retaining explicit adapter metadata and development diagnostics.

## Testing

### Red-first unit tests

- Resolver returns assignable metadata for all five supported kinds.
- Resolver blocks Book, draft, incomplete, unpublished, deleted, and unknown items with exact codes.
- Registry completeness assertion fails for an unregistered listing family.
- Material list adapter exposes slot-4 assignment for IELTS Reading, Listening, Writing, THCS, and eligible Reading Passage.
- Shared action invokes the normalized handler and renders disabled reasons correctly.
- Teacher Lobby opens the correct existing configuration flow for THCS and the standard flow for IELTS/Reading Passage.

### Worker tests

- Reject missing/invalid auth.
- Reject non-teacher roles.
- Reject class/student targets not controlled by the teacher.
- Reject missing, draft, deleted, unpublished, incomplete, unsupported, and intentionally nonassignable content.
- Accept each supported content kind and derive canonical metadata.
- Preserve THCS config and Reading Passage snapshot compatibility.
- Require safe projections for IELTS Reading/Listening and Reading V2.
- Write normalized `contentRef` and compatibility fields to Firestore.

### Regression and validation

- Existing THCS and Reading Passage assignment tests remain green.
- Student homework launch tests cover IELTS Reading, Listening, Writing, THCS, and Reading V2 compatibility.
- Run targeted Vitest suites, Worker TypeScript checks/tests, app build, lint where practical, UTF-8 checks, and `git diff --check`.
- Browser proof uses `http://localhost:5173/lobby`, teacher dev quick-login, network response evidence, and durable Firestore assignment evidence. Student launch proof uses `http://localhost:5174`.

## Scope Limits

- No whole-Book assignment.
- No draft assignment.
- No new assignment datastore or broad migration.
- No Teacher Lobby redesign.
- No replacement of existing homework configuration UI.
- No global removal of direct Firestore homework writes until other producers migrate.
