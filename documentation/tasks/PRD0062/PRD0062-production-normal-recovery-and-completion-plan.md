# PRD0062 Production-Normal Recovery and Completion Plan

Status: controlling recovery and completion execution plan
Prepared: 2026-08-14
Workspace: `/home/iamhuwng/worktrees/prd0062-production-normal-20260813-v2`

This revision supersedes the prior execution sequencing at this path. It does not supersede PRD0062 product requirements, accepted amendments, repository or platform safety rules, or append-only historical evidence.

Accepted current amendment governing the discovered Book Homework compatibility/projection/composition/review/handoff boundaries:
- `documentation/tasks/PRD0062/PRD0062-architecture-and-delivery-amendment-2026-08-15.md`

## 1. Purpose

Finish PRD0062 as quickly and safely as possible by recovering the existing production-normal path first, then closing only the remaining canonical PRD0062 acceptance gaps.

The governing principle is:

> Verify what already exists, reproduce only demonstrated failures, fix the owning seam, and avoid new architecture unless repeated evidence proves the current boundary is fundamentally wrong.

The deliverable is working product behavior. Tests, hashes, packets, logs, and deployment records are supporting gates and evidence, not substitutes for that behavior.

The next primary milestone is user-visible: get the real site into a safe production-normal state where the user can sign in and exercise the representative PRD0062 flow personally. Internal recovery work must converge toward that browser handoff rather than becoming an open-ended sequence of code-only diagnostics.

This plan intentionally avoids creating another orchestration framework around PRD0062.

### Agent operating charter

The Codex thread is the implementation and execution owner. The user grants standing authority to complete PRD0062 within this plan's scope, including investigation, source and test changes, local repair, builds, exact evidence generation, inactive Worker validation, generated-rules deployment, bounded activation, required production data reconciliation, production workflow execution, rollback on failure, bounded cleanup, commit, push, and PR creation where repository and platform policy permit.

This standing authority does not override repository rules, platform-enforced approval, credential limits, branch protection, destructive-operation safeguards, or the requirement for explicit approval before direct mutation of `main`. Pause only when required credentials or tools are unavailable, a destructive target cannot be identified safely, current state materially changes the target outcome, or the required correction materially exceeds PRD0062.

## 2. Scope Boundary

This plan has two separate completion levels.

### 2.1 Production-normal recovery

Production-normal recovery is complete when one representative existing Book/Source/Activity path works end to end in production:

1. The verified PDF remains attached to the intended Material Book and Source Version.
2. The existing Activity candidate/version is recovered without duplicate Activity state.
3. The canonical tuple `{ownerId, bookId, unitKey, activityKey}` resolves to the intended Activity.
4. Preview reads the canonical Book, Source Version, Activity, candidate, binding, and approval state.
5. Approval and revocation work durably.
6. Publication preflight rejects stale, revoked, and wrong-source inputs.
7. Approved publication creates the intended immutable publication state exactly once.
8. One normal assignment is created using an explicit schedule and policy.
9. Teacher and student paths consume the published result through the Book ↔ Homework bridge, including one representative Homework → Book return trip where a bounded assignment locator plus authenticated actor is enriched from authoritative Book sources before trusted Book read/Runtime consumption. No Book-required field is invented from the compatibility shell.
10. Production remains active only when the positive path and required negatives pass; otherwise the exact rollback path is used immediately.

These conditions prove that the current production integration is healthy. They do not by themselves prove full PRD0062 completion.

### 2.1.1 User-visible recovery milestone

As soon as the production-normal path satisfies the bounded safety gates in Phase C, hand the real site back to the user for direct browser testing before beginning a broad remaining-acceptance audit.

The handoff must include:

- the exact site/origin to open;
- which teacher and student identities/roles to use;
- the shortest representative flow to exercise from source/activity through publication, assignment, and consumption;
- any known limitations that remain outside the recovered normal path; and
- the exact rollback/reporting rule if the user encounters an unexpected 5xx, authorization failure, missing state, duplicate state, or broken teacher/student experience.

The purpose of this milestone is to restore product feedback from the actual UI. Do not keep the user waiting for every documentation, cleanup, or full-acceptance task once the normal path is safe enough to use.

### 2.2 Full PRD0062 completion

PRD0062 is complete only when the active canonical V1 acceptance criteria and Definition of Done are reconciled against current source, deployed behavior, and accepted evidence, and every remaining required behavior is either:

- demonstrated as working; or
- explicitly identified as future scope by the governing PRD rather than silently deferred.

This includes the wider Assembly, Runtime, Homework, selective-update, notification, Course/Class, accessibility, security, compatibility, and pilot requirements not fully represented by the production-normal recovery path.

Before Phase E, the state ledger must name the exact paths for the governing PRD requirement body, `documentation/tasks/PRD0062/PRD0062-architecture-and-delivery-amendment-2026-08-15.md`, any other accepted amendments, the acceptance matrix, and the Definition of Done. Historical task documents that conflict with those named authorities are diagnostic input only.

## 3. Architecture Decision

### 3.1 Freeze the product architecture

Do not redesign the PRD0062 domain model. Retain:

- the existing Book system;
- verified immutable Source Versions;
- first-class immutable Activity versions;
- the canonical server-owned Activity binding;
- durable approvals and revocations;
- stale, revoked, and wrong-source fences;
- idempotent operation receipts;
- generated least-privilege RTDB rules;
- rollback-safe Worker activation; and
- existing Book Delivery, Runtime, Homework, Course/Class, and result ownership boundaries.

The observed production failures do not justify replacing Firebase or Cloudflare Workers, merging service identities, introducing a second Book model, collapsing all authorities into one object, adding a generalized rollout system, or performing a broad route/schema rewrite.

### 3.2 Do not create a new orchestration abstraction unless forced

Workflow names such as `attachVerifiedSource`, `saveActivityAndBinding`, `prepareApprovedPublication`, and `publishApprovedUnit` are conceptual boundaries only. They are not an implementation requirement.

Prefer the routes, services, repositories, and durable receipts that already exist. Add or deepen a boundary only when a reproduced failure proves that the existing seam cannot be made correct with a bounded change. A cleaner API alone is not a reason to refactor during recovery.

## 4. What the Failure Chain Demonstrated

The repeated rollbacks point to production-contract drift, not failed product architecture.

| Failure class | Actual lesson | Fix level |
| --- | --- | --- |
| Route/body/claim mismatch | Production request scope was assembled differently across layers | Canonical composition fix |
| Production authority reader missing/defaulted | Focused tests did not exercise default Worker composition | Default-composition test |
| Undefined renderer/config value | Tests injected dependencies production never had | Deployable-config validation |
| Function-valued Worker dependency | Wrangler cannot supply arbitrary JavaScript functions | Composition/config correction |
| Firebase token exchange/referrer failure | Live auth assumptions were unproven | Shared token-exchange boundary fix |
| Global RTDB validator blocked unrelated writes | One producer rule coupled independent domains | Owning rule-fragment fix |
| RTDB removed `null` and empty arrays | Repository assumed in-memory JSON equaled RTDB wire JSON | Read-boundary hydration/codec fix |
| Activity saved but binding missing | A durable multi-step operation needed replay/reconciliation | Existing operation-receipt recovery |
| Binding creation failed before PUT | Exact-leaf read rule denied the null ETag read | #118C leaf-rule fix |
| Local green, production red | Tests proved modules rather than deployed protocol | Exact production-shaped harness |

Future failures follow the same loop:

1. Reproduce the exact failing protocol locally.
2. Identify the owning seam.
3. Patch the root cause there.
4. Add one regression that would have caught it.
5. Rerun the production-shaped gate.
6. Regenerate any invalidated deployment identities.
7. Retry production.

Do not compensate at unrelated call sites.

## 5. Verify Existing Implementation Before Redesign

The recovery worktree already contains candidate implementations for items previously described as future phases:

- #118C absent-binding-leaf read behavior;
- exact Activity-scoped binding claims and sibling denial;
- save/bind durable receipt states including `binding-pending`, `complete`, and `binding-conflict`;
- replay repair after Activity commit with a missing binding;
- RTDB hydration for demonstrated lossy values;
- an exact/default `createUploadWorker()` production-normal workflow test; and
- generated-rules production-normal emulator coverage.

Treat these as candidate completed fixes, not tasks to rebuild. The first job is to prove whether they are correct and complete. Do not redesign them merely because a conceptual model appears cleaner.

## 6. Execution Rules

- **No speculative refactors.** A code change must solve a reproduced blocker or directly missing PRD requirement.
- **No duplicate durable data to escape failure.** Reuse the existing Source Version, candidate, Activity, operation receipt, and publication state where valid.
- **No new worktree or dependency installation by default.** Use the existing recovery worktree and installed environment unless a concrete tooling failure requires otherwise.
- **No evidence work before behavior is proven.** Evidence records the result; it must not become the implementation workflow.
- **No repeated architecture review after every bounded fix.** Use one final review at a meaningful commitment boundary.
- **No broad IAM change for a narrow defect.** Prefer the existing least-privilege identity and owning rule seam.
- **No production rerun without deployment-equivalent reproduction of the last demonstrated production-only failure.** The reproducer must exercise the same production composition boundary closely enough that the previously deployed failing implementation goes red with the same failure class; a green Node/unit/emulator suite alone is insufficient when it bypasses that boundary.
- **No known durable commit hidden behind a generic 500.** Preserve and return enough operation state for safe retry.
- **Rollback immediately on demonstrated production failure.** Preserve durable partial data and reconcile it on retry.
- **Historical evidence is append-only.** Never overwrite consumed approval packets, execution results, or accepted proof; create a superseding artifact when needed.
- **Proof classes remain distinct.** Local, emulator, dry-run, deployed/current, browser, and rollback proof are not interchangeable.

Current user direction governs the recovery objective within repository, platform, credential, branch-protection, and destructive-operation safety constraints.

## 7. Phase A — Converge Actual Current State

Perform one read-only convergence pass. Record only what is required to execute:

- branch, HEAD, upstream, and dirty/untracked recovery paths;
- active production Worker deployment, version, traffic, and relevant bindings;
- active RTDB rules identity;
- current Material Book and Source Version state;
- current Activity candidate revision and lifecycle;
- current saved Activity/version;
- current save-operation receipt;
- current canonical binding;
- current approval/publication/assignment state; and
- the exact last demonstrated failure.

Historical session state is input only. Current local and remote state wins.

Important historical operation:

`62e20638-b575-4f12-8d10-243a356103c3`

Reuse it only if current durable state confirms it remains the correct incomplete save/bind operation.

### Completion criterion

Produce a short state ledger containing:

- what is already durably committed;
- what is missing;
- the exact seam currently blocking progress;
- the existing code/test intended to fix it; and
- the exact governing product and acceptance documents for later Phase E reconciliation.

No source change occurs in this phase.

## 8. Phase B — Verify Existing Recovery Fixes

Before writing new implementation, run the smallest decisive tests around the existing changes.

Required proof:

1. Exact scoped read of an absent binding leaf succeeds.
2. Sibling, parent, wrong-scope, wrong-Activity, and browser binding access remains denied.
3. First conditional binding create succeeds through the repository's ETag/`If-Match` protocol.
4. Save with post-Activity binding failure records a retryable durable partial state.
5. Replay with the same operation ID repairs the missing binding without another Activity or candidate.
6. RTDB-omitted normal values are rehydrated only at repository boundaries.
7. Malformed and rejected variants still fail closed.
8. Default `createUploadWorker()` production-normal composition passes with production-deployable configuration.
9. For Book Homework, a deployment-equivalent/workerd contract test exercises `createUploadWorker()` -> the canonical assignment route -> default `createBookHomeworkProductionRuntime()` composition without injecting a saga implementation or low-level transport dependency.
10. The production-shaped harness validates exact token claims, REST request shapes, lossy RTDB behavior, populated unrelated roots, and partial-success replay.
11. Generated rules pass the focused emulator proof and full relevant matrix with populated unrelated roots.

After any production-only failure, the deployment-equivalent harness must first prove that the previously deployed failing implementation goes red with the same failure class before a corrective implementation is accepted as causal. If the previous implementation also passes that harness, the harness is not yet sufficient and production must not be used to discover the next diagnostic step.

For the current Book Homework recovery, the uploaded V18 `fetchImpl` wrapper is not eligible for activation merely because existing suites are green. The V17 production failure must first be reproduced at the default Homework production-composition boundary; only a correction that turns that exact regression green may proceed toward Phase C.

If these tests pass, do not refactor unrelated areas. Move directly to predeployment readiness. If one fails, fix only that failing owning seam and rerun this phase.

## 9. Phase C — Freeze and Execute Production Recovery

### 9.1 Freeze exact identities and execution inputs

Before any production mutation, create a new dated, append-only checkpoint containing:

- source commit, branch, and exact dirty-state identity;
- exact Worker source/bundle hash, size, and compressed size;
- exact activation and rollback config hashes and expiry;
- exact generated-rules hash and producer-fragment/composer identity;
- exact inactive activation and rollback version IDs after upload;
- test commands and results tied to those identities;
- required configuration names, service identities, renderer registry identity, and secret presence without secret values;
- current durable production state and reconciliation operation ID;
- exact frozen production-request path and SHA-256, plus a byte-for-byte gate that reads those literal bytes through the canonical parser, canonical route, and default production runtime;
- explicit execution order and rollback triggers; and
- reference to the standing authority in this plan.

Freeze these normal-use inputs before activation:

- teacher ID;
- student ID;
- class ID;
- Book ID;
- Source Version ID and source key;
- unit key and Activity key;
- candidate and existing Activity identities;
- assignment ID;
- due date;
- schedule/policy;
- presentation title/description snapshot; and
- placement/context.

Any later source, config, rule, bundle, or frozen-input change invalidates the checkpoint and requires regeneration before execution resumes.

The production request is a frozen input, not an example to reconstruct at execution time. Before activation, the exact checkpointed request bytes must pass the canonical parser and route through the default deployment-equivalent runtime. A test object assembled separately from those bytes does not satisfy this gate.

For a committed-projection repair replay, that exact-byte gate must seed the same authoritative state class as production: committed root, committed exact recipient authority, active Delivery, and absent compatibility shell. The literal replay must repair/read back the shell without creating new authoritative assignment state. The same deployment-equivalent gate must also prove the minimum browser return path from shell locator + authenticated actor through authoritative context enrichment to trusted Book consumption.

### 9.2 Validate inactive rollback and activation versions

Use this exact order:

1. Confirm supported Firebase browser authentication through `http://localhost:5173` or `http://localhost:5174` as appropriate and the production Worker origin.
2. Build and dry-run activation and rollback from the intended Worker source.
3. Upload the rollback Worker as an inactive version.
4. Upload the activation Worker as an inactive version.
5. Inspect both inactive versions and their bindings.
6. Prove both start and serve their expected health/preflight behavior without production traffic.
7. Stop if either inactive identity differs from the frozen checkpoint.

### 9.3 Execute the bounded production run

After inactive validation:

1. Deploy the exact frozen generated rules.
2. Read back and verify the deployed rules identity.
3. Activate the exact frozen Worker version.
4. Reconcile the incomplete Activity-save/binding operation instead of creating another Activity.
5. Read back the canonical binding.
6. Continue preview.
7. Exercise wrong-source and stale denial.
8. Grant approval and verify publication preflight.
9. Exercise revocation.
10. Re-approve for the final publication attempt.
11. Publish exactly once.
12. Read back immutable publication versions and current pointers.
13. Create one normal assignment with the frozen policy/schedule inputs.
14. Verify teacher consumption.
15. Verify student consumption.
16. Keep production active only if the complete recovery definition passes.
17. Immediately perform the user-visible browser handoff defined in Section 2.1.1 instead of continuing into another internal-only recovery loop.
18. Treat the user's direct site observations as product evidence for the later acceptance-delta audit; fix any demonstrated blocker through the same bounded rollback/reproduction rules.

### 9.3.1 Current Book Homework bridge recovery state — 2026-08-14

The corrected Milestone 1 assignment request is no longer an uncommitted candidate. Production durably committed:

- root saga `assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4`;
- its exact per-recipient `book_homework_authorities` record; and
- active Book Delivery.

The same request returned HTTP 202 `committed_projection_pending` because `homework_assignments/{assignmentId}` remained absent. Worker, RTDB rules, and Firestore rules were then restored to rollback state. Evidence is append-only at `documentation/tasks/PRD0062/evidence/126-production-normal-bridge-m1-corrected-attempt-failure-2026-08-14.json`.

For this current recovery, the generic Phase C sequence is constrained as follows:

1. **Do not create another assignment.** The committed root/authority/Delivery are authoritative and must be preserved.
2. The next owning seam is the Book → Homework compatibility projector/repository. Reproduce the exact projection failure deployment-equivalently using the corrected command and committed production-shaped root/authority/Delivery values. A generic green projection fixture is insufficient.
3. Preserve a bounded internal failure class for compatibility projection failures. `committed_projection_pending` may remain the safe outward state, but diagnostics/evidence must distinguish at least token/auth, Firestore read, Firestore write, precondition/conflict, invalid derived projection, and readback mismatch.
4. Correct only that projector seam, then prove same-command replay repairs an absent compatibility shell while leaving committed saga, authority, Delivery, operation, and idempotency identities unchanged.
5. Before activation, prove the minimum Homework → Book return path for the browser milestone. From only the compatibility locator, authenticated actor, and requested launch/read action, the bridge must resolve required owner/recipient/authority/publication/manifest/Delivery/placement/version/revision facts from authoritative sources. Missing or crossed provenance fails closed; shell data never substitutes for Book authority.
6. Freeze the exact replay request bytes and every invalidated source/bundle/config/rules identity. If source changes are required for the projector fix or context resolver, regenerate the checkpoint and inactive versions normally.
7. The next production mutation is exactly one **same-command replay** of the already committed corrected assignment. Its purpose is compatibility-shell repair and teacher/student round-trip verification, not assignment creation.
8. Keep production active only if replay returns committed success, the exact compatibility shell reads back, teacher consumption succeeds, student discovery/detail succeeds, and the representative student action resolves back through the bridge to trusted Book Runtime/read consumption.
9. On that complete success, immediately perform the Section 2.1.1 browser handoff. Full management/review/progress breadth remains Milestone 2 and must not delay handoff.

### 9.3.2 Unobservable committed-projection failure fallback

If the previously deployed implementation cannot be made red deployment-equivalently with the exact committed root/authority/Delivery/projection state, do not invent a corrective patch and do not create a fresh assignment. Exhaust read-only production observability first:

1. query retained Cloudflare Workers Logs for the exact activation Worker version, assignment ID, operation ID, route, and request window;
2. query any available Cloudflare trace/subrequest telemetry for Identity Toolkit and Firestore calls, if tracing was enabled for that deployment;
3. query available Firebase/Google Cloud audit/error telemetry for the same request window without changing production state;
4. exercise the exact activation Firestore rules source through the Firebase Rules `projects.test` API with the literal compatibility create/read request context and exact projected resource, retaining expression/debug reports; and
5. verify the exact production compatibility Firebase UID/custom-claim tuple independently from the shell payload and rules test.

If those read-only sources recover a concrete failure class, reproduce that class locally/deployment-equivalently and correct only its owning seam.

If all retained telemetry is absent or insufficient because the application swallowed the caught projection exception, classify the blocker as `UNOBSERVABLE_CAUGHT_PROJECTION_FAILURE`. At that point, missing observability itself is the demonstrated seam. One behavior-neutral diagnostic instrumentation change is permitted before another production replay, provided it:

- does not change Book, Homework, Delivery, projection, authorization, CAS, retry, or replay semantics;
- preserves the outward `committed_projection_pending` result;
- records only bounded non-secret stage/error classification and safe correlation IDs;
- enables Worker tracing only if needed to capture outbound Identity Toolkit/Firestore status and request-stage metadata;
- passes the same exact committed-state replay harness and all Milestone 1 gates; and
- receives a fresh frozen bundle/config/checkpoint identity.

A separate IAM Credentials `signJwt` preflight is not a required replay gate when it does not match the deployed token mechanism. The production compatibility provider signs its Firebase custom token locally from the configured `BOOK_HOMEWORK_GOOGLE_SA_KEY` and exchanges it with Identity Toolkit. An IAM `signJwt` 403 therefore proves only that the inspecting caller lacks IAM signing permission; it does not prove the deployed compatibility token path is invalid. Any independent token preflight used as a gate must exercise the same local-sign + Identity Toolkit exchange mechanism as production, or be treated as non-representative evidence. Secret values must never be recorded.

After that observability-only change, exactly one same-command replay of the already committed assignment is allowed once the fresh bundle/config/checkpoint has received independent review. If it succeeds, verify the repaired shell and complete the round-trip/browser handoff. If it fails, the retained diagnostic must identify the concrete failing stage/class; rollback and return to deterministic reproduction. This exception cannot be used for a fresh assignment, speculative behavioral fix, or repeated diagnostic activations.

### 9.3.3 Canonical Activity Version RTDB wire-loss gate

The final Milestone-1 round-trip review exposed a separate Book Assembly persistence seam before any diagnostic replay was frozen. The strict canonical Activity Version reader rejected the authoritative production Activity Version because required top-level `evidenceRefs` was absent on the RTDB wire record.

This is not permission for Homework to fabricate evidence and not permission to weaken canonical validation. The current Full PDF publication adapter creates the canonical Activity Version with `evidenceRefs: []`. The repository already documents elsewhere that RTDB drops null and empty-array object children on writes. For the exact authoritative Activity Version used by the representative assignment, the RTDB record also omits domain-defined `taskProfile: null`, `stimulus: null`, and `assetRefs: []` inside both `activity` and `projection`.

The owning correction is therefore bounded to the canonical Book Assembly RTDB read codec:

1. preserve the strict canonical domain schema and fingerprint validator unchanged;
2. before strict validation, hydrate only fields whose absent RTDB wire representation has one unambiguous domain value for this schema: top-level `evidenceRefs: []`, and `taskProfile: null`, `stimulus: null`, `assetRefs: []` inside both `activity` and `projection`;
3. do not hydrate identifiers, provenance, publication/version fields, placement IDs, source context, content, answers, scores, or any field for which absence could represent more than one domain value;
4. require the hydrated record's existing `payloadFingerprint` to validate exactly. For the representative production record, the complete bounded hydration must reproduce stored fingerprint `fnv1a64:2fcc389f248bb9ae`; hydrating only `evidenceRefs` is insufficient and must remain red;
5. prove RTDB write/read round-trip with empty/null fields through the real emulator and prove a record with genuinely missing/tampered non-wire-loss data still fails closed;
6. apply the codec consistently to the exact canonical Activity Version readers that consume RTDB records; do not mutate the immutable production Activity Version merely to materialize empty children;
7. rerun the locator-only Homework → Book round trip through strict Book Runtime consumption. Only when the canonical reader is green may the diagnostic recovery bundle/checkpoint be frozen.

This correction belongs to Book Assembly persistence compatibility. It does not change the Book Homework bridge authority model and must not expand into republishing or synthesizing a replacement Activity Version unless the bounded codec cannot restore the existing fingerprint exactly.

### 9.3.4 Activation-edge route-gate readiness after the 2026-08-14 v2 replay

The independently reviewed v2 repair replay did not reach Book Homework command processing. Production read back diagnostic Worker `ec8ef179-35e7-4547-ba16-a96b9192d67d` at 100% traffic with `BOOK_HOMEWORK_ROUTES_ENABLED=enabled`, but the sole exact command POST returned HTTP 503 `book_route_disabled`. The router checks that exact gate after Firebase authentication/rate limiting and before service/body/pilot/handler processing. Durable root, authority, Delivery, operation, and compatibility state remained unchanged; rollback completed. Append-only evidence is `documentation/tasks/PRD0062/evidence/126-production-normal-bridge-m1-standards-freeze-replay-failure-result-2026-08-14.json`.

Classify this as `ROUTE_GATE_NOT_ACTIVE_AT_REQUEST_EDGE`, not as a Book Homework command, projection, Runtime, or authority failure. The existing `OPTIONS` readiness check is insufficient because canonical Book routing returns CORS preflight before `enforceGate`; HTTP 204 therefore proves route/method/CORS registration but does not prove the activated write gate is visible at the serving edge.

No automatic retry is authorized. Any replacement repair replay requires a fresh explicit authorization, fresh checkpoint/review, and the following activation-edge gate before the exact command may be sent:

1. activate the exact reviewed rules and Worker and read back their immutable identities normally;
2. mint/obtain the same class of valid teacher Firebase ID token intended for the repair command without recording the token;
3. send a **non-mutating gate-sensitive POST probe to the exact assignment-command route** using that valid authentication and production origin, with a body deliberately larger than the route's 256 KiB control-body limit;
4. require HTTP 413 `body_too_large`. In the canonical router this result is reachable only after authorization, rate limiting, `BOOK_HOMEWORK_ROUTES_ENABLED`, and service-identity checks have passed, while it fails before pilot-scope/handler/command processing and therefore cannot mutate assignment state;
5. require at least two consecutive successful 413 probes from the execution client, retaining safe response metadata such as timestamp and `CF-Ray`/colo when available, then submit the exact frozen repair bytes promptly after the second probe;
6. if any probe returns 503 `book_route_disabled`, 503 `book_route_unavailable`, 401, 429, or any result other than the expected 413, do **not** consume the command replay: remain/return to rollback as required, record the edge-readiness failure, and do not send the assignment command;
7. immediately before the real command, re-read the committed root/authority/Delivery and absent compatibility shell so the replacement attempt still targets the same repair state.

The prior v2 POST consumed its authorized production-request budget under the frozen checkpoint, but because it failed before the route gate and command handler, it does not demonstrate a second product/composition failure and does not require a new product candidate. A future replacement attempt must be separately authorized rather than silently treating the consumed budget as restored.

### 9.3.5 Compatibility shell repaired; browser Homework consumption is now the only Milestone-1 blocker

The corrected replacement execution subsequently passed both gate-sensitive 413 probes, sent the exact frozen command once, and returned HTTP 200 `committed`. The compatibility shell now exists durably with the exact Book Homework compatibility marker, while the committed root remains revision 7, exact recipient authority remains revision 2, and Delivery remains active and unchanged. Trusted teacher/student projections and locator-only Book Runtime launch returned HTTP 200. Evidence is append-only at `documentation/tasks/PRD0062/evidence/126-production-normal-bridge-m1-corrected-client-replacement-replay-browser-failure-result-2026-08-14.json`.

The command/bridge repair objective is therefore complete for Milestone 1. **Do not replay the assignment command again merely to fix browser UI.** The remaining browser-handoff blockers are confined to the existing PRD0062 Homework surfaces:

- teacher Homework list rendered a legacy-stat path and crashed on missing `stats.completionRate`;
- student Homework discovery succeeded, but detail rendered the compatibility shell as legacy Homework and made the Book Runtime action unreachable.

Before changing either symptom independently, reproduce the exact persisted compatibility shell through the browser/Firestore read boundary and evaluate `isBookHomeworkCompatibilityProjection` on that exact browser-shaped value. Determine whether both failures share one discriminator/normalization defect. If they do, correct that shared Homework compatibility-consumption boundary only. If they do not, correct only the two named Homework UI consumers. In either case:

1. do not add legacy `stats`, `status`, submission authority, or other invented fields to the compatibility shell;
2. do not weaken Book authority or make the shell authoritative for progress/runtime facts;
3. do not expand the Book ↔ Homework adapter beyond what the PRD0062 list/detail/browser path requires;
4. prove ordinary non-Book Homework behavior remains unchanged;
5. obtain focused browser proof for teacher Homework list, student Homework list/detail, and Book Runtime launch before another production activation; and
6. after successful browser handoff, return to the remaining PRD0062 acceptance delta. Milestone 2 is PRD0062 completion work, not generic adapter completion.

### 9.3.6 Hosting authentication gate after the 2026-08-15 browser-delivery freeze

The reviewed browser-delivery freeze passed Standards and Spec review, but production Hosting deployment failed before a Hosting version was created because the Firebase CLI was given a short-lived `gcloud auth print-access-token` value through `FIREBASE_TOKEN`. The frontend artifact, Book bridge, Runtime, authority, compatibility shell, and rules were not the failing boundary. Backend activation was rolled back and the live Hosting release remained unchanged. Evidence is append-only at `documentation/tasks/PRD0062/evidence/126-production-normal-bridge-m1-browser-delivery-hosting-auth-failure-result-2026-08-15.json`.

Treat this as a deployment-client authentication blocker only. Before another backend activation:

1. keep Worker, RTDB, and Firestore on rollback while resolving Hosting authentication;
2. do not modify Book Homework, legacy Homework, bridge, Runtime, authority, rules, or the frozen frontend merely to satisfy the Hosting client;
3. do not pass an arbitrary Google OAuth access token through `FIREBASE_TOKEN`; use the repository's supported Firebase CLI authentication boundary and prefer Application Default Credentials / `GOOGLE_APPLICATION_CREDENTIALS` with an identity that is already authorized for the target project/site;
4. isolate Firebase CLI config so a persisted interactive login cannot silently substitute for the reviewed deployment identity when using a service-account/ADC path;
5. prove the exact chosen credential can perform a read-only Firebase/Hosting project/site lookup for project `temp-a1437` and site `kahut1` before activating backend surfaces or creating a Hosting version;
6. do not change IAM roles, create credentials, generate service-account keys, or broaden project permissions solely for this recovery unless the current authorized deployment identity is first proven insufficient and the user explicitly approves the permission change;
7. once read-only Hosting authorization passes, freeze only the invalidated deployment-client/auth identity and obtain focused Standards/Spec review if the checkpoint identity changes; the reviewed product/frontend artifact remains unchanged if its bytes are unchanged;
8. deploy the exact reviewed Hosting artifact first or otherwise prove the Hosting version can be created before switching Book backend surfaces to activation, so another client-auth failure cannot unnecessarily expose/rollback the backend; and
9. after Hosting deployment plus exact artifact readback, activate the exact reviewed Book read/Runtime Worker and rules and immediately execute the bounded teacher/student/ordinary-Homework browser gate. No assignment command is permitted because the compatibility shell is already present.

This authentication repair is release engineering for PRD0062 browser handoff, not new product scope and not adapter work.

### 9.3.7 Hosting file-upload transport gate after authenticated deployment reached `CREATED`

The corrected Hosting authentication path then passed read-only project/site/live-release authorization using the established Firebase CLI account and preserved the reviewed frontend bytes exactly. A production Hosting deploy created version `sites/kahut1/versions/c4f60a9e9eca95a5`, but one static-file upload exhausted the Firebase CLI's six transport retries before finalization or release. The version remained `CREATED`; the live channel stayed on the previous finalized version, no backend activation occurred, and durable Book/Homework state remained unchanged. Evidence is append-only at `documentation/tasks/PRD0062/evidence/126-production-normal-bridge-m1-browser-delivery-hosting-upload-failure-result-2026-08-15.json`.

Treat this as Hosting transport/release engineering only. Before any backend activation:

1. keep Worker, RTDB, and Firestore on rollback and keep the existing live Hosting release unchanged;
2. do not modify or rebuild PRD0062 product source while the frozen frontend artifact remains byte-identical;
3. inspect the exact failed upload task/file hash and reproduce only the Hosting upload transport boundary using the same authenticated Firebase CLI identity and same frozen artifact;
4. do not treat the unreleased `CREATED` version as production. It may be left to become abandoned automatically or deleted through the Hosting versions API/CLI if cleanup is needed; cleanup must never touch the current live release;
5. avoid blind repeated full live deploy attempts. First establish whether the upload failure is transient transport, client/runtime, proxy/network, or a reproducible artifact-specific upload failure. A preview-channel or otherwise non-live Hosting upload of the exact frozen artifact is preferred when it can prove the upload/finalization path without changing the live channel;
6. if the exact artifact can upload and finalize non-live, freeze the resulting deployment-client/transport proof and then perform one reviewed live Hosting deployment using the same artifact and authenticated identity;
7. require the live Hosting release to point to the exact new finalized version and verify the frozen entry asset before activating Book backend surfaces;
8. only after that exact Hosting readback may the previously reviewed Worker/rules activation occur, followed immediately by teacher, student, Runtime, and ordinary-Homework browser verification; and
9. no assignment command, bridge expansion, legacy Homework rewrite, or Milestone-2 work is authorized by this transport failure.

This transport gate exists only to deliver the already-reviewed PRD0062 browser artifact. It is not a new feature-development loop.

### 9.3.8 Rule-enforced production-composition capsule after repeated browser-only projection failures

Repeated production-only Book Homework read failures have now exposed a proof-boundary defect: the current workerd production-composition harness records the Firebase UID/claim tuples used by RTDB and Firestore requests, but its outbound Firebase stubs do not enforce the actual activation rules. Separate RTDB/Firestore emulator tests prove individual rules, yet no gate currently composes the exact default Worker transcript with those rules. A green workerd replay can therefore miss the same service-claim/rules denial that production later exposes.

Before another product activation, make the production-composition proof trustworthy rather than adding another feature workaround:

1. capture the exact non-secret production-shaped state required for the representative assignment: committed root, recipient authority, active Delivery, compatibility shell, completion/progress state, class/membership, and exact activation config/rules identities;
2. run the real default Worker routes/composition against that state and retain the exact outbound Firebase request transcript including path, method, authenticated UID, and custom claims;
3. validate that transcript against the exact activation RTDB and Firestore rules using the real rules engines/emulators, or equivalently back the outbound Firebase boundary with rule-enforced stores; a request denied by the real rules must make the composition gate red;
4. require the previously deployed teacher-projection failure class to reproduce before accepting any source correction. If the current implementation remains green, the capsule is still incomplete and production must not be used to discover the next dependency;
5. preserve authoritative assignment/recipient identity independently from derived completion enrichment. If exact replay proves that one unavailable completion projection causes an otherwise valid assigned student to disappear from the teacher projection, correct that Book-side projection composition boundary so assignment membership remains visible while progress availability fails explicitly/fail-closed; do not source authority from the Homework shell and do not weaken completion validation;
6. prove the full representative M1 path in this capsule: teacher aggregate/per-student projection, student projection, compatibility locator resolution, and Runtime launch, followed by the browser-facing consumer path where practical; and
7. treat Wrangler/Cloudflare control-plane reauthorization as the final deployment/safety dependency after the rule-enforced M1 composition is green, not as a prerequisite for continued product diagnosis.

This capsule is bounded verification/composition infrastructure serving PRD0062 completion. It is not a new adapter platform, generic Firebase abstraction, or replacement for the existing Book/Homework authority model.

### Production failure rule

Any unexpected 5xx, authentication or token-exchange failure, rules denial on an intended path, missing or crossed authority, duplicate version, unreconciled partial commit, invalid readback, or teacher/student delivery failure triggers the exact rollback immediately.

After rollback:

- read back and record active Worker/rules state;
- preserve durable partial data;
- inspect the last committed operation state;
- reproduce the exact failure in the deployment-equivalent harness;
- prove the previously deployed failing implementation goes red with the same failure class;
- fix only its owner;
- prove that exact regression green;
- rerun Phase B;
- regenerate invalidated identities; and
- retry Phase C without restarting from scratch.

### Production-attempt circuit breaker

Production may reveal a genuinely untested downstream boundary once, but it must not repeatedly act as the integration test for a supposedly covered composition boundary.

If two production attempts expose failures in the same composition family, stop further activation until the preceding deployed failure is deterministically reproduced in the deployment-equivalent harness and the owning composition seam is corrected. Transport, token/authentication, owner/authority-context, and production-configuration wiring failures within the same Book Homework production composition count as one composition family even when their immediate low-level exceptions differ.

If the previous failing implementation and its proposed correction both pass the supposedly deployment-equivalent regression, stop: the reproducer is insufficient or the causal diagnosis is wrong. Do not create another activation candidate merely to obtain the next stack trace.

## 10. Phase D — Checkpoint Recovered Production

Once Phase C passes and the user has had the first safe browser handoff:

1. Append the successful execution result with exact deployed Worker, rules, activation, rollback, and durable data identities.
2. Record final Source, Activity, binding, approval, publication, assignment, and delivery identities.
3. Run the focused regression suite one final time.
4. Inspect the complete recovery diff and dirty-path scope.
5. Obtain one final architecture/acceptance review at this commitment boundary.
6. Commit and integrate the coherent recovery state through the repository's normal safe path, preferably a PR.

Do not continue adding unrelated PRD features in the same uncheckpointed recovery diff. Direct push to `main` still requires explicit user approval plus a diff, commit, and test summary.

### Completion criterion

The production-normal path is healthy, reproducible, tied to exact repository/deployment identities, and represented by a coherent repository state. At this point production-normal recovery is complete, but full PRD0062 completion is not yet claimed.

## 11. Phase E — Calculate Remaining PRD0062 Acceptance Delta

Only after production-normal recovery is stable, compare current implementation and accepted evidence to the exact governing PRD0062 V1 acceptance criteria and Definition of Done named in Phase A.

Do not regenerate a giant implementation plan. Create one delta list:

| Requirement | Current proof | Missing behavior/proof | Owner | Action |
| --- | --- | --- | --- | --- |

Classify each requirement as:

- `PASS_CURRENT`
- `IMPLEMENTED_NEEDS_FINAL_PROOF`
- `MISSING_BEHAVIOR`
- `PRD_FUTURE_SCOPE`
- `BLOCKED_EXTERNAL`

Anything already accepted is not reimplemented. `MISSING_BEHAVIOR` becomes a bounded task. `IMPLEMENTED_NEEDS_FINAL_PROOF` receives verification only.

At minimum reconcile:

- Assembly Workspace;
- structured and source-assisted Activity Runtime;
- autosave, submission, result, and review;
- Book Homework and scheduling;
- integrity mode;
- selective updates and Review Checkpoints;
- notifications;
- Solo delivery;
- Course/Class delivery;
- result/context isolation;
- accessibility and mobile requirements;
- security and generated rules;
- legacy compatibility; and
- pilot and Definition-of-Done requirements.

Historical acceptance evidence may be reused only where it matches current source and the required proof class.

## 12. Phase F — Finish Only the Remaining Acceptance Delta

For every remaining item:

1. Identify the existing owner.
2. Change the minimum code necessary.
3. Prove the requirement at the correct level.
4. Update the delta.
5. Continue until no required V1 item remains unresolved.

Avoid reopening completed ticket architecture, rebuilding historical proof frameworks, or creating generalized infrastructure solely for acceptance.

PRD0062 is complete only when the delta contains no unresolved required V1 item and the Definition of Done is true in current source and deployed behavior.

## 13. When Refactor or Redesign Is Justified

A refactor is justified only when at least one condition is demonstrated:

- the same boundary fails again after a correct root-cause fix;
- two or more active call sites require duplicated corrective logic for the same invariant;
- the existing interface cannot safely represent a required durable state;
- production configuration cannot express a dependency the interface requires; or
- the boundary prevents deterministic local reproduction of its deployed protocol.

A redesign is justified only when a PRD invariant cannot be satisfied by the existing architecture without violating another PRD invariant.

Repeated rollbacks or a large dirty diff alone do not justify redesign.

Repeated transport, token/authentication, owner/authority-context, or configuration-wiring failures inside the same production composition family are treated as repeated failure of that composition boundary, not as unrelated one-line defects. Once the production-attempt circuit breaker is triggered, deepen that composition boundary enough to make its required transport, authentication, and command-scoped authority dependencies explicit and deterministically reproducible before another activation. This is a bounded composition refactor, not evidence that the wider PRD0062 domain architecture requires redesign.

## 14. Explicit Non-Goals During Recovery

Do not spend recovery time on:

- stylistic cleanup;
- generalized deployment tooling or storage abstractions;
- speculative service consolidation;
- new IAM identities without a proven blocker;
- broad route renaming or schema modernization;
- rewriting Reading V2 or Listening;
- replacing existing result or Homework systems;
- proof-artifact redesign;
- unrelated worktree cleanup; or
- rare edge cases that do not block normal V1 use.

Record deferred items separately where useful. They do not block the production-normal critical path unless current product evidence proves otherwise.

## 15. Authority and Source-of-Truth Clarification

Use this precedence:

1. Repository, platform, credential, branch-protection, and destructive-operation safety constraints.
2. Current user direction for the active recovery objective.
3. The exact active PRD0062 product requirements, accepted amendments, acceptance criteria, and Definition of Done named in the Phase A ledger.
4. Current source and reproducible local, emulator, deployed, and browser behavior.
5. Current accepted evidence matching those identities and proof classes.
6. Historical sessions, packets, and evidence for diagnosis only.

An old dormant-status banner, consumed packet, or historical approval does not redefine the product or authorize a new identity. If historical documentation conflicts, resolve only what is necessary to identify the active product requirement, record the conclusion in the ledger, and continue. Do not start a documentation-governance project.

## 16. Reporting Style

At checkpoints report only:

1. current state;
2. decisive pass/failure evidence; and
3. next critical-path action.

As soon as a safe browser handoff is available, reporting must prioritize the site URL/origin, usable role/account context, the shortest manual test flow, and known limitations so the user can experience the product directly.

Do not narrate every command, create approval ceremony around routine bounded fixes, describe local success as production completion, or describe production-normal recovery as full PRD0062 completion.

## 17. Fresh-Thread Launch Prompt

> Work in `/home/iamhuwng/worktrees/prd0062-production-normal-20260813-v2`. Read `documentation/tasks/PRD0062/PRD0062-production-normal-recovery-and-completion-plan.md` completely before acting; it is the controlling recovery and completion execution plan. The goal is the shortest credible path to working PRD0062 behavior: first recover the existing production-normal path, then close only the remaining canonical V1 acceptance delta. Do not redesign or refactor by default. Begin by converging current state and verifying the fixes already present in the worktree, including exact #118C absent-leaf Activity binding access, save/bind replay reconciliation, RTDB hydration, and the default production-normal workflow harness. If they pass, freeze exact Worker/rules/config/input identities, validate inactive rollback and activation versions, and proceed directly to the existing durable production recovery under the standing authority in this plan. On any production failure, roll back, reproduce that exact failure locally, fix only the owning seam, rerun the production-shaped gate, regenerate invalidated identities, and retry. Treat production-normal recovery and full PRD0062 completion as separate milestones. Keep updates to current state, decisive evidence, and next action.
