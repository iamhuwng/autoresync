# Persistent qualification foundation — 17 November 2026

The separate QA foundation is deployed and usable for Codex-selected application
journeys. This records setup evidence, not production authorization or a feature's
promotion qualification. No production service, permission or data was changed.

## Identities and source

- Protected `main` observed at setup: `dbe75dca01673a2be21c259fb5c1521efe01082d`.
- Application tree: `6664a507d9d56a61976e968dbdf1f58e5995df42`.
- Website: `https://luyentap-pdf-qa-20261021.web.app`.
- Firebase project/site: `luyentap-pdf-qa-20261021`.
- RTDB: `luyentap-pdf-qa-20261021-default-rtdb.asia-southeast1.firebasedatabase.app`.
- Firestore: the QA project's `(default)` Standard-edition database in
  `asia-southeast1`.
- Worker: `https://luyentap-qualification-upload-signer.iamhuwng.workers.dev`.
- Independently observed active Worker version:
  `9b00993f-32a1-441b-ba7d-70e0bec77787`, 100% traffic.
- R2 bindings: `luyentap-qualification-media` and
  `luyentap-qualification-listening-audio`.
- Rate limiter: `UPLOAD_RATE_LIMITER`, namespace `205514`, 30 requests/60 seconds.
- Local QA env: `%USERPROFILE%\.luyentap\qualification\.env`; synchronized to
  GitHub environment `qualification` as `LUYENTAP_QUALIFICATION_ENV`.

The application was built from protected source using only the dedicated QA
environment. Runtime Worker source was also taken from that revision. The
configuration corrections below were applied separately on the existing QA
hardening branch; they do not change the compiled frontend code.

## Repairs demonstrated by the rehearsal

1. The existing QA Worker shell had no deployed source/bindings/endpoint. Deployed
   the checked-in isolated config and source through the existing x64 Wrangler.
   A temporary, byte-compatible root dependency junction supplied the app's PDF
   library to the worktree; no dependencies were installed.
2. Added the QA-only rate limiter and `BOOK_HOMEWORK_SERVICE_IDENTITY` matching
   the uploaded QA key. The service account initially had no project role. The
   owner explicitly authorized `roles/firebasedatabase.admin` after confirming
   that the database/project were separate from production; that grant was made
   only on the QA project.
3. A secret-name listing concealed an unusable `FIREBASE_WEB_API_KEY` value.
   The real registration probe exposed it. Resynchronized the verified QA web
   key through stdin. Temporary QA-only diagnostics were removed before final
   deployment; the Google service-account private key was never printed or
   committed, and its temporary local file had already been removed.
4. The student dashboard exposed a missing Firestore composite index. Deploying
   the checked-in indexes also proved nine single-field entries were invalid
   composite definitions. Removed those automatically managed entries, retained
   empty `fieldOverrides`, and added the actual pending-review query index:
   `markingStatus ASC, studentId ASC, submittedAt DESC`. All seven remaining
   composite definitions deployed successfully; the new index reached READY.
   The checked-in Firestore rules were also released to QA.
5. Publishing the hardening branch exposed an existing Git-triggered Cloudflare
   build using the repository-root app build, a default preview/deploy command
   and no build variables. Disabled automatic builds on the QA Worker so later
   pushes cannot replace its explicitly selected and tested QA deployment.

## Results

| Check | Result |
| --- | --- |
| Existing toolchain / Worker dry-run / QA Worker deployment | Passed; no dependency installation |
| Read-only foundation health with `--require-workers` | PASS; Firebase config, separate identity, Hosting site, RTDB, Auth and three QA URL bindings |
| QA frontend build | Passed |
| Independent Hosting source, manifest and content readback | Exact source and all 437 asset hashes verified |
| RTDB rules | Read back equal to the selected protected source |
| Firestore rules/index deployment | Passed; pending-review index READY |
| Real teacher browser login | `/login` to `/lobby`; zero console errors |
| Real student browser login | `/login` using student ID through QA Worker to `/student`; zero console errors after index repair |
| QA Worker registration, signed custom-token exchange and profile writes | Passed against real QA Auth/RTDB |
| Wrong password / foreign origin / anonymous private-index access | Rejected with 401 / 403 / 401 |
| Native Hosting clone recovery surface | QA live version cloned to one temporary channel; manifest readback matched the tested artifact |
| Cleanup | Both temporary Auth accounts, profiles and private student-ID mappings deleted and absence verified; session credential file removed; temporary channel independently absent |
| Focused Node health/config tests | 2 passed, 0 failed |
| Sol-loop source review | One round with GPT-6.1 Sol on medium; APPROVE, no findings; usage not reported |

Local machine evidence is retained under `tmp/qa-foundation-20261117/`:
`setup.json`, `readback.json`, `service-proof.json`, `browser-proof.json`,
`clone-recovery.json`, `cleanup.json`, `health.json`, `worker-deployments.json`
and `final-state.json`. These are operational records, not an immutable
production verification bundle. Each future candidate still needs its own
source-bound evidence.

## Boundaries for reuse

The stable foundation remains in place. Future journeys select their own
temporary accounts/data and, when needed, unique channels. Shared rules and
Worker versions must be reconciled and serialized; an exact preview origin
must be allowed for a browser-to-Worker journey and removed afterward.

No permanent journey password was retained. No production data was copied.
The rehearsal did not qualify every application page, Google sign-in, actual
verification-email delivery, public R2 delivery, Backblaze, external AI services,
Functions, migrations, production compatibility or production publication.
Public R2 delivery remains disabled; bucket bindings are not delivery proof.

Use `documentation/system/qualification-foundation-runbook.md` for current
operating instructions. The historical fixture-rules Hosting smoke lane must
not replace the persistent site's full candidate RTDB rules.
