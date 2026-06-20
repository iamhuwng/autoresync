# Pre-Task-1.8 Readiness Audit — Completion Addendum

Status: Advisory review artifact — NOT planning authority. Supplements `tasks/review-pre-task-1.8-independent-readiness-audit-0055.md` (the primary audit). Authority order unchanged.
Type: Completion pass for the two reviewer scopes the primary audit could not finish (runtime PRDs 0059/0060/0061 full + historical-drift layer).
Date: 2026-06-20
Verdict impact: **UNCHANGED — PASS WITH REQUIRED CORRECTIONS.** No new BLOCKER surfaced. Adds findings N1–N5 (one HIGH elevation, three MEDIUM, one LOW) and upgrades several "not fully verified" completeness cells to PRESENT.

> Read the primary audit first. This addendum only records what is NEW or now-confirmed. It does not repeat B1, B2, H1–H5, M1–M8, or L1.

---

## What this pass closed

The primary audit disclosed that two delegated reviewers stalled, leaving these gaps:
1. Full completeness audit of PRD-0059 (solo), PRD-0060 (live), PRD-0061 (Reading V2).
2. Historical-drift verification of strategy/research/audit/implementation-log + the 3 runtime architecture docs.

This pass completed (1) for PRD-0060 via a focused subagent (full 1512-line read + source verification) and for PRD-0059/0061 via main-reviewer section-and-contract verification plus first-hand reading of all 3 runtime architecture docs (mobile-ielts-listening-audio-navigation 120/120, mobile-ielts-listening-runtime-diagnostics 74/74, reading-v2-runtime-integrations 179/179). Item (2) is partially closed (see Residual Gaps).

### Completeness cells upgraded to PRESENT (Task-1.8 axes)

| PRD | Axis | Was | Now | Evidence |
|---|---|---|---|---|
| 0059 | rollback | nfv | PRESENT | §19 line 987, §20 item 22, §24 item 7 |
| 0059 | observability | nfv | PRESENT | §4 (line 248), §21 (line 1076) |
| 0059 | stop conditions | nfv | PRESENT | §23 (lines 1103–1115) |
| 0059 | tests | OK | CONFIRMED | §17 (777), §18 browser proof (877) |
| 0060 | rollback | nfv | PRESENT | §27 (11-rule plan) |
| 0060 | observability | nfv | PRESENT | §25 (10 actions + 10 events + dimensions) |
| 0060 | stop conditions | nfv | PRESENT | §18 (15 conditions) |
| 0061 | rollback | nfv | PRESENT | §20 (line 944, code-only, data-neutral) |
| 0061 | observability | nfv | PRESENT | §18 (line 882) |
| 0061 | stop conditions | nfv | PRESENT | §25 (line 1141), incl. self-aware item 15 |
| 0061 | tests | nfv | PRESENT | §15 (719), §16 RED/GREEN/mutation (776), §17 (810) |

PRD-0059 and PRD-0061 are the cleanest of the six child PRDs — structurally complete on all axes, with no new findings of their own.

---

## NEW Findings (completion pass)

### HIGH

**N5 — Elevates H4: the worker PRD-0058 wants to extend for registry backup ALSO runs Reading V2 trusted submit + homework.**
- Confirmed fact. `documentation/architecture/reading-v2-runtime-integrations.md:113,117` states the production Reading V2 trusted-submit backend is the Cloudflare Worker `r2-backup-worker/src/reading-v2/submit.ts` (Firebase Functions core at `functions/src/readingV2SubmitCore.ts` is shared source only, not production). Subagent-2 H4 already found `r2-backup-worker/src/index.ts:413,417` also routes `/api/reading-v2/submit` and `/api/homework/assignments`. PRD-0058 (§6/§8) describes that worker as backup/restore only.
- Why it matters more than H4 alone: a registry backup/restore change to `r2-backup-worker` has cross-feature blast radius spanning Reading V2 trusted submit and homework, not just media backup. A routing/type regression there breaks Reading V2 result submission.
- Required correction: PRD-0058 §6 must document the worker's full route surface (media backup + Reading V2 submit + homework) and require regression tests for `r2-backup-worker/src/reading-v2/submit.ts` and the homework route in any packet that touches that worker. Cross-reference reading-v2-runtime-integrations.md.
- Blocks: PRD-0058 registry backup integration. Approval: architecture-security.

### MEDIUM

**N1 — Playwright `testDir` mismatch makes PRD-0060 §24 proof command unrunnable as written.**
- Confirmed fact (first-hand). `playwright.config.js:5` -> `testDir: './e2e'`. PRD-0060 §24 (line ~1239) command is `npx playwright test tests/e2e/listening-live-session.spec.ts --reporter=json > report.json`. The `tests/e2e/` path is outside the configured `./e2e` testDir; no `tests/e2e/` directory exists.
- Failure scenario: first browser-proof run returns "no tests found"; the proof artifact path is silently invalid.
- Correction: align one to the other — set config `testDir: './tests/e2e'` OR change the PRD command to `e2e/listening-live-session.spec.ts`. Record the choice. Note: this also touches the Playwright Testing Protocol convention (every run uses `--reporter=json > report.json`).
- Blocks: PRD-0060 §24 browser proof; Phase 2–5. Approval: architecture alignment (record the decision).

**N2 — `playwright.config.js` has no student `5174` webServer; dual teacher/student proof is unsupported.**
- Confirmed fact (first-hand). `playwright.config.js:12,21-24` defines a single `baseURL`/`webServer` at `http://localhost:5173`. PRD-0060 §24 (and AGENTS.md Live Browser Testing URLs) require teacher `5173` + student `5174` as separate authenticated contexts. No `5174` server is launched.
- Failure scenario: every teacher+student dual-context scenario (the core of live-session proof) cannot connect the student context, or silently falls back to `5173`, defeating the authority-boundary proof. Also affects PRD-0057/0058/0059 browser-proof gates that require a student `5174` context.
- Correction: add a second `webServer` (student Vite on `--port 5174`) in `playwright.config.js`, or document the exact out-of-band `5174` launch command in each child PRD's browser-proof section. This is shared test-harness infrastructure — assign an owner (recommend the storage/S0 harness task or a dedicated test-infra packet) rather than leaving it implicit in each PRD.
- Blocks: live and solo browser-proof gates across 0057/0058/0059/0060. Approval: architecture (test-infra ownership).

**N3 — Protected live monitor hook pervasively uses `alert()`/`window.confirm()`, violating the shared-announcement rule; only the audio subset is owned.**
- Confirmed fact (first-hand). `src/hooks/monitor/useMonitorControls.ts` uses `alert()`/`window.confirm()` at 14 sites: lines 288, 325, 497, 797, 826, 840, 843, 886, 929, 949, 986, 1035, 1061, 1131. This violates AGENTS.md "User Action Announcements" (shared bottom-right `role=status`/`role=alert`, no `alert()`) and PRD-0060 FR-102/FR-104.
- Scope gap: PRD-0060 owns and plans to fix the audio-authority subset (886 pause, 929 resume, 949 skip-confirm, 986 skip, 1035 speed). The remaining ~9 sites are non-audio teacher-monitor actions (start test 288, pause/resume test 325, confirm 497, end test 797, extend-time 826/840/843, accommodations 1061/1131) that are not clearly owned by any child PRD.
- Failure scenario: `window.confirm()` blocks/behaves inconsistently on mobile Safari/Chrome; screen-reader users get no accessible live region; AGENTS.md announcement compliance fails. Remediating only the audio subset leaves the same protected file half-migrated.
- Correction: PRD-0060 should note the full inventory and either (a) own the file-wide migration to the shared announcement system, or (b) explicitly defer the non-audio sites to a named teacher-monitor packet. Replace `window.confirm()` with an in-app modal.
- Blocks: PRD-0060 Phase 2 monitor convergence + accessibility acceptance (§19). Approval: implementation (FR-102 already mandates) + scope decision for the non-audio sites.

### LOW

**N4 — `HeadphoneRequestStatus` type lacks `'revoked'`, which PRD-0060 FR-057/FR-062 require.**
- Confirmed fact (first-hand). `src/types/audio.types.ts:75` -> `export type HeadphoneRequestStatus = 'pending' | 'approved' | 'denied';`. PRD-0060 FR-057 requires `pending|approved|denied|revoked` and FR-062 requires `revoked` distinct from `denied`. Current type cannot express it; a new V2 type with `revoked` would mismatch existing consumers (`HeadphoneRequest.status` line 93, `StudentSyncStatus.headphoneStatus` line 141).
- Correction: add `'revoked'` to the union before the headphone service is implemented and update consumers (or define the migration to `HeadphoneRequestV2` cleanly). PRD-0060 already authorizes this; record it as a Phase-3 precondition.
- Blocks: PRD-0060 Phase 3 (headphone/recovery). Approval: none (FR-057 authorizes).

---

## Source-Verified Confirmations (strengthen the verdict — no defect)

PRD-0060 (live), via full 1512-line read + source:
- Load-test plan covers 100 students/session + 20 concurrent sessions (2,000 virtual clients), with methodology (8 network profiles, ramp/steady/drain, 17 pass thresholds) and is explicitly NON-destructive — "Never run destructive load against production… unique prefixed session codes and fixture users" (§17:881–886). CONFIRMED.
- 500ms/2s and 10s-disconnect values framed as test baselines needing measured proof (FR-037, FR-052), not final. CONFIRMED.
- Heartbeat is `HEARTBEAT_INTERVAL_MS = 2000` (`useMasterAudioState.ts:23`), not a 500ms write loop (FR-012). CONFIRMED.
- Teacher-disconnect grace `TEACHER_DISCONNECT_THRESHOLD_MS = 10000` (`useAudioSync.ts:27`) matches FR-052. CONFIRMED.
- Monitor default-value hazard (default section1/pos0/speed1.0) is a declared release blocker (FR-047, §6.3); source confirms it is currently live (`useMonitorControls.ts` defaults + `TeacherTestMonitorPage.tsx` argless calls) — expected pre-implementation. CONFIRMED.
- AudioPlayer internal changes require BOTH solo+live suites (§21:1035, §23:1098, §32:1506); does NOT absorb solo state (no solo imports in the hooks). CONFIRMED.
- File-size baselines exact: AudioPlayer 1885, ListeningTestPage 2168, TeacherTestMonitorPage 1431, useMonitorControls 1180, AudioProgressPanel 850 (§22). CONFIRMED.
- Rollback §27, observability §25, stop conditions §18, regression checklist §29 — all complete. CONFIRMED.

PRD-0059 (solo):
- Complete on all Task-1.8 axes (§8 dependencies on 0057/0058; §9 state ownership; §10 AudioPlayer boundary; §15 module homes; §16 owned/protected; §17 tests; §18 browser proof; §19 rollout+rollback; §23 stop conditions; §24 DoD). Already carries a "Packet 1I Data-Path And Line-Evidence Addendum" (§25).
- Solo hook anchors are real: `src/hooks/solo/useSoloResume.ts`, `useSoloTimer.ts`, `useSoloSubmission.ts`, `useSoloAutoSave.ts`, `useSoloTestData.ts` all exist.

PRD-0061 (Reading V2):
- Complete on all axes (§9–26), with a self-aware stop condition (§25 item 15: "Task 1.8 completeness audit finds this child PRD missing a required owned/protected path, contract, test, rollback, observability, or stop condition").
- ZERO `masterAudioState`/`audioCommand`/audio references — Reading V2 isolation confirmed.
- Preservation claims match the authority doc `reading-v2-runtime-integrations.md`: submit payload fields (FR-024 vs arch lines 97–104), backend scoring (FR-026 vs line 106), AI feedback `result.readingV2.reviewPayload` (FR-029 vs lines 125–126), audit path (FR-030 vs line 141), projection paths (FR-002 vs lines 44–45). CONFIRMED.

Architecture docs (read first-hand this pass):
- `mobile-ielts-listening-audio-navigation.md` (120) — line 26 reinforces that generic shells must not own `currentAudioIndex`/playback intent/section transitions/live authority; lines 32–43 require active student section nav to move `currentAudioIndex` and start destination audio (a behavior 0059's "preserve mobile semantics" must not regress).
- `mobile-ielts-listening-runtime-diagnostics.md` (74) — gated diagnostics model (`listeningDiagnostics`, dev-on/prod-off); confirms `src/hooks/solo/useSoloResume.ts`.
- `reading-v2-runtime-integrations.md` (179) — production RV2 submit backend is the Cloudflare Worker (line 113/117) -> see N5.

---

## Residual Gaps (still open after this pass)

1. Full line-by-line of the 4 historical docs (strategy 744, research 469, audit 302, implementation-log 436) and a systematic implementation-log-vs-source pass were NOT completed (the historical-drift subagent did not return). Mitigation: the canonical architecture doc's "Historical Artifact Authority Map" + "Obsolete Interpretations" already encode the drift resolution; subagent-2 confirmed Google Drive obsolescence across 0056/0057/0058; the load-bearing impl-log facts (shared primitives at `src/features/assessment/shared/components/`; audio hooks at `src/hooks/audio/`) were confirmed first-hand. Residual risk: LOW. Recommend a short dedicated impl-log-vs-source pass before final acceptance.
2. Full line-by-line of PRD-0059 (1145) and PRD-0061 (1199): every section header, completeness axis, and named contract was verified, but not every prose line. Confidence is now HIGH that both are complete and clean.

---

## Net Effect on the Verdict

- Verdict unchanged: PASS WITH REQUIRED CORRECTIONS.
- The two BLOCKERs (B1 upload-path/`assetId` ownership, B2 draft/version record paths) remain the headline and the only blockers.
- New corrections to fold into the correction packet: N5 (elevate H4, HIGH), N1/N2/N3 (MEDIUM), N4 (LOW).
- N1/N2 are shared test-harness defects (Playwright wiring) that affect multiple child PRDs' browser-proof gates — fix once, centrally, and assign an owner.
- PRD-0059, PRD-0060, PRD-0061 are confirmed complete on Task-1.8 axes; no BLOCKER hides in the runtime layer.

Status statements (still true): no planning file was modified to produce this addendum; Task 1.8 checkbox unchanged; Task 1.9 not started; implementation not started.
