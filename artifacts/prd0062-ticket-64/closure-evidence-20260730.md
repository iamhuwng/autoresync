# PRD0062 ticket #64 closure evidence

## Scope and ownership

- Primary: #64 / Ticket 16A, Runtime phase.
- Direct prerequisite #31 is CLOSED; complete transitive prerequisite chain has
  no open ticket.
- Live contract transfer was applied destination-first: #134 now owns deployed
  and canary common-publication proof. #64 retains only local
  production-equivalent common-boundary proof.
- #65 and #66 retain strategy-specific adapter behavior and teacher workflow
  proof. #59 retains canonical route composition. #118 retains assembled
  generated rules. #134 retains deployment, identity/configuration readback,
  cleanup, and deployed rollback.

## Implemented contract

- A required typed authority gate checks the exact owner, Book, candidate,
  candidate revision, Book revision, Source Set revision, plan fingerprint, and
  current unrevoked/unexpired preview approval before the common Worker invokes
  publication.
- The durable Firebase repository no longer writes the Book ancestor. It
  idempotently prepares exact immutable children, advances only `current` with
  ETag CAS as the visibility barrier, then writes bounded audit/operation
  markers.
- Retry hides same-operation prepared children from mutation planning, heals
  missing post-pointer markers only after the retry fingerprint matches the
  committed pointer fingerprint, rejects immutable updates/deletes, and leaves
  losing prepared records inaccessible to runtime readers.
- Authenticated exact-command replay remains available for deterministic crash
  recovery after the publication gate is disabled or the preview authority
  expires; new and fingerprint-mismatched commands still fail closed.
- Canonical Activity Versions are first-class immutable records at exact
  Activity/version paths. Book publication references are keyed per Manifest
  Version with a collision-free length-prefixed key that round-trips two
  maximum-length IDs, carry the exact canonical payload fingerprint and
  safe-projection identity, and permit intentional reuse without overwriting
  prior references.
- Rollback accepts only a prior version whose originating operation proves an
  exact committed publication. A losing-CAS prepared version cannot later be
  promoted through rollback.
- The exact runtime reader requires a published Manifest, exact Book reference,
  current pointer or committed historical operation, safe projection,
  Placements, canonical payload, and canonical student-safe sibling. Missing,
  malformed, wrong-owner/version/fingerprint/publication/lineage records fail
  closed. Transport outages propagate distinctly from absence.
- Fragment 16A denies ancestor writes, grants only exact scoped child writes,
  gates raw runtime reads on current/committed publication visibility, and owns
  the canonical Activity Version paths. Fragment 19 no longer duplicates that
  ownership.

## Verification

- Root focused suites:
  `node scripts/harness/run-tool.mjs vitest . run
  src/services/book-assembly/publicationTransaction.service.test.ts
  src/services/book-assembly/canonicalPublication.service.test.ts
  src/services/book-assembly/canonicalActivityVersion.service.test.ts
  src/__tests__/security/bookAssemblyPublicationRuleFragment.test.ts
  src/__tests__/security/bookActivityRevisionRuleFragment.test.ts
  src/__tests__/cloudflare/bookAssemblyPublicationWorker.test.ts
  --reporter=dot`
  - PASS: 6 files, 47 tests.
- Cloudflare repository suites:
  `node ..\scripts\harness\run-tool.mjs vitest . run
  test/book-assembly-publication-repository.test.ts
  test/book-assembly-canonical-activity-version-repository.test.ts
  --reporter=dot`
  - PASS: 2 files, 29 tests.
- Scoped ESLint over all #64 TypeScript paths: PASS.
- Scoped `git diff --check`: PASS.
- UTF-8 validation: PASS for 23 #64 text files.
- TypeScript `tsc --noEmit`: 53 diagnostics in the shared dirty tree, zero
  diagnostics in #64 paths.
- `npm run build`: PASS; Vite production build completed in 2m37s and bundle
  budget passed (root entry 241 KB).

## Graph and selection evidence

- Graph:
  `artifacts/prd0062-graph-20260730-post-ticket64-deployment-transfer.json`
- Selection:
  `artifacts/prd0062-selection-20260730-post-ticket64-deployment-transfer.json`
- Live graph: 112 issues, 52 open, 60 closed, 310 unique edges, zero missing
  references, duplicate edges, or cycles, topological coverage 112.
- Graph-clear frontier: #49, #59, #64, #129, #131, #132, #133.
- #64 remains the sole selected primary until formal closure.

## Safety and rollback

- #03B remains disabled.
- #50A remains all-six-deny/default-deny.
- Private B2 and trusted actions remain disabled.
- No Worker, Firebase, rules, route, B2, or capability deployment/activation is
  claimed.
- Rollback is to disable the common publication command and pointer advancement
  while preserving immutable versions, current/historical safe reads,
  operation/audit evidence, and deterministic recovery. Pointer rollback
  remains a separately authorized command.

## Independent review

- Live-contract review: PASS; no remaining #64 closure blocker.
- Repository standards review: PASS.
- Review findings repaired before the final pass: exact authority fingerprint
  binding, canonical-origin lineage, runtime visibility of prepared records,
  rollback-origin proof, exact path-ID binding, collision-free/max-length
  Activity reference keys, strict student-safe schemas, immutable marker
  handling, and fingerprint-gated crash-marker repair.
