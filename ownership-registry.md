# PRD0062 ownership registry

This registry records final proof owners and destination-first transfers.
Published issue bodies remain authoritative. Update both when ownership moves.

## Global proof classes

| Proof class | Final owner |
| --- | --- |
| Domain model, pure validation, local unit/property proof | Domain ticket |
| Fragment content and fragment-level negative proof | Fragment-producing domain ticket |
| Generated `database.rules.json`, assembled emulator suite, active rules readback, rules rollback | #118 / 09E |
| Top-level Worker route composition, live route reachability, active Worker/config/gate readback, fail-closed route probes, route rollback | #59 / 09D |
| Feature-specific browser behavior on an already-owned shell | Feature ticket |
| Structural Book Runtime shell, shell navigation, launch/reload structure | #73 / 22B |
| Deployed integrated drills and pre-pilot decision | #134 / 51E |
| Controlled pilot evidence and release decision | #136 / 52B |
| Final cross-ticket browser/security/recovery suites | #128–#133 / 51B1–51D2 |
| Capability activation and positive trusted-action proof | Published activation owner |

## Transfer ledger

### #25 Materials creation

Kept in #25:

- Materials creation/persistence;
- legacy fallback;
- immutable mode;
- fail-closed PDF denial while 50A is all-deny.

Moved to activation owner (#126/50B or published successor):

- positive PDF creation proof after generated rules and trusted seams complete.

Moved/confirmed in #118:

- generated rules composition, emulator, deployment readback, and rollback.

### #31 Book Delivery

Kept in #31:

- lifecycle, CAS, authorization, repository, handlers;
- `08B.json` fragment and fragment-level negative tests;
- domain service-identity declaration.

Moved to #118:

- generated rules proof;
- assembled emulator proof;
- active rules hash/readback;
- generated-rules rollback artifact;
- legacy-path preservation.

Moved to #59:

- live top-level route composition;
- deployed Worker-to-Firebase identity integration.

### #35 Activity candidate

Kept in #35:

- lifecycle, CAS, authorization, repository, handlers;
- `12C.json` fragment and fragment-level negative tests;
- domain service-identity declaration.

Moved to #118:

- generated rules proof;
- assembled emulator proof;
- active rules hash/readback;
- generated-rules rollback artifact;
- legacy-path preservation.

Moved to #59:

- live top-level route composition;
- deployed Worker-to-Firebase identity integration.

### #55 Assembly candidate

Kept in #55:

- exact RTDB path contract;
- `13A.json` fragment and static/fragment-level negative tests;
- scoped repository/CAS tests;
- handler authorization and identity expectations;
- local rollback proving mutations disable while safe reads remain;
- no publish, delivery binding, Mode 1, 50A, or 03B activation.

Moved to #59:

- canonical top-level Assembly route composition;
- deployed Assembly route reachability;
- active Worker version/config/readback;
- fail-closed disabled-route probes;
- route-level rollback proof.

Moved/confirmed in #128/#134:

- positive disposable Assembly save/reload through the canonical Worker route;
- positive current Book/Source Set/Source Version/candidate readback through an
  enabled canonical route;
- deployed Worker-to-Firebase Assembly identity integration after scoped
  provisioning and activation.

Moved to #118:

- generated `database.rules.json` proof;
- assembled emulator enforcement for Assembly paths;
- active rules deployment/hash/readback;
- generated-rules rollback artifact;
- legacy-path preservation after Assembly fragment composition.

### #74 Book Runtime commands

Kept in #74:

- strict runtime command schema;
- authenticated actor and Delivery binding revalidation;
- injectable schedule-policy seam, including explicit unscheduled Solo behavior
  and missing Homework policy fail-closed behavior;
- runtime repository CAS drafts, immutable attempts/results, idempotency,
  bounded indexed reads, and privacy-safe receipts;
- `28A.json` fragment and fragment-level negative proof;
- disabled route descriptor under the #59 dispatcher seam;
- local Worker, route, repository, authorization, schedule, and service-identity
  proof.

Moved to #134:

- deployed negative suite proving only configured Worker identity can mutate
  disposable runtime rows;
- browser tokens, wrong service claims, stale bindings, malformed commands, and
  sensitive-metadata logging denial in deployed/canary environment;
- active deployed route/config/readback and runtime command rollback drill after
  activation/provisioning authority.

### #70 Unpublished source-strategy migration

Kept in #70:

- trusted source-strategy migration planner and explicit source-qualified local
  page remap/reconciliation proof;
- unpublished-only Full-PDF/component-PDF migration command, staged candidate,
  CAS/idempotency, explicit confirmation/discard, and migration metadata;
- browser teacher fixture proof for both directions, reload/cancel behavior,
  source-byte preservation, mobile layout, and 200% zoom.

The canonical migration route remains a disabled #70 contributor seam under
#59's dispatcher. #56/#32 retain Source Version and Book/Source Set authority;
#118 retains assembled generated-rules proof. #134 owns any positive deployed
disposable migration, identity/readback, cleanup, or operational rollback drill;
#70 does not enable a trusted action, #50A, #03B, or private-B2 capability.

## Current ownership checks

- #56 owns hierarchy/source workspace behavior and local 13A-client proof.
  #56 also owns browser-safe Source Version, current Book/source-set revision,
  and candidate discovery/readback in its fixture-backed workspace. #59 owns
  deployed canonical route composition. #118 owns assembled rules.
- #54 owns the reusable PDF viewer/viewer-host seam, viewer-local lifecycle,
  accessibility, focus, abort/retry/revocation, security, and memory proof.
  #73 owns assembled student launch, Delivery, canonical route/CSP, and
  integrated PDF transport proof.
- #59 owns fixed route-manifest/top-level dispatcher composition, generic
  auth/rate/CORS/gate enforcement, seam registration, active Worker/config/gate
  readback, fail-closed route probes, and route rollback. Positive domain
  mutation/read drills and activated Worker-to-domain-identity proof remain with
  #128/#134 or the published activation/integration owner. #86 owns Book
  Homework saga behavior and its route-specific teacher/student/deployment/
  rollback proof. #59 also owns canonical #63 preview/approval descriptor
  composition and handler binding; it must preserve generic deny probes and
  route rollback without making #63 edit the top-level Worker. #59 also owns
  the canonical Full-PDF/component-PDF publication descriptors and handler
  binding, including injection of #64's durable Firebase publication repository.
  #65/#66 retain strategy adapters and local teacher publication proof; #118
  retains generated-rules proof; #134 retains deployed/canary publication,
  identity, cleanup, and rollback drills.
- #70 owns unpublished source-strategy migration planning, explicit page
  remapping, staged candidate CAS/confirmation/discard, migration-specific
  local Worker/browser proof and source-byte preservation. It consumes the
  #55/13A fragment-level deny boundary and #118 assembled-rules proof. Its
  route is disabled by default and contributes to #59's dispatcher. #134 owns
  positive deployed/canary migration execution, identity/config/version/hash
  readback, assembled-rules readback, pointer/context proof, cleanup, and
  operational rollback. #70 does not own activated publication, generated
  rules, private-B2, or deployed canary proof.
- #71 owns published source-strategy successor behavior: separate successor
  identity/publication lineage, reuse of #70 explicit source-qualified remap
  validation and #65/#66 immutable publication adapters, predecessor/context
  continuity, CAS/replay/crash/rollback, rules-fragment, impact-input, and
  teacher browser proof. #59 retains canonical route composition; #118 retains
  assembled generated-rules proof; #73 owns assembled student
  predecessor-binding proof; #134 owns deployed/canary successor execution,
  identity/config/version/hash readback, cleanup, rollback, and recovery.
  #71 does not claim deployed proof or automatic context switching.
- #67 owns published mapping-revision behavior without Activity reimport:
  mapping-only split/merge/reorder/default/reference decisions, stable Activity
  and Activity Version references, new Placement lineage, bounded impact input,
  source-assisted fresh-preview enforcement, CAS/replay/crash/rollback through
  the common primitive, local rule/Worker proof, and teacher localhost browser
  proof. #64 owns the common durable publication repository and conformance
  proof after its repair; #59 owns canonical Full-PDF/component publication
  route composition and repository injection after its repair; #118 owns
  assembled generated-rules proof; #134 owns deployed/canary mapping proof;
  #73 owns assembled student binding/runtime proof. #67 makes no durable
  production, deployed, trusted-action, private-B2, #50A, or #03B claim.
- #68 owns Activity-revision behavior and local proof: full replacement import,
  candidate/CAS/conflict recovery, semantic diff and bounded impact, exact
  source-assisted preview, immutable old/new Activity Versions, stable Activity
  and compatible Placement lineage, projection/security, local Worker/rules
  fragment, teacher localhost browser, and local rollback proof. #118 owns the
  generated revision fragment composition, complete assembled emulator,
  active-rules hash/readback, generated-rules rollback, and legacy preservation.
  #134 owns approved-activation deployed/canary revision publication,
  identity/config/version readback, cleanup, recovery, and emergency gate
  rollback. #73 owns assembled Student old-version/current-context proof. #68
  makes no generated-root, assembled-rules, deployed, activated, or operational
  rollback claim.
- #63 owns teacher candidate-preview projection/host/input, approval record,
  local Worker/security proof, fixture-safe component/browser proof, and
  preview-control rollback. It consumes the shared frame/registry and viewer
  seams; it does not own canonical dispatcher composition, activated
  teacher-browser evidence (#128), deployed/canary drills (#134), or the
  structural student runtime shell (#73).
- #64 owns the strategy-neutral publication primitive and adapter-neutral
  common Worker-boundary proof, including the durable Firebase RTDB
  `FirebaseRestBookAssemblyPublicationRepository` and its ETag-CAS conformance
  tests. #65/#66 own teacher-facing adapter publication
  proof; #72 owns server-side Book Delivery projection resolution and
  pinned-identity contracts; #73 owns the assembled student proof for the #64
  current-pointer/student-safe projection and publication/binding visibility
  from #65/#66/#67/#68/#71. Those source tickets retain teacher workflows,
  adapter contracts, immutable-record tests, and no student-shell launch claim.
- #74 owns the Book Runtime trusted command seam: strict schemas, actor and
  Delivery binding revalidation, schedule policy, local repository CAS/append/
  idempotency, route descriptor, disabled gate, fragment, and local Worker/
  service-identity proof. #75/#76 own browser autosave/submission workflows,
  #73 owns assembled student-shell proof, #118 owns assembled generated rules,
  and #134 owns deployed/canary runtime identity, cleanup, and rollback drills.
- #38 owns choice/text-entry renderers, codecs, registrations, and their focused
  accessibility tests, read-only/review/malformed-input behavior,
  normalization/serialization proof, component responsive CSS/200% zoom
  checks, production registration loading, and unsupported-registration denial.
- #73 owns Student quick-login at `http://localhost:5174`, full
  `BookRuntimeShell` structured/source-assisted fixtures, desktop/mobile shell
  navigation and browser 200% zoom, plus production route, Delivery projection,
  PDF transport, and assembled registry integration.
- #39 owns matching and ordering renderers/codecs, component-level accessibility
  and responsive proof, canonical validation/serialization, supported-row
  registration, unsupported-registration denial, and local rollback. #73 owns
  #39's transferred integrated browser proof: Student quick-login, assembled
  shell fixtures, pointer/keyboard/touch runtime operation, navigation, and
  browser-level 200% zoom.
- #40 is closed under the repaired generic-registration boundary: canonical
  `profile:null` long-response registration satisfies #36's generic contract
  without claiming an IELTS Reading/Listening matrix row. Profiled or invented
  IELTS long-response registration remains rejected. #73 owns the transferred
  assembled Student quick-login, drafting/restoration, pending-review,
  navigation, browser-level zoom, and no-objective-scoring proof.
- #41 owns Reading V2/Listening public-export adapters, exact supported-matrix
  conversion, authorization-reference preservation, dependency-direction
  proof, and native-domain regressions. #73 owns assembled Book-shell loading,
  Delivery/authenticated transport, route/CSP integration, quick-login, and
  browser responsive proof for adapted fixtures.
- #51 owns the server-only document authorization decision: current Firebase
  identity/profile, current Delivery/pinned Source Version resolution,
  publication/context/revocation denials, and document-ledger retirement.
  #59 owns top-level route composition and deployed Worker identity/config
  readback; #09B/#54/#73 own byte transport, viewer, and assembled browser
  proof. #51 never returns provider storage identity, credentials, signed
  authority, or PDF bytes to browser-safe payloads.
- #53 owns browser-only document transport implementation and transport-local
  role-port fixture proof: Firebase token per HEAD/GET/range/retry, metadata
  validation before stream exposure, bounded range streaming, abort/timeout/
  source-switch cleanup, redacted typed failures, no token/provider/PDF byte
  storage, and no direct B2, bearer URL, iframe, or whole-buffer fallback. #59
  owns deployed canonical document-route composition, live route reachability,
  active Worker readback, fail-closed document-route probes, and route rollback.
  #134 owns deployed positive document-byte drills after activation/provisioning.
  #73 owns assembled student-runtime proof through #53/#54 transport/viewer,
  Delivery projection, production route/CSP, quick-login, redacted network
  behavior, retry/abort/resume, copied/anonymous/direct-B2 denial, and console
  review.

## Dependency repair ledger

- #64 consumes a typed preview-approval contract; #63 is a contributing
  producer and is not a hard prerequisite for the common publication
  primitive.
- #68 depends on #64 for strategy-neutral publication and does not depend on
  #65's full-PDF initial-publication workflow.
- #71 depends on #65, #66, and #70; #67's separate mapping-repair workflow is
  not a hard prerequisite for successor publication.
