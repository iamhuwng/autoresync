# PRD0062 #126 document-composition correction cycle — 2026-08-23

This append-only record supersedes neither historical failure evidence nor the
standing rollback artifact. It records the reviewed source correction, the
bounded candidate deployment, the browser-control blocker, and the verified
safe terminal state.

## Candidate

- Source: `31496c20d0abaf5e56e8a2dade24339aa5413a9c`, branch
  `codex/prd0062-continuation-after-cleanup`, clean at candidate freeze.
- Root correction: `document.ts` now passes the required
  `FIREBASE_WEB_API_KEY` into the default Firebase REST Homework document
  store. `required()` remains fail-closed.
- Red/green: the new owning-seam test was red at 503 and green at 403 after
  the one-line source correction. The adjacent candidate suite passed 10/10
  files and 89/89 tests.
- The current renderer manifest digest is
  `2e1dd559172c6750c53c82cd4fb0cb7bcc68589805c3451cfaaa5be3111f488c` and
  the reviewed activation config digest is
  `86b3de6edb08d55b9a121874ca6bf6931d159c977b5e9fa52a738c30fa6fe60`.
- Independent Standards and Specification reviews both returned PASS.

## Deployment and rollback

The Windows ARM64 harness/Wrangler 4.103.0 dry-run passed. Candidate Worker
version `49d86f37-7365-4b13-ae4c-d79e5ee720a1` (version 128) uploaded and read
back with the expected renderer digest, launch/document/homework/runtime
bindings, and `FIREBASE_WEB_API_KEY` as a secret binding. It was activated at
100% under deployment `d87c0e9c-2977-4540-8bfb-13dbe130798b`.

The required authenticated browser proof could not start: the configured
browser-control runtime failed before connection with a kernel-assets
path-not-found error, even after resetting the runtime and recovering Windows
storage. No browser acceptance is claimed. The candidate was therefore
rolled back immediately to `bbc55301-0c59-4edf-a6d6-bb527b7f3080` at 100%
under deployment `829a062c-0ecb-4d4c-961a-d9537a8313fa`. The existing
assignment was not replayed and no durable Firebase state was mutated.

The direct unauthenticated probes after rollback returned 401 at the Worker
root and document route; this confirms the auth boundary only and does not
replace the prior authenticated 404 rollback probe in the historical
evidence.

## Local and scope disposition

The PRD0062 static/rules/security checks, UTF-8/diff guardrails, and Worker
dry-run passed. The frontend build and Firebase emulator phases were blocked
before product assertions by the Windows snapshot/loopback harness boundary.
Those are classified as tooling results, not product passes. Hosting, RTDB,
Firestore rules, durable assignment state, main, Listening, unrelated data,
forensic archives, and WSL authority were untouched.

Current status remains `BLOCKED_ROLLED_BACK`; #128 and later tickets remain
held. The sole release blocker for this cycle is the unavailable authenticated
browser-control runtime.
