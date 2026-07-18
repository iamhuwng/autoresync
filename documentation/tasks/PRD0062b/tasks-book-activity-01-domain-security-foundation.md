> **DORMANT_AFTER_CODE_RESET:** read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). All status and checkbox state below is dated evidence until fresh reactivation approval and proof.
>
> **CANONICAL FULL-WORDING CHECKLIST — ONE CHECKBOX OWNER**
>
> Root execution checklist. Amendment 043 wins conflicts. Master, recovered, and implementation-audit files are evidence/reference only, not execution checkbox owners.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
# Task List: PRD0062 Component 01 - Domain And Security Foundation

Status: VERIFIED

## Closure Evidence

- Source: `src/services/materialCatalog/materialCapabilityRegistry.service.ts`; `src/services/materialCatalog/bookActivityBookIntegration.service.ts`
- Tests: `src/services/materialCatalog/materialCapabilityRegistry.service.test.ts`; `src/services/materialCatalog/bookActivityBookIntegration.service.test.ts`
- Findings/traceability: `documentation/tasks/PRD0062b/implementation-audit.md`; `documentation/tasks/PRD0062b/authority-and-provenance.md`

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/types/materialCatalog.types.ts` - Existing Material Catalog kinds, Book node types, Book refs, and public projection contracts to extend with `interactive-activity` and `unit` support where needed.
- `src/services/materialCatalog/materialBooks.service.ts` - Existing Book metadata/node read/write service that must remain the Book storage integration seam.
- `src/services/materialCatalog/bookValidation.service.ts` - Existing validation seam to extend for Activity refs, `unit`, and student-safe projection requirements.
- `src/types/bookActivity.types.ts` - New Activity schema, candidate, draft, published version, Interaction ID, projection, grading, and diff types.
- `src/services/book-activity/activitySchema.service.ts` - New schema normalization and validation owner.
- `src/services/book-activity/activityCandidate.service.ts` - New candidate staging and draft-save owner.
- `src/services/book-activity/activityPublish.service.ts` - New immutable publish owner.
- `src/services/book-activity/activityProjection.service.ts` - New student-safe projection owner.
- `src/services/book-activity/activityDiff.service.ts` - New semantic change classification owner.
- `src/services/book-activity/activityScoring.service.ts` - New objective scoring/regrading plan owner for supported interaction families.
- `src/services/materialCatalog/materialCapabilityRegistry.service.ts` - New central capability registry to avoid spreading kind checks through callers.
- `database.rules.json` - RTDB rules for new data paths, if RTDB is used.
- `firestore.rules` - Firestore rules for new data paths, if Firestore is used.
- `src/__tests__/security/*bookActivity*.test.ts` - Emulator/rules tests for new Activity paths.
- `src/services/book-activity/*.test.ts` - Unit tests for schema validation, hidden IDs, projection, scoring, and diff behavior.

### Notes

- Follow `AGENTS.md` and triggered rule docs before writing code.
- Add no dependency from Reading V2 or Listening back into the new Book Activity module.
- The generic Activity schema MUST NOT add generic Task Group, Task Set, or first-class Resource layers.
- Activity revision JSON MUST NOT accept `activityId`, `materialId`, `versionId`, `placementId`, `bookId`, `nodeId`, source provenance, owner identity, or publish timestamps.
- Student-safe projections must exclude hidden answers, authoring data, source provenance, hidden Interaction IDs where not needed by the client, and teacher-only fields.
- New Book Activity logic must be fully typed. Do not place new invariants inside a legacy `// @ts-nocheck` seam without a typed wrapper or cleanup.
- Use `npm test -- [path]` or `npm run test -- [path]` according to the repo's Vitest setup after Packet 0 confirms exact commands.

## Packet Contract And Closure Addendum

Before source changes in this component:

- [x] Create or update `documentation/tasks/PRD0062b/authority-and-provenance.md` with storage, rules/security, UI, migration/compatibility, test, browser-proof, proof-classification, and authority-reconciliation sections.
- [x] Map every implemented requirement to PRD section, source owner, test title, negative proof where applicable, architecture/current-state doc, findings row, traceability row, and taskbox ID.
- [x] Classify proof separately as local source proof, type/build proof, emulator/rules proof, browser proof, remote/deployed proof, or not required for Packet 1.
- [x] Keep phase state explicit. Tests passing may move work to `IMPLEMENTED_UNREVIEWED`; they do not make the packet `CLOSED`.

Before completing this component:

- [x] Run stale-claim scans over touched task docs, findings, traceability, and architecture/current-state docs for contradicted proof language.
- [x] Request review only after source, tests, findings, traceability, and docs are updated and inspectable.
- [x] Record reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks.
- [x] Update the packet handoff with current live contract, historical/superseded evidence, verification commands, dirty-path classification, and unresolved blockers.

## Amendment 043 Packet Contract

Non-checkbox authority block. Root task rows remain sole execution boxes. Authority: local `documentation/tasks/PRD0062b/authority-and-provenance.md`, `documentation/tasks/PRD0062b/implementation-audit.md`, `documentation/tasks/PRD0062b/reconciliation-ledger.md`, and approved amendment `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md`.

### Storage

P1 Activity and canonical Material Summary RTDB paths, indexes, archive/delete behavior, and local backup/restore inventory are recorded in `storage-design-book-activity-packet-1.md`. No remote or deployed storage proof is inferred.

### Security/rules

Owner, trusted-write, canonical projection, and summary-index rules are implemented. Actual Database Emulator proof accepts malicious student, cross-owner/cross-student, ancestor, public-summary, producer/kind mismatch, missing-projection, and missing-version denials.

### UI/accessibility/announcements

No route, page, announcement, or analytics-emitting action was added. Existing Book picker candidate eligibility changed, so final teacher localhost browser proof verified its rendered legacy behavior and zero console warning/error. Later consumer packets retain their UI/accessibility/announcement obligations.

### Migration/compatibility

No deployed compatible Activity dataset exists, so no migration/backfill is required. Legacy material/Book behavior and Reading V2/Listening isolation passed local regression proof.

### Tests

Final local source, type, emulator, Worker, Book regression, dependency, backup/restore, browser, stale-claim, and canonical-plan proof is recorded in the P1 handoff. Remote/deployed proof is not claimed.

### Browser/runtime proof

Required for the changed existing Book picker and completed at `http://localhost:5173`; no persistent mutation occurred. Runtime, remote, and deployed gates remain separate inherited boundaries.

### Authority reconciliation

Amendment 043 wins conflicts. Local `authority-and-provenance.md` and `reconciliation-ledger.md` govern reconciliation; recovered/master/audit text is not execution authority.

### Evidence classification

All Component 01 task and packet-contract rows are `VERIFIED_LOCAL_FAITHFUL`, with emulator and localhost browser proof classified separately. Local proof never implies remote faithfulness.

### Rollback/blockers

No deployment or cloud mutation occurred, so no deployment rollback was required. Dirty overlap remains user-owned and preserved. No blocking P1 review or proof finding remains; later operational risks are recorded in findings/handoff.

## Tasks

All Component 01 rows below are `VERIFIED_LOCAL_FAITHFUL` after fresh live-state audit, ordered reviews, final browser proof for the changed picker, and packet-exit verification. No student runtime, assignment, result, or operational Book placement may infer readiness from these P1 checkboxes.

- [x] 1.0 Extend Material Catalog for generic Activity Materials
  - [x] 1.1 Add `interactive-activity` to the canonical material kind list.
  - [x] 1.2 Add or deepen a central capability registry with `playable`, `assignable`, `embeddableInBook`, `gradable`, `supportsSourceContext`, and `supportsPlacementScopedProgress`, plus adapter IDs. Unimplemented user-facing adapters remain `unsupported`; capability readiness flips only in the packet that implements and verifies the adapter.
  - [x] 1.3 Replace any new proposed direct kind checks with capability lookups across picker filtering, publish validation, assignment eligibility, student launch routing, result ownership, and security/student-safe projection decisions.
  - [x] 1.4 Confirm existing `grammar-worksheet` and `vocabulary-set` declarations remain compatible and are not treated as proof of runtime support.
  - [x] 1.5 Add tests proving the implemented projection adapter resolves, unfinished launch/assignment/result adapters fail closed, and existing material behavior remains stable.

- [x] 2.0 Define Activity schema, candidate, draft, and published version contracts
  - [x] 2.1 Define the revisionable Activity JSON contract with `schemaVersion`, `title`, `taskProfile`, `presentationMode`, `contextRequirement`, `instructions`, `interaction`, `answerRule`, `stimulus`, `assetRefs`, `interactions`, and `scoring`.
  - [x] 2.2 Define immutable origin provenance separately from editable revision JSON.
  - [x] 2.3 Define candidate records for imported replacement content awaiting validation and Save Draft.
  - [x] 2.4 Define mutable draft records and immutable published version records.
  - [x] 2.5 Define supported V1 interaction families: `choice`, `text-entry`, `matching`, `ordering`, and `long-response`.
  - [x] 2.6 Define Task Profile registry shape with namespaced `taxonomyId`, `typeId`, and `taxonomyVersion`.
  - [x] 2.7 Define `structured` and `source-assisted` presentation modes only.
  - [x] 2.8 Define `none`, `optional`, and `required` context requirement modes only.
  - [x] 2.9 Define minimum source-assisted response metadata: question label, `accessiblePrompt`, response shape, and relationship to visible source exercise/part labels.
  - [x] 2.10 Add tests proving unsupported families, modes, context requirements, missing source-assisted accessibility metadata, and forbidden fields fail closed.

- [x] 3.0 Implement Activity validation and hidden Interaction ID assignment
  - [x] 3.1 Validate one Activity has one coherent interaction family and one shared answer rule.
  - [x] 3.2 Validate embedded stimulus is distinct from interaction family.
  - [x] 3.3 Validate Task Profiles accept registered namespaced taxonomies and permit ordinary Activities to use `taskProfile: null`.
  - [x] 3.4 Validate source-assisted mode requires source context and complete accessible prompt/label/response-shape metadata before publish; concrete Book page mapping is deferred to Packet 3 placement repair.
  - [x] 3.5 Reject generic Task Group, Task Set, and first-class Resource payloads in V1 schema.
  - [x] 3.6 Reject editable JSON that includes hidden Interaction IDs or placement/provenance fields.
  - [x] 3.7 Generate hidden Interaction IDs when an Activity is first saved.
  - [x] 3.8 Preserve hidden Interaction IDs only when a revision is exact-structure safe by position.
  - [x] 3.9 Generate new IDs and classify redo-required when interactions are added, removed, reordered, or materially changed.
  - [x] 3.10 Add tests for hidden ID generation, safe preservation, forbidden exported IDs, and redo-required ID replacement.

- [x] 4.0 Implement candidate, draft, and publish operations
  - [x] 4.1 Implement `stageActivityCandidate(targetActivityId, replacementContent)`.
  - [x] 4.2 Implement `validateActivityCandidate(candidate)`.
  - [x] 4.3 Implement `saveActivityDraft(candidateId)` as full-content replacement, not partial field merge.
  - [x] 4.4 Implement `publishActivityRevision(activityId, expectedDraftRevision)` with immutable version creation.
  - [x] 4.5 Ensure invalid candidates leave the current draft and published versions untouched.
  - [x] 4.6 Ensure published versions cannot be mutated.
  - [x] 4.7 Add tests for candidate failure, full-content replacement, optimistic concurrency, and immutable publish behavior.

- [x] 5.0 Implement student-safe Activity projections
  - [x] 5.1 Define the student-safe projection shape for runtime use.
  - [x] 5.2 Exclude answer keys until permitted through result/review policy.
  - [x] 5.3 Exclude teacher notes, authoring data, provenance internals, candidate data, and publish-only metadata.
  - [x] 5.4 Include only runtime-required interaction identity plumbing in a safe form.
  - [x] 5.5 Add projection tests proving hidden and authoring fields are absent.
  - [x] 5.6 Add negative security tests proving students cannot read authoring records directly.

- [x] 6.0 Implement semantic diff and grading/regrading classification
  - [x] 6.1 Implement `classifyActivityChange(oldVersion, newVersion)`.
  - [x] 6.2 Classify title/description/formatting/layout changes as no redo.
  - [x] 6.3 Classify same prompt/options plus point-value change as recalculation without redo.
  - [x] 6.4 Classify same prompt/options plus answer-key change as regrade without redo.
  - [x] 6.5 Classify rubric changes as teacher regrade without redo where applicable.
  - [x] 6.6 Classify prompt, choices, response shape, required source context, or interaction structure changes as redo-required where specified.
  - [x] 6.7 Add tests covering the PRD change table and examples.

- [x] 7.0 Add rules, indexes, backup coverage, and observability for new Activity data
  - [x] 7.1 Identify every new RTDB node or Firestore collection before writing data.
  - [x] 7.2 Add rules for owner-only authoring access and student-safe projection access.
  - [x] 7.3 Add malicious cross-owner and cross-student read/write tests.
  - [x] 7.4 Add indexes where queries require them.
  - [x] 7.5 Add backup coverage where required by the repo infrastructure rule.
  - [x] 7.6 Observability registry is N/A for Packet 1 because no UI routes, user-facing actions, or analytics-emitting workflows were added; service validation/publish/projection events remain pure domain operations until Packet 3+ UI/runtime integration.

- [x] 8.0 Enforce typed integration boundaries
  - [x] 8.1 Inventory touched Book/Material Catalog seams that currently use `// @ts-nocheck`.
  - [x] 8.2 Add a fully typed wrapper or remove the suppression before enforcing new Activity, Placement, manifest, source, or homework invariants through that seam.
  - [x] 8.3 Prohibit `// @ts-nocheck` in new Book Activity modules.
  - [x] 8.4 Run focused typechecking and tests proving typed boundaries reject invalid contract shapes.

- [x] 9.0 Preserve regression boundaries
  - [x] 9.1 Prove existing Book create/edit/publish behavior still works.
  - [x] 9.2 Prove existing Reading V2 and Listening code do not import from or depend on the new Book Activity module.
  - [x] 9.3 Prove existing material list/picker behavior remains stable for pre-existing material kinds.
  - [x] 9.4 Update `findings-book-activity-baseline.md` with final owner paths, test names, and unresolved risks.

- [x] 10.0 Complete corrective hardening before student runtime integration
  - [x] 10.1 Keep canonical `student_safe_projections` owner/super-admin readable only. Students must receive Activity content through a context-bound Book Delivery projection after entitlement resolution, not by enumerating canonical projections.
  - [x] 10.2 Keep launch, assignment, and result capability adapters `unsupported` until their owning packets implement and verify them.
  - [x] 10.3 Make validation strict and lossless: reject unknown keys and partially malformed nested arrays instead of filtering them; reconstruct every nested output from explicit allowed fields; enforce per-family payload/answer-key cardinality, duplicate rules, accessible text for non-text stimuli, and bounded serialized bytes/depth/counts/string lengths with path-specific errors.
  - [x] 10.4 Require candidate, previous draft, target Activity, material, owner, and draft identities to agree; require expected-revision CAS for every existing-draft update; publish through one atomic repository transaction that creates the immutable version, advances material pointer, and writes the projection—or commits none.
  - [x] 10.5 Separate browser-staged candidate/draft data from trusted canonical publication. Derive actor identity from authenticated server context, resolve current owner/admin management authority, and revalidate complete retained content/lineage/limits inside the trusted use-case boundary. RTDB acceptance or caller-supplied `validationState`, `ownerId`, or `publishedBy` is never domain proof.
  - [x] 10.6 Replace time/random default IDs with a cryptographically strong trusted ID provider in production adapters and add collision/idempotency tests.
  - [x] 10.7 Add failure tests for candidate owner/Activity mismatch, previous-draft mismatch, missing/stale expected revision, authority removal between draft and publish, direct client-authored normalized content, duplicate version ID, and partial publish failure.
  - [x] 10.8 Add scoring limits and invariants: finite non-negative maximum score, deterministic rounding/display policy, duplicate multi-choice key rejection, answer-key cardinality checks, and bounded submitted-answer shape. Persisted answer-key completeness/cardinality is separate from student-response validity: a non-empty unique in-range multiple-choice subset or superset is valid but incorrect, while omission is the sole unanswered representation.
  - [x] 10.9 Rework semantic change classification to compute all dimensions before selecting the highest-impact outcome from an explicit severity lattice. Include stimulus, asset refs, Task Profile, presentation mode, context/source semantics, points, answer key, and rubric; use order-independent structural comparison and add combined-change tests.
  - [x] 10.10 Reconstruct student-safe projections and nested stimulus/source/interaction objects from exact allowlists. Future/unknown fields remain private until explicitly added; add synthetic extra-field tests at each nested level and align persistence/rules validation with the projection contract.
  - [x] 10.11 Measure and bound candidate/draft/version/projection storage. Candidate staging is Worker-only and bounded; a candidate retains one raw correction payload until trusted save atomically consumes it, a draft retains one validated editable payload, immutable versions own normalized hidden/answer-item identities, and projections remain a necessary safe derivative. Score preparation builds canonical maps/sets once per attempt. Matching/ordering submissions use opaque system-owned item identities rather than display strings; label-only revisions retain positional item identities, while exact detected reorder/add/remove/family topology replacements mint new identities without fuzzy reconciliation.
  - [x] 10.12 Split structural Book embeddability from operational placement readiness. Keep `interactive-activity` operational placement fail-closed until a verified placement adapter, published-version resolver, and runtime launch path exist; reject registry boolean/adapter contradictions in tests.
  - [x] 10.13 Replace `JSON.stringify` equality in Activity publish/immutability checks with canonical structural comparison or canonical serialization that is property-order independent. Add tests using independently decoded equivalent objects, reordered keys, and one nested mutation.

### 10.4/10.5A+B local implementation record (2026-07-11)

- `activityAuthoring.service.ts` owns trusted draft save and publish. A published version, material pointer, student-safe projection, and HMAC-keyed operation ledger record are one `book_activity` root ETag/CAS replacement or none. The root scope remains deliberate: all required records are siblings, so a narrower REST ETag would not preserve the transaction without a schema migration and rules work.
- Candidate staging, draft save, and publish are trusted Worker mutations. Candidate/draft browser writes are denied because RTDB rules cannot prove serialized-byte limits. A candidate retains raw correction input only until save; save revalidates it, writes one HMAC-bound editable draft payload, and atomically consumes the candidate. Publish revalidates that draft and its saved HMAC before deriving the immutable normalized version/projection. Saved validation, ownership, lineage, and any undeclared payload are not proof.
- `crypto.randomUUID()` creates production draft, operation, version, and interaction identities. Older idempotent publications replay from immutable operation/version/projection lineage even after a newer version advances the material pointer.
- Task 10.5 corrective closure (2026-07-11): `users/{uid}` remains the one canonical role/status source because every existing RTDB rule, Auth consumer, Book Activity Worker, Listening Worker, and trusted Function already consumes it. Browser rules now permit only exact-active student first-profile bootstrap, preserve role/status/roles/forceReauth/`privilegedAuthorityRevokedAt` on later self/admin profile edits, deny profile deletion, and freeze `users` plus `user_authority_audit` at the root ancestor boundary. Trusted deletion removes profile PII but retains a minimal disabled, fenced UID tombstone plus immutable audit, so the UID cannot re-enter first-profile bootstrap. Email promotion, caller-selected registration roles, generic profile authority writes, and client invite promotion no longer create authority. Role/status/delete and teacher-invite redemption use authenticated `/user-authority/mutate`; current exact-active, unfenced super-admin authority is re-read. Demotion/block atomically writes a privileged-revocation fence with the audit, explicit trusted regrant clears it, and invite completion never clears status or fence. Therefore claim/completion and trusted-delete races cannot restore effective teacher authority after removal. Invite codes are super-admin-readable only. Emulator proof first demonstrated the old delete/recreate escalation, then proved self-promotion, first-profile teacher/admin creation, browser and trusted-delete/recreate, role/status/roles/forceReauth/revocation-fence/uid, invite enumeration, ancestor/multi-location, unauthorized admin, every non-active status, and audit-forgery denials plus trusted assignment. Worker proof shows authority removal before Activity publish returns forbidden and leaves material/version/projection/operation publication paths unchanged.
- Authority inventory reconciled in this closure: RTDB enforcement (`database.rules.json`); login/bootstrap/effective-role projection (`AuthContext`, `PrivateRoute`); generic/admin management (`userService`, admin user-management hooks/page); profile/registration/deletion/invitation (`profileService`, `accountDeletionService`, `invitationService`); trusted Book Activity and Listening Cloudflare Workers plus the retained Listening Function; ancillary client readers (`firebaseQueryOptimizer`, `classManager`, `reportingService`); and operator bootstrap (`scripts/setup-admin.js`). Direct authority writers are now limited to exact student bootstrap, the authenticated authority Worker, or an explicitly audited one-time operator bootstrap. Ancillary readers consume the full exact-active/unfenced profile rather than `/role` alone.
- Revocation consistency is request-bound, not atomic with Activity publication: a demotion/block and its fence are one authority/audit mutation. A fence committed before the Worker's fresh authority read denies that request and all later privileged requests, including a raced invite completion; only explicit trusted regrant clears it. Revocation after the read may race with and allow the already-authorized in-flight `book_activity` CAS to finish because authority lives outside that CAS. No atomic-revocation claim is made.
- Task 10.8/10.9 hardening closure (corrected 2026-07-11): `activityScoring.service.ts` owns one canonical scoring policy. Maximum and earned scores are finite, non-negative, capped at 10,000, rounded half-up to two decimal score units, persisted as those numeric values, and displayed with two fixed decimal places. Persisted objective keys remain complete, unique, in-range, and family-valid. Submitted multiple-choice responses do not know key cardinality: any non-empty unique in-range array is structurally valid; an unequal subset or superset scores zero; the exact set in any order receives full credit. Omission is the one unanswered representation, while empty, duplicate, non-integer, out-of-range, non-array, oversized, unknown, or dual-alias input fails closed. Rubric Activities return no automatic numeric score and remain pending teacher review. Task 10.9's named severity lattice and all-reason analysis are unchanged.
- Task 10.10 projection closure (2026-07-11): `activityProjection.service.ts` rebuilds root, projection-specific stimulus/source/pair objects, every interaction family, and every array from exact allowlists; unknown canonical fields are not copied and malformed visible values fail closed. Stored replay is accepted only when the exact projection validates and canonically equals a fresh projection regenerated from its immutable version and stored `generatedAt`. RTDB rules add exact object allowlists and typed numeric-index containers while keeping root ancestor protection, `.write: false`, owner/super-admin canonical reads, and student denial. Privileged Worker writes bypass RTDB validation, so native array identity/order/contiguity/counts, byte/depth bounds, and cross-field semantics remain trusted schema/Worker responsibilities.
- Task 10.11 closure (2026-07-11): `activityStorage.service.ts` limits editable content to 81,920 UTF-8 bytes and complete candidate/draft records to 86,016 bytes, immutable version/projection records to 114,688 bytes, and operation records to 8,192 bytes. The reproducible x64 fixture measures representative candidate/draft/version/projection records at 3,610/3,647/12,876/4,798 bytes and synthetic worst-permitted bounded records at 82,093/82,130/91,359/75,090 bytes; the version exercise uses 50 hidden identities at the accepted 160-character ceiling. The former two-full-payload candidate/draft shape measures 164,034/173,321 bytes at that same content bound; the single-payload design reduces those to 82,093/82,130. Limits are checked before trusted stage/save/publish CAS writes and projection construction/replay reads. Matching/ordering key labels must exactly name the declared editable items; after normalization only opaque IDs score. Item IDs are ordinally stable through label/localization/reformat edits, replace for family/cardinality changes or an exact detected display-row permutation, and never use trim/case/fuzzy cross-label matching. A simultaneous complete relabel plus row reorder has no trusted cross-row evidence, so it is deliberately a positional label revision (Task 10.9 still classifies its semantic content change redo-required) rather than a fabricated reconciliation. RTDB rules deny candidate/draft browser writes but cannot prove JSON bytes, depth, native array shape, identity/order, or cross-field semantics; those remain trusted Worker/schema duties. No compatible deployed Activity rows exist in the Packet 1 feature state, so no migration/backfill is required; legacy normalized rows are rejected at trusted reads. The full-root CAS still has unbounded historical root-growth/retry risk; retention/aggregate partitioning is explicitly later operational work, not claimed bounded here. At this Task 10.11 record, no attempt storage/preprocessing or Task 10.12 work had begun; the append-only Task 10.12 record below states current closure.
- Before the Task 10.12 record below, Component 01/10.0 remained open only for unchecked hardening Task 10.12; Tasks 10.4/10.5 and 10.8-10.11 remained locally verified. Deployment/readback remained—and remains—a separate gate because this change set does not deploy.

### Task 10.12 and 10.0 corrective closure (2026-07-11)

- `embeddableInBook` now means structural Book representation only. `operationalPlacementReady` is the sole registry authority for create/publish/resolve/launch of an Activity placement, and requires a registry-owned placement adapter, immutable published-version resolver, and runtime launch adapter together.
- Current production `interactive-activity` remains structurally embeddable and has its Packet 1 projection seam, but is `operationalPlacementReady: false`; all three operational dependencies remain `unsupported`. `validateBookActivityBookStructure` may validate its structural ref shape, while `authorizeBookActivityOperationalPlacement` and the historical `validateBookActivityBookIntegration` alias reject it fail-closed.
- Registry-owned `playable`, `assignable`, and `gradable` booleans must exactly match their adapter declarations. Placement/resolver declarations must form the complete readiness contract, field-specific adapter IDs are checked, and `legacy-external` rows cannot claim registry readiness or registry adapters. Existing full-test/listening/writing/THCS/book booleans retain their legacy owners without invented adapters.
- Focused registry and Book-boundary tests prove structural-but-not-operational Activity shape, rejected current production readiness, rejected one/two dependency declarations, a fully coherent injected row, boolean/adapter/resolver/readiness contradictions, and no direct `materialKind === 'interactive-activity'` comparison in the Book placement boundary. Material Catalog and Book regressions remain required in the Packet 1 proof table.
- Residual owner is explicit: Component 03 / Task 3.0 must implement the real placement adapter and pinned placement contract; Component 04 / Tasks 1.0-2.0 must implement Book Delivery's immutable version resolution and runtime launch. Only their jointly verified integration may flip `operationalPlacementReady`; this Task does not implement placement, resolver, launch, assignment, result, or student delivery.
- Historical note superseded by 2026-07-13 P1 revalidation: Task 10.12 was reopened because live production readiness had drifted beyond the P1 boundary. Current source restores fail-closed production readiness. Ordered specification and quality reviews passed, and final packet-exit proof accepted Tasks 10.0 and 10.12 locally. This is not deployment, remote readback, Packet 2 completion, or later-packet runtime readiness.

### Packet P1 verification record (2026-07-13)

- Verdict: `VERIFIED`; proof classification is `VERIFIED_LOCAL_FAITHFUL` plus actual local Firebase emulator and localhost browser proof. No remote/deployed claim is made.
- Specification review first found and then accepted corrections for public Activity-summary leakage and unsafe picker/legacy attachment bypasses. Independent code-quality review passed with no blocking finding.
- Consolidated source proof passed 22 files/164 tests; isolated Book UI proof passed 1/4, 1/24, and 4/33 files/tests; actual emulators passed Book Activity 5/5 and Material Catalog 24/24; Activity-authoring Worker passed 14/14; backup/restore passed 6/6; focused strict TypeScript passed; dependency isolation passed 2/2.
- Browser proof at `http://localhost:5173` used the teacher quick-login session, opened a real private Book, exposed the picker through an unsaved section, observed legacy Reading Passage/full-test candidates and no console warnings/errors, then discarded changes and confirmed the Book remained `draft-empty`. No Activity summary existed in remote data, so Activity-row discovery is local source/component proof, not remote proof.
- `rtk node documentation/tasks/PRD0062b/check-canonical-plan.mjs` passed. Historical `npm run check:prd0062` still fails only the preserved C02 checked-parent/open-child `7.0`/`7.6` to `7.6c` condition and was not repaired.
