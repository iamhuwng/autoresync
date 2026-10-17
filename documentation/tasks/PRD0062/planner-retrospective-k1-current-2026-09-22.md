# Planner retrospective: K1 through current work

Date: 2026-09-22. This is a bounded independent source/caller audit with targeted
read-only browser observations, not a replacement full acceptance campaign.
Three resumed read-only assignees returned; the planner inspected the decisive
source paths independently. No implementation, deployment, or test-suite rerun
was performed. Shared worktree HEAD: aa4d65222287cc2aa59ec469bcd0c0b624bf2fef.

## Product model used before comparing execution evidence

A teacher must retain component files and their combined output, stage trusted
immutable sources and a student-document descriptor, then activate the complete
prepared setup through the existing Material Book CAS receipt. Publication is a
separate P0 authority. The learner receives one opaque document whose requests
are reauthorized. Explicit reconciliation decisions bind the actual proposed
change. Confirmation must accurately describe publication scope. Historical
donors and green fixture tests support these requirements; neither replaces the
normal application's caller chain.

## Confirmed findings

### 1. P1: normal component authoring does not reach S0/A0

`BookPdfFlowWorkspace.tsx:766-800` retains only composition hash/input metadata,
then discards the combined result at line 796. The only non-test caller of
`createComponentPdfStagingService` is `BookAssemblyWorkspaceSmokePage.tsx:459`.
The normal `BookEditorPage.tsx:62`, `BookEditorModal.tsx:327`, and
`BookPdfEditWorkspace.tsx:160` callers supply no
`componentStudentDocumentSourceVersionId`. `BookMode2EditorShell.tsx:452` merely
forwards that optional prop. Consequently the A0 branch in
`BookAssemblyWorkspace.tsx:1054-1067` cannot run from those callers.

The fallback at `BookAssemblyWorkspace.tsx:1094-1113` attaches the component
Source Set separately, then persists the candidate. The production Source
Worker forwards that attachment without activation data (`book-source/worker.ts:
366-394`). `materialBookSourceAttachment.service.ts:404-435` advances the live
Book/source revisions and Source Set while adding a receipt only if supplied.
The qualified reader requires an exact receipt (`componentPdfActivation.service.ts:
163-204`). Thus the normal fallback can advance canonical authoring state without
the complete prepared setup; it does not establish a usable activated setup.

This is an initial-authoring integration defect, not U's later replacement
selection work. Preserve the accepted receipt architecture and trusted upload
implementation. Reopen only S0/A0 production caller integration and its unsafe
fallback. Correct the normal chain using existing services; do not invent a
second document authority, saga, or parallel current pointer.

### 2. P1: M1 resolution survives a changed proposal

`reconciliation.service.ts:262` identifies choices only by change class and item
key. At lines 344-346, membership in `resolvedChangeIds` makes the change
automatic. `BookAssemblyWorkspace.tsx:413,1241-1263` stores these IDs and only
adds to the set; there is no invalidation when the compared values change.

Example: approve moving an Activity from Unit A to B, then change the same
Activity's proposal to Unit C. The same `moved:<activityKey>` decision can resolve
the second proposal without a fresh choice. This violates explicit review of
cross-Unit moves. Reopen the bounded M1 choice-validity contract. Proof must
exercise edit-after-choice against the normal workspace, not only static choices.

### 3. P2: P0 confirmation misstates the operation

`BookPdfFlowWorkspace.tsx:1287-1295` submits all Unit approvals for component
publication. `componentPdfPublication.command.ts:223-267` creates a multi-Unit
publication. Yet the confirmation overlays at lines 1573 and 1596 say
“Publish Unit 1?” and “Later Units remain private.” The trigger itself says
“Publish Book.” A teacher is being asked to approve a narrower action than the
command performs. Reopen this P0 confirmation scope only; retain the whole-
activation publication decision and existing publication CAS authority.

## Evidence and ownership distinctions

| Boundary | Independent disposition |
| --- | --- |
| K1 trusted bytes and lifecycle primitives | Source completion resolves stored provider identity and counts trusted bytes before completion CAS; native Worker ctx is forwarded. No new source-level contradiction found. No fresh emulator/provider/concurrency proof claimed. Preserve bounded acceptance. |
| C1/C2 and M0 | Picker/composition and pure preparation are useful bounded work. They do not prove durable normal-editor integration. No separate new defect established in this audit. |
| S0/A0 | Existing service and emulator evidence remains historical evidence for those contracts; production caller closure is contradicted by finding 1. |
| D0/D1 | Checked authorization-before-provider ordering and source-free combined projection. No new bypass/leak found in inspected paths. This is not full security certification. |
| P0 | Whole-activation approval/publication machinery is retained; confirmation semantics require correction. |
| Vertical Slice | The packet accurately discloses mocked Source persistence, in-memory repositories and intercepted document endpoints. Preserve it as local service-chain evidence, but it cannot close the disconnected normal editor path. The planner's gate definition was too weak. |
| D2 | No demonstrated production-path failure sufficient to reopen found. Optional client ETag acceptance is a follow-up candidate, not a concluded exploit: the inspected trusted component producer requires and supplies ETag. Early navigation telemetry is not evidence that visible Activity state changes before flush succeeds. |
| M1 | Reopen choice invalidation, not the entire manifest/reconciliation implementation. |
| H | Previously reopened. Browser selecting Component PDFs on the Homework smoke page blocked confirmation for missing trusted receipts. During this audit the writer changed notification and timezone code; the earlier missing-guard claim is now historical, not a finding against the final correction. No H refreeze issued. |
| E-core | Retained work remains unaccepted/paused. No new release. |
| CC | Course/Class production resolvers omit resolveStudentDocument and fail closed for components. This belongs to the explicitly held CC lane, not an inferred accepted D0 defect. |
| U/L/Q and remote proof | Still held. Missing deferred proof is not automatically a defect in an earlier bounded lane. |

The Course/Class omissions are at `course-book-placement/production.ts:196,225`
and `class-book-placement/production.ts:286,350`; the missing callback is rejected
by `bookDelivery.service.ts:120-135`.

## Browser observations and limits

On localhost:5173 the authenticated teacher Materials page and Book editor
opened. Selecting Preview on the saved local verification Book displayed
“The saved Book draft could not be loaded.” No attribution to a specific product
defect is made from that environment-dependent observation. On the Homework
smoke route, explicitly choosing Component PDFs displayed the missing-receipt
error and disabled confirmation. No data was assigned, published, or uploaded.
These observations do not prove the normal end-to-end create/assign/student flow.

## Planner conclusion

The main failure is acceptance of individually consistent services as sufficient
evidence of a working product path. Responsibility includes the planner's narrow
fixture gate and conditional caller scope, not just execution quality. Blanket
rejection or re-proving every accepted lane would be equally unjustified.

Hold successor release and overall integration acceptance. Preserve prior code
and architecture. The next planner gate must allocate the missing initial-
authoring caller connection, close the no-receipt fallback, bind M1 choices to
the reviewed values, and correct P0 confirmation scope. Reuse existing services
and prove these specific falsifiers through real application composition over
disposable local persistence. No writer is released by this retrospective.
