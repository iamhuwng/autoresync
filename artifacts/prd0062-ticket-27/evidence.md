# PRD0062 Ticket 27 / #41 evidence

## Selection and ownership

- Roadmap phase: Runtime trusted seams.
- Selected primary: #41.
- Closed direct/transitive prerequisites: #25, #33, #34, #36, #37.
- #40 was rejected as ineligible because its required long-response
  registration contradicts the zero-row canonical coverage boundary. Blocker
  owner/action/evidence/impact is recorded in
  `artifacts/prd0062-ticket-25/blocker-20260726.md`.
- Pre-closure graph: 112 tickets, 87 open, 25 closed, 307 unique edges, no
  missing references, duplicates, or cycles; topological coverage 112.
- Pre-closure graph artifact:
  `artifacts/prd0062-graph-20260726-ticket27-preclosure.json`
- Pre-closure issue hash:
  `1d2d97b4f1c59df5dc03aba380852928406a80bcb6e55f63d106f8847e804302`
- Selection snapshot:
  `artifacts/prd0062-selection-20260726-ticket27.json`

## Owned implementation

- Reading V2 and Listening adapters consume explicit, type-only public export
  barrels.
- The adapter registration manifest names all 32 supported matrix rows.
- Conversion emits student-safe renderer/codec projections only. Book tree,
  source PDF, binding, persistence, submission, result identity, and native
  domain authority remain outside the adapters.
- Source-assisted rows require Book-owned source context. Required audio/image
  inputs require stable authorized asset IDs; URLs, credentials, signed
  authority, owner IDs, and answer data are not copied.
- Listening multiple-selection count and matching reuse semantics must be
  supplied explicitly because the public export intentionally omits answer
  authority. Missing semantics fail closed.
- Reverse dependency tests reject Reading V2/Listening imports of Book Activity.

## Destination-owned proof

#73 owns assembled `BookRuntimeShell` adapted fixtures, Student quick-login,
Delivery projection, authenticated asset transport, route/CSP integration,
assembled adapter loading, desktop/mobile navigation, and browser-level 200%
zoom. No #73 browser/deployment claim is used to close #41.

## Verification

- TypeScript: `npx tsc --noEmit` PASS.
- Adapter/matrix/dependency suite: 45 tests PASS across 5 files.
- Native Reading V2/Listening regression suite: 68 tests PASS across 8 files.
- Activity coverage release validator: PASS, 32 independent fixtures and 32
  registered rows.
- Scoped ESLint: PASS.
- `git diff --check`: PASS for ticket-owned changes.
- Production build and bundle budget: PASS.
- Browser proof: not run; integrated browser proof is destination-owned by #73.
- Deployment: no remote state changed; production compilation/registration
  loading is retained locally, while integrated deployed proof is owned by #73.

## Rollback and safety

Adapter registration is one additive barrel export. Removing that export
disables loading without changing native Reading V2/Listening behavior or data.
Changing affected matrix rows from `registered` to `planned` makes the release
coverage validator fail closed; this gate was observed before registration
metadata was updated. No new secret, Firebase authority, Cloudflare binding,
50A capability, or 03B capability was added. 50A remains all-deny and 03B
remains disabled.
