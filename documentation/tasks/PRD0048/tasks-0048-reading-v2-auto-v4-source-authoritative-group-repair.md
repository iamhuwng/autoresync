# Task List: Reading V2 Auto V4 Source-Authoritative Group Repair

> **Created:** 2026-05-25
> **Branch:** `codex/reading-v2-ielts-task-contracts`
> **Scope:** Retire the whole-test V3 Gemini/Groq pipeline, keep V4 as the main Auto parser, make raw teacher input the source of truth, and use Groq only for small teacher-triggered or verifier-triggered question-group repair.
> **Parent Evidence:** Superseded A/B scratch task removed from active workspace; this task owns the V4 decision path.
> **Canonical Contract:** `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md`

Interpretation rule: `blocked` in this tasklist means blocked for the specific unsafe action being discussed. A group can block Ready, Accept into Draft, publish, extraction, launch, or backfill while the import still opens Studio as `editable-needs-review`. Use `blocked-before-studio` only when no canonical-safe editable candidate can be built.

## Context

The controlled A/B work showed V4 full-document parsing is the stronger foundation for Reading V2 Auto:

- V4 produced more usable service-level results than V3.
- V4 needed fewer provider calls, fewer retries, and fewer repair passes.
- V3 whole-test/package fanout had Groq size and rate-limit pressure.
- Browser evidence exposed a severe source-fidelity risk: V4 could silently alter passage text, such as changing a date.
- A teacher can visually detect when a question group is not well represented, but the current system has no group-level repair action.
- Many bad Studio previews are not wrong question counts; they are under-represented question groups where AI shortened, changed, or cut off the raw question-range content while forcing it into app structure.

This task list captures the new direction:

```text
Raw teacher input = source truth.
V4/Gemini = main structure extractor.
App verifier = source-fidelity and readiness judge.
Groq = small-scope group repair specialist only.
Teacher = final reviewer and accept/reject authority.
```

## Decision Contract

Reading V2 Auto must no longer treat Groq as a fallback replacement for Gemini.

Retire this shape:

```text
raw source -> Gemini topology -> Groq package fanout -> Groq repair -> Studio
```

Move toward this shape:

```text
raw source
-> exact source ledger
-> V4 full-document extraction
-> deterministic source reconciliation
-> app verifier by task group
-> Studio review
-> optional Groq repair for one weak group
-> app verification
-> teacher accept/reject
```

Groq may repair a question group. Groq must not rewrite passage text, own answer truth, decide publish readiness, or receive full IELTS tests when a smaller group slice is available.

## Default Product Decisions

Use these defaults unless the owner explicitly overrides them before implementation.

- Raw teacher input is stored as an author-only import source artifact while the draft exists.
- Student-safe, session-safe, public-library, result, and preview runtime payloads never include raw source, answer keys, provider output, or repair diagnostics.
- After publish, keep only source hash, line/span references, redacted issue summaries, and repair history by default; full raw source remains only in the draft/import artifact lifecycle.
- V4/Gemini is the only default Auto parse path.
- Groq is never a whole-test fallback and never receives passage prose unless the requested group itself is a question-area passage excerpt required by the task.
- A question group may be auto-fixed only by deterministic source rehydration from raw text. If the fix requires interpretation, inference, task-type correction, or answer judgment, it must go to teacher review or teacher-triggered Groq repair.
- Teacher-triggered Groq repair is opt-in per group. Groq output is shown as a patch, verified, and accepted/rejected by the teacher.
- The app may suggest repair for a weak group, but it must not silently repair with provider output.
- A group cannot be marked `ready` if the mapped raw question-range content is materially under-represented in Studio.
- The UI label must show actual parse and repair source: V4 main parse, source verifier, deterministic rehydration, or Groq group repair.

## Junior-Safe Execution Rules

The implementor must follow these rules without improvising:

- Do not delete V3 code until the exact useful pieces listed in this tasklist are ported and covered by tests.
- Do not add new provider calls until local verifier reason codes exist.
- Do not implement Groq repair before raw source ledger and group span mapping are stable.
- Do not build UI repair controls before the data contract for group status, repair request, repair patch, and diff review exists.
- Do not classify a group as `ready` using only question count, answer count, or JSON parse success.
- Do not auto-fix by rewriting prose. Auto-fix means copy exact raw-source content or exact raw-source structure into the canonical group shape.
- Do not accept fuzzy similarity alone for high-risk tokens. Numbers, dates, names, answer labels, question ids, option labels, and blank order require exact or normalized-exact checks.
- Do not let `Repair group` rerun the whole import.
- Do not hide provider failure inside generic "try again" messaging. Show group id, reason code, safe provider status, and next action.
- Do not commit raw Clippings content in test artifacts. Use synthetic fixtures, hashes, line ids, and redacted snippets.

## Lacking Areas To Resolve During Implementation

These are not blockers for the tasklist, but they are risks that must be resolved by explicit implementation decisions:

- Raw-source lifecycle must be codified. Current recommended default is draft-scoped author-only storage with post-publish hash/redacted evidence retention.
- Group-span confidence must be measurable. If AI maps the wrong raw range, representation checks can compare against the wrong source. The verifier must score span confidence and block low-confidence spans.
- Source rehydration needs task-family-specific rules. A generic text diff will not be enough for note, table, flowchart, diagram, summary, or matching banks.
- Teacher repair UX needs a diff that teachers can understand. JSON-only diffs are not enough; rendered group diff is required.
- Provider budget needs hard caps. Group repair should not create hidden quota burn through repeated teacher clicks.
- Historical V3 docs must stay readable as history, while active UI/code must stop presenting V3 as the target architecture.

## Potential Conflicts And Resolutions

- Conflict: "Retire V3" versus "port useful V3 parts."
  - Resolution: retire only the whole-lane orchestration. Port verifier, span, diagnostics, and small-package concepts first.
- Conflict: "App self-realises bad representation" versus "App must not hallucinate fixes."
  - Resolution: app detects coverage loss; deterministic rehydration fixes only exact source-copy cases; ambiguous cases alert or route to teacher-triggered Groq repair.
- Conflict: "Minimal change to fit app structure" versus "Preserve source text."
  - Resolution: canonical structure may wrap source text, but visible source wording, option labels, blanks, table cells, and note rows must remain source-authoritative.
- Conflict: "Groq helps repair" versus "Groq is not fallback."
  - Resolution: Groq receives one group repair request only after local verifier or teacher identifies the weak group.
- Conflict: "Fast Auto workflow" versus "Strict source gates."
  - Resolution: successful clean imports stay fast; only weak/blocked groups get warnings or repair options.
- Conflict: "Store raw text for verification" versus "Avoid exposing copyrighted source."
  - Resolution: author-only draft/import artifact, redacted committed reports, no raw source in student/session/public payloads.

## Edge Cases And Prevention

- Wrong AI question-range mapping.
  - Prevention: validate range against question numbers, instruction text, option labels, answer-key rows, and nearby headings before trusting it.
- Raw text contains duplicated instructions or repeated option labels.
  - Prevention: use line ids and local span boundaries, not text search alone.
- OCR/paste noise changes whitespace, bullets, roman numerals, or table separators.
  - Prevention: use normalized comparison for low-risk formatting and exact comparison for high-risk tokens.
- Note completion keeps blanks but drops heading or note rows.
  - Prevention: compare raw note block headings, subheadings, row count, blank order, and sentence fragments against Studio note structure.
- Table completion keeps answers but drops a column, row, merged cell, or cell text.
  - Prevention: compare raw table-like grid units, column labels, row labels, blank cells, and answer-bearing cells against Studio table structure.
- Flowchart completion keeps answer blanks but changes step order.
  - Prevention: compare step sequence and connector order, not only blank ids.
- Matching information and matching features contaminate each other's option banks.
  - Prevention: verify option-bank labels, bank text, family type, and answer label domain per group.
- Multiple-choice choices are paraphrased.
  - Prevention: option text must be exact or marked changed; no semantic-only acceptance.
- TFNG/YNNG labels are converted or mixed.
  - Prevention: canonical answer domain must match task type exactly; `TRUE/FALSE/NOT GIVEN` and `YES/NO/NOT GIVEN` cannot cross.
- Answer key exists but source question is missing.
  - Prevention: source answer row binding cannot mark group ready unless matching question id exists.
- AI returns publishable-looking draft with silent passage date/name/number change.
  - Prevention: high-risk token source-diff is hard blocker.
- Teacher clicks repair repeatedly.
  - Prevention: per-group cooldown, provider budget, visible attempt history, and no automatic retry loops.
- Groq returns valid JSON but changes source meaning.
  - Prevention: patch must pass source ledger verification and teacher diff acceptance.
- Browser/network provider failure interrupts repair.
  - Prevention: preserve draft state, preserve raw source, show recoverable group-level failure, no navigation loss.
- Raw source span is too large for Groq.
  - Prevention: require group-scoped slice; if still too large, ask teacher to highlight smaller span or mark teacher-review.
- Draft edited manually after import, then repair requested.
  - Prevention: repair request includes current Studio group version; diff must merge against latest group and detect conflicts.
- Existing teacher edits conflict with source rehydration.
  - Prevention: never overwrite teacher edits silently; show conflict diff and require accept.

## Required Data Contracts

Use these shapes as implementation targets. Field names may be adapted to existing code style, but the represented facts must remain.

### Import Source Artifact

```ts
type ReadingV2ImportSourceArtifact = {
  artifactId: string;
  createdAt: string;
  sourceKind: 'teacher-paste';
  rawTextOriginal: string;
  rawTextSha256: string;
  normalizedTextSha256: string;
  lineIndex: Array<{
    lineId: string;
    lineNumber: number;
    rawText: string;
    normalizedText: string;
  }>;
  retention: {
    scope: 'draft-author-only';
    includeInStudentProjection: false;
    includeInSessionProjection: false;
    includeInPublicPayload: false;
  };
};
```

### Group Source Span

```ts
type ReadingV2GroupSourceSpan = {
  groupId: string;
  questionRange: { start: number; end: number };
  taskType: string;
  confidence: 'high' | 'medium' | 'low';
  startLineId: string;
  endLineId: string;
  evidenceLineIds: string[];
  answerKeyLineIds: string[];
  optionBankLineIds: string[];
  warnings: string[];
};
```

### Group Quality Record

```ts
type ReadingV2GroupQualityRecord = {
  groupId: string;
  questionRange: { start: number; end: number };
  taskType: string;
  status: 'ready' | 'weak' | 'blocked' | 'teacher-review';
  sourceSpanConfidence: 'high' | 'medium' | 'low';
  reasonCodes: string[];
  coverage: {
    rawLineCount: number;
    representedLineCount: number;
    missingLineIds: string[];
    rawStructuralUnitCount: number;
    representedStructuralUnitCount: number;
    missingStructuralUnits: string[];
    highRiskTokenChanges: Array<{
      tokenKind: 'number' | 'date' | 'name' | 'question-id' | 'answer-label' | 'option-label' | 'blank-id';
      rawValue: string;
      studioValue: string;
      lineId?: string;
    }>;
  };
  recommendedAction: 'none' | 'deterministic-rehydrate' | 'teacher-review' | 'teacher-groq-repair' | 'blocked';
};
```

### Group Repair Request

```ts
type ReadingV2GroupRepairRequest = {
  requestId: string;
  groupId: string;
  questionRange: { start: number; end: number };
  taskTypeHint: string;
  problemReasons: string[];
  rawSourceSlice: {
    startLineId: string;
    endLineId: string;
    text: string;
    sha256: string;
  };
  currentStudioGroup: unknown;
  currentRenderedPreviewText: string;
  answerKeyRowsForRange: Array<{
    questionNumber: number;
    answer: string;
    sourceLineId: string;
  }>;
  teacherHighlight?: {
    startLineId: string;
    endLineId: string;
    note?: string;
  };
};
```

### Group Repair Patch

```ts
type ReadingV2GroupRepairPatch = {
  requestId: string;
  groupId: string;
  patchKind: 'replace-group';
  repairedGroup: unknown;
  sourceEvidenceLineIds: string[];
  modelWarnings: string[];
  verifierResult: ReadingV2GroupQualityRecord;
  applyState: 'pending-teacher-review' | 'accepted' | 'rejected';
};
```

## Group Status Meanings

- `ready`: source span confidence is high, high-risk tokens match, required structure is represented, answer-key rows bind, and no publish blocker exists.
- `weak`: group is likely repairable, but source representation is incomplete or suspicious.
- `teacher-review`: app cannot prove correctness or safe repair; teacher must inspect.
- `blocked`: source fidelity, answer binding, task type, or projection safety failure prevents the unsafe action being discussed. It does not automatically mean pre-Studio failure.

## Repair Decision Matrix

| Finding | Default Action | Groq Allowed? | Auto-Fix Allowed? |
| --- | --- | --- | --- |
| Whitespace-only difference | Ready with note | No | Yes |
| Missing exact heading with clear raw line | Deterministic rehydrate | No | Yes |
| Missing note row with clear raw row boundary | Deterministic rehydrate then teacher diff | No | Yes |
| Missing table column with parseable raw table | Deterministic rehydrate then teacher diff | No | Yes |
| Missing option-bank item with exact label/text | Deterministic rehydrate | No | Yes |
| Changed date, number, name, answer label, or question id | Blocked | No until teacher confirms | No |
| Wrong task type | Teacher review or Groq group repair | Yes | No |
| Raw span confidence low | Teacher review | No | No |
| Ambiguous table/note/flowchart layout | Teacher repair or Groq group repair | Yes | No |
| Provider output valid JSON but verifier fails | Teacher review or Groq group repair | Yes | No |
| Teacher manual edit conflicts with repair | Show conflict diff | Yes only after teacher confirms | No silent fix |

## Task-Family Representation Rules

| Family | Must Compare Against Raw Span | Ready Blockers |
| --- | --- | --- |
| `note-completion` | heading, subheading, note rows, sentence fragments, blank order, answer rows | missing heading/subheading when present in raw, missing row, changed sentence, blank order mismatch |
| `table-completion` | row count, column count, headers, merged/blank cells, answer-bearing cells | missing column, missing row, missing cell text, changed header, blank location mismatch |
| `summary-completion-text` | summary body sequence, blank order, word limit, answer rows | summarized/shortened body, missing sentence, blank order mismatch |
| `summary-completion-list` | summary body, list/choice bank, blank-to-choice mapping | missing choice bank item, changed list label, unmapped blank |
| `flowchart-completion` | step order, connectors, step text, blank order | missing step, changed order, missing connector meaning, blank order mismatch |
| `diagram-labeling` | diagram/image reference, label targets, answer row count | missing diagram source, missing label, answer row unbound |
| `matching-information` | paragraph/section bank, statement rows, answer label domain | bank contamination, missing paragraph option, statement changed, answer label outside bank |
| `matching-features` | feature bank, statement rows, reuse rule, answer labels | mixed feature/information bank, missing feature, statement changed |
| `matching-headings` | heading bank, paragraph targets, roman numeral labels | missing heading, label mismatch, target paragraph mismatch |
| `matching-sentence-endings` | sentence beginnings, ending bank, labels, reuse rule | missing ending, changed beginning, duplicate answer when no-reuse |
| `multiple-choice` | stem, all options, selected answer, single/multiple mode | paraphrased option, missing option, wrong choice count |
| `true-false-not-given` | statement text, answer domain, instruction wording | TFNG/YNNG mix, changed statement, missing answer |
| `yes-no-not-given` | statement text, answer domain, instruction wording | YNNG/TFNG mix, changed statement, missing answer |
| `short-answer` | question text, word limit, answer rows | changed question, missing word limit, answer row unbound |

## Goals

- Preserve exact raw teacher input as the import source of truth.
- Prevent silent passage/source drift before Studio shows "Ready".
- Remove the V3 whole-lane force path after useful components are ported.
- Keep V4 as the default Auto path.
- Add app-side group quality checks that compare Studio candidate groups against raw source.
- Add representation coverage checks that compare each Studio question group with the mapped raw question-range span.
- Add teacher-triggered `Repair group` flow for cases the app cannot reliably judge.
- Use Groq only on the smallest useful raw source slice plus current bad group preview.
- Show before/after diffs and require teacher accept before applying Groq output.
- Keep all diagnostics redacted and reproducible without committing raw copyrighted source.

## Non-Goals

- Do not make Groq a full-test fallback.
- Do not keep V3 as a selectable long-term lane after migration.
- Do not let any AI rewrite passage body text.
- Do not auto-apply Groq repairs without teacher review.
- Do not rely on question count and answer count alone as proof of quality.
- Do not publish directly from Auto.
- Do not expose raw source, answer keys, provider output, or repair diagnostics in student/session projections.

## Useful V3 Parts To Port

- [x] Source-ledger verifier issue families.
- [x] Group coverage checks.
- [x] Exact source span hints.
- [x] Answer-key binding diagnostics.
- [x] Option/reference-bank contamination guards.
- [x] Repair reason codes.
- [x] Replay bundle shape with redacted evidence.
- [ ] Small task-group package shape.
- [ ] Provider metrics and retry/failure diagnostics.

## V3 Parts To Remove

- [x] Whole-test `v3-groq-package` lane forcing.
- [x] Groq package fanout as primary parse architecture.
- [x] Groq as Gemini fallback.
- [x] Merge-heavy package reassembly path.
- [x] Retry loops that run without a precise verifier reason.
- [x] UI copy or diagnostics that imply Auto V3 is the current target.

## Implementation Tasks

- [ ] 1.0 Freeze and link A/B evidence before architecture removal.
  - [ ] 1.1 Record service-level V4 versus V3 verdict summary in the decision notes.
  - [ ] 1.2 Record browser evidence that V4 and V3 can reach Studio from the same raw input.
  - [ ] 1.3 Record the V4 source-drift example as a regression case.
  - [ ] 1.4 Record provider evidence: Gemini quota/referrer issues and Groq size/rate-limit pressure.
  - [ ] 1.5 Keep the A/B tasklist open until its decision report is written or explicitly superseded.

- [ ] 2.0 Make raw teacher input the durable import source ledger.
  - [x] 2.1 Store exact raw input for the import session before provider calls.
  - [x] 2.2 Store hash, line index, normalized comparison text, and source span map.
  - [x] 2.3 Define raw-source retention lifecycle for draft, publish, diagnostics, and cleanup.
  - [x] 2.4 Ensure committed reports use hashes, line references, and redacted snippets only.
  - [ ] 2.5 Add tests proving raw source survives failed Auto attempts and teacher repair loops.

- [ ] 3.0 Make V4 source-authoritative.
  - [x] 3.1 Ensure passage body text shown in Studio is copied from raw source spans when possible.
  - [x] 3.2 Treat V4 passage text as boundary evidence, not final source text.
  - [ ] 3.3 Add hard source-diff gate for numbers, dates, names, paragraphs, question text, answer rows, and option banks.
  - [ ] 3.4 Classify harmless differences such as whitespace separately from semantic drift.
  - [x] 3.5 Block or mark `Needs review` when source text differs materially from raw input.

- [ ] 4.0 Add task-group quality verifier.
  - [x] 4.1 Emit one quality record per question group.
  - [x] 4.2 Compare question range, task type, instruction, option/reference bank, answer-key binding, and layout shape against raw source.
  - [ ] 4.3 Add task-family rules for matching information, matching headings, matching features, sentence endings, completion, table, note, flowchart, diagram, multiple choice, TFNG, and YNNG.
  - [x] 4.4 Mark each group as `ready`, `weak`, `blocked`, or `teacher-review`.
  - [x] 4.5 Surface exact reason codes in Studio without leaking raw provider output.
  - [x] 4.6 Compare Studio-rendered group content against the AI-mapped raw question-range span, not only against global raw text.
  - [x] 4.7 Detect under-representation where raw headings, subheadings, sentences, blanks, note rows, table cells, table columns, option banks, or instructions disappear from Studio.
  - [x] 4.8 Detect over-compression where AI summarizes or shortens visible raw question content instead of preserving minimal source wording.
  - [x] 4.9 Emit coverage metrics per group: raw text tokens represented, raw structural units represented, missing raw lines/cells/options, and changed high-risk tokens.
  - [x] 4.10 Add reason codes such as `group-source-underrepresented`, `note-heading-missing`, `note-row-missing`, `table-cell-missing`, `table-column-missing`, `instruction-shortened`, and `question-text-changed`.

- [ ] 4A.0 Research and implement safe auto-fix versus alert rules.
  - [ ] 4A.1 Classify which under-representation failures can be deterministically fixed from raw source spans.
  - [ ] 4A.2 Allow automatic source rehydration only when raw span, task type, question range, and structural mapping are unambiguous.
  - [ ] 4A.3 Prefer alert plus `Repair group` when task structure is ambiguous, source span is uncertain, or a provider patch could alter meaning.
  - [ ] 4A.4 For note completion, research whether headings, subheadings, note rows, and blank order can be rebuilt from raw span without AI.
  - [ ] 4A.5 For table completion, research whether row/column/cell coverage can be rebuilt from raw span without AI.
  - [ ] 4A.6 For flowchart, diagram, and summary/list completion, decide per family whether deterministic repair is feasible or teacher/Groq repair should be required.
  - [ ] 4A.7 Document the final rule table: `auto-fix`, `alert-only`, `teacher-repair`, or `blocked`.

- [ ] 5.0 Add teacher-triggered Groq group repair.
  - [ ] 5.1 Add a `Repair group` action to each Studio question-group header.
  - [ ] 5.2 Require teacher to choose or confirm a problem reason before sending repair.
  - [ ] 5.3 Allow optional teacher-highlighted raw source span for the group.
  - [ ] 5.4 Send only the relevant raw source slice, current group preview, answer-key rows for that range, task type hint, and failure reasons to Groq.
  - [ ] 5.5 Require Groq to return a patch for that group only.
  - [ ] 5.6 Verify Groq patch against the raw source ledger before showing it as usable.
  - [ ] 5.7 Show before/after diff and require teacher accept/reject.
  - [ ] 5.8 Preserve undo/reject path and diagnostic history.

- [ ] 6.0 Add verifier-triggered Groq micro-repair only where safe.
  - [ ] 6.1 Define which reason codes are eligible for automatic repair suggestion.
  - [ ] 6.2 Never auto-repair source-text drift, answer-key uncertainty, or missing raw-source evidence.
  - [ ] 6.2a Never send Groq when deterministic source rehydration can safely restore missing raw group content.
  - [ ] 6.3 Add per-group provider budget and cooldown.
  - [ ] 6.4 Stop after one failed repair unless teacher explicitly retries.
  - [ ] 6.5 Record provider metrics per repair request.

- [x] 7.0 Retire V3 whole pipeline.
  - [x] 7.1 Remove or disable long-term `v3-groq-package` lane selection.
  - [x] 7.2 Remove V3-only UI/provider labels after migration.
  - [x] 7.3 Delete dead V3 orchestration code only after V4 has ported required verifier pieces.
  - [x] 7.4 Keep historical docs clearly marked as historical; remove stale generated V3/A-B artifacts from the active workspace.
  - [x] 7.5 Update tests that currently assert V3 lane forcing so they assert V4 source-authoritative behavior instead.

- [ ] 8.0 Improve Studio diagnostics and review UX.
  - [ ] 8.1 Show actual pipeline and repair source: V4 main parse, app verifier, Groq group repair.
  - [ ] 8.2 Show group-level quality status beside each group.
  - [ ] 8.3 Show repair reason and patch summary after Groq returns.
  - [ ] 8.4 Keep `Accept into Draft` disabled when hard source-fidelity blockers exist.
  - [x] 8.5 Ensure `Copy parsing diagnostics` includes group status, reason codes, provider metrics, and redacted source references.
  - [x] 8.6 Route validation/import-review warnings into the PRD0048 Review Issues panel instead of relying on hover tooltip text.

- [ ] 9.0 Verification and E2E coverage.
  - [x] 9.1 Add unit tests for source ledger retention and source-diff classification.
  - [x] 9.2 Add service tests for V4 source-authoritative assembly.
  - [ ] 9.3 Add task-group verifier tests across each IELTS task family.
  - [ ] 9.4 Add Groq group repair tests for success, rejected patch, provider failure, and teacher reject.
  - [ ] 9.5 Add Studio tests for `Repair group`, diff review, accept, reject, undo, and disabled publish.
  - [ ] 9.6 Add browser E2E for one successful V4 import, one V4 weak group repaired by Groq, and one blocked source-drift case.
  - [ ] 9.7 Rerun controlled Clippings fixtures after V3 retirement.
  - [x] 9.8 Extend the Clippings E2E harness to accept an external gold baseline for random raw tests.
  - [ ] 9.9 Promote random raw Clippings gold baselines into a repeatable corpus runner with hash/line-coordinate evidence only.
  - [ ] 9.10 Add an automated Chrome/Playwright raw-paste import E2E that asserts Studio handoff, disabled publish, and group/answer coverage.
  - [ ] 9.11 Refine verifier verdict labels so editable drafts with publish blockers are never reported as plain acceptable.

## Acceptance Criteria

- [x] V4 is the only default Auto parser path.
- [x] Whole-test V3/Groq fallback is removed or disabled outside historical diagnostics.
- [x] Raw teacher input is retained as source truth for verification.
- [x] Studio passage text cannot silently drift from raw source.
- [x] Every question group has a quality/verifier status.
- [x] Every question group compares Studio content against the mapped raw question-range span.
- [ ] Note/table/flowchart/diagram/completion groups cannot be marked ready when raw structural content is missing from Studio.
- [ ] Deterministic source rehydration is used only for unambiguous missing-content cases; ambiguous cases alert the teacher or route to group repair.
- [ ] Localized structured-layout conflicts open Studio as `editable-needs-review` when a canonical-safe degraded group can be built.
- [ ] Structured-layout conflicts fail before Studio only when the candidate cannot be canonical-safe or the failure is global/non-localizable.
- [ ] Groq receives only group-scoped repair requests, not full IELTS tests.
- [ ] Teacher can trigger repair for one bad group without rerunning the whole import.
- [ ] Groq repair output is verified before teacher can accept it.
- [ ] Teacher sees before/after diff before applying a repair.
- [x] Student/session projections contain no raw source, answer keys, provider output, or diagnostics.
- [ ] E2E evidence proves the new architecture is more accurate, efficient, and stable than the retired V3 lane.

## Open Questions

- [ ] Should raw source be stored only in local draft state, Firestore draft metadata, or a short-lived import artifact?
- [ ] How long should raw source and repair diagnostics be retained after publish?
- [ ] Should teacher-highlighted source spans be required for repair, or optional only?
- [ ] Which group verifier reason codes are safe enough for automatic Groq repair suggestion?
- [ ] Should repaired group diffs compare canonical JSON only, rendered Studio preview only, or both?
- [ ] What coverage threshold is enough for each task family before a group can be marked `ready`?
- [ ] Which completion-family layouts can be safely rebuilt from raw source without provider repair?

## Required Reads Before Code Changes

- [ ] `DESIGN.md` before Studio UI/UX work.
- [ ] `documentation/rules/observability.md` before adding `Repair group` actions or diagnostics.
- [ ] `documentation/rules/react-patterns.md` before changing modal/group repair state.
- [ ] `documentation/rules/mobile-portability.md` before adding browser storage or direct DOM/window access.
- [ ] `documentation/rules/codebase-hygiene.md` before removing V3 imports or shared data contracts.
- [ ] `documentation/rules/infrastructure.md` before changing persisted draft/source storage paths.
- [ ] Use only active V4 task evidence for architecture justification; historical V3/A-B docs are archive context, not implementation source.

## Implementation Notes

### 2026-05-25

- Created from the post A/B architecture discussion.
- Captures decision direction: V4 main path, raw source as authority, retire whole V3, port useful verifier pieces, use Groq only for focused group repair.
- No code changes made by this tasklist creation.
- Added representation-coverage requirement: compare Studio question-group content with the mapped raw question-range span to catch cut-off, shortened, or structurally incomplete note/table/completion groups.
- Retired active V3 whole-lane implementation: removed `v3-groq-package` forcing, V3-only orchestration services/tests, clippings/A-B harness scripts, provider labels, smoke fixture aliases, and generated stale V3/A-B output artifacts. Active `src/`, `scripts/`, and `package.json` now grep clean for V3/Groq-package lane tokens.
- Random raw Clippings E2E: selected `Practice Cam 16 Reading Test 02.md` from `C:\Users\The Lord\Desktop\luyentap\Clippings` excluding known prior gold/E2E samples. Source SHA-256: `7072A62D57137C5967159186C9419345D337BEFAC0C23C5060D21247281138F0`. Gold baseline stored in `output/reading-v2-auto-v4-random-clippings-e2e/cam16-test02-gold.json` with 3 passages, 8 groups, and 40 answer rows.
- Service E2E command:
  `cmd /c npm run reading-v2:auto-v4-clippings-e2e -- --source "C:\Users\The Lord\Desktop\luyentap\Clippings\Practice Cam 16 Reading Test 02.md" --gold "output\reading-v2-auto-v4-random-clippings-e2e\cam16-test02-gold.json" --out "output\reading-v2-auto-v4-random-clippings-e2e\cam16-test02-service-report.json" --allow-live-v4-provider`
- Service E2E verdict: `editable-needs-review`. Auto V4 returned 3 passages, 40 questions, 40 answer-key rows, 0 missing questions, 0 answer mismatches, and all 8 expected groups: `1-8`, `9-13`, `14-16`, `17-20`, `21-26`, `27-30`, `31-35`, `36-40`.
- Repair assessment from the same run: coverage and answers are sound enough for editable Studio draft, but 19 publish blockers remain. The blockers are useful safety gates, not silent failures: 3 passage source-drift warnings plus `group-source-underrepresented` and `instruction-shortened` on every group. Next repair focus is reducing false-positive/noisy weakness by task family while keeping hard blockers for true source loss.
- Chrome raw-input E2E used the actual raw Clippings file pasted into the teacher `Create New Test -> IELTS -> Reading V2 -> Auto` flow. Studio reached `http://localhost:5173/teacher/reading-v2/import`, showed 3 passage tabs, 19 validation items pending, `Publish` disabled, and visible answer bindings matching the gold samples checked in Passage 1, 2, and 3. Evidence artifacts: `output/reading-v2-auto-v4-random-clippings-e2e/chrome-evidence-cam16-test02.json` and `output/reading-v2-auto-v4-random-clippings-e2e/chrome-studio-cam16-test02.png`.

### 2026-06-08

- Added cross-reference to `documentation/tasks/PRD0048/tasks-0048-reading-v2-studio-review-issues-ux.md`.
- Source-truth warnings and publish blockers now route into a normalized teacher-facing Review Issues panel in the active Studio Build Workspace.
- Hover/title warning details are deprecated for critical review content; the pill is now a click trigger and issue rows can navigate to affected questions/task groups.
