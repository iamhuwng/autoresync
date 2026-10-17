# PRD0062 ticket #49 closure evidence — 2026-07-31

## Scope and authority

- Primary: `iamhuwng/autoresync#49`, Foundation ticket 06C.
- The live issue's disposable-preview authority was used only for one
  disposable teacher, Book, environment, and provider-object prefix.
- Ticket #50A and unrelated trusted-action gates remained default-deny.
- Provisioning credentials remained offline and were not runtime bindings.
- No credential value, account identifier, personal identity, signed URL,
  provider object identity, or secret content is retained here.

## Deployed state

- Named Cloudflare profile: `media`.
- Profile sentinel: `kahoot-media`; the backup-account sentinel was absent.
- Acceptance-run version after final secret rollback:
  `b92ecc94-44f8-4afe-bdeb-0f9ae359ead2`.
- Current 100% active post-review version:
  `1cf234e2-db2b-4a9d-b581-239bac2e2d98`.
- Current deployment:
  `61f18ddd-3df2-4a93-a614-b1ee6c8f2e4a`.
- Final preview gate state: `disabled`, from
  `2026-07-31T03:35:38.828Z`.
- Final disabled gate expiry:
  `2026-07-31T03:43:38.828Z`.
- Acceptance environment: `ticket49-preview`.
- Secure readback fingerprints:
  - teacher: `174bde79d0d3e7d90987764e3a6aaec6c434bde53621a61b5e291e03b94ede2c`;
  - Book: `d3c0677f0047fd3ea9df7dbd5b7ba36137aba1703aeffa11552a1819216745c5`;
  - provider prefix:
    `aaf7e5b432c323f16abb7deecc3c68de9393ed1b435b4c37eeabac266c82eeb8`.
- Final secure-source checks show the upload, metadata, and read role
  credentials all match their current role-separated files.
- The separately retained authority audit records the six 50A decisions as
  default-deny. No 50A secret, binding, route, or decision was changed during
  this drill.

### Acceptance transition ledger

1. `DISABLED`: the private B2 path and #49 preview gate began disabled.
2. `PROVISIONED`: the existing role-separated upload, metadata, and read
   identities were reused; the provisioning master remained offline.
3. `DEPLOYED`: canonical Worker code was deployed through the named `media`
   profile. The current post-review version is
   `1cf234e2-db2b-4a9d-b581-239bac2e2d98`.
4. `READBACK_VERIFIED`: deployed binding names, role-credential fingerprints,
   private bucket policy, exact prefix, and bounded gate document were read
   back without exposing values.
5. `BOUNDED_PREVIEW_ENABLED` (acceptance-only exception, not an activation
   state): only the disposable #49 teacher/Book/environment/prefix upload gate
   was enabled for the bounded acceptance drill.
6. `ACCEPTANCE_VERIFIED`: canonical upload, signed-target negatives and
   replay, interruption cleanup, representative 500 MiB inspection, quota,
   alert, Firebase, and provider readbacks passed.
7. `EXPLICITLY_ACTIVATED` was not entered: #50A and all unrelated trusted
   actions remained default-deny.
8. `DISABLED`: only the #49 acceptance exception was rolled back at
   `2026-07-31T03:35:38.828Z`; the fresh 503/no-reservation drill verified the
   rollback. After the final review repair was deployed, the authenticated
   teacher flow repeated only this rollback check against the current version:
   begin returned 503 with no reservation or Source Version. The sole console
   error was the expected 503 resource response.

### Private provider and binding contract

- The bucket remained private. Anonymous object read was denied, and no public
  bucket or public delivery fallback was enabled.
- The exact private-bucket CORS rule allowed only:
  - origin `http://localhost:5173`;
  - operation `s3_put`;
  - headers `content-type`, `x-amz-content-sha256`,
    `x-amz-meta-book-source-byte-size`, and
    `x-amz-meta-book-source-sha256`;
  - exposed response header `x-amz-version-id`;
  - maximum age 3,600 seconds.
- The deployed Worker used named non-secret bindings for Firebase project and
  database routing, upload account and runtime identity, allowed origin, B2
  endpoint/region/storage location/private bucket name/object prefix, and
  route state. Secret bindings were separately named for the Firebase runtime
  key, private bucket ID, upload role, metadata role, read role, and the
  bounded #49 preview gate. No value is retained here.
- Provider capabilities were exact and role-separated:
  - upload: `[writeFiles]`;
  - metadata: `[readFiles, listFiles]`;
  - read: `[readFiles]`;
  - cleanup: `[deleteFiles]`, owned by the separately deployed #50 cleanup
    consumer;
  - capacity: `[listFiles]`, owned by the separately deployed #50 capacity
    producer.
- The cleanup and capacity identities were not reused by the canonical #49
  upload runtime. The #50 scheduler evidence proves both consumers remain
  independently bounded and operational.

## Canonical positive and provider readback

- The final in-app Browser run used the repository's canonical 578-byte,
  two-page PDF fixture through the real teacher page on `localhost:5173`.
- The authenticated role was teacher, the exact route was
  `/teacher/materials/books/book-prd0062-ticket49-1785372769166`, and the
  viewport was 1,280 x 720.
- Browser inspection proved the exact byte size, physical page count, and
  checksum before authorization.
- The browser sent the original `File` directly to the one exact B2 target.
- The Worker used native B2 immutable-version metadata to prove the exact
  object identity, key, bucket, byte size, content type, and checksum.
- Authoritative Firebase readback records `verified_completed` at
  `2026-07-31T03:35:21.497Z`, with byte size 578.
- The UI recorded exactly one verified ready Source Version.
- A post-flow browser console review found no warning or error entries.

During the first final attempt, the Worker returned
`502 provider_unauthorized`. The red-capable browser/network loop proved that
CORS and teacher authentication had succeeded. Fingerprint-only comparison
then showed that all six provider fields in the secure bulk source were stale.
The bulk source was rebuilt from the current role-separated secure files,
redeployed through the `media` profile, and the exact retry passed. No values
were logged or retained.

## Negative, replay, interruption, and cleanup proof

- Existing deployed negative evidence remains in
  `artifacts/prd0062-ticket49-negative-20260730.json`:
  unauthenticated begin denied, wrong-origin Worker begin denied, wrong-origin
  provider preflight denied, and anonymous bucket read denied.
- Live altered-header, wrong-key, and cross-object signed-target requests were
  denied.
- The exact signed target accepted two same-object replays while valid.
- The same target was denied after its bounded expiry.
- Authoritative Firebase readback records the scheduler releasing that
  operation at `2026-07-31T03:15:24.258Z` with
  `exact_version_deleted`, proving all uncommitted exact versions were removed.
- A separate interrupted 500 MiB operation was released by the scheduler with
  `provider_absent`; its cleanup did not alter the earlier committed tiny
  Source Version.
- Begin authorization and completion/reconciliation are separately gated.
  The executable control test proves completion remains available after begin
  returns to deny, while the independently deployed #50 scheduler and its
  retained rollback drill prove cleanup/reconciliation remain active with the
  #49 preview gate disabled.
- The final rollback drill, after disabling only the #49 preview gate, returned
  Worker status 503. The browser remained `begin pending` with no reservation
  and no Source Version.

## Representative 500 MiB browser and memory proof

- For this incomplete-PRD foundation stage, the controlling continuation
  defines representative 500 MiB acceptance as browser/memory-path proof. The
  real provider-integrated positive remains the canonical tiny fixture so the
  acceptance drill stays bounded and no-cost.
- A real 524,288,000-byte PDF completed the production browser inspection and
  reported two physical pages without a crash.
- Ordinary production-flow samples showed no retained JS-heap or backing-store
  growth after inspection.
- A bounded hold/read/release probe of the same selected browser `File`
  measured a 525,075,046-byte backing-store increase while the 500 MiB
  `ArrayBuffer` was retained:
  - baseline backing store: 18,626,733 bytes;
  - held backing store: 543,701,779 bytes;
  - released backing store: 19,413,779 bytes.
- The production upload path itself does not call `arrayBuffer()` or
  `stream()`; it passes the original `File` body to `fetch`.
- The temporary 500 MiB fixture and the temporary in-page probe were removed.

## Quota, billing, and alerts

Authenticated Backblaze `Caps & Alerts` readback after the drills showed:

- storage today: `$0.00`, 1 KB;
- download today: `$0.00`, 0 bytes;
- Class B transactions: 3 of 2,500 daily;
- Class C transactions: 166 of 2,500 daily;
- all four corresponding alert checkboxes enabled.

No cap error occurred during the acceptance run.

## Verification

- Final ticket-focused root suite: 7 files, 89 tests passed.
- Final ticket-focused Cloudflare suite: 7 files, 67 tests passed.
- The canonical R2 quarantine contract passed all 6 checks after recognizing
  the #49 Worker config as active while continuing to reject Book-PDF R2/B2
  bindings and server-side PDF-processing fallbacks.
- Review raised a possible initial-versus-replacement idempotency mismatch.
  No speculative code change was made: every request admitted by the bounded
  preview gate is normalized to `replacement`, the control service's exact
  replay test passes, and the deployed same-operation target replay passed
  twice. The proposed failure therefore did not reproduce.
- A broader root sweep passed 99 of 100 tests. Its sole failure is the
  unrelated untracked Ticket 03A owned-contract test, which calls an absent
  `createSourceUploadProviderPort`; it is not included in #49 staging or claims.
- Ticket-focused ESLint passed.
- `git diff --check` passed.
- Cloudflare dry-run passed through Wrangler 4.112.0 on x64 Node.
- The final isolated production-build retry passed (9,448 modules; bundle
  budget remained within limit).
- A full shared-worktree TypeScript check is not claimed: it currently fails
  only in unrelated dirty book-assembly/runtime paths, with no #49-owned path
  in the diagnostics.

## Referenced retained evidence

- `artifacts/prd0062-ticket49-browser-20260730.json`
- `artifacts/prd0062-ticket49-harness-20260730.json`
- `artifacts/prd0062-ticket49-negative-20260730.json`
- `artifacts/prd0062-ticket-06c/final-verification-20260731.json`
- `artifacts/prd0062-ticket-06b/evidence.md`
- `artifacts/prd0062-ticket-07/capacity-scheduler-repair-20260730.md`
- `artifacts/prd0062-authority-audit-20260729-private-b2.json`
