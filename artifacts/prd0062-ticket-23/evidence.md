# PRD0062 Ticket #38 evidence

Date: 2026-07-26
Primary: #38 / Ticket 23

## Destination-first transfer

The following integrated proof was added to #73 before removing it from #38:

- Student quick-login at `http://localhost:5174`
- full structured and source-assisted `BookRuntimeShell` fixtures
- desktop/mobile navigation and browser-level 200% zoom
- production route, Delivery projection, PDF transport, and assembled registry integration

#38 retains:

- choice/text-entry renderers and codecs
- registry and coverage-matrix checks
- keyboard and screen-reader component tests
- read-only, review, malformed-input, normalization, and serialization tests
- responsive component CSS checks at 200% zoom
- production build and unsupported-registration denial

## Fresh graph and selection

Graph artifact:

`artifacts/prd0062-graph-20260726-post-ticket23-transfer.json`

SHA-256:

`d7ddbf1359d7dbd559497d2d09f2957d9cc775bb7859e01f52ea628d8dc783e2`

Graph result: 112 issues; 89 open; 23 closed; 309 unique/raw edges; 0
missing edges; 0 duplicates; 0 cycles; topological order 112/112.

Selected #38 as the only Foundation primary. Its transitive prerequisite chain
`[25, 33, 34, 36, 37]` is live-closed. #73-owned integrated proof is excluded
from #38 eligibility and remains open in its destination lane.

## Retained gate evidence

Focused suite:

`node node_modules/vitest/vitest.mjs run src/components/book-runtime/interactions/choice src/components/book-runtime/interactions/text-entry src/components/book-runtime/interactions/rendererResponsiveCss.test.ts src/services/book-activity/runtime/choiceTextEntryCodecs.test.ts src/services/book-activity/runtime/codecs/choiceResponseCodec.test.ts src/services/book-activity/runtime/codecs/textEntryResponseCodec.test.ts src/services/book-activity/runtime/registrations/activityRendererRegistrations.test.ts src/services/book-activity/runtime/registrations/choiceTextEntryHostIntegration.test.tsx src/services/book-activity/runtime/activityRendererManifest.test.ts src/services/book-activity/runtime/activityRendererRegistry.test.tsx`

Result: 11 files, 40 tests passed, including the dependency-boundary suite.

Additional gates:

- `node scripts/check-prd0062-activity-coverage.mjs` — PASS; 32 independent
  fixtures and 32 coverage rows.
- `node node_modules/typescript/bin/tsc --noEmit` — PASS.
- Scoped ESLint for renderer, codec, registration, responsive, and test files —
  PASS.
- `npm run build` with the approved Mode 2 environment — PASS; 9,346 modules,
  bundle budget PASS, 234 KB root entry.
- `git diff --check` — PASS for the scoped change set.

The focused tests cover:

- native keyboard operation, fieldset/group semantics, labels, source
  correspondence, validation error association, and read-only/review behavior;
- required selection cardinality, duplicate/unknown/malformed responses, text
  bounds, canonical set ordering, stable equality, and review projection;
- shared answer-rule case/whitespace normalization through the registered
  text-entry host;
- exact registration/manifest parity, coverage-matrix support parity, and
  unsupported registration fail-closed behavior;
- responsive component CSS bounds, 44px targets, relative sizing, and
  narrow-viewport behavior compatible with 200% zoom.

Independent review remediation:

- review/read-only controls remain focusable while guarded against changes, so
  selected state remains available to keyboard and screen-reader users;
- optional structured `book-pages` context no longer fails as though it were
  required; source context remains mandatory for source-assisted and explicitly
  required projections;
- browser-level zoom behavior remains destination-owned by #73; #38 claims only
  component CSS bounds and narrow-viewport behavior.

## Scope and authority

No Book Delivery, Firebase, persistence, autosave, submission, scoring
authority, result ownership, trusted activation, 50A capability, or 03B
activation was added or enabled. #73 remains the sole owner of integrated
browser/runtime proof. #118 remains the owner of generated assembled-rules
proof.

## Provenance reconciliation

The live-closed prerequisite artifacts for #33/#36/#37 were present in the
working tree but absent from Git history. The closure commit includes only the
direct prerequisite runtime/type/coverage artifacts required by #38 plus
#38-owned implementation, tests, manifest, and evidence. This restores the
published closure chain without staging unrelated dirty work.
