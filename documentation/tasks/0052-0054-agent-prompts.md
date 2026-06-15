# Agent Prompts — Hardening the 0052/0054 PRDs & Tasklists

**Purpose of these prompts:** the assessment `0052-0054-discussion-log-alignment-assessment.md` exists to **find faults and improve the PRDs/tasklists before implementation** — that was the original job. These prompts continue that job. They are oriented toward **auditing and hardening the specs**, not building from them.

> Why not just say "implement the tasklist"? Because the tasklists are already the build instructions; an implementation agent barely needs this md. The md earns its keep at the **spec-improvement** stage: surfacing remaining faults, verifying the "already-fixed" claims, and closing the known residual. Implementation comes *after* the specs are hardened — see the demoted [Appendix](#appendix--implementation-prompts-use-only-after-hardening).

## Recommended order (the "both, in order" workflow)

```
PHASE A — RE-AUDIT (find faults)          PHASE B — HARDEN (close faults)
  A1  Deep independent re-audit    ──►      B1  Close the auto-split dedupe residual
  A2  Verify the "fixed" claims    ──►      B2  Apply §13 housekeeping (non-destructive)
                                            B3  Consolidated hardening pass (batch edits)
```

Run **A1 + A2 first** (they only read and report). Feed their findings into **B1–B3**, which propose concrete PRD/tasklist edits **for your approval** before anything changes. Only after Phase B is signed off should anyone use the Appendix implementation prompts.

**Phase A is analysis-only** (safe for a read-only / Explore agent). **Phase B edits documentation** (non-destructive) and pauses for your approval before changing any contract.

---

## Shared preamble (identical in every block, on purpose)

Every block below starts with the same preamble so each is copy-paste-standalone. If you write your own variant, keep the preamble and change only `YOUR TASK` / `DELIVERABLE`.

---

## Variant A1 — Deep independent re-audit (find NEW faults)

````text
Read this reconciliation reference first, then do the task at the bottom:
  documentation/tasks/0052-0054-discussion-log-alignment-assessment.md

WHAT THIS FILE IS
- The authoritative map between historical .codex discussion logs and the CURRENT
  Reading V2 / Auto V4 / PRD-0052 Part 2 / PRD-0054 docs. Use it as your BASELINE so you
  do not waste effort re-deriving settled decisions. Your job is to find what it MISSED.

HOW TO USE IT
1. Read it fully, especially §5 (decision→doc table), §11 (alignment summary), §12 (residuals).
   Anything marked PASS/faithful there is the baseline — do not re-litigate it; look past it.
2. Use Appendix B to jump to the exact file:line in the specs. Verify file:line before trusting it.

RULES YOU MUST HONOR
- Precedence: PRD-0052 Part 2 is authoritative for the master-editing model; PRD-0054 is
  interpreted THROUGH it. Judge conflicts by that rule.
- documentation/tasks/0052+0054-assessment.txt is STALE (predates the current PRDs); do not use
  its line numbers and do not resurrect conflicts it lists that §7 says are fixed.
- The .codex logs are read-only history; do not modify anything under C:\Users\The Lord\.codex.
- This is ANALYSIS ONLY. Do not edit any PRD, tasklist, or code. Report findings.
- A "fault" = a contradiction, an underspecified mechanic a junior would have to guess, a missing
  requirement traceable to a decision/use case, or a rule/architecture violation. For each, give:
  exact file:line, why it is a fault, the blast radius, and a proposed fix direction.

YOUR TASK
Perform an INDEPENDENT fault-finding pass on the current PRD-0052 Part 2 and PRD-0054 PRDs and their
tasklists, treating the assessment as a baseline of already-known issues. Do not stop at confirming
the assessment — push into the areas it flagged as thin or deferred, and look for faults it did not
list. Cover at minimum:
- Composition numbering (Part 2 §9.4): is the assembly function fully specified for reorder/remove/
  replace, and are its freeze points (assignment projection + result) unambiguous for a junior?
- RTDB/Firestore consistency: assignment-time write spans the Firestore homework doc + the RTDB frozen
  projection. Is ordering, failure recovery, and the fail-closed launch path airtight (FR-ASSIGN-13)?
- New composed-projection path security: does a Firebase rule + test exist/covered for
  reading_v2/projections/assignment_payloads/...? Any leak of answer keys/scoring/provenance?
- Auto V4 split-on-publish: do FR-PUBLISH-9/10 actually prevent an individually-invalid passage after
  split (anchors that only worked with cross-passage context)?
- Audit boundary: is audit inside or outside the all-or-nothing publish, and is that consistent
  between Part 2 FR-PUBLISH-5/6 and the append-only reading_v2/audit_events contract?
- Cross-tab/new-tab: single-passage Studio opens in another tab — is the cross-tab refresh handshake
  and the tablet/phone fallback specified? Any navigation/mobile-portability rule conflict?
- Edit-surface ambiguity: extend EditTestFrame vs. new ReadingV2MasterEditModal — is the choice still
  unresolved, and does anything depend on it being decided?
- The "student started" authoritative signal: is its source named (submission/attempt/session) or
  still approximated?
- Any NEW cross-PRD conflict, any decision in the logs (see assessment §4 timeline / Appendix A) not
  reflected in the docs, and any @mantine/ban or non-destructive-edit rule the tasklists would trip.

DELIVERABLE
A findings report: numbered faults, each with file:line, severity (High/Med/Low), why-it-matters,
blast radius, and a proposed fix direction. Separate "confirms assessment" from "NEW finding". End
with the top 5 to fix before implementation. No edits.
````

---

## Variant A2 — Verify the "already-fixed" claims (adversarial)

````text
Read this reconciliation reference first, then do the task at the bottom:
  documentation/tasks/0052-0054-discussion-log-alignment-assessment.md

WHAT THIS FILE IS
- The map between historical .codex logs and the CURRENT docs. §5 and §7 CLAIM that a set of
  conflicts (H1, H2, H4, H5, H7, H8, C1, #5) were fixed in the 09:16–09:34 revision. Your job is to
  adversarially verify those claims are actually true in the current files — not to take them on faith.

HOW TO USE IT
1. Read §5 (rows marked ➕ added / 🔧 changed), §7 (the stale-artifact reasoning + the fix table),
   and §8 (audit-path registration trace). Use Appendix B for file:line.

RULES YOU MUST HONOR
- documentation/tasks/0052+0054-assessment.txt is the STALE pre-revision artifact; the current PRDs
  were edited after it. You are checking whether the CURRENT files really contain the claimed fixes.
- The .codex logs are read-only; do not modify anything under C:\Users\The Lord\.codex.
- ANALYSIS ONLY — no edits. Be skeptical: a fix is only "confirmed" if the current file text actually
  enforces it, not merely mentions it.

YOUR TASK
For each claimed fix, open the current file and confirm it holds. Specifically verify:
- H1 — Part 2 §1.4 explicitly states Part 1 left embedded payload and Part 2 supersedes to ref-only.
- H2 — FR-MASTER-EDIT-0 plus an EXACT published-vs-draft routing field, plus the both-states case.
- H4 — the remake-vs-Update-References carve-out exists in BOTH Part 2 (~L203) and 0054
  (FR-STUDIO-REMAKE-7/7A), with no contradictory leftover.
- H5 — Part 2 §9.4 defines one assembly numbering function with named freeze points.
- H7 — the frozen-projection RTDB path + write ordering + fail-closed launch (FR-ASSIGN-13).
- H8 — FR-PUBLISH-9/10 enforce per-passage canonical validation on split.
- C1 — 0054 FR-STUDIO-ADD-2 now allows Test-Type mismatch with confirmation (not "must require same").
- #5 — broken-ref recompute owned by mutating services (FR-BROKEN-9), not reads.
- Audit path (§8) — registered in reading-v2-audit-trail.md + 0054 + AGENTS.md + rules/infrastructure.md
  + rules/observability.md, with legacy audit_logs explicitly excluded.
Also flag any place where the fix is half-applied (e.g. one PRD updated, the sibling still stale), and
any line-number citation in the assessment that no longer matches (note the new file:line).

DELIVERABLE
A verification table: claim | expected file:line | CONFIRMED / PARTIAL / NOT-FOUND | current file:line |
note. List every PARTIAL/NOT-FOUND as a fault to feed into Phase B. No edits.
````

---

## Variant B1 — Close the auto-split duplicate residual (propose edits)

````text
Read this reconciliation reference first, then do the task at the bottom:
  documentation/tasks/0052-0054-discussion-log-alignment-assessment.md

WHAT THIS FILE IS
- The map between historical .codex logs and the CURRENT docs. It identifies ONE substantive
  unclosed fault (§12 #1 / §5 row 21): auto-split / re-import duplicate detection against the
  teacher's OTHER passages — the founding use case — is a deferred Non-Goal. Close it.

HOW TO USE IT
1. Read §5 row 21, §11 (missing/changed/contradicted), §12 #1, and §6.1 (the 80% Sørensen–Dice
   formula). Use Appendix B for file:line. Verify file:line before trusting it.

RULES YOU MUST HONOR
- Precedence: PRD-0052 Part 2 is authoritative; PRD-0054 interpreted THROUGH it.
- Treat 0052+0054-assessment.txt as STALE. The .codex logs are read-only history.
- Documentation edits are non-destructive (append / mark obsolete with "> Update Note (date): ...";
  never overwrite). DO NOT change a PRD until I approve the chosen option — propose first.
- If you find a NEW conflict while doing this, report it; do not resolve it silently.

YOUR TASK
Produce a decision memo that closes the residual, presenting two options WITHOUT editing any PRD yet:
(a) WIRE IT NOW — propose exact new PRD text (e.g. a Part 2 "FR-PUBLISH-1B") that runs the existing
    PRD-0054 Sørensen–Dice duplicate warning during auto-split against the teacher's accessible AND
    archived passages. Specify: when it runs, the UI (reuse the duplicate-warning modal: title,
    similarity %, "Use existing" / "Create new anyway"), interaction with all-or-nothing publish, the
    data source (must NOT scan full canonical payloads — hashed shingles only), and which
    observability/audit events fire.
(b) CONFIRM DEFERRAL — state the plain-language user consequence (re-importing the same Cambridge test
    as two separate full tests creates near-duplicate passages with no warning) and record it as an
    accepted V1 limitation with a pointer to future work.
Recommend one with reasoning, and map every cross-PRD ripple (FR-DUP scope, the index/data source, the
"no full-canonical scan" constraint, idempotency vs. fuzzy-dedupe interplay with FR-PUBLISH-1A).

DELIVERABLE
A new non-destructive memo file under documentation/tasks/ containing both options, ready-to-paste FR
text for (a), the consequence statement for (b), a recommendation, and file:line citations. No spec
edits until I pick an option.
````

---

## Variant B2 — Apply §13 housekeeping (non-destructive)

````text
Read this reconciliation reference first, then do the task at the bottom:
  documentation/tasks/0052-0054-discussion-log-alignment-assessment.md

WHAT THIS FILE IS
- The map between historical .codex logs and the CURRENT docs. §13 lists housekeeping that keeps the
  doc set trustworthy. This task executes only the NON-DESTRUCTIVE recommendations.

HOW TO USE IT
1. Read §7 (why 0052+0054-assessment.txt is stale), §9 (stale logs, incl. the un-summarized
   …08-24-34 session), §13 (recommendations), and Appendix A (verbatim decisions).

RULES YOU MUST HONOR
- All edits NON-DESTRUCTIVE: never overwrite/delete existing content; append sections/files; mark
  obsolete text only with "> Update Note (date): ..." blockquotes.
- The .codex logs are read-only; do not modify anything under C:\Users\The Lord\.codex.
- Do NOT touch any PRD/tasklist CONTRACT in this task — documentation hygiene only.
- Do not invent any decision not present in the assessment.

YOUR TASK
1. Add a one-line supersession banner to the TOP of documentation/tasks/0052+0054-assessment.txt,
   exactly:
   "> Update Note (2026-06-09): Items H1, H2, H4, H5, H7, H8, C1, and #5 were addressed in the
    09:16–09:34 revision of the PRDs/tasklists; the line numbers in this file predate that revision.
    Retained as historical input. See 0052-0054-discussion-log-alignment-assessment.md §7."
2. Create a durable distilled record of the un-summarized 2026-06-09 …08-24-34 session decisions
   (the rollout summaries do not cover it). Capture, with the verbatim quotes from Appendix A: the 80%
   threshold + Sørensen–Dice formula binding, the new Reading V2-specific audit path instruction, and
   "no V1 master restore UI." Put it in a sensible documentation location (short appended note on
   PRD-0054, or a new documentation/tasks/ record). Invent nothing beyond the assessment.

DELIVERABLE
The two non-destructive edits + a one-paragraph summary of what changed and where + confirmation no
existing content was removed. Run `cmd /c npm run check:utf8` and `git diff --check` on touched files.
````

---

## Variant B3 — Consolidated hardening pass (batch proposed edits)

````text
Read this reconciliation reference first, then do the task at the bottom:
  documentation/tasks/0052-0054-discussion-log-alignment-assessment.md

WHAT THIS FILE IS
- The map between historical .codex logs and the CURRENT docs. This task takes the CONFIRMED faults
  (from the §12 residuals plus whatever Variants A1/A2 surfaced) and turns them into one reviewed
  batch of proposed PRD/tasklist edits — the final hardening step before implementation.

HOW TO USE IT
1. Read §11, §12, §13. If Variant A1/A2 findings reports exist, read those too and treat them as the
   authoritative fault list. Use Appendix B for file:line; verify before trusting.

RULES YOU MUST HONOR
- Precedence: PRD-0052 Part 2 is authoritative; PRD-0054 interpreted THROUGH it. Resolve conflicts
  in Part 2's favor and amend 0054 to match.
- Treat 0052+0054-assessment.txt as STALE. The .codex logs are read-only history.
- Documentation edits are non-destructive. PROPOSE the full batch FIRST as a diff/changelist and WAIT
  for my approval before applying anything. Do not implement code.
- Keep every change junior-safe: exact file, exact FR id, exact wording; no behavior left to guess.

YOUR TASK
Assemble a single hardening changelist that closes all confirmed faults, including at minimum:
- the auto-split dedupe residual (per the approved Variant B1 option, if decided),
- any PARTIAL/NOT-FOUND items from Variant A2,
- any High/Med NEW faults from Variant A1 (numbering edge cases, RTDB/Firestore ordering, projection
  security rule + test, audit boundary, cross-tab/mobile fallback, the "student started" signal source,
  the EditTestFrame-vs-new-modal decision).
For each, give: target file, FR/section id (new or existing), the exact before/after text, the
discussion-log or assessment citation that justifies it, and the cross-PRD ripple. Also update the
relevant tasklist phase + acceptance criteria so the change is executable.

DELIVERABLE
A single proposed changelist (grouped by file, each item with before/after text + citation + ripple),
plus a one-line risk note per item. NOTHING APPLIED until I approve. After approval, apply
non-destructively and run check:utf8 + git diff --check.
````

---

## Appendix — Implementation prompts (use ONLY after hardening)

> These are intentionally demoted. Run them **only after** Phase A/B have closed the faults and you've
> approved the changes. At that point the value-add over "just implement the tasklist" is small — so
> these are deliberately thin wrappers that mainly point the agent at the right tasklist and the few
> things the md still adds (ignore the stale assessment; honor the Phase-0 docs-vs-code gate; the one
> residual). If the specs are hardened, feel free to skip these and tell the agent directly:
> *"Implement documentation/tasks/tasks-0052-part-2-...md phase by phase; treat 0052+0054-assessment.txt
> as stale; run the Phase-0 verification gate before assuming composition publish exists."*

### Appendix A1 — Implement PRD-0052 Part 2 (after hardening)

````text
Pre-req: the Phase A/B hardening prompts have been run and their edits approved. If not, STOP and run
those first.

Implement PRD-0052 Part 2 by following its tasklist phase by phase:
  documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md

Carry only these cross-cutting reminders from
documentation/tasks/0052-0054-discussion-log-alignment-assessment.md:
- Treat documentation/tasks/0052+0054-assessment.txt as STALE history (its conflicts are fixed; its
  line numbers predate the current PRDs). Do not act on it.
- Docs are AHEAD of code: run the Phase-0 verification gate and record the current truth in findings
  before assuming anything is built (publish pipeline still embeds the full document; TeacherLobby
  still routes all masters to Studio). Do not pre-mark composition publish as done.
- Stop-and-record (never guess): the "student started" signal source, and EditTestFrame vs. new
  ReadingV2MasterEditModal — unless hardening already resolved them.
- Browser proof on localhost:5173 with dev quick-login; @chrome only when justified, reason logged.
- Reading V2 audit → reading_v2/audit_events/{eventId}; never legacy audit_logs.
- Do not start PRD-0054 broken-master repair UI (gated behind this work).

DELIVERABLE
Code + targeted tests + localhost:5173 browser proof + findings entries + passing check:utf8 and
git diff --check. Cite file:line for every contract implemented. STOP if embedded payload remains
after Phase 2 (tasklist circuit-breaker).
````

### Appendix A2 — Implement PRD-0054 (after Part 2)

````text
Pre-req: PRD-0052 Part 2 is implemented (its ReadingV2MasterEditModal or approved equivalent exists
and its tests pass) AND hardening edits are approved. If not, STOP.

Implement PRD-0054 by following its tasklist:
  documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md

Carry only these reminders from the assessment:
- Phase-0 dependency gate: if the Part 2 master Edit Test Modal does not exist, mark master-repair UI
  tasks BLOCKED and do not implement Phase 3 (archive/restore SERVICE work may still proceed).
- Archive-not-delete; restore reuses same id/version; NO V1 master restore UI (FR-MASTER-DEL-5A).
- Broken-master repair in Edit Test Modal; manual remake = single-passage Studio in a new tab that
  ATOMICALLY updates the originating broken ref and does NOT show the Update-References modal.
- Duplicate guard = Sørensen–Dice, hashed shingles only, warn at >= 80, archived-inclusive,
  owner-scoped; no full-canonical scans.
- Audit state-changing actions to reading_v2/audit_events/{eventId}; route *_viewed to observability.
- Treat 0052+0054-assessment.txt as stale.

DELIVERABLE
Code + tests (incl. append-only audit rule + denied-payload coverage) + localhost:5173 browser proof +
findings entries + passing check:utf8 and git diff --check. Cite file:line for every contract.
````

---

## Notes for the human

- **Lead with Phase A, then B.** A1 + A2 are read-only fault-finding; their reports become the input to B1–B3, which propose edits for your approval. Nothing changes a contract without you signing off.
- **The implementation prompts are deliberately in the Appendix and deliberately thin.** You were right that for pure implementation, this md adds little over "implement the tasklist" — so those wrappers only carry the three things it genuinely adds (stale-assessment warning, Phase-0 docs-vs-code gate, the one residual).
- **B1 should be resolved before A-pipeline implementation reaches the publish phase**, since the auto-split dedupe decision changes FR-PUBLISH.
- If you want an even narrower fault-finding slice (e.g. "only audit the security rules for the new projection path"), copy Variant A1 and replace its `YOUR TASK` list with the single area.
