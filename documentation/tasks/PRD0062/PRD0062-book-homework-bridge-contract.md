# PRD0062 Book Homework Bridge Contract

Status: accepted target architecture; Milestone 1 bridge core implemented; production rollback active after committed compatibility-projection failure

Prepared: 2026-08-14

Scope: Book ↔ Homework-experience integration through an anti-corruption boundary

Governing current amendment:
- `documentation/tasks/PRD0062/PRD0062-architecture-and-delivery-amendment-2026-08-15.md`

This file supplies the detailed bridge contract beneath that amendment. The amendment governs current PRD0062 scope, trusted-projection, acceptance-proof, and browser-handoff boundaries; this bridge has no independent product roadmap or completion target.

## 1. Current State

The original identity-boundary diagnostic phase is complete and the Milestone 1 bridge core has been implemented and proven locally/emulator/workerd. Preserve unchanged as evidence of the old boundary failure:

- the intentional absent-authority Firestore `GET` regression;
- Firebase UID and custom-claim tracing in the production-shaped workerd harness; and
- deterministic V19b retry-1 reproduction evidence.

The separate internal `book_homework_authorities` authority plus derived `homework_assignments` compatibility projection remains the accepted architecture.

The corrected Milestone 1 production attempt on 2026-08-14 accepted the exact assignment command and durably committed the root saga, one recipient authority, and active Delivery, but returned HTTP 202 `committed_projection_pending`; the compatibility shell remained absent. Production was immediately restored to the deny-only Worker and rollback RTDB/Firestore rules. The committed assignment is authoritative durable state and must not be replaced by a fresh assignment merely to repair its derived shell.

The compatibility projection failure has now been classified as `UNOBSERVABLE_CAUGHT_PROJECTION_FAILURE`; bounded observability-only diagnostics are implemented without changing projection/CAS/auth/replay semantics, and exact same-command shell repair is green in the committed-state harness. The minimum Homework → Book return-path context resolver is also proven: it accepts only the compatibility locator, authenticated actor, and requested action, then reloads strict Book identity from authoritative root/authority/Delivery/publication/Activity Version sources.

The remaining Milestone-1 blocker is now owned by the Book Assembly canonical Activity Version RTDB wire codec, not by Homework. The Full PDF publication adapter creates the authoritative record with `evidenceRefs: []` and with domain-defined empty/null Activity fields. RTDB drops these empty/null children on persistence. The exact persisted production record is reconstructed byte-semantically by hydrating top-level `evidenceRefs: []` plus `taskProfile: null`, `stimulus: null`, and `assetRefs: []` in both `activity` and `projection`; after that hydration the canonical payload fingerprint exactly returns to the stored `fnv1a64:2fcc389f248bb9ae`. Therefore Homework must not invent evidence references and the strict canonical validator must not be weakened. The bounded correction is a Book Assembly read-side wire codec that restores only domain-defined RTDB-loss values before strict validation, with fingerprint equality as the fail-closed proof.

Append-only evidence:

- `documentation/tasks/PRD0062/evidence/126-production-normal-bridge-m1-corrected-input-checkpoint-2026-08-14.json`;
- `documentation/tasks/PRD0062/evidence/126-production-normal-bridge-m1-corrected-attempt-failure-2026-08-14.json`.

## 2. Governing Integration Rule

The governing rule is:

> Bidirectional interaction, unidirectional authority per fact.

Homework UI and runtime actions may enter the Book domain through explicit bridge commands or trusted event ports. Book-derived discovery, progress, result, and management projections may return to the Homework experience. Each fact still has exactly one authoritative owner.

There is no bidirectional database synchronization:

- Book publication, root saga, internal authority, Delivery, Runtime, progress, and evaluation facts remain authoritative on the Book side;
- `homework_assignments/{assignmentId}` remains a derived compatibility/read projection only;
- no Book authorization, scheduling, publication, Delivery, progress, grading, retry, replay, or compensation decision reads authority from the compatibility shell; and
- legacy Homework never interprets or mutates raw Book authority internals.

The anti-corruption boundary translates commands and projections. It does not mirror databases or make legacy Homework a peer authority.

### 2.1 Directional asymmetry and provenance

The two directions are intentionally asymmetric:

- **Book → Homework is a lossy projection.** Book holds richer authoritative identity, publication, binding, Delivery, schedule, policy, Runtime, and result data. The projector selects only the discovery/display fields Homework needs plus a bounded compatibility locator.
- **Homework → Book is command enrichment, not inverse projection.** Homework-originated actions carry only authenticated actor identity, the compatibility locator, and the user's requested intent. The bridge must resolve every additional Book-required field from authoritative Book sources before calling a strict Book domain command.

The bridge must never reconstruct missing Book authority by guessing, copying untrusted compatibility-shell fields, concatenating derived identifiers, or relaxing Book validation. If any required Book fact cannot be resolved from an authoritative source, the return trip fails closed.

For every Homework → Book command, each strict Book field must have explicit provenance. Examples include:

```text
ownerId            <- authenticated actor plus committed root authority
assignmentId       <- compatibility locator/path
recipientId        <- authenticated actor plus committed recipient mapping
authorityId        <- committed root saga recipient mapping
publicationId      <- committed Book Homework authority
manifestVersionId  <- committed Book Homework authority
bindingId          <- active Book Delivery
placement/version  <- committed authority plus Delivery/manifest
result/evaluation  <- Runtime/Result/Evaluation authoritative record
revision           <- current authoritative record, never a shell counter
```

If the Book → Homework projection lacks a locator genuinely required to route a supported return action, extend the compatibility protocol deliberately with a non-authoritative locator. Do not copy raw Book authority into `homework_assignments` merely to make round-tripping convenient.

## 3. Bridge Module and Ports

`BookHomeworkExperienceBridge` is the deep Module at the Book ↔ Homework-experience Seam. Its Interface is a small set of focused ports sharing exact identity, authorization, and replay rules. The façade does not implement Publication, Delivery, Runtime, Evaluation, Result, or legacy Homework internals.

```ts
interface BookHomeworkExperienceBridge {
  assignmentCommands: BookHomeworkAssignmentCommandPort;
  managementCommands: BookHomeworkManagementCommandPort;
  runtimeActions: BookHomeworkRuntimeActionPort;
  reviewActions: BookHomeworkReviewActionPort;
  progressEvents: BookHomeworkProgressEventPort;
  projections: BookHomeworkProjectionPort;
}
```

The compatibility projection Adapter is an internal collaborator, not a browser command surface:

```ts
interface BookHomeworkCompatibilityProjectionPort {
  ensureCommittedProjection(input: EnsureCompatibilityProjectionInput): Promise<
    'created' | 'updated' | 'replayed' | 'conflict'
  >;
}
```

The reverse direction uses a focused authoritative context resolver/enricher. It is also an internal collaborator, not a browser-supplied Book object:

```ts
interface BookHomeworkContextResolverPort {
  resolveLaunchContext(input: {
    assignmentId: string;
    actorUid: string;
  }): Promise<BookHomeworkResolvedLaunchContext>;

  resolveManagementContext(input: {
    assignmentId: string;
    ownerId: string;
    expectedRevision: number;
  }): Promise<BookHomeworkResolvedManagementContext>;

  resolveReviewContext(input: BookHomeworkReviewLocator): Promise<BookHomeworkResolvedReviewContext>;
}
```

Resolved contexts contain only facts read from the committed root saga, exact recipient authority, active Delivery, canonical publication/manifest, Runtime/Result/Evaluation sources, and authenticated actor context as appropriate. Browser/shell values may identify the requested assignment or action but cannot satisfy strict Book authority fields.

### 3.1 Assignment Command Port

```ts
interface BookHomeworkAssignmentCommandPort {
  assignBookHomework(
    input: AssignBookHomeworkIntent,
  ): Promise<AssignBookHomeworkResult>;

  duplicateAsFreshAssignment(
    input: DuplicateBookHomeworkIntent,
  ): Promise<AssignBookHomeworkResult>;
}
```

`duplicateAsFreshAssignment` means re-resolve current canonical publication, roster, schedule, and policy inputs under fresh assignment, operation, and idempotency identities. It never copies a compatibility document or raw authority record.

```ts
interface AssignBookHomeworkIntent {
  assignmentId: string;
  operationId: string;
  idempotencyKey: string;

  // Injected from authenticated teacher context, never trusted from browser JSON.
  ownerId: string;

  expectedPublication: {
    bookId: string;
    publicationId: string;
    publicationRevision: number;
    manifestVersionId: string;
  };

  target: {
    classId: string;
    selectedBookTarget: BookHomeworkSelectionTarget;
    recipientIds: readonly string[];
  };

  schedule: BookHomeworkScheduleIntent;
  policy: BookHomeworkPolicyIntent;

  // Display-only, sanitized, frozen, and fingerprinted.
  presentation: {
    title: string;
    description?: string;
  };
}
```

The browser omits `ownerId`. The Worker derives it from the authenticated teacher UID before calling the bridge.

### 3.2 Management Command Port

```ts
interface BookHomeworkManagementCommandPort {
  changeDeadline(input: ChangeBookHomeworkDeadlineCommand): Promise<ManagementResult>;

  grantStudentExtension(
    input: GrantBookHomeworkStudentExtensionCommand,
  ): Promise<ManagementResult>;
}
```

Every command includes `assignmentId`, authenticated `ownerId`, `operationId`, `idempotencyKey`, and the expected authoritative revision. The port loads the committed root and exact internal authorities before mutation.

No generic `updateHomework` command exists for Book assignments. Availability-window edits, arbitrary config changes, close/reopen, archive/restore, delete, reset, exemptions, notes, reminder counters, and override deletion remain unsupported until an accepted Book-domain contract defines their authority and safety semantics.

### 3.3 Runtime and Review Action Ports

```ts
interface BookHomeworkRuntimeActionPort {
  resolveLaunch(input: ResolveBookHomeworkLaunchInput): Promise<BookRuntimeLaunch>;
  routeRuntimeCommand(input: BookHomeworkRuntimeCommand): Promise<BookRuntimeCommandResult>;
}

interface BookHomeworkReviewActionPort {
  routeEvaluationCommand(
    input: BookHomeworkEvaluationCommand,
  ): Promise<BookHomeworkEvaluationCommandResult>;
}
```

These are Adapters to the existing Book Runtime and Activity Evaluation Interfaces. The bridge validates committed Book Homework scope, actor, recipient, Delivery, placement, and trusted locator identity, then delegates. Runtime owns attempts and submissions. Activity Evaluation/Result owns review, grading, regrade, score, and feedback revisions.

### 3.4 Progress Event and Projection Ports

```ts
interface BookHomeworkProgressEventPort {
  runtimeStateCommitted(event: BookRuntimeStateCommitted): Promise<ProjectionResult>;
  runtimeTerminalCommitted(event: BookRuntimeTerminalCommitted): Promise<ProjectionResult>;
  evaluationRevisionCommitted(event: BookEvaluationRevisionCommitted): Promise<ProjectionResult>;
  repairProgress(scope: BookHomeworkProgressScope): Promise<ProjectionResult>;
}

interface BookHomeworkProjectionPort {
  resolveStudentProjection(
    assignmentId: string,
    studentId: string,
  ): Promise<BookHomeworkStudentProjection | null>;

  resolveTeacherProjections(
    assignmentId: string,
    ownerId: string,
  ): Promise<readonly BookHomeworkTeacherProjection[] | null>;
}
```

Event payloads carry exact locators and committed source revisions, not browser-asserted progress facts. The bridge reads back the authoritative Runtime or Evaluation record before projecting it. A missing event can be repaired from source; duplicate events replay idempotently.

## 4. Authority

The authoritative state is:

1. canonical Book publication, class roster, source readiness, and frozen policy;
2. RTDB root saga `book_homework/operations/{assignmentId}` for workflow, idempotency, recipient fan-out, assignment visibility, and management-operation receipts;
3. Firestore `book_homework_authorities/{authorityId}` for frozen per-recipient assignment authority, schedule, and extensions;
4. Book Delivery for active recipient entitlements;
5. Book Runtime for drafts, starts, attempts, terminal submissions, and objective results;
6. Activity Evaluation/Result for teacher review, manual grades, regrades, scores, and result revisions; and
7. the Book Homework progress aggregate for completion and Homework-experience progress derived from trusted Runtime and Evaluation facts.

`homework_assignments/{assignmentId}` is a derived compatibility/read projection only. Its Firestore rule may restrict who can discover or read the shell. That rule does not authorize a Worker or Book-domain operation.

## 5. Authoritative-State Diagram

```text
Homework teacher/student experience
       │ commands                     ▲ trusted projections
       ▼                              │
┌────────────────────────────────────────────────────────┐
│        BookHomeworkExperienceBridge boundary           │
│ identity + translation + replay + projection repair    │
└───────┬──────────────┬──────────────┬─────────────┬────┘
        │              │              │             │
        ▼              ▼              ▼             ▼
 Book publication   Root saga    Book Runtime   Activity Evaluation
 class / policy     + authority   submissions    / Result revisions
        │              │              │             │
        │              └──────┬───────┘             │
        │                     ▼                     │
        │                Book Delivery              │
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                 trusted Book Homework projections
                              │
             one-way discovery derivation/repair only
                              ▼
             homework_assignments/{assignmentId}
                  compatibility shell only
                              │
                              ▼
                    Homework discovery UI
```

Commands flow back through the bridge. Database authority never flows back from `homework_assignments`.

## 6. Internal Persistence

Use one internal authority document per recipient:

```text
book_homework_authorities/{assignmentId--recipientId--authority}
```

For the bounded first implementation, preserve the existing validated authority body and add only the management-revision envelope required for safe post-create fan-out:

```ts
interface BookHomeworkAuthorityRecord {
  assignmentId: string; // Existing field: equals authorityId/document ID.
  assignmentKind: 'book_activity_bundle';
  schemaVersion: 1;
  ownerId: string;
  bookManifest: BookHomeworkManifest;
  schedule: BookHomeworkAuthoritySchedule;
  managementRevision: number;
  pendingManagement?: {
    operationId: string;
    targetManagementRevision: number;
    expectedAuthorityRevision: number;
    stagedSchedule?: BookHomeworkAuthoritySchedule;
    stagedFingerprint: string;
  };
  activityPolicies?: Record<string, BookHomeworkActivityPolicySnapshot>;
  studentExtensions: Record<string, Record<string, BookHomeworkStudentExtension>>;
  saga: {
    sagaId: string; // Root assignment ID.
    state: 'prepared' | 'committed' | 'compensating';
    lastCommandId: string;
  };
  visibility: BookHomeworkVisibilityPointer;
  revision: number;
  createdAt: string;
  updatedAt: string;
  operations?: Record<string, BookHomeworkOperationRecord>;
}
```

Required identity invariants:

```text
document ID
  == record.assignmentId
  == authorityId

record.saga.sagaId
  == record.bookManifest.context.contextId
  == root assignmentId

record.ownerId
  == record.bookManifest.ownerId
  == authenticated ownerId

record.bookManifest.context.recipientId
  == recipient mapped by the root saga
```

Every internal authority operation receives one non-optional scope:

```ts
interface BookHomeworkAuthorityScope {
  authorityId: string;
  assignmentId: string;
  ownerId: string;
}
```

No assignment-only or authority-only authentication path remains.

Assignment-wide management mutations additionally use a root mutation journal. The journal freezes the command fingerprint, expected revision, affected recipients, per-recipient staging progress, staged schedule digests, and final committed management revision.

The concrete visibility model is:

1. each child retains its existing committed `schedule` and `managementRevision`;
2. fan-out writes the proposed value only to `pendingManagement.stagedSchedule`, bound to the next root management revision;
3. before root commit, Runtime and trusted reads continue using the existing committed `schedule`;
4. the root CAS commits the next management revision only after every child has an exact matching staged record;
5. after root commit, the schedule resolver accepts either a promoted `schedule` with the committed management revision or the exact matching staged schedule named by the committed root;
6. replay/finalization promotes the staged value into `schedule`, advances `managementRevision`, and clears `pendingManagement`; and
7. any child that matches neither the root committed revision nor its exact staged digest fails closed.

This preserves the prior committed schedule during partial fan-out and makes the root management revision the visibility gate without moving schedule authority into RTDB.

## 7. Service Authorization

Every internal authority create, read, update, commit, and CAS operation uses:

```text
uid = ownerId

book_homework_authority_service = true
book_homework_authority_authorityId = authorityId
book_homework_authority_assignmentId = root assignmentId
book_homework_authority_ownerId = ownerId
```

Firebase UID must never fall back to an authority or assignment ID. It is always the real teacher/owner UID.

The Firestore rules contract is:

- `get`: exact service claim and path; does not inspect `resource.data`, allowing an absent-document read before create;
- `list`: denied;
- `create`: exact tuple plus every stored identity invariant;
- `update` and commit: same tuple, immutable identities, CAS revision advancement, and a legal lifecycle transition;
- `delete`: denied; and
- browser access: always denied.

Compatibility projection writes use a separate exact capability. An internal authority token cannot write browser projections. Browser reads of a compatibility shell are limited to `createdBy == auth.uid` or exact membership in `target.studentIds`; all browser writes are denied.

Runtime and Evaluation commands use their existing exact service and actor authorization. The bridge does not replace or broaden those rules.

## 8. Compatibility Projection and Status/Stats Decision

One committed Book assignment produces one compatibility document:

```text
homework_assignments/{assignmentId}
```

The selected design is **marker-aware Book UI with trusted bridge projections**. The shell does not maintain Book progress, status, or stats caches. This avoids a second event-mirroring system and prevents stale shell fields from becoming accidental authority.

Proposed exact allowlisted schema:

```ts
interface BookHomeworkCompatibilityProjection {
  schemaVersion: 1;
  assignmentKind: 'book_homework_compatibility';

  id: string;        // == document ID == root assignmentId
  createdBy: string; // teacher owner UID
  createdAt: number;
  updatedAt: number;

  materialId: string;
  materialTitle: string;
  materialType: 'book';
  materialSkill: 'mixed';

  title: string;
  description?: string;

  target: {
    type: 'students';
    studentIds: string[]; // exact committed recipients
  };

  scheduling: {
    availableFrom?: number;
    dueDate: number;
  };

  // Structural launch compatibility only; ignored for Book execution.
  config: {
    timerMinutes: null;
    maxAttempts: null;
    feedbackTiming: 'never';
    lateSubmissionAllowed: false;
  };

  visibility: {
    showTimer: false;
    showAttempts: false;
    showDueDate: true;
    showQuestionCount: false;
    showDuration: false;
  };

  archived: false;
  tags: [];

  bookHomeworkCompatibility: {
    schemaVersion: 1;
    assignmentId: string;
    sourceSagaRevision: number;
    sourceFingerprint: string;
  };
}
```

`status` and `stats` are intentionally absent. Marker-aware teacher and student lists hydrate status, completion, attempts, review state, score summaries, and late state from the trusted bridge projection before filtering or display. Generic legacy consumers must never substitute zeroed shell stats.

The compatibility document also contains no:

- `bookManifest`;
- Activity bindings or policies;
- publication approval or freshness state;
- Delivery record;
- saga lifecycle or operation receipt;
- student extension;
- source context;
- Runtime terminal fact; or
- Book grading/result fact.

Teacher grading, result, integrity, and Runtime locators come from the trusted bridge projection, not from a manifest embedded in the compatibility shell.

### 8.1 Projection CAS

Projection publication must:

1. create only when the document is absent;
2. update only when the existing document has the same compatibility marker and assignment identity;
3. require the existing source revision to be older, or equal with the same fingerprint;
4. reject any legacy or conflicting document without overwriting it;
5. read back and compare the exact derived projection and fingerprint; and
6. never delete a conflicting legacy document.

The bridge freezes the bounded presentation snapshot in the root saga before its initial create and includes it in the root fingerprint. Repair never fetches mutable title data or re-runs canonical authorization.

## 9. Reverse-Action Classification

Every current legacy Homework mutation is classified exactly once. `ROUTE_TO_BRIDGE` invokes a Book command or an Adapter to a Book authoritative system. `DERIVED_READ_ONLY` reads a trusted projection. `UNSUPPORTED_FOR_BOOK` is suppressed and rejected without mutating the compatibility shell.

| Homework-experience action | Classification | Book handling |
| --- | --- | --- |
| Create/assign selected recipients | `ROUTE_TO_BRIDGE` | Canonical assignment command with fresh identities |
| Bulk assign/copy to another roster | `ROUTE_TO_BRIDGE` | Fresh canonical assignments; never clone documents |
| Duplicate | `ROUTE_TO_BRIDGE` | Fresh assignment from current canonical publication and roster |
| Change or extend final deadline | `ROUTE_TO_BRIDGE` | Root management command over authoritative schedules and affected-student safety checks |
| Shorten/remove/add a deadline | `ROUTE_TO_BRIDGE` | Allowed only when every affected authoritative state satisfies Book schedule safety; otherwise reject |
| Per-student deadline extension | `ROUTE_TO_BRIDGE` | Later-only authoritative student extension command |
| Bulk deadline extension | `ROUTE_TO_BRIDGE` | Explicit per-assignment bridge commands with independent revision and replay checks |
| Start/resume/autosave/submit Book Activity | `ROUTE_TO_BRIDGE` | Exact launch and Runtime command Adapter; never legacy submissions/practice |
| Grade/regrade/review a submitted Book Activity | `ROUTE_TO_BRIDGE` | Trusted locator to Activity Evaluation/Result command port |
| Schedule, progress, result, completion, late, and review display | `DERIVED_READ_ONLY` | Trusted teacher/student projection |
| Aggregate stats, completion rate, score distribution | `DERIVED_READ_ONLY` | Book progress aggregate; never shell `stats` |
| Integrity review | `DERIVED_READ_ONLY` | Trusted Book result/integrity projection |
| Bulk filtering, selection, and dashboard counts | `DERIVED_READ_ONLY` | Marker-aware trusted projection; never pass Book IDs to legacy bulk mutators |
| Change availability/release window | `UNSUPPORTED_FOR_BOOK` | No safe post-create Book command exists |
| Clear/revoke/shorten a student extension | `UNSUPPORTED_FOR_BOOK` | Existing authority supports later-only extension, not deletion or shortening |
| Close/reopen or direct status mutation | `UNSUPPORTED_FOR_BOOK` | Current visibility transitions are saga internals, not teacher lifecycle commands |
| Edit title, description, tags, timer, attempts, feedback, late policy, visibility, or anti-cheat config | `UNSUPPORTED_FOR_BOOK` | Manifest, presentation, and policy are frozen |
| Archive/restore/soft delete | `UNSUPPORTED_FOR_BOOK` | No accepted Book archive lifecycle exists |
| Permanent delete or auto-purge | `UNSUPPORTED_FOR_BOOK` | Internal authority and terminal facts are immutable/auditable |
| Legacy submission/result reset | `UNSUPPORTED_FOR_BOOK` | No Book retract/reset command exists |
| Per-student exemption, exemption reason, or note | `UNSUPPORTED_FOR_BOOK` | No Book authority field or command exists |
| Individual reminder, remind-all, or reminder counters | `UNSUPPORTED_FOR_BOOK` | No trusted Book reminder command/state exists |
| Bulk close/archive/delete/restore | `UNSUPPORTED_FOR_BOOK` | No corresponding Book lifecycle command exists |
| Test metadata propagation or generic `updateHomework` | `UNSUPPORTED_FOR_BOOK` | Frozen Book presentation and no generic mutation authority |
| Periodic legacy status update or automatic archive | `UNSUPPORTED_FOR_BOOK` | Status is derived; scheduled legacy mutators skip marked shells |

No governing PRD0062 Book lifecycle requirement currently establishes archive/restore or close/reopen semantics. If acceptance later requires them, add an explicit Book management command and authority transition; never implement them as compatibility-shell writes.

## 10. Progress and Result Flow

### 10.1 Trusted Source Ports

The bridge depends on read-only source Interfaces and command Adapters:

```ts
interface BookHomeworkRuntimeSource {
  readSnapshot(scope: BookHomeworkProgressScope): Promise<BookRuntimeSnapshot>;
}

interface BookHomeworkEvaluationSource {
  readCurrent(target: BookEvaluationTarget): Promise<BookEvaluationSnapshot | null>;
}

interface BookHomeworkScheduleSource {
  readEffectiveWindow(
    scope: BookHomeworkProgressScope,
    placementId: string,
  ): Promise<BookScheduleWindowSnapshot>;
}
```

The bridge does not write Runtime drafts, score Activities, calculate grades, or interpret mutable legacy submission rows.

### 10.2 Fact Flow

1. **Activity started:** Runtime commits the first accepted state/autosave under exact context and placement. A trusted event or repair read lets the bridge project `in_progress`.
2. **Attempts:** Runtime owns attempt numbering, operation replay, and maximum-attempt enforcement. The bridge exposes attempts used and remaining for display only.
3. **Terminal submission:** Runtime atomically commits attempt, result, completion, index, and operation receipt. The bridge validates and materializes the immutable terminal fact by `completionId`.
4. **Objective result:** Runtime owns the initial objective score or `review_required` state.
5. **Teacher review/grading:** Homework UI routes an exact locator through the bridge to Activity Evaluation. Evaluation owns the revision and grade. The bridge re-reads the accepted revision and refreshes the Homework progress projection.
6. **Result details:** Result service owns safe result/read models. The bridge returns locators or a bounded safe projection, not copied result internals.
7. **Completion:** The Book Homework progress aggregate derives completion from current valid terminal facts for required placements. It never reads legacy submissions or shell stats.
8. **Late status:** Runtime captures the effective deadline, schedule source, authority revision, and immutable `late` decision at terminal acceptance. Historical late status is never recomputed from a later schedule. Before terminal submission, current late/due display is derived from the current authoritative schedule and time.
9. **Teacher/student output:** The bridge joins committed root, exact child authority, active Delivery, Runtime facts, Evaluation state, and safe result locators into actor-specific projections.

### 10.3 Progress Replay and Failure

- Runtime commit is the submission commit point. Projection failure never rolls back Runtime attempts, submissions, scores, or evaluator history.
- Runtime terminal projection identity is `completionId`; the same ID with different content is an integrity conflict.
- Evaluation projection identity is `{resultId, evaluationRevision}`; duplicate accepted revisions replay, while stale or conflicting revisions reject.
- Progress projection writes use CAS, exact readback, and bounded retry. Exhaustion leaves repairable derived-state lag.
- A Runtime or Evaluation replay re-emits or re-reads committed facts and repairs the projection without duplicating attempts, submissions, or grades.
- The compatibility shell is not updated for progress, status, stats, score, review, or completion changes.

## 11. Authority and Translation Matrix

Every row names exactly one authoritative owner.

| Fact or action | Authoritative owner | Direction into bridge | Bridge output | Mutable | Stored in compatibility shell |
| --- | --- | --- | --- | --- | --- |
| Current publication/version | Book Publication | Book source read | Canonical validation input | Yes, through Publication lifecycle | No |
| Frozen assignment publication reference | Book Homework root saga | Assignment command → bridge | Exact immutable assignment reference | No after assignment commit | Presentation reference only; no authority |
| Teacher owner | Book Homework root saga | Authenticated teacher → bridge | Owner-scoped authority and `createdBy` projection | No | Yes, derived `createdBy` |
| Recipients | Book Homework root saga | Canonical roster/selection → bridge | Exact recipient authorities and target projection | No after assignment commit | Yes, derived `target.studentIds` |
| Schedule/deadline | Book Homework authority | Homework UI command → bridge | CAS authority update and derived schedule | Yes, through bridge safety rules | Yes, derived display schedule |
| Student extension | Book Homework authority | Homework UI command → bridge | Recipient schedule projection | Later-only | No |
| Delivery entitlement | Book Delivery | Bridge assignment/recovery command | Active/revoked entitlement join | Yes, through Delivery lifecycle | No |
| Activity started | Book Runtime | Runtime event/read → bridge | `in_progress` projection | Runtime-controlled | No |
| Attempt | Book Runtime | Runtime event/read → bridge | Attempts-used projection | Append/replay by Runtime | No |
| Terminal submission | Book Runtime | Runtime committed event/read → bridge | Submitted row and result locator | Immutable per terminal ID | No |
| Review/grade revision | Activity Evaluation | Homework UI command or evaluation event → bridge | Current safe evaluation projection | Revisioned by evaluator | No |
| Result read model/locator | Book Result service | Result source read → bridge | Actor-safe result locator/projection | Revisioned by Result service | No |
| Completion | Book Homework progress aggregate | Trusted Runtime/Evaluation facts → aggregate | Student/teacher completion projection | Rebuildable derivation | No |
| Late status | Book Runtime terminal fact | Runtime terminal event/read → bridge | Immutable terminal late badge/count | No after submit | No |
| Assignment lifecycle visibility | Book Homework root saga | Assignment/management command → bridge | Hidden/committed/compensating visibility | Only through defined Book commands | No |
| Effective temporal status | Book Homework progress aggregate | Authoritative schedule + clock + progress → aggregate | Scheduled/active/past-due/completed display | Recomputed derivation | No |
| Stats | Book Homework progress aggregate | Trusted fact read → aggregate | Marker-aware summary | Rebuildable derivation | No |
| Compatibility shell | Book Homework compatibility Adapter | Committed Book state → Adapter | Discovery/read shell | Derived CAS/repair only | Yes; it is the shell |

## 12. Initial Assignment Commit Ordering

The required completion order is:

1. authenticate the teacher and bind `ownerId`;
2. validate and freeze Book, publication, roster, schedule, and policy inputs;
3. freeze presentation and create or read the hidden prepared root saga;
4. create or read every recipient authority as prepared;
5. create every Delivery draft and activate it;
6. commit every recipient authority;
7. revalidate canonical publication, roster, and policy state;
8. CAS the root saga to committed and visible;
9. derive and conditionally publish the compatibility projection;
10. read back the projection exactly; and
11. return committed success.

The root saga commit is the logical assignment visibility point.

While the root remains uncommitted, even a child authority already marked committed remains compensable. Its active Delivery must be revoked. Only a committed root makes child authority and Delivery irreversible.

Trusted reads remain gated by a committed root, matching committed child authority, and matching active Delivery.

## 13. Post-Create Mutation Semantics

Every Homework-originated Book management command follows this transaction/replay protocol:

1. authenticate the actor and bind the exact owner/assignment tuple;
2. load the committed root, exact child authorities, and active Delivery state;
3. read or create a root management-operation receipt keyed by operation and idempotency identity;
4. validate the command fingerprint, expected revision, actor role, current progress, and domain safety rules;
5. for assignment-wide mutations, stage the proposed value in every affected authority while retaining each prior committed value;
6. CAS the new root management revision only after every staged child identity and digest matches the frozen recipient plan;
7. resolve the committed value through the root revision and promote/clear staged child records idempotently;
8. re-read the authoritative state exactly;
9. repair the compatibility projection when the command changes shell display fields;
10. read back the repaired projection; and
11. return committed success.

Trusted Runtime reads resolve only the root's committed management revision, using either the promoted child value or its exact root-bound staged value. A partially staged assignment-wide mutation is not visible as the new schedule. Same-command replay resumes staging or promotion from the frozen recipient plan; a conflicting fingerprint, digest, or identity returns conflict.

### 13.1 Deadline Change

`teacher changes deadline → authenticate → load committed Book authority and trusted affected-student progress → validate schedule safety → stage/CAS all affected authorities → commit the root management revision → repair the compatibility schedule → read back → success`.

If authoritative mutation commits but projection repair fails, return `committed_projection_pending`. Same-command replay repairs the shell without repeating the schedule mutation.

### 13.2 Student Extension

The command targets one committed recipient authority and one schedule node. It may only lengthen the effective deadline. Replay returns the same committed revision and repairs any affected teacher/student projection.

### 13.3 Runtime and Review Commands

Runtime or Evaluation remains the commit point. If bridge projection refresh fails after either system commits, return a repairable projection-pending result. Replay reads the committed Runtime or Evaluation revision and repairs projections; it never resubmits or regrades.

## 14. Failure Semantics

### 14.1 Before Initial Root Commit

- prepared or committed child authorities transition to `compensating`;
- active Delivery is revoked;
- the root remains hidden and becomes `compensated` or `failed_terminal`; and
- no compatibility projection is created.

### 14.2 After Initial Root Commit

- authority and Delivery are not compensated for compatibility projection failure;
- projection failure returns `committed_projection_pending`;
- the outward response may remain bounded, but the projection layer must preserve a non-secret structured failure class in diagnostic/evidence output (for example read denial, write denial, precondition conflict, invalid derived projection, token exchange, or readback mismatch); it must not erase the owning exception so completely that production becomes the only way to learn the next failing seam;
- replay of a committed root must ensure, read back, and repair the projection before returning committed success; and
- projection repair never changes root saga, authority, Delivery, publication, Runtime, or Evaluation state.

### 14.3 Later Management Failures

- failure before a root management revision commits leaves the new assignment-wide value invisible and retryable under the same operation identity;
- same-command replay completes the staged fan-out or reports a deterministic conflict;
- failure after authoritative management commit never rolls back the committed Book fact merely because a derived shell or UI projection is stale; and
- repair uses the committed root revision and frozen presentation without re-running the mutation decision.

A missing projection is an availability defect, not ambiguous assignment authority. All compatibility and progress projections are deterministically rebuildable from their authoritative sources.

## 15. Consumer Inventory and Dispatch

| Consumer | Current dependency | Two-way bridge behavior |
| --- | --- | --- |
| Teacher discovery/list | `createdBy`, timestamps, title, target, schedule, status, stats | Shell satisfies discovery; marker-aware hydration supplies trusted status/stats and routes supported commands |
| Student discovery/list | `target.studentIds`, class queries, schedule/config | Exact selected-student shell; marker routes launch to Book Runtime and hydrates trusted progress |
| Shared student shell | Reuses Homework list data across site surfaces | Remains discoverable; Book marker prevents legacy practice/submission dispatch |
| Student detail/submission | Legacy eligibility and `homework_submissions` | Trusted Book projection and Runtime command port |
| Teacher detail | Root document, legacy submissions, overrides, stats | Trusted teacher projections; supported management/review commands route to bridge |
| Teacher grading/integrity | Raw `bookManifest` locators | Trusted result/evaluation locators from bridge projection |
| Legacy mutation services | Generic updates, archive/delete, override, status, stats | Central marker guard routes supported actions and fails closed otherwise |
| Bulk/automatic jobs | Treat every assignment as mutable legacy Homework | Skip Book shells except explicit bridge-routed fresh assign or deadline commands |
| Notification authorization | Trusts shell `createdBy` | Validates committed bridge authority; shell is discovery input only |
| Book progress consumers | Worker projections | Continue using trusted progress; never shell stats |

Relevant current consumers include:

- `src/services/homeworkManager.ts`;
- `src/services/homeworkBulkOperations.ts`;
- `src/services/homeworkSubmissionService.ts`;
- `src/hooks/useHomeworkList.ts`;
- `src/hooks/useHomeworkDetail.ts`;
- `src/hooks/useHomeworkSubmission.ts`;
- `src/pages/StudentHomeworkListPage.tsx`;
- `src/pages/StudentHomeworkDetailPage.tsx`;
- `src/pages/TeacherHomeworkListPage.tsx`;
- `src/pages/TeacherHomeworkDetailPage.tsx`; and
- `src/services/notificationDestinationResolver.ts`.

The existing `isBookHomeworkAssignment` predicate remains the manifest-bearing raw-authority predicate. A separate `isBookHomeworkCompatibilityProjection` predicate recognizes the compatibility marker.

## 16. Migration

Historical evidence records:

1. `assignment-vocab-u1-d43935c735245dc8` as compensated, hidden, revision 5, with no Firestore authority and no Delivery; and
2. `assignment-vocab-u1-29896863-e887-4e2e-8ced-3b3e93be5a93` as compensating, hidden, revision 3, with authority HTTP 404 and no Delivery.

Therefore:

- no recorded Firestore authority or Delivery data needs copying;
- the compensated saga remains an immutable hidden receipt;
- retry-1 remains historically unresolved rather than being relabeled compensated;
- neither receives a compatibility projection;
- no state is synthesized, deleted, or marked migrated; and
- a fresh live read-only reconciliation is mandatory before any eventual rollout because repository evidence is not current production truth.

Evidence:

- `documentation/tasks/PRD0062/evidence/126-production-normal-recovery-v19b-failure-result-2026-08-14.json`
- `documentation/tasks/PRD0062/evidence/126-production-normal-v19b-retry1-failure-rollback-2026-08-14.json`

## 17. Current Runtime Comparison

Current Milestone 1 implementation behavior:

- the canonical Worker route injects authenticated owner context;
- the saga owns canonical validation, root idempotency, child fan-out, Delivery, authority commit, trusted reads, and committed compatibility-projection repair;
- raw per-recipient Book authority is persisted under `book_homework_authorities` with owner-scoped identity;
- the compatibility repository derives a non-authoritative shell under `homework_assignments`;
- exact parser, route, default workerd commit/replay, Firestore authority ACL, marker-aware teacher/student projections, and non-Book Homework regressions are green locally/emulator/workerd;
- the corrected production assignment durably committed root saga, authority, and active Delivery but compatibility projection creation/readback did not complete;
- `BookHomeworkAssignmentSaga.projectCommitted()` currently converts any compatibility projection exception into `committed_projection_pending` without preserving the precise owning failure class in the outward result, so the exact projection failure still requires deployment-equivalent reproduction;
- the committed production assignment is the repair target; a fresh assignment would duplicate authoritative state rather than repair the derived shell; and
- the minimum Homework → Book context resolver/enricher required for the browser round trip must be proven explicitly before handoff, even where existing trusted projection/runtime code already resolves parts of that context.

The target contract retains ownership and internal algorithms in the existing Publication, Activity, Delivery, Runtime, Evaluation, Result, and general legacy Homework Modules. It deepens only the Book ↔ Homework-experience boundary and its explicit Adapters.

Two later cross-module contract extensions remain in scope because the bridge cannot truthfully derive these facts after the event:

- Runtime terminal records capture the immutable effective deadline, authority/schedule revision, and late decision made at terminal acceptance; and
- Runtime and Evaluation expose committed-revision callbacks or equivalent repairable source reads carrying exact locators.

These extensions do not move attempt, submission, schedule enforcement, scoring, grading, or result ownership into the bridge.

## 18. Two-Milestone Implementation and Recovery Sequence

### 18.1 Milestone 1 — one safe round trip and browser handoff

Milestone 1 is not complete merely because Book assignment authority commits or a Homework shell can be constructed locally. It is complete when one representative flow makes a safe round trip:

```text
Book authoritative assignment
  -> Book-to-Homework compatibility projection
  -> Homework discovery/detail UI
  -> real teacher/student action carrying only bounded locator + intent
  -> Homework-to-Book context resolver/enricher
  -> strict Book trusted read/Runtime action
```

No Book-required field on the return trip may be invented from Homework data.

Current bounded sequence:

1. Preserve the old absent-read, V17, V19b/retry-1, missing-presentation, and corrected `committed_projection_pending` evidence unchanged.
2. Treat the already committed corrected assignment as authoritative durable state. Do not create a fresh assignment for projection repair.
3. Reproduce the exact compatibility projection failure deployment-equivalently from the corrected command plus the committed root/authority/Delivery shape. The previously deployed Milestone 1 implementation must go red with the same projection failure class.
4. Preserve a bounded, non-secret projection failure classification through diagnostics/evidence so read denial, write denial, token failure, precondition conflict, invalid derived data, and readback mismatch are distinguishable without another production probe.
5. Fix only the owning Book → Homework projector/compatibility seam and prove same-command committed replay creates/reads back the missing shell without changing root saga, authority, or Delivery identity.
6. Prove the compatibility shell carries only display/discovery data plus the bounded locator needed to return to the bridge.
7. Add or formalize the minimum `BookHomeworkContextResolverPort` needed by the representative browser flow. Given only the assignment locator, authenticated actor, and requested action, prove it reloads every strict Book field from committed root/authority/Delivery/publication/Runtime sources and fails closed when any provenance is missing or crossed.
8. Prove one deployment-equivalent round trip for both roles: shell discovery/detail -> trusted teacher projection, and shell discovery/detail -> authenticated student -> context resolution -> Book Runtime launch/read consumption. Include provenance assertions for owner, recipient, authority, publication/manifest, Delivery binding, placement/version, and current revision as applicable.
9. Reconcile live rollback state and the committed assignment. Freeze exact source/bundle/config/rules plus the literal corrected command bytes. If only projector source changes, regenerate every invalidated identity normally; do not create a new product design/candidate merely for naming.
10. Perform one bounded activation whose assignment mutation is **same-command replay of the committed assignment**, not a new assignment. Expected behavior is projection repair followed by committed success and teacher/student consumption.
11. On complete success, stop internal work and hand the real site to the user immediately. On any new failure, rollback and reproduce that exact failing seam before further activation.

### 18.2 Milestone 2 — complete the supported two-way surface

Only after the first safe browser handoff, continue the remaining breadth of this contract:

1. add the root management-operation journal and expose accepted deadline and student-extension commands;
2. prove management CAS, partial fan-out replay, progress safety, projection-pending, and repair semantics;
3. add Runtime/Evaluation source Adapters, trusted event replay, and immutable terminal late metadata;
4. complete marker-aware teacher/student progress, result, review, status, and stats hydration;
5. route supported duplicate/bulk/review actions and retain central fail-closed guards for unsupported legacy mutations;
6. prove Runtime submit/replay, Evaluation revision replay, progress repair, notification/integrity behavior, and unchanged non-Book Homework behavior; and
7. reconcile and close the remaining governing PRD0062 acceptance/ticket delta.

## 19. Bounded File and Interface Set

Core Book Homework boundary:

- `src/services/book-homework/bookHomeworkSaga.types.ts`
- `src/services/book-homework/bookHomeworkAuthority.types.ts`
- `src/services/book-homework/bookHomeworkProgress.types.ts`
- `src/services/book-homework/bookHomeworkProgress.service.ts`
- `cloudflare/src/upload-worker/book-homework/repository.ts`
- `cloudflare/src/upload-worker/book-homework/sagaRepository.ts`
- `cloudflare/src/upload-worker/book-homework/saga.ts`
- `cloudflare/src/upload-worker/book-homework/bridge.ts`
- `cloudflare/src/upload-worker/book-homework/compatibility-repository.ts`
- a focused `BookHomeworkContextResolverPort` implementation under `cloudflare/src/upload-worker/book-homework/` (separate file or bridge-internal collaborator; do not expose browser-supplied Book authority)
- `cloudflare/src/upload-worker/book-homework/completion-repository.ts`
- `cloudflare/src/upload-worker/book-homework/runtime.ts`
- `cloudflare/src/upload-worker/book-homework/worker.ts`
- `cloudflare/src/upload-worker/book-activity-authoring/firebase-token.ts`
- `firestore.rules`

Explicit existing-system contract extensions and Adapters only:

- `src/services/book-activity/activityRuntimeAttempt.types.ts` for immutable late metadata;
- `cloudflare/src/upload-worker/book-runtime/worker.ts` for committed progress callbacks;
- `src/services/book-activity/activityEvaluation.types.ts` and the existing grading command Adapter for revision events; and
- existing Book result read-model Interface for trusted locators.

Compatibility consumers:

- `src/types/homework.types.ts`
- `src/services/book-homework/bookHomeworkManifest.service.ts`, or a new focused compatibility predicate module
- `src/services/homeworkManager.ts`
- `src/services/homeworkBulkOperations.ts`
- `src/services/homeworkSubmissionService.ts`
- `src/services/homeworkAssignmentClient.ts`
- `src/hooks/useHomeworkList.ts`
- `src/hooks/useHomeworkDetail.ts`
- `src/hooks/useHomeworkSubmission.ts`
- `src/pages/StudentHomeworkListPage.tsx`
- `src/pages/StudentHomeworkDetailPage.tsx`
- `src/pages/TeacherHomeworkListPage.tsx`
- `src/pages/TeacherHomeworkDetailPage.tsx`
- `src/services/notificationDestinationResolver.ts`

Book Publication, Activity authoring, Delivery internals, Runtime algorithms and persistence beyond the terminal late envelope/callback, grading algorithms and persistence beyond the committed-revision callback, general legacy Homework persistence, and unrelated PRD0062 domains remain outside this redesign.

## 20. PRD0062 Acceptance Impact

This two-way contract changes the integration method, not the accepted product outcomes. It affects existing acceptance coverage for:

- Book Homework assignment targeting, frozen publication/binding identity, scheduling, and per-student extensions;
- teacher/student list, detail, Runtime launch, submission, result, review, redo/regrade, completion, and late-state consumption;
- selective update safety, affected-student validation, idempotency, and replay;
- placement/context/version-scoped Delivery and cross-feature isolation;
- notification authorization and retry deduplication;
- security of exact teacher UID and owner/assignment/authority claims;
- compatibility protection for non-Book Homework and legacy launch branches; and
- rebuildable projection and reproducible history requirements.

The current acceptance surfaces include:

- `documentation/tasks/PRD0062/tasks-book-activity-05-book-homework.md`;
- `documentation/tasks/PRD0062/tasks-book-activity-06-updates-checkpoints-notifications.md`;
- `documentation/tasks/PRD0062/tasks-book-activity-07-cross-feature-delivery-results.md`;
- `documentation/tasks/PRD0062/supporting/prd0062-v1-acceptance-matrix.json`; and
- the Homework, Updates, Delivery, Results, and quality/safety sections of the governing Book Activity PRD and accepted amendment.

No new acceptance criterion is created by this contract. Archive/restore, close/reopen, reminder management, exemptions, reset, and mutable Book config remain unsupported because no accepted Book authority semantics were found for them. Adding any of those capabilities requires explicit product authority and acceptance coverage before implementation.

### 20.1 Active V1 Acceptance Authority

The provenance question is resolved for implementation:

- `documentation/tasks/PRD0062/supporting/prd0062-v1-acceptance-matrix.json` is the active Full-V1 case, fixture, and command authority;
- its state is `SOURCE_CONFORMANT_DEFINED_NOT_EXECUTED`, so it defines acceptance but proves no execution;
- `documentation/tasks/PRD0062b/**` is dormant historical planning and proof evidence after the code reset, not the active case or taskbox authority; and
- the later accepted full-document Source Delivery decision retained in PRD0062b continues to win only where Source Delivery semantics conflict. It does not replace the active V1 matrix.

Milestone 1 production-normal recovery is a representative product-recovery gate under the controlling recovery plan, not a newly invented acceptance-matrix case. Milestone 2 reconciles the full active matrix without reopening this bridge architecture.

## 21. Risks and Tradeoffs

- Marker-aware trusted hydration adds list-query fan-out; batch teacher/student projection endpoints and bounded caches may reduce latency without changing authority.
- Omitting shell `status` and `stats` requires every current Book consumer to detect the marker before legacy filtering or display. This is intentional containment, not optional UI polish.
- Assignment-wide schedule mutation spans per-recipient authorities. A root management journal and committed revision gate are required to avoid exposing partial fan-out.
- Historical late status requires a new immutable Runtime terminal field; deriving it later from a changed schedule is incorrect.
- Projection publication introduces post-commit eventual availability; mandatory replay repair contains it.
- Mixing ordinary Homework and derived Book shells in one collection requires exact discriminator-aware rules because Firestore rule allows are additive.
- Generic Homework mutation paths remain the largest split-authority risk; rules, central guards, and marker-aware UI dispatch are all required.
- A conflicting legacy document at the root assignment ID must never be overwritten; the committed Book assignment remains projection-pending until explicitly reconciled.
- The bridge façade can become a god module if it absorbs Runtime, Evaluation, Delivery, or Publication logic. Its depth comes from stable ports and centralized identity/replay translation, not ownership of those systems.

## 22. Review Disposition

The separate-authority architecture remains accepted. This revision adds two-way interaction without adding reverse database authority:

- supported Homework actions route through explicit Book commands;
- unsupported legacy actions fail closed;
- Runtime and Evaluation remain authoritative behind source and command ports;
- trusted Book progress returns through marker-aware projections;
- the compatibility shell remains discovery-only and contains no status/stats authority;
- post-create mutations have explicit CAS, root revision, replay, and projection-repair semantics; and
- every important fact has one authoritative owner in the translation matrix;
- Book → Homework is explicitly lossy projection, while Homework → Book is authoritative enrichment with provenance rather than inverse field mapping; and
- the current committed assignment with missing compatibility shell is a repair target, not permission to create another assignment.

This documentation revision authorizes no immediate production replay by itself. The next activation remains gated by exact compatibility-failure reproduction, owning-seam correction, minimum return-path provenance proof, regenerated frozen identities, and the bounded same-command replay described in Sections 18.1 and the controlling recovery plan.
