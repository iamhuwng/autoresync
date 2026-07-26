# PRD0062 Ticket 51 / #51 evidence

## Selection and graph

- Roadmap phase: Runtime — trusted document-delivery authorization.
- Selected primary: #51.
- Complete direct/transitive prerequisite chain:
  `[25, 26, 27, 29, 30, 31, 44, 45, 46, 47]`.
- Ownership-repair graph: 112 tickets, 86 open, 26 closed, 307 unique edges,
  zero missing references, duplicate edges, or cycles, topological coverage
  112.
- Graph artifact:
  `artifacts/prd0062-graph-20260727-ticket51-ownership-repair.json`
- Issue hash:
  `451815f16841550a2b8f89d7916d09ba4d1abed69da839be42df94d6c52567c2`
- Selection snapshot:
  `artifacts/prd0062-selection-20260726-ticket51.json`
- #40 remains blocked by its unresolved long-response/coverage ownership
  contradiction and was not used as a descendant bypass.

## Owned implementation

- Added a server-only Book document authorization seam.
- Firebase `Authorization: Bearer <token>` verification occurs before profile
  read or Delivery repository lookup.
- Authorization re-resolves the current Delivery pointer and immutable record,
  checks active status, recipient identity, context, publication state, pinned
  revision, and verified-usable source versions on every request.
- An explicitly active student profile is required; teacher preview remains
  #09C-owned. Blocked, inactive, suspended, disabled, and revoked profiles
  fail closed.
- An opaque route key is resolved server-side; direct recipient/context IDs and
  all query parameters fail closed.
- The in-process decision contains the server-only facts needed by 09B:
  binding, Book/publication revisions, pinned source version IDs, strategy,
  scope, and exact provider locations. The HTTP seam returns only generic
  `{status:"authorized"}` and never serializes that decision.
- Each request re-resolves live publication status, schedule state, source
  version set, revocation set, and provider locations.
- Added an internal GET/HEAD route descriptor. #59 owns top-level composition,
  deployed route reachability, and Worker identity/config readback. #09B owns
  byte transport. No document ledger, cookie, bearer URL, or provider access
  was added.
- Destination-first transfer recorded live in #51 and #59 on 2026-07-27:
  #51 does not claim #59-owned route registration, deployed reachability,
  active Worker readback, deployed identity integration, or deployed negative
  probes. #59 retains those gates open until its own closure.

## Verification

- `npx tsc --noEmit`: PASS.
- Provider-neutral Ticket #51/#08B suite via
  `cloudflare/vitest.ticket51.config.mjs`: 18 tests PASS across 3 files.
- Scoped ESLint: PASS.
- x64 Wrangler preflight:
  `x64 C:\Users\The Lord\Tools\node-x64\node.exe`, Wrangler 4.112.0,
  `media` profile, sentinel `kahoot-media` and
  `luyentap-book-source-private` visible.
- `wrangler deploy --config .\wrangler.jsonc --profile media --dry-run`: PASS.
  This proves local bundle/config compilation only; no remote mutation.
- Worker-pool config was attempted and stopped before test collection because
  repository `workerd` reports `Unsupported platform: win32 arm64 LE`. This is
  a local harness limitation, not product proof; the provider-neutral harness
  was used for the affected seam.
- Browser/deployed document transport proof remains destination-owned by
  #09B/#54/#73 and top-level route/deployment proof remains #59-owned. Those
  destination tickets remain open; they are not producer closure blockers.

## Rollback and safety

- Disable the internal authorization route or top-level composition while
  retaining immutable records and safe reads. Do not restore a document ledger,
  cookie, bearer URL, public bucket, or unauthenticated route.
- No remote mutation, new secret, Firebase rule activation, 50A capability, or
  03B capability occurred. 50A remains all-deny and 03B remains disabled.
