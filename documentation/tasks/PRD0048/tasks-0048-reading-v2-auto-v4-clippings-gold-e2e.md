# Task List: PRD-0048 Reading V2 Auto V4 Clippings Gold-Parse E2E

> **Created:** 2026-05-22
> **Purpose:** Validate Auto V4 against a real Clippings source by comparing an agent-produced gold parse with the app-produced Studio draft, diagnostics, and review contract.
> **Source under test:** `C:\Users\The Lord\Desktop\luyentap\Clippings\Practice Cam 10 Reading Test 04.md`
> **Active repo root:** `C:\Users\The Lord\Desktop\luyentap-reading-v2-auto-v3-source-proof`
> **Branch:** `codex/reading-v2-auto-v4-review-contract`

## Decision Contract

This validation is not a perfection chase. Auto V4 is acceptable when it acts as a safe assistant:

- AI owns broad interpretation of messy real-world source. This applies across passage boundaries, question areas, task groups, instruction text, option/reference banks, answer-key areas, and clipped web pollution.
- Code should not become a brittle parallel parser through endless source-format exceptions.
- It opens a usable Studio draft when generated structure is editable.
- It does not silently bind unsupported or wrong answers.
- It marks incomplete source/question/answer/task-group coverage as `needs_review`.
- It attaches exact teacher repair diagnostics and publish blockers.
- It hard-blocks only unsafe or non-editable output.
- It does not require local code to fully parse messy source formats before AI processing. Auto V4 provider output is the primary parse, and local checks are advisory guardrails that should warn/block publish only when output is unsafe or incomplete.
- It does not treat local ledger structure or answer-key counts as product authority. If local preflight undercounts messy but human-readable question/answer areas, record that as a measurement limitation and compare the AI/app output to the gold baseline plus Studio diagnostics.

## Data Boundary

- Do not commit full copyrighted passage text.
- Do not commit raw provider prompts or raw provider payloads.
- Committed docs may include source path, hashes, line coordinates, task groups, answer-key values, redacted diagnostics, and verdicts.
- Local `output/` artifacts may be generated for this run, but should not be staged unless explicitly approved.

## Gold Parse Baseline

The gold parse is the agent-authored benchmark. It records what the app should preserve structurally.

| Passage | Title | Source lines | Question range | Task groups |
| --- | --- | ---: | ---: | --- |
| 1 | The megafires of California | 53-143 | 1-13 | 1-6 notes completion; 7-13 true-false-not-given |
| 2 | Second nature | 145-247 | 14-26 | 14-18 summary completion; 19-22 matching features; 23-26 matching information |
| 3 | When evolution runs backwards | 251-385 | 27-40 | 27-31 multiple choice; 32-36 matching sentence endings; 37-40 yes-no-not-given |

Expected answer key:

| Range | Answers |
| --- | --- |
| 1-6 | 1 spread; 2 10/ten times; 3 below; 4 fuel; 5 seasons; 6 homes/housing |
| 7-13 | 7 TRUE; 8 FALSE; 9 TRUE; 10 TRUE; 11 NOT GIVEN; 12 FALSE; 13 FALSE |
| 14-18 | 14 transformation/change; 15 young age; 16 optimism; 17 skills/techniques; 18 negative emotions/feelings |
| 19-22 | 19 E; 20 C; 21 G; 22 A |
| 23-26 | 23 E; 24 C; 25 G; 26 H |
| 27-31 | 27 C; 28 D; 29 C; 30 B; 31 A |
| 32-36 | 32 F; 33 G; 34 A; 35 B; 36 D |
| 37-40 | 37 NOT GIVEN; 38 YES; 39 NO; 40 YES |

## Required Evidence

Capture one report under `output/reading-v2-auto-v4-clippings-e2e/` with:

- source file path, size, hash, and line counts
- gold parse summary and answer key
- local ledger summary before provider call
- app Auto V4 result status: `ready`, `needs_review`, or `blocked`
- app passage count and question count
- app diagnostics with code, severity, message, passage/question coordinates, and repair scope
- Studio publish blockers and uncertainty markers
- Chrome/browser evidence: route, visible mode, diagnostics text, console diagnostic payload summary, provider request domains
- comparison table: gold vs app by passage, group, question range, and answers
- final verdict and advice

Run command:

```powershell
npm run reading-v2:auto-v4-clippings-e2e -- --source "C:\Users\The Lord\Desktop\luyentap\Clippings\Practice Cam 10 Reading Test 04.md" --out output/reading-v2-auto-v4-clippings-e2e/report.json --allow-live-v4-provider
```

The `--allow-live-v4-provider` flag is required because this sends the Clippings file content to the configured live Auto V4 provider path.

## Verdict Rubric

| Verdict | Meaning |
| --- | --- |
| `acceptable` | Draft opens in Studio, no silent wrong answer binding, repair list is clear, publish is blocked when needed. |
| `needs-code-fix` | App hides important drift, binds wrong answers, loses source without warning, or permits unsafe publish. |
| `provider-weakness-caught` | Provider omitted/misstructured content, but app correctly flags it as `needs_review` or `blocked`. |
| `blocked` | Browser/app/provider cannot complete the test path. |

## Implementation Steps

- [x] Generate local gold-parse artifact from the Clippings source without copying full passage text.
- [x] Run local ledger/preflight against the same source.
- [x] Run Auto V4 through the app in Chrome against the same source.
- [x] Capture Studio diagnostics and copied diagnostic logs.
- [x] Compare app output with the gold parse.
- [x] Write final report with verdict, criticism, and next engineering advice.

## Final Evidence And Verdict

Report artifact: `output/reading-v2-auto-v4-clippings-e2e/report.json` (local artifact, not staged).

Source proof:

- SHA-256: `14564b0882b31e8e26965d7784efbaa60a38aa1594dad5bd1093384ff25e1e7c`
- Size: 26,347 bytes; 26,039 chars; 477 lines
- Full passage text included in committed docs: no

Live provider run:

- Provider path: Gemini through `generateReadingV2AutoImportCandidate`
- Model label: `gemini-2.5-flash+auto-v4-staged-adapter`
- Result: `success=true`, `reviewStatus=needs_review`
- Verdict: `acceptable`

Gold vs app comparison:

| Metric | Gold | App |
| --- | ---: | ---: |
| Passages | 3 | 3 |
| Task groups | 8 | 8 |
| Questions/interactions | 40 | 40 |
| Missing questions | 0 | 0 |
| Teacher answer-key rows bound | 40 expected | 13 detected/bound |

Task-group coverage:

| Range | Gold type | App type |
| --- | --- | --- |
| 1-6 | notes-completion | note-completion |
| 7-13 | true-false-not-given | true-false-not-given |
| 14-18 | summary-completion | summary-completion-text |
| 19-22 | matching-features | matching-features |
| 23-26 | matching-information | matching-information |
| 27-31 | multiple-choice | multiple-choice |
| 32-36 | matching-sentence-endings | matching-sentence-endings |
| 37-40 | yes-no-not-given | yes-no-not-given |

Publish safety:

- Candidate publish blockers: 57
- Draft validation blockers: 54
- Silent question loss: false
- Studio status: `Needs review`
- Publish button: disabled
- Main user-facing repair item: teacher answer-key binding is incomplete for questions 14-40, so Studio blocks publish and asks teacher review.

Local ledger advisory:

- Local preflight detected 35 source answer-key rows.
- Gold baseline has 40 answer rows.
- Local-only missing rows: 2, 6, 14, 17, 18.
- Interpretation: this is measurement limitation, not product blocker. Local preflight is not product authority for messy source. Auto V4 provider output plus Studio diagnostics owns the user-facing parse/review contract.

Chrome evidence:

- Route: `/lobby` -> `Create New Test` -> `IELTS` -> `Reading V2` -> `Auto` -> `Process with Auto V4` -> `/teacher/reading-v2/import`
- Visible mode: `Create from Auto`
- Visible diagnostics: 3 structured passages, 8 structured question groups, 40 structured questions, 13 teacher answer key rows, source ledger hash `319139ab`, answer-key binding review required.
- Provider requests: two `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` calls, both HTTP 200.
- Residual UI noise: existing Mantine guardrail warnings and repeated React duplicate-key console errors for validation issue IDs around questions 14-18. This did not block Studio handoff, but should be cleaned separately because it can make validation lists unstable.

No-provider Chrome smoke:

- Command: `npx playwright test e2e/reading-v2-studio-smoke.spec.ts -g "Auto V4" --project=chromium --reporter=line`
- Result: 2 passed.

Final advice:

- Keep Auto V4 as safe assistant, not judge.
- Do not add source-format exceptions just because local preflight undercounts messy human-readable source.
- Improve provider/Studio answer-key binding and repair summaries for questions 14-40, but keep the broad contract: incomplete areas go to Studio with clear diagnostics and publish blockers.
