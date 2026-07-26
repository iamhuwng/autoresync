# PRD0062 ownership registry

This registry records final proof owners and destination-first transfers.
Published issue bodies remain authoritative. Update both when ownership moves.

## Global proof classes

| Proof class | Final owner |
| --- | --- |
| Domain model, pure validation, local unit/property proof | Domain ticket |
| Fragment content and fragment-level negative proof | Fragment-producing domain ticket |
| Generated `database.rules.json`, assembled emulator suite, active rules readback, rules rollback | #118 / 09E |
| Top-level Worker route composition, live route reachability, deployed Worker identity/config integration, route rollback | #59 / 09D |
| Feature-specific browser behavior on an already-owned shell | Feature ticket |
| Structural Book Runtime shell, shell navigation, launch/reload structure | #73 / 22B |
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
- deployed Worker-to-Firebase Assembly identity integration;
- disposable save/reload through canonical Worker route;
- active Worker version/config/readback;
- route-level rollback proof.

Moved to #118:

- generated `database.rules.json` proof;
- assembled emulator enforcement for Assembly paths;
- active rules deployment/hash/readback;
- generated-rules rollback artifact;
- legacy-path preservation after Assembly fragment composition.

## Current unresolved ownership checks

- #56 owns hierarchy/source workspace behavior and local 13A-client proof.
  #59 owns deployed route composition. #118 owns assembled rules. Browser-safe
  verified Source Version/current-revision/candidate discovery needs one
  published owner before #56 closure.
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
