# PRD0052 Book Editor — Review + Fixes Handoff (2026-06-05)

> Purpose: a single source another agent can use to collect all work from this
> session. Covers the code/UX review of the Book editor modal redesign, every fix
> applied, the Rule 19 documentation change, the commits created, and the exact
> verification evidence. Nothing here is destructive to prior PRD0052 work.
>
> **Historical/superseded note (2026-06-06):** This handoff predates the real
> portaled three-dot actions menu, icon-only right-panel actions, typography
> hierarchy cleanup, and removal of legacy teal/green Book-modal chrome. Its
> “relabel to Select / no menu” decision is obsolete. Current source of truth:
> `documentation/architecture/book-editor-authoring-modal-architecture.md`.

## 1. Session Context

- **Repo:** `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`
- **Branch:** `codex/prd0052-material-tabs-inline`
- **HEAD after this session:** `3c6256d3`
- **Starting point:** picked up the review described in
  `documentation/tasks/PRD0052/handoff-20260605-162506.md` (Book editor modal +
  approved Stitch "Content" tab redesign).
- **Task flow:** independent code/UX review → user approved fixing the two
  pre-merge findings → user approved the fast-follow (#3) → discussion + approval
  to downgrade Rule 19 → user approved the four Low/polish items → commit + report.

## 2. Review Performed

Reviewed the Content-tab redesign and modal shell against the handoff contract,
the approved Stitch design (`.stitch/designs/book-editor-content-tab-redesign.html`
/ `.png`), and the QA screenshots (`output/playwright/prd0052-content-redesign-*.png`).

**Contract conformance confirmed (no change needed):** exactly 3 tabs
(Overview/Content/Settings), no peer Assign tab; modal header owns Save / Request
review / close; no nested TeacherHeader; no body command bar or footer strip in
modal (gated to `page-compat`); left panel = outline + search + root-add +
selection only (no picker, no inline command dump); right panel owns
details/structure/attach/assign; copy uses "Selected material" / "Assignment"
(not Stitch's "Currently Active Draft Item"); attach uses snapshot refs (no source
mutation); delete uses an in-modal confirm (not `window.confirm`); public
projection is read-only; legacy route redirects to `/lobby` with modal-open state.

**Findings (all now resolved):**

| # | Severity | Finding |
|---|----------|---------|
| 1 | Medium | Header `Save` is tab-scoped (intentional, tested) but silently dropped unsaved edits in the **non-active** domain |
| 2 | Medium (a11y) | Tree row `...` buttons were labelled `Open actions for X` but only selected — no menu existed |
| 3 | Medium (a11y) | Modal had `aria-modal` but no focus trap and no body scroll lock |
| 4 | Low | Inspector Type `<select>` could not represent placeholder node types (controlled-value mismatch) |
| 5 | Low | `BookNodeTree` had incomplete ARIA tree semantics (treeitems without tree/group parents) |
| 6 | Low | Row buttons rendered literal `...` instead of the design's `more_vert` icon |
| 7 | Low | Page-compat dirty check compared `nodes` to the immutable `initialNodeList` prop → spurious dirty after repo load/save |

## 3. Fixes Applied (by task)

### Task A — Cross-tab Save flush (Finding #1)
- **File:** `src/components/books/BookEditorWorkspace.tsx`
- **Root cause:** `saveActive()` branched on the active tab and saved only that
  domain (metadata on Overview/Settings, structure on Content). The dirty flag is
  global, so edits made on another tab were not persisted.
- **Important discovery:** the per-tab Save is an **intentional, tested contract**
  (`BookEditorModal.test.tsx` "routes modal Save by active three-tab body owner"
  pins exact `repository.update` counts). So it was preserved, not replaced.
- **Fix:** new `handleSaveActive()` — the active tab's domain always saves; the
  other domain is flushed **only when dirty**, with the metadata write's
  `updatedAt` threaded into the structure write so optimistic concurrency holds.
- **Verification:** new regression test in `BookEditorModal.test.tsx`
  ("flushes metadata edited on another tab when Save runs from the Content tab");
  existing count-based contract tests still pass.

### Task B — Tree button relabel (Finding #2)
- **File:** `src/components/books/BookNodeTree.tsx` (+ `BookNodeTree.test.tsx`)
- **Fix:** relabeled both row buttons from `Open actions for X` → `Select X` so the
  accessible name matches behavior. Deliberately did **not** add a tree actions
  menu (would reintroduce the command surface the handoff banned; all real actions
  stay in the right panel). Tests updated to the new labels.

### Task C — Modal focus trap + scroll lock (Finding #3)
- **File:** `src/components/books/BookEditorModal.tsx` (+ `BookEditorModal.test.tsx`)
- **Fix:** body scroll lock on open (restore previous `overflow` on close);
  Tab/Shift+Tab focus trap over the existing `onKeyDown` (Escape unchanged). When
  the discard prompt is open, focus is confined to that prompt. Guarded
  focusable-element query for `noUncheckedIndexedAccess`.
- **Verification:** two new tests (scroll lock; focus trap via `fireEvent.keyDown`
  for determinism after `userEvent.tab` proved flaky).

### Task D — Placeholder-type select (Finding #4)
- **File:** `src/components/books/BookEditorWorkspace.tsx`
- **Fix:** the inspector Type `<select>` prepends the node's current type when it
  is not `section`/`chapter`/`test`, giving placeholder nodes a valid controlled
  value (no React warning, no wrong displayed type) while still allowing
  conversion.

### Task E — ARIA tree semantics (Finding #5)
- **File:** `src/components/books/BookNodeTree.tsx`
- **Fix:** root list `role="tree"` (labelled by the heading); nested child and
  material-ref lists `role="group"`; parent nodes expose `aria-expanded`.

### Task F — `more_vert` icon (Finding #6)
- **File:** `src/components/books/BookNodeTree.tsx`
- **Fix:** replaced literal `...` with an inline more-vert SVG (`aria-hidden`,
  `focusable="false"`); button `aria-label` still supplies the accessible name.
  Matches the approved Stitch design and the inline-SVG house style.

### Task G — Dirty baseline (Finding #7)
- **File:** `src/components/books/BookEditorWorkspace.tsx`
- **Fix:** added a `baselineNodes` state that advances on every load and save
  (mount, `initialBook` change, repo `listBookNodes`, full `loadBook`,
  public-projection fallback, both structure-save paths). Dirty check and
  `structureDirty` now compare against `baselineNodes` instead of the immutable
  `initialNodeList` prop.

### Task H — Rule 19 documentation downgrade (governance, user-approved)
- **File:** `documentation/rules/mobile-portability.md`
- **Why:** grounded against the codebase — no `react-native`/`@capacitor/*`/
  `@react-navigation/*` deps installed; Capacitor (a stated target) runs a webview
  where `window`/`document`/`navigator` work, so the "crashes at runtime" premise
  only applies to bare RN; ~190 files already use these APIs directly outside the
  platform layer, so the blanket ban was unenforced.
- **Change:** reframed Rule 19 from a hard "zero-bypass" ban to a **scoped
  guideline** — require the abstraction only for cross-cutting capabilities that
  already have one (online status, screen size, lifecycle, clipboard, storage,
  document title); added an explicit EXEMPT list for one-off intrinsically-DOM
  component-local behavior (modal focus traps, scroll lock, `ref.focus()`, etc.);
  added a dated Update Note + a reinstatement trigger (restore hard rule if/when a
  React Native target is committed). The abstraction layer itself is kept.

## 4. Commits Created (this session only)

Ordered so each commit's tests are valid on its own tree (workspace
implementation before the modal that depends on it):

| Hash | Title | Files |
|------|-------|-------|
| `9d7fab2b` | `docs(rules): downgrade Rule 19 to a scoped guideline` | `documentation/rules/mobile-portability.md` |
| `92f98487` | `feat(prd0052): harden book-editor content tab (save-flush, dirty baseline, a11y)` | `BookEditorWorkspace.{tsx,css,test.tsx}`, `BookNodeTree.{tsx,css,test.tsx}` |
| `3c6256d3` | `feat(prd0052): book-editor modal shell with focus trap and scroll lock` | `BookEditorModal.{tsx,css,test.tsx}` |

**Important caveat for the collecting agent:** `BookEditorWorkspace.*`,
`BookEditorModal.*` and their tests were **untracked/in-progress** at session
start, so commits #2 and #3 also introduce the surrounding PRD0052 feature code
those files contain — not only this session's fixes. `BookNodeTree.*` was tracked
but already had prior uncommitted edits mixed in. Per-task isolation was not
possible (no clean seam between this session's edits and the in-progress feature;
no interactive hunk staging). Only the Rule 19 doc (commit #1) is provably
this-session-only.

## 5. Verification Evidence

Run from repo root (bash; `npx` works directly — do **not** prefix `cmd /c`):

- **Targeted suite — 61 passing (6 files):**
  ```
  npx vitest run \
    src/components/books/BookEditorModal.test.tsx \
    src/components/books/BookEditorWorkspace.test.tsx \
    src/components/books/BookNodeTree.test.tsx \
    src/components/books/BookMaterialPicker.test.tsx \
    src/pages/TeacherLobbyPage.test.jsx \
    src/components/books/BookEditorPage.test.tsx \
    --reporter=basic --pool=forks
  ```
  (was 58 before this session; +3 new tests: cross-tab Save flush, scroll lock,
  focus trap.)
- **TypeScript — no diagnostics on touched files:**
  ```
  npx tsc --noEmit --pretty false 2>&1 | grep -iE "BookEditorWorkspace|BookNodeTree|BookEditorModal"
  ```
  (Full `tsc` still exits non-zero from pre-existing repo-wide debt outside this slice.)
- **Whitespace:** `git diff --check` clean on all touched files.
- **UTF-8:** `npm run check:utf8 -- documentation/rules/mobile-portability.md` passed.

## 6. State Left Behind / Next Steps for the Collecting Agent

- **All 7 review findings are resolved and committed.** No outstanding fixes from
  the review.
- **87 working-tree entries remain dirty and are NOT from this session** — prior
  PRD0052 feature work plus some items worth a human decision before committing:
  - 10 deleted `.claude/skills/kn-*/SKILL.md` files,
  - a file literally named `json`,
  - `.claude/settings.local.json`,
  - `src/components/modern/*`, `src/config/*`, `src/routes/*`, `src/pages/*`,
    `BookMaterialPicker.*`, `BookEditorPage.*`, PRD0052 docs, `.stitch/` designs,
    `output/` backups, and several `handoff-*.md` files.
  These were intentionally left untouched. Decide scope before committing them.
- **Deliberately NOT changed:** `CLAUDE.md` still labels these "Integration Safety
  Rules (22 rules — ZERO BYPASS)" and its trigger table still points
  `window/document` hooks at `mobile-portability.md`. That row is still accurate
  (it says "read this file," which now yields the scoped guideline), but the
  "ZERO BYPASS" header is now slightly inconsistent with Rule 19's new status.
  Left to the user since `CLAUDE.md` is top-level project governance.
- **Nothing pushed.** Commits are local on `codex/prd0052-material-tabs-inline`.

## 7. Constraints / Conventions Observed

- No new `@mantine/*` imports.
- Modal shell contract preserved (no nested TeacherHeader, no body command bar /
  footer strip, no peer Assign tab, 3 tabs only).
- DOM usage for the focus trap / scroll lock kept local to the web-only modal,
  consistent with Rule 19's new EXEMPT list and the file's existing DOM usage.
- Commit messages end with the required `Co-Authored-By` trailer.
- Commit-only-when-asked honored (committed only after explicit request).
