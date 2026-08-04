# PRD0062b Packet 2 post-cleanup R2 proof execution plan — 2026-07-18

Status: dated local plan and evidence only; dormant after code reset. It grants no current implementation authority and does not change product decisions, taskboxes, deployed state, remote data, cleanup state, or `presentationMode` authority. Root Components 02–03 remain the future plan owners after fresh baseline reconciliation.

## Goal and established facts

Close the remaining Packet 2 proof gap without reviving Browser Run, PDF splitting, renderers, renditions, per-page grants, query tokens, public R2 access, or a new delivery endpoint.

Already established locally on `codex/prd0062b-p2-reconcile`:

- Browser delivery uses one authenticated complete-document transport. Every `GET`, `HEAD`, and range request obtains a fresh Firebase bearer.
- Worker authentication occurs before the document ledger, repository authorization, and R2 access. Wrong-user requests stop before repository/R2 reads.
- Full, HEAD, single-range, invalid-range, CORS, and token-refresh behavior has focused local proof.
- Guarded proof preflight requires exact Worker versions, complete bindings, routes, secret names, Firebase rules hash, and denial for a known-existing private-R2 object.
- Mutable cleanup is limited to empty-before-write exact paths, fingerprints state before deletion, verifies deletion readback, and freezes when Source operation state is unresolved.
- The 2026-07-17 ledger is historical evidence only. Current task and product authority remain elsewhere.

The remaining hard gap is exact post-cleanup readback of both the immutable original PDF and its integrity sidecar. An earlier stream plus zero planned R2 cleanup targets is useful evidence but is not final object-preservation proof.

## Chosen solution

Add one local public verification seam:

`verifyPostCleanupR2Evidence(input) -> structured immutable-object evidence or fail-closed error`

The verifier receives only:

- exact bucket and exact original/sidecar keys derived from trusted Source records;
- expected PDF bytes and SHA-256;
- expected sidecar schema and binding values;
- a read-only object client exposing exact-object `GET` only;
- explicit byte and time limits.

It must stream both objects, never fully buffer the PDF, independently calculate byte counts and SHA-256, validate the sidecar schema/binding, and return redacted evidence. It must expose no list, head, put, copy, or delete operation.

Preferred remote adapter: short-lived R2 S3-compatible credentials restricted to the proof bucket and, where supported, `HeadObject`/`GetObject` for the exact proof prefix. Credentials remain process-only, are never written to repository files/artifacts/logs, and expire automatically. A pinned isolated WSL Wrangler read path is a fallback because repository Wrangler cannot start on Windows ARM64.

## Execution sequence and gates

1. **Local plan and identity research — historically authorized when this plan was written; not authorized now**
   - Confirm exact original and sidecar keys/schema from live source code and tests.
   - Record all assumptions in this evidence plan.

2. **Test-first verifier — historically authorized when this plan was written; not authorized now**
   - Red: exact original+sidecar success; missing object; byte/hash mismatch; malformed/mismatched sidecar; oversized stream; timeout; non-read capability rejection.
   - Green: implement the smallest streaming verifier and proof-runner adapter.
   - Keep runner blocked unless final original and sidecar readback both pass.

3. **Local verification and review — historically authorized when this plan was written; not authorized now**
   - Focused verifier/proof tests, authenticated transport tests, syntax, TypeScript, governance, canonical plan, UTF-8, diff check.
   - Independent standards and specification reviews.
   - Commit only to the isolated reconciliation branch.

4. **Supervised Chrome inspection — read-only inspection only**
   - Use the existing logged-in Chrome session to inspect Cloudflare account, R2 bucket, object layout, and available read-only/temporary credential controls.
   - Do not create credentials, download objects, change configuration, or mutate remote state at this gate.
   - If sign-in is absent, stop and ask the user to sign in to Cloudflare in Chrome.

5. **Credential approval checkpoint — separate explicit approval required**
   - Present exact account, bucket, path scope, actions, TTL, and credential creation method.
   - Recommended authority: short-lived, bucket/path-scoped `HeadObject` and `GetObject` only.
   - Do not accept list/write/delete/admin authority when narrower authority is available.

6. **Live deployment/configuration validation — separate explicit approval required**
   - Read exact active Worker versions, percentages, complete bindings, routes, secret names, Firebase rules hash, and known-object private-R2 denial.
   - Any mismatch stops before authentication or mutation.

7. **One guarded remote proof and cleanup — separate explicit approval required**
   - Use one disposable namespace and one stable publish operation identity.
   - No real-user data, new operation identity, blind retry, deployment, rollback, taskbox edit, or `presentationMode` resolution.
   - Freeze on ambiguity. Delete only fingerprint-matching mutable targets. Preserve immutable Source, operation, publication, audit, original, and sidecar evidence.

8. **Final post-cleanup proof — covered only by the same separately approved remote proof**
   - Read original and sidecar through the read-only adapter after cleanup.
   - Require exact byte/hash/schema/binding agreement and exact final infrastructure equivalence.
   - Write only redacted hashes, sizes, identities, timestamps, and PASS/FAIL to the evidence artifact.

9. **Integration — only after remote PASS**
   - Refresh against a clean current `main`; preserve unrelated dirty work.
   - Reconcile documentation governance without changing root task ownership.
   - Prefer PR. Do not claim Packet closure from local evidence alone.

## Stop conditions

- Missing or over-broad credential scope.
- Unexpected account, bucket, object key, Worker version, route, binding, secret name, or Firebase rules hash.
- Missing/malformed sidecar, byte/hash mismatch, oversized stream, timeout, or any ambiguous Source/publish state.
- Any need to list the bucket, write/delete R2, create a public URL, deploy, roll back, touch real-user data, change taskboxes, or resolve `presentationMode` without the matching explicit approval.

## Alternatives considered

- **Manual Chrome download and local hashing:** valid supervised fallback, but weaker repeatability and greater risk of selecting/renaming the wrong object.
- **`wrangler r2 object get --remote --pipe`:** simple read path; use only through an isolated WSL pinned Wrangler because the repository Windows ARM harness cannot start.
- **New private Worker verifier endpoint:** reusable, but adds deployment work and a new security surface. Not preferred.
- **Earlier stream plus no-delete intent:** insufficient for final preservation proof. Rejected.

## Recommendation

Implement and review the local read-only verifier first. Then use Chrome only to confirm the live scope and credential options. Stop before credential creation or any production read. After the user approves the exact least-privilege authority, perform deployment validation and one guarded proof. Leave taskboxes and `presentationMode` unchanged until their separate authorities act.

## Local execution status — 2026-07-18

- Implemented the exact-object `GET` adapter, streaming verifier, temporary-session-token gate, proof-runner integration, and fail-closed tests.
- Focused local proof passed for verifier/adapter, Worker document transport, and browser/service delivery. Governance, canonical-plan, UTF-8, syntax, and diff checks passed.
- Broad root TypeScript validation is limited by the isolated worktree resolving shared `node_modules` types through the dirty main path (`TS2742` in unchanged `src/test/test-utils.tsx`); this is a local harness-path failure, not a changed-code failure.
- The broad scripts suite executed 65 passing tests, then failed on the unchanged raw `database.rules.json` checkout hash in `build-prd0062b-p2-replay-rules.test.mjs`; focused changed-code proof remained green. This is the recorded LF/CRLF checkout-harness limitation and was not normalized.
- Signed-in Cloudflare account URL was identified. Chrome page-structure and screenshot reads timed out, so account/bucket/credential-control details were not claimed.
- No remote credential, read, deployment, proof, cleanup, mutation, rollback, taskbox edit, or `presentationMode` decision occurred.
