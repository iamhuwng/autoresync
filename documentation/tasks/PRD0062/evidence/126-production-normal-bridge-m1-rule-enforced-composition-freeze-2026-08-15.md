# PRD0062 Milestone 1 rule-enforced composition freeze — 2026-08-15

## Scope

This is a test-only, non-mutating proof for the existing PRD0062 Milestone-1
Book Homework read path. It does not invoke the assignment command or
projector, change the compatibility shell, add adapter capability, modify
legacy Homework, or contact production.

## Frozen state and rules

- Saga root: committed, visible, revision 7.
- Firestore Book authority: revision 2.
- Delivery binding: active, revision 1.
- Compatibility shell: present, `book_homework_compatibility`, source saga
  revision 7.
- Student membership: `student_classes/<student>/2NE3KY`, active.
- Runtime state: fixture-backed publication, canonical Activity, and
  student-safe Activity projection.
- RTDB activation source SHA-256:
  `e16df0c49724ca9a5f1c4fe886115f5b3ef3ddc5fe7bedf0a92d433454feca2f`.
- Firestore activation source SHA-256:
  `3322ddc1f4977f2063e0251c7921a3e19f8f463b9f8d92c06f13e7d679b519bc`.

## Proof artifact

- `cloudflare/test/prd0062-m1-rule-enforced-composition.emulator.test.ts`
  SHA-256 `363caf0736125845abb169c565f9fcf25b37427eb6962a396121c0a1ad8ce458`
- `cloudflare/vitest.prd0062-m1-rule-enforced-composition.config.mjs`
  SHA-256 `ca4b1d63baed8913adb5f027f2e46f5d85fd71025345e583f4e72ffefdc6e041`

The harness seeds RTDB and Firestore only under rules-disabled test setup.
The default `createUploadWorker()` production composition then performs its
normal service-account custom-token exchange. The test gateway retains each
issued UID/custom-claim tuple and forwards each Worker Firebase read to the
actual RTDB or Firestore emulator with that tuple. No in-memory Firebase data
stub is used for Worker reads.

## Required result

The proof executes:

1. teacher aggregate projection;
2. teacher per-student projection;
3. student projection;
4. delivery locator and Book Homework launch; and
5. student Runtime renderer resolution.

It asserts all Worker-originated Firebase operations are authenticated `GET`
reads, no command route is invoked, no compatibility shell is read or written
by the authoritative Book path, and no durable state is mutated. It verifies
the exact claim/path bindings for root, authority, and delivery reads.

Negative cases prove crossed Firestore authority claims and a binding revision
mismatch fail closed. A simulated unavailable derived completion read produces
the validated saga-owned student row with `completion: null`.

## Results

```text
firebase emulators:exec --only database,firestore ...vitest...rule-enforced-composition...
3 tests passed

book-homework route + saga focused suite: 23 tests passed
teacher progress/cache UI suite: 22 tests passed
student discovery/detail/locator/Runtime suite: 65 tests passed
focused ESLint: PASS
git diff --check: PASS
```

## Candidate boundary

The source correction remains limited to the Book read-projection boundary and
Book teacher UI cache contract. Existing legacy Homework behavior is not part
of this freeze. Candidate review is required before Wrangler reauthorization
and the one final production/browser handoff.
