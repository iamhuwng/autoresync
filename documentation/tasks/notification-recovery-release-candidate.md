# Notification recovery combined release candidate

**Prepared:** 2026-09-24. **Status:** source candidate only; no Firebase, Hosting, or Cloudflare deployment and no historical backfill.

## Source and proof

- Combined branch: `codex/notification-combined-release`, based on the latest inspected Hosting source commit `070d2d3c` and merged with notification branch `codex/notification-recovery` at `1ff86c63`, then documentation checkpoint `c1446e53` and live-rule preservation commits `e3eb4baf`, `f7f12347`.
- Current Hosting site `kahut1`: release `sites/kahut1/releases/1790240765374000`, version `aea32fa07517146f`, deployed 2026-09-24 09:06:05Z. The Firebase Hosting REST read on 2026-09-24 returned this as the newest of five releases. This version is associated with the dedicated THCS Gemma source; recheck before any deployment.
- [Combined Linux CI run 35987727981](https://github.com/iamhuwng/autoresync/actions/runs/35987727981) passed focused app, RTDB emulator, Firestore emulator, Workerd, and Wrangler dry-run gates at `05bcbffa`, including the already-live role validator added at `f7f12347`.
- After that run, the THCS store was changed to reuse the shared OAuth token. The focused local Workerd suite passed **62/62 across 18 files** and the notification Worker Wrangler dry-run passed at **385.11 KiB**. A new Linux CI run is still required for this source change.
- A local production Vite build from the combined source passed with configured Firebase build values. Bundle budget passed (`247 KB` root entry). Generated `notificationCommandClient-DpLzxhIH.js` contains `https://luyentap-notification-command.iamhuwng.workers.dev` and has SHA-256 `141230A782F51FEA71EAA29DC640E6C2F802C2A99555DF44786F544B1BCFB636`. No Gemini key values were loaded into this build. It is a build proof, not a deployable approved artifact until every required installation value and browser flow is checked.

## Rules composition

- The refreshed live RTDB rules snapshot was read after the separate AI gateway's role restriction. Its SHA-256 is `79CE0AFA69FD892BF941BD4BD30B2A143A4D92926E87011BD09F145AD51C33A3`; the local read-only copy is in `output/notification-recovery/live-rtdb-rules-refresh-20260924.json` in the notification worktree.
- The candidate `database.rules.json` preserves all four previously divergent live Book rule paths and the newer `users/$uid/role/.validate` restriction. Comparing the JSON rule tree with the refreshed live snapshot leaves **44 changed leaf/subtree paths**, all in notification-related source, query index, or intent rules. Their paths are listed in [the semantic diff inventory](notification-recovery-remote-rule-paths.txt); exact candidate expressions are in `database.rules.json`.
- Before any rules deploy, fetch live rules again, verify the snapshot hash or regenerate and review the semantic diff, then run the emulator against that exact composed file. A direct whole-file deploy from the notification source branch would overwrite live Book and AI rules and is not the release candidate.

## Cloudflare readback

Wrangler authentication is currently valid for account `e41db829dabe9993f03674afdfd56510`. The active deployment remains version `6df57eec-587b-44b5-9a59-6d65ba13a70a` at 100% (2026-09-23). `wrangler versions view` shows its script has only a `fetch` handler and its bindings lack `FIREBASE_WEB_API_KEY`; the candidate's scheduled handler is therefore **not live**. The dedicated Identity Toolkit key is restricted to `identitytoolkit.googleapis.com` and its value was verified via `gcloud` without printing it. It was staged with `wrangler versions secret put` as **undeployed** version `f4d45512-f2d0-4d51-b8ea-8de9012ddb27`; version readback shows the secret binding, while deployment readback confirms version `6df57eec` stayed active. The runtime service account now has `roles/datastore.user` in addition to `roles/firebasedatabase.admin`. No Worker deployment occurred. Read back the active script, bindings, cron triggers, and secret names immediately before release.

## Product and release gates

1. Deploy the combined Worker with the staged `FIREBASE_WEB_API_KEY` secret and Firestore-capable service account; read back its active version, bindings, and cron triggers. The current active version is fetch-only and lacks the key.
2. Measure the fully composed scheduled invocation, including queue reads, OAuth, recipient writes, redirects, failure issue, CPU, and overlapping triggers, against current Free plan limits. The [scheduler budget](notification-recovery-scheduler-budget.md) records the proposed two-trigger cadence, a measured THCS scan/inbox slice, and source-path estimates. CPU and populated-queue runtime proof remain open.
3. Release server and rules before the combined Hosting build. Verify teacher and student flows in real browsers at `http://localhost:5173` and `http://localhost:5174`, then in the authorized live target. Read back exact inbox records, read flags, links, retry, and one admin issue for a persistent failure. Green CI alone does not satisfy this gate.
4. Establish evidence-backed outage bounds and source records for the [35-row historical ledger](notification-recovery-historical-backfill.md), then run read-only previews, reviewed bounded writes, readback, and replay checks. No historical backfill has run. Row 32, THCS writing auto grade, has no committing source and remains outside delivered coverage.
5. Keep Book assignment/update notices on the same existing inbox and verify their committed-action behavior in the live release. Check current Hosting source and remote RTDB rules immediately before any cutover because both can change independently of this candidate.
