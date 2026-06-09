# Discussion-Log ↔ Current-Docs Alignment Assessment

**Scope:** Reading V2 (PRD-0048) · Auto V3/V4 · PRD-0052 Part 1 & Part 2 · PRD-0054
**Question answered:** Do the historical `.codex` development/discussion logs and the *current* PRDs/tasklists form one coherent design/development path, and where do they still drift?
**Date of assessment:** 2026-06-09
**Author:** Claude Code (reconciliation pass)
**Status:** Reference assessment. Non-destructive companion to `documentation/tasks/0052+0054-assessment.txt` (which it partially supersedes — see §7).

> This document is the *discussion-log alignment* assessment. It is distinct from `0052+0054-assessment.txt`, which is a PRD-vs-PRD / PRD-vs-code conflict reassessment. Read §7 before trusting that older file: it predates the final 2026-06-09 09:16–09:34 revision of the PRDs and is therefore partially stale.

---

## 0. Executive Summary & Verdict

**Verdict: SUBSTANTIALLY RECONCILED AND COHERENT.** Every load-bearing decision recorded in the `.codex` conversation logs is reflected in the current PRDs and tasklists, with explicit cross-PRD precedence rules. The four bodies of work form one layered path:

```
PRD-0048 (Reading V2 canonical/anchor/projection invariants)
  └─ Auto V4 (Gemini-only, fail-closed, anchor-safe import)
       └─ PRD-0052 Part 1 (passage/book library, additive composition)
            └─ PRD-0052 Part 2  ◄── authoritative master-editing model
                 │  (ref-only masters, publish-state-split edit routing,
                 │   frozen assignment projection, composition numbering)
                 └─ PRD-0054 (lifecycle: archive, broken-ref repair,
                              duplicate guard, Reading-V2-specific audit)
                              — interpreted *through* Part 2
```

**What is fully aligned:** composition-first ref-only masters; publish-state-split Edit routing; single-passage Studio in a new tab; frozen assignment projections with a defined RTDB path + fail-closed launch; clone-only reuse; owned-refs-only `Update references?`; archive-not-delete with super-admin audit; broken-ref repair via Edit Test Modal with atomic remake; the **80% Sørensen–Dice duplicate guard**; the **Reading-V2-specific append-only audit path** registered across docs/rules/AGENTS; **no-V1-master-restore-UI**; Auto-V4 anchor integrity enforced per split passage; the composition-numbering assembly function; and the two-tasklist sequencing (Part 2 → 0054) with an explicit dependency gate.

**The one substantive residual:** the *founding* use case — "make a new reading passage only if not duplicated; compare dup % then confirm" at **auto-split / auto-import** time — is only partially covered. Current docs cover *same-source idempotency* (Part 2 FR-PUBLISH-1A) and the 80% guard scoped to *manual remake* (0054 FR-DUP-1), but fuzzy dedupe of an auto-split passage against the teacher's *other existing* passages is an **explicit deferred Non-Goal** (Part 2 §Non-Goals, line 202). This is acknowledged and cross-referenced, not silently dropped.

**Other open items** are (a) the stale `0052+0054-assessment.txt` artifact, (b) docs-ahead-of-code (PRDs are right; the publish pipeline and Lobby edit routing are not yet changed — the tasklists' Phase-0 gates exist to catch this), and (c) two implementation-level ambiguities the logs themselves never resolved (authoritative "student started" signal; extend `EditTestFrame` vs. new `ReadingV2MasterEditModal`), correctly deferred as tasklist stop-and-record flags rather than guessed.

---

## 1. Purpose and Scope

The task was to inspect **discussion/development conversation logs** (not only repo docs) inside `C:\Users\The Lord\.codex`, treat them as historical decision evidence, and reconcile them with the *updated* PRDs/tasklists. Where logs conflict with repo docs, report the conflict rather than silently choosing one. Where a log is stale, explain why and what supersedes it.

Topics in scope (as requested):
- Reading V2 unified design and development; PRD-0048 foundation
- Reading V2 Studio/runtime/task-group/page-schema decisions
- Auto V4 design & implementation; canonical anchor foundation; source-authoritative group repair; field fidelity foundation; Clippings/gold E2E validation
- PRD-0052 Part 1 (materials/books/passage library); PRD-0052 Part 2 (composition-first master tests)
- PRD-0054 (passage archive / master repair)
- Duplicate guard & 80% similarity decision
- Reading V2-specific audit path decision
- Browser proof, exact `localhost:5173`, and `@chrome` usage

---

## 2. Method & Evidence Base

### 2.1 What I read in `.codex`
- **`memories/rollout_summaries/*.md`** — 89 per-session distilled decision logs; ~33 in scope, read in full. Each file carries a header (`thread_id`, `updated_at`, `rollout_path`, `cwd`, `git_branch`) followed by a structured narrative (Task / Outcome / Preference signals / Key steps / Failures / Reusable knowledge / References). These are the cleanest decision records.
- **Raw transcripts** — `sessions/2026/MM/DD/rollout-*.jsonl` and `archived_sessions/rollout-*.jsonl`, exact-phrase searched for contested decisions (80% / similarity / duplicate / `localhost:5173` / `@chrome` / audit path / composition-first / archive / canonical anchor / source-authoritative / field fidelity).
- **`session_index.jsonl`** (1,203 threads) for thread discovery; **`memories/memory_summary.md`**, **`MEMORY.md`** for cross-reference.
- **Deliberately not read** (size/binary, would not help): `logs_2.sqlite` (~1.4 GB), `state_5.sqlite`, `memories_1.sqlite`, `goals_1.sqlite`, `history.jsonl`.

### 2.2 What I compared against (current repo docs)
- `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md` (mtime 09:16)
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md` (09:25)
- `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md` (09:32)
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md` (09:34)
- `documentation/tasks/0052+0054-assessment.txt` (09:09)
- `documentation/architecture/reading-v2-audit-trail.md` (new, untracked)
- `AGENTS.md`, `documentation/rules/infrastructure.md`, `documentation/rules/observability.md`

### 2.3 Provenance caveat (important for trust)
The rollout summaries are **distillations**, not raw transcripts. They faithfully record decisions but abstract some specifics (e.g., they say "duplicate warning" without the literal "80%"). For the exact numbers/wording I went to the **raw session transcripts** and to the **produced artifacts** the logs name as the decision's output. Every verbatim figure in this document is traced to its source (see Appendix A). No quantitative threshold was invented.

---

## 3. Evidence Inventory (logs found)

### 3.1 Reading V2 / Auto V3/V4 rollout summaries (read in full)
- `2026-05-19…ZcvX-restart_branch_localhost_vite_verified.md`
- `2026-05-21…3Zgv-prd0048_reading_v2_auto_v3_separate_worktree_clean_main.md`
- `2026-05-21…o9xq-reading_v2_auto_v3_sync_teacher_materials_worktree_cleanup.md`
- `2026-05-21…9i4i-reading_v2_auto_v4_clippings_gold_e2e.md`
- `2026-05-22…QDLA-reading_v2_auto_v4_binding_failure_and_diagnostic_gap.md`
- `2026-05-22…iS7l-reading_v2_auto_v4_backend_contract_and_parsing_diagnostic.md`
- `2026-05-23…F6E2-reading_v2_auto_v4_local_main_cleanup_and_fast_forward.md`
- `2026-05-23…Z5wF-reading_v2_auto_pipeline_ab_foundation_and_commit_attempt.md`
- `2026-05-24…nxQH-reading_v2_auto_v4_matching_info_root_cause_analysis.md`
- `2026-05-25…TJFG-reading_v2_auto_v4_source_authoritative_group_repair_tasklis.md`
- `2026-05-25…ALLL-prd0048_reading_v2_auto_v4_field_fidelity_foundation.md`
- `2026-05-25…tVNA-prd0048_reading_v2_auto_v4_field_fidelity_and_deploy.md`
- `2026-05-25…811B-reading_v2_key_exposure_backend_proxy.md`
- `2026-06-03…9nDU-reading_v2_auto_v4_agentic_workflow_assessment.md`
- `2026-06-06…zXNy-reading_v2_auto_v4_canonical_anchor_foundation_tasklist.md`
- `2026-06-06…AamZ-prd0048_reading_v2_auto_v4_canonical_anchor_foundation.md`
- `2026-06-06…lrbx-reading_v2_auto_v4_review_issues_and_anchor_safety.md`

### 3.2 PRD-0050 / PRD-0052 (Part 1) / Book editor / public-book rollout summaries
- `2026-05-28…rPwz-teacher_lobby_materials_list_view_prd_tasklist_visual_contra.md`
- `2026-05-31…XczY-root_design_md_synthesis_and_tasklist.md`
- `2026-05-31…9pYz-prd0052_teacher_materials_books_reading_passage_tasklist.md`
- `2026-06-01…4klN-prd0052_tasklist_peer_review_hardening_and_mockup_reference.md`
- `2026-06-01…FmOv-prd0052_teacher_materials_reading_passage_books_implementati.md`
- `2026-06-01…3IXf-prd0052_gap_closure_tasklist_and_worktree_reattach.md`
- `2026-06-02…HkNn-prd0052_public_book_governance_handoff_to_temp.md`
- `2026-06-02…3rMS-prd0052_public_book_admin_review_browser_qa_handoff.md`
- `2026-06-02…9YVb-prd0052_reading_v2_publish_permission_block.md`
- `2026-06-02…OliO-prd0052_reading_v2_publish_docs_knowns_propagation.md`
- `2026-06-02/03…73an / ZCFX-prd0052_bulk_reading_passage_worker…`
- `2026-06-04…bl2s-prd0052_book_editor_modal_tasklist_and_handoff.md`
- `2026-06-04…PTVW-prd0052_book_editor_modal_three_tab_redesign_and_handoff.md`
- `2026-06-05…6a0M-prd0052_book_editor_docs_knowns_commit_finalization.md`

### 3.3 Keystone PRD-0052 Part 2 / PRD-0054 sessions
- `2026-06-08…qGO3-prd0052_part2_composition_first_master_tests_and_prd0054_ali.md` (summary; `updated_at 2026-06-09T01:06:07Z`)
- `2026-06-09…NVMU-prd0052_part2_prd0054_faithfulness_review_and_tasklist_gate.md` (summary; `updated_at 2026-06-09T01:24:14Z`)
- **Raw final-decision threads:**
  - `sessions/2026/06/08/rollout-2026-06-08T21-53-36-019ea7b9-6ec3-7ec1-9a23-f80d4c1f6557.jsonl` (the model creation + alignment thread)
  - `sessions/2026/06/09/rollout-2026-06-09T08-06-29-019ea9ea-9e58-7542-91d3-776aea1addc4.jsonl` (faithfulness review + tasklist gate)
  - `sessions/2026/06/09/rollout-2026-06-09T08-24-34-019ea9fb-24fe-70c2-a5b8-207303ec2d69.jsonl` (**later** thread — 80% formula binding, Reading-V2-specific audit path, no-V1-restore-UI; **no rollout summary written yet**)

---

## 4. Chronological Decision Timeline (the arc)

| Date (local) | Decision | Source log |
|---|---|---|
| 2026-05-19 | Dev verification convention: success = listener + HTTP 200 on the fixed Vite port; title `MySTUdent Workspace`; Windows `netstat` fallback. | ZcvX |
| 2026-05-21 | Auto **V3** source-proof / answer-key hardening confirmed on `codex/reading-v2-auto-v3-source-proof-stack`; moved to a separate worktree to keep clean `main`; evidence-based checkbox discipline. | 3Zgv, o9xq |
| 2026-05-22 | **Auto V4 provider split:** *Gemini = topology + answer-key witness; Groq = per-passage structured JSON normalizer; local code = verifier/assembler/Studio guardrail.* Groq self-repair mandatory before bounded local audit/repair; Studio gets `needs_review` or fails closed. **Cloud Functions deprecated for new Reading V2; trusted backend = Cloudflare Worker / approved small backend.** New doc `reading-v2-auto-v4-provider-review-contract.md`. | iS7l |
| 2026-05-22 | **Clippings gold E2E** framework: independent gold parse + comparison + verdict rubric (`acceptable / needs-code-fix / provider-weakness-caught / blocked`); fixture `Practice Cam 10 Reading Test 04.md` (3 passages, 8 groups, 40 answers; P1 53-143, P2 145-247, P3 251-385, key @391); copyright-safe redaction; `--allow-live-v4-provider`. (Live run blocked by usage gate.) | 9i4i |
| 2026-05-22 | Auto V4 **binding failure** reproduced live on `localhost:5173`: `Source answer-key rows cannot bind to generated questions: 15-16, 19-40.`; diagnostics judged too summary-level. | QDLA |
| 2026-05-23/24 | **A/B foundation:** "no pipeline decision until both lanes tested on identical inputs / gold / metrics"; lanes `v3-groq-package` / `v4-full-doc` (default `v4-full-doc`); URL param `?readingV2AutoPipeline=…`. | Z5wF, F6E2 |
| 2026-05-24 | `matching-information` contamination root-caused to app-side reference-bank derivation; decision: contracts must be **source-led and family-specific**, hard vs soft constraints, ambiguity preserved for teacher review ("source ledger first, task contracts second, deterministic repair only when the source proves the shape"). | nxQH |
| 2026-05-25 | **Source-authoritative group repair:** raw teacher input = author-only source artifact; *no raw source / answer key / provider output / repair diagnostics in student or session payloads*; V4/Gemini only default parse path; Groq only for teacher/verifier-triggered group repair; deterministic rehydration for exact-copy only. | TJFG |
| 2026-05-25 | **V3 lane retired (`f00fe35`), V4 source-authoritative.** Field-fidelity foundation: shared `normalizeReadingV2AutoSourceProofText` prevents mojibake false-fails; under-represented note group routes to `teacher-groq-repair`. | ALLL |
| 2026-05-25 | **Word-limit fidelity contract:** word-limit phrases must stay out of `questionText`, stored only in `sectionInstructions[].wordLimit`/`wordLimitText`; `stripWordLimitTagsFromPrompt()`. Deployed to `kahut1`. | tVNA |
| 2026-05-28 | PRD-0050 Materials list view as a release-blocking **visual contract** (mockup HTML/PNG/components), overflow gates at named widths. | rPwz |
| 2026-05-31 → 06-05 | **PRD-0052 Part 1:** Books + Reading Passage library; storage paths pinned; **canonical index `material_catalog/material_indexes`** (old `reading_v2/listing_indexes` retired); public-book governance (sanitized projections, raw-read lockdown, `public-library-published` as only teacher-visible bucket, admin `Book Reviews` requires reason); bulk passage Worker; **Book editor three-tab modal** (Overview / Content [assignment inside] / Settings; `Assign` retired as a peer tab; reuse Edit Test Modal design; no new `@mantine/*`). | 9pYz, 4klN, FmOv, HkNn, 3rMS, OliO, bl2s, PTVW, 6a0M |
| 2026-06-03 | Auto V4 assessed as a bounded verifier-driven workflow ("**a safe assistant, not an autonomous judge**"); deterministic local checks + fewer/bounded AI calls preferred. | 9nDU |
| 2026-06-06 | **Canonical anchor foundation:** `assertValidReadingV2CanonicalDocument()` rejects duplicate `stimulus.anchorIds` (Set-size vs length); `registerStructuredLayoutAnchor()` = one question-number → one structured anchor per source position; same visible number in multiple structured positions = invalid; fail-closed before draft persistence; backfill classes `valid / auto-repairable / manual-review-required / unsafe-to-write` (only deterministic dupes auto-repaired); broad recursive anchor rewrite banned. | zXNy, AamZ |
| 2026-06-06 | **Review Issues panel + anchor safety:** click-to-fix repair queue (hover tooltips obsolete); "**Canonical anchor identity … is a uniqueness contract, not an event log.**" Current Auto V4 contract: "**Gemini staged extraction is the active default; whole-test Groq fallback is retired; Groq is only a future group-scoped repair path.**" Commits `ff32fce6`, `3095a727`. | lrbx |
| 2026-06-08 | **PRD-0052 Part 2 created** (composition-first ref-only masters; publish-time split; Edit Test Modal for published masters; single-passage Studio per passage; frozen assignment projection; clone-only for non-owned; `Use existing Reading Passages` flow). **PRD-0054 created** (archive-not-delete; broken-ref repair; duplicate guard) and **aligned to Part 2** ("Repair in Studio" → "Repair in Edit Test"; "broken tab" → "broken slot"). User gate: "**this 0052 part 2 must not be conflict with 0054, if there is, need to report.**" | qGO3 (raw …21-53-36) |
| 2026-06-09 early | **Faithfulness review:** drift found and patched — 0052 "source of truth" wording could allow embedded payload caches → made explicit "**must not store embedded full passage payload**"; 0054 stale "Studio" wording + duplicate manual-remake publish path → `Update references?` made conditional on owned refs, manual remake made a single-passage Studio publish that **atomically updates the originating master/Book ref**. Decided **two junior tasklists, Part 2 first then 0054**. | NVMU (raw …08-06-29) |
| 2026-06-09 08:24 | **80% threshold formula bound** (Sørensen–Dice, hashed shingles); **new Reading-V2-specific audit path** ("register this with app, system, docs, rules, md files, agents.md"); **no V1 master restore UI**. | raw …08-24-34 |
| 2026-06-09 09:09 | `0052+0054-assessment.txt` reassessment written (verdict "NEEDS POLISH"; H1–H8, C1–C6). | repo artifact |
| 2026-06-09 09:16–09:34 | **Final revision pass** of both PRDs + both tasklists, applying the assessment's recommendations. | repo artifacts |

---

## 5. Decision-by-Decision Reconciliation (log → current doc)

Legend: ✅ faithful · ➕ added after assessment · 🔧 changed to match recorded decision · ⚠️ residual/partial.

| # | Discussion-log decision | Source | Status | Current-doc location |
|---|---|---|---|---|
| 1 | Published master = **ref-only**, must **not store embedded payload** | qGO3/NVMU | ✅ | Part 2 §2.4; FR-PUBLISH-4 (L276), FR-PUBLISH-8 (L284); §1.4 (L77-79, L85); decisions 4-5 (L147-148) |
| 2 | **Edit routing split by publish state** | qGO3 | ✅➕ | Part 2 **FR-MASTER-EDIT-0** (L292); exact field `materialKind:'reading-v2-full-test-composition'`, `state:'published'`, `publishedVersionId` (L197); both-published-and-draft case (L199) |
| 3 | Single-passage Studio per passage, **new browser tab** | qGO3 | ✅ | Part 2 FR-MASTER-EDIT-13 (L318); FR-ALIGN-2/3 (L494-496) |
| 4 | **`Use existing Reading Passages`** creation flow (published passages only) | NVMU | ✅ | Part 2 §7 FR-EXISTING-* |
| 5 | **Frozen** assignment projection; refresh only before first student; **fail-closed** if missing | qGO3 | ✅➕ | Part 2 §2.6; FR-ASSIGN-1 (L454), FR-ASSIGN-9 (L470), **FR-ASSIGN-13** (L478); path `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` (L608-610) |
| 6 | **Clone-only** for non-owned/public (template rejected) | qGO3 | ✅ | Part 2 FR-MASTER-EDIT-10/12/15 (L312-322) |
| 7 | `Update references?` updates **owned refs only**, never assignments/results | NVMU | ✅ | Part 2 §7.5 FR-UPDATE-REFS-1…12 (L348-370); decisions 15-20 (L158-163) |
| 8 | **Archive-not-delete:** "Remove from library"; `Archive` subtab; restore same id/version; owner-only; super-admin archive with audit | qGO3/NVMU | ✅ | 0054 decisions 1-10; FR-RP-ARCH-*; FR-MASTER-DEL-5/10/11 (L328-342) |
| 9 | Broken master repair via **Edit Test Modal** ("Repair in Edit Test"); broken masters cannot be assigned/published; **no auto-repair V1** | NVMU | ✅ | 0054 §1.5; FR-ALIGN-1…5; FR-MASTER-BROKEN-* |
| 10 | **Manual remake → single-passage Studio**, atomically updates originating ref, **bypasses** `Update references?` | NVMU + assessment H4 | ✅🔧 | 0054 **FR-STUDIO-REMAKE-7/7A** (L446-448); decision 34 (L183); §2.7 (L138); Part 2 L203 |
| 11 | **Duplicate guard 80%**, deterministic Sørensen–Dice, hashed shingles only, archived-inclusive, owner-scoped | raw 08-24 | ✅ | 0054 FR-DUP-3 (L472), **FR-DUP-4A** (L478-482), FR-DUP-4B (L484); decisions 36-40 (L185-189); decision 8 (L216) |
| 12 | **Reading-V2-specific audit path**, separate from legacy `audit_logs`, registered across app/docs/rules/AGENTS | raw 08-24 (verbatim) | ✅ | `architecture/reading-v2-audit-trail.md`; 0054 decision 49 (L198), decisions 6-7 (L214-215), L680-683; FR-AUDIT-1 (L544); `AGENTS.md:65`; `rules/infrastructure.md:104-107`; `rules/observability.md:23-24` |
| 13 | **No V1 master restore UI** | raw 08-24 | ✅ | 0054 decision 4 (L212), **FR-MASTER-DEL-5A** (L330), success-criterion (L904) |
| 14 | **Two tasklists, Part 2 first, 0054 second**; 0054 repair UI gated on Part 2 modal | NVMU | ✅ | tasks-0052 Execution Contract (L12-13); tasks-0054 predecessor (L6), gate (L11-12), Phase 0 (L128-140), Phase 3 gate (L238) |
| 15 | Auto-V4 **anchor safety carried into split-on-publish** | assessment H8 | ✅➕ | Part 2 **FR-PUBLISH-9/10** (L286-288); tasks-0052 Phase 2 (L157) |
| 16 | **Composition numbering** assembly function, frozen into projection + results | assessment H5 | ✅➕ | Part 2 **§9.4** (L614-635) |
| 17 | Same-Test-Type at repair = **mismatch allowed with confirmation** | assessment C1 / raw 06-09 | ✅🔧 | 0054 FR-STUDIO-ADD-2 (L406); decision 1 (L209) |
| 18 | Broken-ref recompute **owned by mutating services**, not reads | assessment #5 | ✅➕ | 0054 decision 5 (L213), **FR-BROKEN-9** (L366) |
| 19 | Browser proof: exact **`localhost:5173`**, dev quick-login, **`@chrome` only when needed** | multiple (05-22…06-03) | ✅ | tasks-0052 Browser Proof (L391-394), `@chrome` rule (L383); tasks-0054 (L474-477, L466) |
| 20 | Auto V4 = "**safe assistant, not autonomous judge**"; Gemini staged default, Groq future group-repair only | 9nDU / lrbx | ✅ | Referenced as PRD-0048 constraint in `0052+0054-assessment.txt` Foundation Context; `reading-v2-auto-v4-provider-review-contract.md` |
| 21 | **Auto-split dedupe against *other* passages** (founding "compare dup % then confirm") | qGO3 origin + assessment #10/C5 | ⚠️ partial | Part 2 FR-PUBLISH-1A = same-source idempotency only (L270); cross-source fuzzy dedupe **deferred** as Non-Goal (L202); 0054 FR-DUP scoped to manual remake (FR-DUP-1) |

---

## 6. The Three Named Specifics — in detail

### 6.1 Duplicate guard & 80% similarity — *approved and fully bound*
Raw thread `…08-24-34` shows the negotiation:
- User: *"1. I think for this we have agree on a similarity % already, no?"*
- Agent: *"Confirmed: 80 percent threshold exists, formula still unresolved. I'll bind formula now…"*
- Agent patch plan: *"…lock PRD/tasklist decisions: 80% threshold plus exact formula, new audit path, no V1 master restore UI."*

Current 0054 PRD binds it deterministically (FR-DUP-4A, L478-482):
1. normalize text;
2. SHA-256 set of contiguous **five-word body shingles**;
3. SHA-256 set of contiguous **three-word question shingles** (visible prompts, instructions, choices, labels, table/diagram visible text only);
4. `bodySimilarity` / `questionSimilarity` via **Sørensen–Dice** = `2 * intersectionSize / (leftSetSize + rightSetSize)`;
5. `combinedSimilarityPercent = round((bodySimilarity * 0.5 + questionSimilarity * 0.5) * 100)`;
6. **warn when `combinedSimilarityPercent >= 80`.**

Index stores **hashed shingle sets only** (FR-DUP-4B, L484) — no body, canonical payload, answer keys, scoring rules, provenance, or import evidence; must not scan/hydrate full canonical payloads during typing/publish (FR-DUP-4C). Scope: owner-accessible passages, **archived included**, no answer-key use for public/non-owner comparisons. Emits `reading_passage_duplicate_warning_shown` (observability) + an audit event for duplicate-warning decisions (FR-AUDIT-1). Runs on draft save/checkpoint for manual remake and again on publish.

> Decision 8 (L216) makes it implementation-binding: "**The duplicate threshold is already approved at 80 percent… Implementation must not stop to re-ask for a threshold or formula unless the index cannot be built safely.**"

### 6.2 Reading V2-specific audit path — *approved and fully registered*
Verbatim user instruction (raw `…08-24-34`): *"2. new Reading V2-specific audit path, register this with app, system, docs, rules, md files, agents.md clearly where needed."*

Result — a dedicated contract and full registration:
- **Contract doc** `documentation/architecture/reading-v2-audit-trail.md`: RTDB path `reading_v2/audit_events/{eventId}`; **append-only** (no update/delete); fixed event shape; explicit **must-not-include** list (passage body, canonical payload, answer keys, student answers, scoring rules, AI evidence, hidden provenance, import evidence); required actions enumerated (`reading_passage_archived`, `…restored`, `reading_master_removed`, `reading_master_broken_ref_repaired`, `reading_book_broken_ref_repaired`, `reading_duplicate_warning_existing_used` / `…restore_used` / `…bypassed`, `reading_super_admin_passage_archived`); view-only events routed to observability, **not** audit; owner service `src/services/reading-v2/readingV2AuditTrail.service.ts` (must fail closed); registration requirements for `database.rules.json`, `readingV2FirebaseRules.test.ts`, `featureRegistry.ts`, and findings.
- **0054 PRD:** decision 49 (L198), decisions 6-7 (L214-215), §body (L680-683), FR-AUDIT-1 (L544): "**Legacy `audit_logs` must not be extended for these events.**"
- **`AGENTS.md:65`** trigger row: "Adding or modifying Reading V2 audit events… → `architecture/reading-v2-audit-trail.md`."
- **`rules/infrastructure.md:104-107`** (RTDB node) and **`rules/observability.md:23-24`** (state-changing actions must also write the Reading V2 path).

This fulfills the user's "register with app/system/docs/rules/md/agents.md" instruction across exactly those surfaces. (App-code wiring of the service itself is implementation-pending — correctly deferred to the tasklists.)

### 6.3 Browser proof / `localhost:5173` / `@chrome` — *codified*
The logs established the convention over many sessions: a **live browser verdict** is required, not a synthetic/unit-test proof (9i4i: user asked for "a test using `@chrome` on materials in `Clippings`"); the bug repro and Review-Issues smoke were both driven in Chrome on `localhost:5173` (QDLA, lrbx); "**do not treat parse success as import success**" (zXNy); use **dev quick-login**, not manual credentials (06-02/03).

Both current tasklists codify this verbatim:
- "Start the dev server bound to **`localhost:5173`**. Do not use a neighboring port. Open `http://localhost:5173`." (tasks-0052 L391-394; tasks-0054 L474-477)
- "The **`@chrome`** plugin may be used when necessary: in-app browser authentication fails, popup/new-tab behavior must be proven in real Chrome, cross-tab refresh/on-focus behavior is under test, or existing Chrome session/state is required. **Record the reason** in the findings file before using Chrome." (L383 / L466)
- "Do not ask for manual credentials… Use the hidden dev quick-login buttons." (L384 / L467)

**Minor nuance (not a conflict):** earlier 06-02/03 logs used a **5173-admin / 5174-teacher** *two-server* split for multi-actor QA (because `127.0.0.1` was blocked by Firebase referrer restrictions). The new single-actor proof steps standardize on `5173` with `Teacher` quick-login. Situational convention vs. canonical OAuth-fixed port — both are "use 5173"; no contradiction.

---

## 7. Key Reasoning — Why `0052+0054-assessment.txt` is partly stale

This is the central analytical finding, and it changes how the older assessment must be read.

**File mtimes (all 2026-06-09):**
- `0052+0054-assessment.txt` — **09:09**
- `0052-part-2-…md` — 09:16
- `tasks-0052-part-2-…md` — 09:25
- `0054-…md` — 09:32
- `tasks-0054-…md` — 09:34

The assessment was written **before** the PRDs/tasklists were rewritten. It was the **input** to a final revision pass, and that pass applied its recommendations. Proof by inspection of the current text:

| Assessment finding (pre-09:09 state) | Current state (post-revision) |
|---|---|
| **C1/H3** "FR-STUDIO-ADD-2 still says *must require the same Test Type*" (drift) | Now L406: "different-Test-Type replacement is allowed only after explicit teacher confirmation with a mixed-Test-Type warning" + L209 "aligns repair with PRD-0052 Part 2." **Fixed.** |
| **H1** "Part 1 'done' vs Part 2 'not built' contradiction; add §1.4 supersede statement" | Now L77-79, L85: explicit "Part 1 added additive… did not complete the ref-only master contract… Part 2 as the reconciliation layer." **Fixed.** |
| **H2** "no published-vs-draft Edit branch; define the exact field" | Now **FR-MASTER-EDIT-0** (L292) + exact field tuple (L197) + both-states case (L199). **Fixed.** |
| **H4/C2** "remake auto-update vs Update-References modal conflict; carve the two cases" | Now Part 2 L203 + 0054 **FR-STUDIO-REMAKE-7/7A** (L446-448). **Fixed.** |
| **H5** "cross-passage numbering unspecified; add a Composition Numbering section" | Now Part 2 **§9.4** (L614-635). **Fixed.** |
| **H7** "frozen projection storage path + ordering undefined" | Now path `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` (L610) + **FR-ASSIGN-13** ordering + fail-closed (L478). **Fixed.** |
| **H8** "anchor safety not carried into split-on-publish" | Now **FR-PUBLISH-9/10** (L286-288). **Fixed.** |
| **#5** "broken-status recompute owner undefined" | Now **FR-BROKEN-9** (L366) + decision 5 (L213). **Fixed.** |

**Conclusion:** A reader who trusts `0052+0054-assessment.txt` at face value will wrongly believe these conflicts are still open. It should be treated as a historical input. (Recommended fix in §11.) Note also that the assessment's line-number citations (e.g. "FR-STUDIO-ADD-2 at lines 384/394") no longer match the grown files (now L406) — independent corroboration that the files were edited after it.

**What the assessment got right and remains true:** the **docs-vs-code** observations. It verified `readingV2PublishPipeline.service.ts` still threads the embedded `ReadingV2Document` into material writes, and `TeacherLobbyPage.handleEditTest` still routes *all* Reading V2 masters to Studio with no publish-state branch. Those are code facts, unaffected by the doc revision — and they are exactly what Part 2's Phase-0/Phase-2 verification gates are designed to confirm before coding.

---

## 8. Reading V2-Specific Audit Path — full registration trace

For auditability, the complete set of surfaces that now encode the dedicated audit path:

1. `documentation/architecture/reading-v2-audit-trail.md` — the contract (path, append-only rule, event shape, action list, forbidden fields, service owner, registration requirements, rule interactions).
2. `0054-…md` — decision 49 (L198); decisions 6-7 (L214-215); body (L680-683); FR-AUDIT-1 (L544); success criteria (L903).
3. `AGENTS.md:65` — Integration-Safety trigger row → points to the contract doc.
4. `documentation/rules/infrastructure.md:104-107` — RTDB node registration.
5. `documentation/rules/observability.md:23-24` — state-changing vs. view-only event routing.

Git confirms these are real, small, additive edits: `AGENTS.md` +1, `infrastructure.md` +10, `observability.md` +4. This is precisely the "app/system/docs/rules/md/agents.md" breadth the user requested, scoped to documentation (service code deferred to implementation).

---

## 9. Stale / Superseded Logs (flagged, not silently chosen)

1. **Older Auto-V4 "split-provider / whole-test Groq fallback" descriptions** (iS7l, TJFG era) are **superseded** by the 06-06 contract (lrbx): "*Gemini staged extraction is the active default; whole-test Groq fallback is retired; Groq is only a future group-scoped repair path.*" The `.knowns` mirrors mark the old wording historical. Current docs match the new contract.
2. **`reading_v2/listing_indexes`** referenced in early Part 1 logs is **retired** in favor of **`material_catalog/material_indexes`** (06-02/03, rn5U/OliO). Current docs use the new canonical index.
3. **`0052+0054-assessment.txt`** itself is **internally stale** relative to the docs it triggered (see §7).
4. **The keystone rollout summaries (qGO3, NVMU) are complete for the 06-08 / 06-09-early threads but do not capture the later `…08-24-34` thread** (80% formula, audit path, no-restore-UI). The raw transcript is the source of record for those three decisions; a rollout summary for that session had not been written at the time of this assessment.

---

## 10. Red Herrings Discarded (reasoning)

Exact-phrase grep across `.codex` surfaced hits that look relevant but are **different features**. I excluded them deliberately:

- **"30-day soft-delete then hard-delete"** — found in `.codex/worktrees/c5fd/luyentap/documentation/conversation_2026-01-30_log.md` and `.knowns/.../prd-student-teacher-assignment.md`. This is **PRD-0014 *course* deletion**, in an old worktree checkout of the repo. It is **not** the PRD-0054 passage archive policy. The actual passage decision is "Remove from library" = archive in V1, no teacher hard-delete, super-admin may hard-delete later.
- **"duplicate guard against existing imported homework/student" on `localhost:5175`** — found in `archived_sessions/rollout-2026-05-08…`. This is **PRD-0043 *writing-import* dedupe**, a different subsystem and port. It is **not** the Reading V2 passage duplicate guard.
- **"Audit Trail" link in `.stitch/designs/…IELTS Scoring - Teacher Native View.html`** — a UI mockup label, not the audit-path decision.

Distinguishing these mattered: a naïve grep summary would have mis-attributed a 30-day hard-delete policy and a 5175 port to PRD-0054, contradicting the actual decisions.

---

## 11. Discussion / Development Log Alignment (required summary)

**Relevant logs found.** The full Reading-V2 → Auto-V4 → PRD-0052 → PRD-0054 thread is present: ~33 in-scope rollout summaries plus the three keystone 06-08/09 raw sessions (including the later `…08-24-34` thread that finalized the 80% formula, the audit path, and no-restore-UI).

**Decisions reflected in the updated PRDs/tasklists.** All load-bearing decisions (rows 1-20 in §5) are present, with explicit cross-PRD precedence: *Part 2 controls the master-editing model; PRD-0054 is interpreted through it* (Part 2 decision 50; FR-ALIGN-5; 0054 decision aligning repair to Edit Test Modal). This directly satisfies the user's "must not conflict with 0054; if conflict, report" directive — the docs encode the resolution rule rather than leaving a latent conflict.

**Decisions missing, changed, or contradicted.**
- *Changed correctly (post-assessment):* same-Test-Type at repair → mismatch-with-confirmation (row 17); remake/Update-References collision → carved into two cases (row 10).
- *Contradiction resolved by precedence:* master-editing authority assigned to Part 2; 0054 amended to it.
- *One genuine residual (row 21):* auto-split duplicate detection against *other* passages — the founding use case — is only partially covered; cross-source fuzzy dedupe is an explicit deferred Non-Goal (Part 2 L202), with the 80% guard currently scoped to manual remake (0054 FR-DUP-1).

**Do they form one coherent path?** **Yes** — see §0 diagram. The layers share a frozen-projection/numbering model, carry Auto-V4 anchor integrity into split-on-publish, and have a single declared precedence direction. The tasklists encode the same ordering the logs decided (Part 2 → 0054, with a hard dependency gate on `ReadingV2MasterEditModal`).

**Unresolved drift between discussion history and current docs.**
1. **Auto-split duplicate detection vs. founding intent** — the one substantive doc residual (deferred Non-Goal).
2. **`0052+0054-assessment.txt` is stale** relative to the docs it spawned — should be marked historical.
3. **Docs-ahead-of-code** — PRDs say the right thing; `readingV2PublishPipeline.service.ts` (embedded `document` still threaded) and `TeacherLobbyPage.handleEditTest` (unconditional Studio route) are not yet changed. This is implementation-pending, caught by Phase-0 gates, not a doc-vs-discussion conflict.
4. **Implementation-level ambiguities the logs never resolved** — authoritative "student started" signal source; extend `EditTestFrame` vs. new `ReadingV2MasterEditModal`. Correctly deferred as tasklist stop-and-record flags, not guessed.

---

## 12. Unresolved Drift & Residuals (categorized)

- **Doc residual (1):** Auto-split / re-import fuzzy dedupe (row 21). *Severity: medium — traces directly to the founding use case (passages auto-appearing on import of "Cambridge 20 Test 1"). Currently a deferred Non-Goal.*
- **Artifact hygiene (1):** `0052+0054-assessment.txt` stale relative to current PRDs (§7). *Severity: low — risk of future re-litigation of already-fixed conflicts.*
- **Docs-vs-code (2):** embedded `document` payload still written; Lobby edit routing unconditional → Studio. *Severity: high for implementation, zero for doc alignment. Guarded by Part 2 tasklist Phase 0/2 circuit-breaker ("stop if embedded payload remains after Phase 2").*
- **Deferred implementation ambiguities (≥2):** authoritative "started" signal; `EditTestFrame` vs new modal; cross-tab refresh handshake for the new-tab single-passage Studio; split-passage default visibility; public-master-with-later-private-ref handling. *All flagged as tasklist Ambiguity / stop-and-record items, consistent with the logs.*

---

## 13. Recommendations

1. **Add a one-line supersession banner** to `0052+0054-assessment.txt` (non-destructive, top of file): *"Update Note (2026-06-09): items H1, H2, H4, H5, H7, H8, C1, and #5 were addressed in the 09:16–09:34 revision of the PRDs/tasklists; line numbers below predate that revision. Retained as historical input."* (Matches the global non-destructive editing protocol.)
2. **Resolve residual #1 (row 21) before Part 2 implementation:** either add a Part 2 `FR-PUBLISH-1B` that runs the PRD-0054 duplicate warning on auto-split against the teacher's existing passages, or explicitly confirm the deferral in writing and note the user-visible consequence (re-importing the same Cambridge test creates near-duplicate passages without a warning).
3. **Keep the Phase-0 verification gates** as written — they are the correct mechanism for the docs-vs-code gap; do not pre-mark composition publish as "done."
4. **Write a rollout summary for the `…08-24-34` session** so the 80%-formula / audit-path / no-restore-UI decisions have a distilled record (currently only in the raw transcript).

---

## 14. Methodology Caveats & Provenance Notes

- Rollout summaries are distillations; verbatim figures (notably "80%" and the Sørensen–Dice formula) were confirmed from the **raw transcript** (`…08-24-34`) and the **produced artifact** (`0054-…md`), not from the summaries alone.
- All current-doc line numbers were obtained by direct `grep` of the files at the mtimes in §2.2; they are accurate as of this assessment and will shift if the files are edited.
- The Auto-V4 / PRD-0048 decisions were corroborated across multiple independent summaries (zXNy, AamZ, lrbx, TJFG, ALLL, iS7l) and the architecture docs they reference.
- Where the logs and docs diverged, this document reports the divergence and the precedence rule the docs encode; it does not silently pick a side.

---

## Appendix A — Verbatim log evidence (with sources)

**80% threshold (raw `sessions/2026/06/09/rollout-…08-24-34-019ea9fb-…jsonl`):**
- User: "1. I think for this we have agree on a similarity % already, no?"
- Agent: "Confirmed: 80 percent threshold exists, formula still unresolved. I'll bind formula now and add Reading V2-specific audit path contract across PRD, tasklist, rules, and AGENTS."
- Agent: "Patch plan: add one architecture doc for Reading V2 audit trail, update AGENTS/rules to point there, then lock PRD/tasklist decisions: 80% threshold plus exact formula, new audit path, no V1 master restore UI."

**Reading V2-specific audit path (same session):**
- User: "2. new Reading V2-specific audit path, register this with app, system, docs, rules, md files, agents.md clearly where needed"

**Cross-PRD gate (qGO3 / raw `…21-53-36`):**
- User: "this 0052 part 2 must not be conflict with 0054, if there is, need to report."
- Preference signal: plan must leave "no room for the junior with no experience to act on their own, improvise, imagine, guess or hallucinate."
- Runtime: "Freeze by default, allow teacher-controlled refresh before any student starts."

**Faithfulness fixes (NVMU / raw `…08-06-29`):**
- Drift: "`0052` used 'source of truth' language that could be read as allowing embedded payload caches, and `0054` still mixed Studio/editor terminology and had a duplicate publish path for manual remake."
- Fix: "make the master rule explicit (`must not store embedded full passage payload`), make `Update references?` conditional on owned refs, and make the manual remake path a single-passage Studio publish that atomically updates the originating master/Book ref."
- Gate: "a tasklist is required because both PRDs are broad, cross-cutting… two separate junior-executable tasklists, with `0052 Part 2` first and `0054` second."

**Auto V4 provider split (iS7l):** "Gemini = topology + answer-key witness; Groq = per-passage structured JSON normalizer; local code = verifier/assembler/Studio guardrail."

**Auto V4 current contract (lrbx):** "Gemini staged extraction is the active default; whole-test Groq fallback is retired; Groq is only a future group-scoped repair path." · "Canonical anchor identity in Reading V2 is a uniqueness contract, not an event log."

**Canonical anchor crash (zXNy):** `Stimulus cambridge-ielts-10-test-1-reading-table-1-3 references duplicate anchors.` · Guard: `assertValidReadingV2CanonicalDocument()` rejects duplicate `stimulus.anchorIds` by comparing `new Set(stimulus.anchorIds).size` to `stimulus.anchorIds.length`.

**Auto V4 binding failure (QDLA):** `Source answer-key rows cannot bind to generated questions: 15-16, 19-40.`

**Clippings gold baseline (9i4i):** "3 passages, 8 task groups, and all 40 answers"; verdict rubric `acceptable / needs-code-fix / provider-weakness-caught / blocked`.

**Book editor three-tab (PTVW):** Overview (metadata/stats) / Content (tree + detail, **assignment inside**) / Settings (access); "`Assign` should not be a peer tab."

---

## Appendix B — Current-doc citation index

**`0052-part-2-…md`:** §1.4 supersede L77-79/L85 · §2.4 ref-only L112-116 · FR-MASTER-EDIT-0 L292 · published field L197 · both-states L199 · FR-PUBLISH-1/1A L268-270 · FR-PUBLISH-4 L276 · FR-PUBLISH-5/6 L278-280 · FR-PUBLISH-8 L284 · FR-PUBLISH-9/10 L286-288 · FR-MASTER-EDIT-13 L318 · §7.5 FR-UPDATE-REFS L348-370 · remake carve-out L203 · §7.10 FR-ALIGN-1…5 L490-500 · §2.6 frozen L124-126 · FR-ASSIGN-13 L478 · projection path L608-610 · §9.4 numbering L614-635 · Non-Goals dedupe L202.

**`0054-…md`:** decisions 36-40 (80%/Sørensen) L185-189 · decision 8 L216 · FR-DUP-3 L472 · FR-DUP-4A L478-482 · FR-DUP-4B L484 · audit decision 49 L198 · audit decisions 6-7 L214-215 · audit body L680-683 · FR-AUDIT-1 L544 · FR-STUDIO-ADD-2 L406 · decision 1 (test-type) L209 · no-restore decision 4 L212 · FR-MASTER-DEL-5A L330 · FR-BROKEN-9 L366 · FR-STUDIO-REMAKE-7/7A L446-448 · §2.7 remake L138 · decision 34 L183 · decision 2 (remake bypass modal) L210.

**`tasks-0052-part-2-…md`:** Execution Contract L8-15 · sequencing L12-13 · Phase 2 publish L151-159 · Phase 8 handoff L351-361 · `@chrome` rule L382-384 · Browser Proof L389-394 · acceptance L439.

**`tasks-0054-…md`:** predecessor L6 · gate L11-12 · dependency services L67-69 · Phase 0 gate L128-140 · Phase 2 prereq L198 · Phase 3 gate L238-259 · `@chrome` rule L465-467 · Browser Proof L472-477/L485 · acceptance L528.

**`architecture/reading-v2-audit-trail.md`:** full contract (path `reading_v2/audit_events/{eventId}`, append-only, event shape, action list, forbidden fields, service owner, registration requirements).

**`AGENTS.md`:** L65 (audit trigger row). **`rules/infrastructure.md`:** L104-107 (RTDB node). **`rules/observability.md`:** L23-24 (event routing).
