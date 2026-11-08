# Reading V2 student runtime independent review

Date: 2026-11-08
Review branch: `codex/reading-student-runtime-review-impl``nSource discussion: `C:\Users\The Lord\Downloads\Issues in Reading Student Runtime.md`

## Outcome

The discussion’s earlier investigation was explicitly blocked before source access. This review reached the live code and the public Reading V2 smoke route. The five reported symptoms are not one defect:

- **Confirmed P0:** the Reading V2 app does not register an app-level resume record, so leaving the route cannot be auto-resumed through the student shell. Answers are only a same-browser local draft.
- **Confirmed P0:** highlights are held in component state only. A live highlight disappeared after reload.
- **Confirmed P1:** table answer textareas render at 1px wide in the live full-test fixture. The CSS declares `min-width: 8ch` and immediately overrides it with `min-width: 0`.
- **Confirmed P1:** the splitter accepts the range value, but its percentage tracks are combined with hard `320px`/`360px` minimums and a 10px divider. On narrow desktop widths the requested 30–70% geometry cannot be honored.
- **Confirmed P0/P1 grading defect:** the shared scorer removes all punctuation when punctuation is ignored. That accepts `3,000` as `3.000` and `1.5` as `1,5`; it is too permissive even though `1,000` and `1000` currently compare equal.
- **Boundary defect:** imported answer keys already expand spaced slash alternatives and optional-word notation, but manual answer-key editors accept only `|`-separated alternatives. A published interaction containing one literal `"A / B"` remains one literal answer.

The smallest coherent implementation is three targeted fixes followed by one controlled grading improvement. A full runtime rewrite is not justified by the current evidence.

## Evidence and root causes

### 1. Answers restore only from a local draft

The runtime does have a useful hydration guard in [`ReadingV2RuntimeShell.tsx`](../../../src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx):

- `persistenceKey` is read from `storage` during hydration (around lines 2460–2496).
- Answer changes write the whole answer map to local storage (around lines 2498–2506).
- The existing component test covers remount hydration (`ReadingV2RuntimeShell.test.tsx`, “persists and rehydrates answers for remount-safe attempts”).

That path only covers the same browser and only the answer map. The app-level resume path is separate:

- `StudentPracticePage` writes `studentResumeService.savePracticeResume` only when `testType === 'IELTS'` or a THCS homework attempt (around lines 869–884). `testType === 'ReadingV2'` is excluded.
- `studentResumeService.hasLocalPracticeProgress` checks solo and writing progress only (around lines 95–114 of `studentResume.service.ts`). It cannot discover a Reading V2 draft.
- `handleReadingV2Exit` navigates away without a flush or resume-record update (around lines 1069–1099 of `StudentPracticePage.tsx`).
- The only durable cleanup is after successful submit (around lines 1013–1021). This is correct; exit must not clear an unfinished attempt.

This explains why an answer can survive a direct remount in the same tab while the student still cannot close the test, reopen the app, and be returned to the Reading V2 attempt. The trusted submission endpoint accepts final answers only; there is no in-progress Reading V2 draft endpoint.

There is also a timer resume gap. `readingV2StartedAt` is initialized from route state or `Date.now()` (around lines 538–540). The timer is not part of the local draft envelope. Re-entry without the original route state can restart the timer.

**Fix scope:** first make same-device exit/re-entry reliable by persisting a versioned draft envelope and registering Reading V2 with the student resume service. Add server draft synchronization only if cross-device continuation is a hard requirement; it would need a new trusted write contract and infrastructure rules.

### 2. Highlights are not persisted and are not anchored safely

`ReadingV2RuntimeShell` owns `highlights` as component state (around lines 2330–2332). Selection capture stores only `{id, text, color}` (around lines 656–671). The shell passes those strings to `ReadingV2FormattedText`; it never writes them to the answer draft.

`ReadingV2FormattedText` locates a highlight with `text.indexOf(highlight.text, cursor)` (around lines 80–107). Repeated text therefore highlights the first matching occurrence, and a paragraph rerender can change the match. The repository’s highlighting architecture already requires stable source offsets, but the V2 shell does not implement that contract.

The live smoke route reproduced the report:

1. Enable the highlighter and select passage text.
2. One `mark.reading-v2-runtime__highlight` was present.
3. Reload the route.
4. The mark count was `0`.

There is no free-form student note editor in this V2 shell. “Highlight note taking” currently means passage highlights; adding written notes would be a separate product feature.

**Fix scope:** include highlights in the same draft envelope as answers, keyed by `stimulusId`/`anchorId` and passage-relative offsets. Do not create a second annotation store. Add written notes only if explicitly required.

### 3. Table fields are effectively unclickable

The table change in commit `c8d77933` correctly preserved authored cell text and enabled wrapping, but the final CSS has a contradictory pair:

```css
min-width: 8ch;
min-width: 0;
```

The latter wins. The parent uses `width: fit-content`, so the textarea collapses to its intrinsic minimum.

The live full-test smoke route measured the first table field as:

```text
width: 1px
computed min-width: 0px
height: 31.6px
```

The screenshot showed the question badge and punctuation with no usable text field. This is a localized CSS fix, not a table renderer redesign.

**Fix scope:** restore a real minimum and a bounded flexible width, for example `min-width: 8ch; width: min(14ch, 100%)`, while retaining the existing soft wrapping and horizontal table scroll. Add a regression assertion for computed width or a stable CSS contract.

### 4. The splitter is constrained by impossible track math

The shell renders:

```tsx
gridTemplateColumns: `minmax(320px, ${leftWidthPercent}%) 10px minmax(360px, ${100 - leftWidthPercent}%)`
```

The range input itself works: the live route changed from 50 to 70 and the inline style changed accordingly. The issue is the layout contract. Percentages already consume 100% of the grid; the divider adds 10px, and the hard minimums can exceed the available width. At a narrow desktop width, 30%/70% cannot produce both a 320px passage and a 360px question panel.

**Fix scope:** use fractional tracks with `min-width: 0` (`${left}fr 10px ${right}fr`) or switch to the phone layout before the minimum geometry becomes impossible. Keep the range bounds, and add a browser regression at the narrowest desktop width plus min/max keyboard checks. The slider itself should remain a native accessible range control.

### 5. Grading strips punctuation too broadly

The shared scorer is correctly centralized: `readingV2Scoring.service.ts` re-exports `readingV2ResultAdapter.service.ts`, and the trusted Functions path imports the same `readingV2AnswerScoring.ts` implementation. This is good architecture.

The defect is in `normalizeText` (lines 5–12 of `readingV2AnswerScoring.ts`): when `punctuationSensitive` is false it removes every non-letter/non-number character. Therefore:

| Key | Student | Current result | Required result |
|---|---|---:|---:|
| `1,000` | `1000` | correct | correct |
| `3,000` | `3.000` | incorrectly correct | incorrect |
| `1.5` | `1,5` | incorrectly correct | incorrect |
| `10 kg` | `10` | incorrect | incorrect |
| `km/h` | `kmh` | potentially correct | incorrect unless keyed that way |

The import normalizer already handles explicit alternatives, spaced slash notation, `or`, and optional parentheses. It intentionally preserves compact literal tokens such as `A/B`, so a global slash split would be unsafe. The manual editors, however, parse only `|` separators (`ReadingV2AnswerRuleEditor.tsx` and `ReadingV2BuildWorkspace.tsx`).

**Fix scope:** keep the current `acceptableAnswers` representation for scalar alternatives and multi-select required sets. Add a shared, context-aware answer parser for authoring/import. In scoring, canonicalize a numeric thousands separator only when both values are valid whole-number expressions and punctuation normalization is allowed; otherwise retain punctuation and compare text safely. Do not add fuzzy synonyms, spelling correction, or unrestricted punctuation deletion. Existing published snapshots with collapsed alternatives need republishing from their source; do not hide the data defect with a permanent read-time compatibility shim.

## Proposed implementation order

1. **Draft envelope and resume registration (P0)**
   - Store `{schemaVersion, projectionId, sourceSnapshotVersionId, answers, highlights, startedAt, activeSectionId, updatedAt}` under the existing projection-scoped key.
   - Write the latest envelope synchronously from answer/annotation handlers, and also flush on `pagehide`/hidden visibility. Keep the current hydration guard so a blank initial state cannot overwrite a saved draft.
   - Register Reading V2 in `studentResumeService`; include projection identity and draft presence in resume resolution. Homework attempts should continue to validate the in-progress submission before resuming.
   - Clear the envelope only after trusted submit succeeds. Surface `Saved`, `Saving`, and `Not synced` when a write fails.

2. **Stable annotation model (P0)**
   - Replace text-only highlights with source offsets scoped to the rendered stimulus/anchor.
   - Persist and restore them through the same envelope. Preserve the existing clear-all action and add a focused remove action only if the current UX requires it.

3. **Table and splitter CSS (P1)**
   - Remove the `min-width: 0` override from table fields and give the field a usable minimum.
   - Replace percentage-plus-minimum splitter tracks with a geometry that can actually fit, or lower the phone breakpoint to protect narrow desktop widths.

4. **Grading contract (P0 for scoring integrity)**
   - Share one parser between teacher entry and import.
   - Add numeric canonicalization with strict grouping/decimal rules.
   - Add direct scorer tests and trusted submission tests for positive and negative numeric cases, alternatives, literal slash values, optional wording, multi-select order, duplicates, and units.
   - Republish affected material after the canonical answer representation is corrected.

## Regression coverage required

### Unit/component

- Reading V2 scorer: `1,000`/`1000` accepted; `3,000`/`3.000` and `1.5`/`1,5` rejected; case and whitespace normalized; units preserved; literal `km/h` preserved; scalar alternatives accepted; multi-select answers are order-independent without duplicate credit.
- Import/editor parser: `A / B`, `A|B`, optional parentheses, `10/ten times`, and literal compact tokens each retain their intended meaning.
- Runtime shell: answers, highlights, `startedAt`, and active location hydrate without a blank write; highlight offsets survive repeated text; table field has a real minimum width; splitter responds at min/max.

### Browser journeys

- Enter answers in every question family, reload, and verify every value.
- Enter an answer, immediately click Exit, return through the student shell, and verify the draft is offered/resumed.
- Close/reopen the app and verify the same unfinished attempt and timer state.
- Switch passages and return; verify answers and annotations remain tied to stable interaction/stimulus IDs.
- Select a repeated phrase, reload, and verify the original occurrence remains highlighted.
- Run the table fixture at normal and narrow desktop widths; verify the field can be clicked and typed into.
- Move the splitter to both limits at the narrowest desktop viewport and verify neither panel is clipped or pushed off-screen.
- Submit successfully and verify the unfinished draft is removed; failed submission keeps it and shows the failure state.

## Verification performed for this review

- `npm run tooling:doctor` passed with repository-owned root Vitest, Vite, Playwright, and Firebase tooling available.
- Focused Vitest run passed on the clean branch: 4 files, 170 tests (`ReadingV2RuntimeShell`, import normalization, result adapter, multiple-answer flow).
- Live public smoke route: `http://localhost:5173/__smoke/reading-v2-vertical-loop?fixture=valid-full-test`.
  - Splitter value moved from 50 to 70.
  - Table textarea measured 1px wide with computed `min-width: 0px`.
  - Highlight count changed from 1 before reload to 0 after reload.

The authenticated Student Practice/homework route was not used in this review, so server-side draft synchronization and the real student-shell resume bootstrap still need an end-to-end pass after implementation.

## Follow-up implementation status — 2026-11-09

The bounded local-runtime correction is committed on the fresh branch from `main`:

- Reading V2 drafts use a versioned envelope containing answers, anchored
  highlights, timer start and active location. Student Practice registers that
  projection with the existing student resume record and clears it only after
  successful submission. Existing answer-map drafts migrate without being erased.
- Highlight capture stores paragraph-relative offsets and the renderer carries
  those offsets through inline markup, so repeated text remains anchored.
- Table fields keep a usable minimum width and the desktop splitter uses
  proportional tracks that fit the available width.
- Numeric scoring accepts a valid thousands separator while preserving decimal,
  unit and slash-token distinctions; manual answer editors use the same parser
  as import normalization.

Focused verification passed 212 tests across six files. Adjacent shared Reading V2
renderer/result tests passed another 30 tests. Touched-file ESLint passed. A full
TypeScript check still reports four pre-existing errors in the listening feature;
no changed file is among them. The branch smoke route rendered in the in-app
browser on `http://localhost:5174`, using its phone layout; desktop-only geometry
and highlighter browser checks remain limited by the in-app browser's mobile user
agent and blocked session-storage override.

Cross-device draft synchronization and publication of affected legacy answer keys
remain outside this local correction.