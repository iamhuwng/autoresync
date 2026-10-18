# Existing Book restoration — 2026-10-18

Status: **deployed and verified within the scope below**. This corrects the
release configuration mistake that hid the existing Book catalog and editor.
The [incident record](2026-10-18-book-catalog-regression.md) preserves the cause
and historical evidence. The previous Reading/cache repair remains intact.

| Release identity | Verified value |
| --- | --- |
| Source revision | `091a1746c630658052978a0c75caa74c04318722` |
| Source tree | `af587f18b0c5df11f098afeb572cd6d468a76335` |
| Exact deployed source tag | `stable-2026-10-18-books` |
| Firebase project / Hosting site | `temp-a1437` / `kahut1` |
| Finalized Hosting version | `ffd0c61f899cb275` |
| Released | October 18, 09:50:22.374 Asia/Bangkok (`2026-10-18T02:50:22.374Z`) |
| Production environment SHA-256 | `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57` |
| Manifest SHA-256 | `cc8f182dbe33fa3c2939ece57e08b0e2d62f2de2b0247df6e27754401dde59b5` |
| Independent deployed content readback | All 453 manifest-listed file hashes matched |
| Previous Hosting / rollback target | `61721e91a13201ae` (retains the missing-Book regression) |

## Authorized change and prevention

The owner approved merging PR #152 and deploying its Hosting-only correction.
After approval, only `VITE_MATERIAL_BOOKS` and `VITE_MATERIAL_BOOK_EDITOR` changed
from disabled to enabled in the machine production environment. Endpoints and
other settings were preserved. The four Reading settings retain their reviewed values;
all six `VITE_BOOK_ACTIVITY_*_PRESENTATION` settings remain disabled.

The generic Book flag module now matches the provider-bound historical module
byte for byte. Existing PDF-mode records retain their historical editor dispatch;
this is not a claim that all PDF code is inaccessible. New PDF source creation
remains disabled. No dirty/new PDF feature source was imported.

PR #152 makes these 12 reviewed modes mandatory in production validation and
adds Release Safety CI. PR #153 replaces the retired installing harness at the
final Firebase invocation with the existing stateless tooling resolver. It
preserves the clean-source, environment, artifact and fresh remote-state guards.
The merged source passed 57 focused deployment/release/tool-routing tests;
applicable CI passed. The normal guarded route verified the prior 453 live files,
built clean production source (257 KB root entry), repeated the live check,
and deployed only `hosting:kahut1`. No package installation was needed.

## Live acceptance and limits

A fresh visit to `https://hocthem.net/login` resumed the Teacher Test session.
Book is visible and both private/public catalogs finish loading without error;
both are empty for this account. Create New Book opens, Materials reveals its
metadata form, and PDF source is disabled. The form was cancelled without a
production write. No existing Book was available to reopen a live editor.

Create New Test opened twice with URL remaining `https://hocthem.net/lobby`,
without `asset_refresh`. IELTS → Reading V2 reached Details; Reading Passage
loaded 11 records. No test was saved or published. Captured console warnings
and errors were empty. The student flow was not repeated for this two-flag
correction; the earlier Reading release records its student acceptance.

Local compiled acceptance separately proved materials Book creation, persisted
metadata update, listing and editor reopen against real disposable emulator
rules, with remote calls denied. This is not production Book persistence proof
or PDF/provider lifecycle acceptance.

The live manifest identifies the exact source, tree and environment above.
All 453 listed files were independently fetched from `kahut1.web.app`; the
custom domain's manifest, HTML and four critical assets matched too. Lobby,
creation-modal JavaScript and a missing-script probe on `hocthem.net` returned
`no-cache, no-store, must-revalidate`. Firebase reports the version finalized.

## Stable source and remaining work

GitHub main and the clean local stable repository were synchronized at the
deployed revision before release. The stable tag identifies that exact source;
the subsequent release-record commit changes documentation only. Start future
feature branches from main in a clean clone of the existing repository. Preserve
the separate dirty PDF checkout and its development dataset.

Only Hosting was deployed. No Worker, rules, database, storage or provider
lifecycle operation was included. Draft PR #150 homework recipient hardening,
draft PR #151 Listening cleanup and its unresolved upload/lease race, retained
feedback/design work, and PDF Book remain separate. This correction does not
mark the original broader assignment complete.

Ignored evidence in the canonical checkout's `tmp/deployment-audit-20261017/`
includes `book-hosting-execution-result.json`,
`book-hosting-deployed-proof-20261018.json`,
`book-hosting-live-browser-proof-20261018.json`,
`book-tab-restored-live-20261018.png`, and
`book-create-restored-live-20261018.png`. Environment backups remain ignored.
