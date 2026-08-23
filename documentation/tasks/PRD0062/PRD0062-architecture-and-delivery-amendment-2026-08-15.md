# PRD0062 Architecture and Delivery Amendment — 2026-08-15

Status: **ACCEPTED current amendment for the active PRD0062 implementation lineage**
Accepted: 2026-08-15
Applies to: Book Homework integration, trusted Book Homework read projections, PRD0062 production-composition acceptance, and the browser-handoff sequencing used to complete PRD0062.

## 0. Authority and intent

This amendment records architecture and delivery requirements that became necessary while completing PRD0062, especially during bounded production activation and browser-handoff work under ticket #126.

It does **not** create a new product, a generic integration platform, a deployment framework, or a separate completion roadmap. It makes explicit the minimum architecture and acceptance rules required to satisfy already-approved PRD0062 outcomes safely:

- Book/subtree Homework must appear in and be usable from the existing Homework experience;
- Book Runtime, progress, result, review, scheduling, and Delivery retain Book-owned authority;
- existing non-Book Homework behavior must remain intact;
- teacher/student Book Homework surfaces must show trusted Book state rather than invented legacy state; and
- production acceptance must prove the actual multi-authority composition rather than use production as an integration debugger.

Where this amendment conflicts with older PRD0062 implementation-planning language about Book Homework compatibility, trusted projection behavior, or production-composition proof, **this amendment wins for the active PRD0062 lineage**. It does not by itself mark any ticket, packet, or acceptance criterion complete.

The historical/dormant PRD0062 and PRD0062b artifacts remain historical unless separately reactivated. Current execution must use this amendment together with the active orchestration, traceability, recovery/completion plan, accepted Book Homework bridge contract, current source, and current accepted evidence.

---

## 1. Why this amendment exists

The baseline PRD already required Book Homework to extend the existing Homework experience while preserving existing Homework behavior. It also required Activity-level Book progress/submission semantics rather than pretending a whole Book is one legacy Homework submission.

During #126 completion work, several production/browser failures exposed requirements that were implicit but not sufficiently explicit in the original contract:

1. a Book compatibility record could fall through legacy Homework normalization and be misclassified as ordinary Homework;
2. making legacy Homework pretend Book Homework had legacy `stats`, submission, attempt, or status authority would violate the intended ownership model;
3. student Homework discovery depended on the existing class-membership owner and could not safely be bypassed with Book-specific broad queries;
4. teacher projection treated derived completion failure as total assignment/recipient absence, causing a valid assigned student row to disappear;
5. retry could reuse a resolved unavailable result rather than perform a fresh read; and
6. a workerd composition harness could be green while not enforcing the exact Firebase rules against the Worker-generated service UID/custom claims, leaving production to discover authorization/composition defects.

The resulting corrections are not independent features. They are the minimum architecture needed to make the original PRD0062 Book Homework and release requirements coherent.

---

## 2. Governing scope rule

The governing scope rule for every compatibility or composition change is:

> **Implement only the minimum architecture required by a named PRD0062 requirement or to prove its real product path. Stop when that requirement is satisfied.**

No adapter, projection, harness, recovery mechanism, or deployment workaround has an independent PRD0062 completion target.

After the representative browser handoff, work returns directly to the remaining PRD0062 acceptance delta. A later compatibility operation is in scope only when a named remaining PRD0062 acceptance requirement needs it.

---

## 3. PRD0062-A1 — Book Homework compatibility is an additive anti-corruption boundary

Book Homework MUST integrate with the existing Homework experience through a bounded anti-corruption/compatibility boundary.

The required shape is:

```text
Homework discovery/read
        ↓
Book compatibility discriminator
     ↙                         ↘
Book compatibility path        ordinary Homework path
     ↓                          unchanged
Book-owned authority/runtime
```

The implementation MUST NOT take this shape:

```text
ordinary Homework internals
        ↓
scattered Book special cases
        ↓
changed legacy semantics
```

### 3.1 Authority

The governing integration rule is:

> **Bidirectional interaction, unidirectional authority per fact.**

Book-owned facts remain authoritative on the Book side, including as applicable:

- committed Book Homework root/operation state;
- exact per-recipient Book Homework authority;
- canonical publication/manifest and Activity Version identity;
- Book Delivery and binding identity/revision;
- Book Runtime attempts, drafts, submissions, and terminal facts;
- Book progress/completion aggregates; and
- Book evaluation/result/review facts.

Existing Homework remains authoritative for ordinary non-Book Homework behavior.

### 3.2 Book → Homework

Book → Homework integration is a **lossy read/discovery projection**, not a database mirror.

`homework_assignments/{assignmentId}` MAY contain a derived Book compatibility shell required for existing Homework discovery, routing, and presentation. That shell MUST remain non-authoritative for Book decisions.

The compatibility shell MUST NOT acquire synthetic legacy authority merely to satisfy ordinary Homework assumptions. In particular, Book compatibility MUST NOT invent legacy:

- `stats`;
- authoritative `status`;
- submission rows;
- attempt rows;
- score/percentage authority;
- progress authority; or
- `studentOverrides`.

Book compatibility MUST be discriminated before ordinary Homework normalization or other legacy transformations can alter its contract shape.

### 3.3 Homework → Book

Homework → Book interaction is **command/read enrichment**, not inverse projection.

A Homework-originated Book action may carry only the bounded locator/intent and authenticated actor context that the user action legitimately supplies. Every additional Book-required fact MUST be reloaded from authoritative Book sources before the Book domain action/read executes.

Missing, crossed, stale, or inconsistent owner, recipient, authority, publication, manifest, Delivery, placement, version, or revision facts MUST fail closed. The compatibility shell MUST NOT be used to synthesize missing Book authority.

### 3.4 Existing Homework preservation

Existing non-Book Homework semantics MUST remain unchanged unless a separate named PRD0062 requirement explicitly requires a shared behavior change that cannot safely be implemented at the additive boundary.

PRD0062 Book compatibility MUST NOT become a reason to redesign ordinary Homework mutation, submission, attempt, status/stat, deadline, or result authority.

Shared changes are acceptable only where they form a narrow dispatch/ownership seam needed to keep Book and ordinary Homework paths separated, for example:

- pre-normalization compatibility discrimination;
- a Book-only detail/list dispatch before legacy submission loading;
- optional canonical membership input at an existing read owner; or
- extraction of unchanged legacy projection logic so the compatibility branch can bypass it without duplicating behavior.

Book-specific membership workarounds, hard-coded pilot identities, or broad Homework queries that bypass the canonical student class-membership owner are prohibited.

---

## 4. PRD0062-A2 — Authoritative recipient identity is separate from derived progress

A valid Book Homework teacher/student recipient row is established from committed Book Homework assignment/recipient authority plus the matching active Delivery/binding context.

Derived progress, completion, grading, review, score, integrity, and similar read-model facts are **enrichments**, not recipient-membership authority.

Therefore:

1. a temporary/unavailable derived completion read MUST NOT silently erase an otherwise valid authoritative recipient row;
2. an unavailable derived value MUST be represented explicitly as unavailable/null/partial according to the surface contract, without inventing a value;
3. UI for an unavailable derived value MUST NOT expose metrics, scores, Activity states, grading/review controls, or legacy Homework controls that require trusted progress data;
4. crossed owner/recipient/binding/revision/authority identity MUST continue to fail closed rather than degrade to a partial trusted row; and
5. unavailable/error/null derived reads MUST remain genuinely retryable and MUST NOT be cached as authoritative non-existence in a way that makes Retry reuse the same resolved unavailable result.

This separation applies to later PRD0062 progress, result, review, grading, integrity, and update surfaces as they are completed.

---

## 5. PRD0062-A3 — Production-composition acceptance must enforce the real authority rules

PRD0062 crosses multiple runtime and authority boundaries. Passing unit tests for those boundaries independently is insufficient to claim the representative production path is deployment-ready.

Before a production activation that depends on the Book Homework production composition, a deployment-equivalent acceptance proof MUST exercise the **default production composition** rather than injected test-only sagas/repositories at the owning boundary.

For the Book Homework M1/read path, the proof MUST be capable of exercising the relevant default Worker routes against:

- production-shaped committed Book Homework state;
- the exact applicable RTDB rules source;
- the exact applicable Firestore rules source;
- Worker-generated service identities and custom claim tuples;
- the canonical root, authority, Delivery, publication/Activity, and membership state required by the path; and
- the browser-facing teacher/student/Runtime read/launch sequence.

The rules engine MUST evaluate the exact generated UID/custom claims for the protected Firebase reads. A transport stub that records claims but returns data without enforcing the rules is not sufficient evidence for this gate.

### 5.1 Non-mutating shell-present replay

When the authoritative assignment and compatibility shell already exist, the acceptance proof MUST prefer direct test setup of that committed state and then exercise only the read/launch paths under rules.

It MUST NOT replay the assignment command merely to prove teacher/student consumption.

For the representative shell-present Book Homework path, the acceptance proof must cover as applicable:

```text
teacher aggregate projection
teacher per-student projection
student projection
student Homework locator → Book launch
Book Runtime resolution/rendering
```

The proof MUST assert that the read-path acceptance flow performs no assignment command, no compatibility projector write, and no unintended authoritative mutation.

### 5.2 Production is not the integration debugger

Once a production-composition gate exists for a boundary, production MUST NOT repeatedly serve as the primary integration debugger for that same supposedly covered boundary.

If production behavior differs from a green rule-enforced composition proof, first classify the difference as a deployment divergence such as:

- active Worker artifact/config;
- environment/binding;
- generated service identity/claims;
- active RTDB/Firestore rules;
- frontend/Hosting artifact; or
- durable production state.

Do not immediately redesign product code merely because the deployed system differs from the frozen proven system.

Operational authentication, upload transport, reviewer-session authentication, or similar tooling/control-plane failures do not authorize changes to Book/Homework product semantics.

---

## 6. PRD0062-A4 — Independent review is a method/scope gate, not a specific tool identity

Where PRD0062 requires independent Standards/Spec review before release mutation, the requirement is **independent inspection evidence**, not continuity with a particular reviewer process, account, refresh token, or platform session.

Accepted independent review evidence MUST record:

- reviewer method/independence relative to the implementing agent;
- exact inspected scope/diff or frozen candidate boundary;
- governing PRD/amendment requirements inspected;
- risk model;
- validation/tests independently run or explicitly not rerun; and
- residual risks and PASS/BLOCKED disposition.

A specific review tool/session authentication failure MUST be recorded as tooling failure, but it MUST NOT become a permanent PRD0062 product blocker when an equivalent independent read-only review can satisfy the same review contract.

This rule does not weaken required review. It prevents a non-product credential from becoming a single point of failure for an otherwise reviewable frozen candidate.

---

## 7. PRD0062-A5 — User-visible browser handoff precedes the broad remaining-acceptance audit

The next meaningful milestone after the representative production-normal path is safe is **real-site browser handoff to the user**, not additional open-ended internal recovery work.

The handoff MUST provide the real site/origin, role/account context, shortest representative teacher/student flow, expected behavior, and known limitations.

The representative browser path should prove at minimum the currently targeted Book Homework round trip:

```text
teacher Homework → Book detail → trusted student row/progress state
student Homework → Book detail → Open Book Activities → real Book Runtime
```

Ordinary Homework must remain unchanged; where no ordinary production fixture is available, do not create unrelated production data solely for a smoke test. Preserve regression evidence and report the production smoke as unavailable.

After the handoff, the workstream MUST switch to:

> **remaining PRD0062 acceptance delta**

not:

> **Book ↔ Homework adapter completion**

User product observations and the canonical PRD/ticket acceptance delta are both inputs to the remaining completion work. Neither replaces the other.

---

## 8. Explicit non-goals of this amendment

This amendment does **not** authorize or require:

- a generic Homework ↔ Book integration framework;
- generalized bidirectional database synchronization;
- a new shared integration bus;
- a replacement Homework architecture;
- a generic Firebase abstraction;
- a generic deployment/recovery framework;
- a new IAM/service-account architecture merely for PRD0062;
- independent adapter milestones or an adapter roadmap;
- legacy Homework APIs becoming Book-aware beyond the minimum additive dispatch seam;
- fake legacy state on the Book compatibility shell;
- replaying or recreating a committed assignment to repair browser/read behavior; or
- starting Milestone 2/general remaining work before the user browser handoff when M1 is otherwise ready.

Anything beyond the minimum required by a named PRD0062 acceptance requirement is deferred unless separately approved.

---

## 9. Added acceptance criteria

The following criteria are now part of PRD0062 acceptance:

### AC-AMEND-01 — Additive compatibility

A Book Homework compatibility record is intercepted before legacy Homework assumptions execute, and ordinary Homework retains its existing semantics. No fake legacy authority is added to the Book shell.

### AC-AMEND-02 — Authoritative return path

A Homework-originated Book read/launch action resolves strict Book context from authoritative Book sources using the authenticated actor plus bounded locator/intent. Missing or crossed provenance fails closed.

### AC-AMEND-03 — Trusted row versus derived enrichment

A saga/authority/Delivery-valid assigned recipient remains represented when derived completion is unavailable, with derived data explicitly unavailable and no untrusted progress controls. Identity mismatches still fail closed, and Retry performs a fresh read.

### AC-AMEND-04 — Rule-enforced default composition

The representative Book Homework read/launch path passes through the default production Worker composition against real RTDB and Firestore rules using the generated service UID/custom claims and production-shaped state, without assignment replay or unintended writes.

### AC-AMEND-05 — Production divergence discipline

After AC-AMEND-04 is green, a differing production result is first investigated as deployed artifact/config/claims/rules/state divergence. Production is not used as the next integration test for the same covered boundary.

### AC-AMEND-06 — Review substitutability

Required independent review is satisfied by a documented independent method/scope/risk/validation review, not by a specific reviewer account/session. Tool authentication failure alone cannot permanently block an equivalent valid review path.

### AC-AMEND-07 — Browser handoff sequencing

Once the representative production-normal path is safely active, the user receives the real-site handoff before a broad remaining-acceptance audit. Work then returns to the complete PRD0062 acceptance delta.

---

## 10. Traceability and supporting contracts

This amendment must be read together with:

- `documentation/tasks/PRD0062/PRD0062-book-homework-bridge-contract.md` for the detailed Book ↔ Homework anti-corruption/authority contract;
- `documentation/tasks/PRD0062/PRD0062-production-normal-recovery-and-completion-plan.md` for current recovery and completion sequencing;
- `documentation/tasks/PRD0062/tasks-book-activity-05-book-homework.md` for Book Homework product execution;
- `documentation/tasks/PRD0062/tasks-book-activity-08-pilot-hardening-release.md` for final validation/release execution; and
- `documentation/tasks/PRD0062/traceability-book-activity-v1.md` for acceptance mapping.

The amendment records requirements. Evidence files record whether a particular candidate/deployment satisfies them. Historical #126 failure packets remain append-only evidence and do not redefine these requirements.

## 11. #126 deployed-proof evidence overlay — 2026-08-23

The active requirements remain unchanged. Under the amendment's production
divergence rule, the exact deployed candidate was investigated at the
artifact/configuration boundary after the real browser path returned HTTP 503
`document_configuration_unavailable`. The default document repository
composition was found not to forward the Firebase Web API key required by its
claim-token provider. The candidate was rolled back safely before closure;
therefore AC-AMEND-07 and the student reference-only/PDF acceptance remain
unmet. No product-source change, assignment replay, or durable-state
substitution was made. See the redacted append-only record in
`evidence/126-production-proof-gate-2026-08-23.json` and `.md`.

## Append-only #126 correction-cycle overlay — 2026-08-23

The default document production composition now forwards the required Firebase
Web API key at its owning boundary. The owning regression, adjacent Worker
proof, exact config/manifest identities, and independent Standards/
Specification reviews are recorded in
`evidence/126-production-normal-document-composition-cycle-2026-08-23.json`.
The candidate was uploaded, activated, and read back, but the required real
authenticated browser proof could not start because the browser-control
runtime failed during initialization. The candidate was rolled back at 100%;
AC-AMEND-07 and the reference-only/PDF gate remain unmet. No assignment replay
or durable-state substitution is authorized.
