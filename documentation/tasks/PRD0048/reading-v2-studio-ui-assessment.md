# Reading V2 Studio — UI Implementation Assessment

> **Date:** 2026-04-28
> **Scope:** All 17 files in `src/components/reading-v2/studio/` (8 component/logic files + 9 test files) + `src/pages/ReadingV2StudioPage.tsx`, assessed against `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md` §1–§13.
> **Verdict:** The Studio is an **architecturally correct skeleton** that faithfully reproduces the PRD's structural contract (two-column layout, three tabs, mode system, operational states). However, the UI is currently a **forms-and-lists wireframe** — it lacks the visual polish, interactive richness, and content-editing capabilities required for a production authoring tool.

---

## 2026-05-01 Task-Type Editor UX Update

The Build Workspace task-type editor phase has moved beyond the original forms-and-lists wireframe for the active Reading V2 task types:

- Question group cards now use the Stitch-style academic card treatment: rounded cards, subtle selected rail, guidance strip, feature chips, hover lift, and reduced-motion-safe entry animation.
- Active task-type editors expose task-specific guidance rather than a generic schema-driven shell.
- Completion rows identify missing visible blanks and provide an Insert blank repair action.
- Completion-family prompts without visible blank markers are now publish-blocking, so a hidden or missing blank cannot pass to preview/runtime.
- Answer-key fields and Multiple Selection choices expose missing/selected states visually.
- Delete question and delete group actions require confirmation before changing draft data.
- Table Completion cells render question-number chips directly inside blank cells, matching the Stitch table sample and improving merge/split verification.
- Table Completion row/column edits, merge/split, selected blank marking, header-row marking, and selection clearing now sit in one compact toolbar above the grid, matching the Stitch table editor's control hierarchy.

Still open after this update:

- Multiple Selection still needs a deeper official IELTS group-level answer-slot model for "Choose TWO/THREE letters" ranges.
- Matching Headings and Matching Information still need paragraph-derived row/choice generation from the passage.
- Flowchart Completion and Diagram Labelling remain disabled until their full persistence, preview, publish, and runtime paths are implemented.

---

## 1. File Inventory

| File | Size | Role | PRD Schema Match |
|------|------|------|:---:|
| `ReadingV2StudioShell.tsx` | 23.4 KB (651 lines) | Root shell: layout, tabs, modes, header, actions, state bar, footer | ✅ core structure |
| `ReadingV2StudioShell.css` | 11.7 KB (577 lines) | Full design system: variables, grids, buttons, responsive breakpoints | ✅ |
| `ReadingV2TaskGroupEditor.tsx` | 6.9 KB (164 lines) | Two-sub-column rail/main: task group list + selected editor | ✅ |
| `ReadingV2AnswerRuleEditor.tsx` | 9.0 KB (267 lines) | Per-interaction scoring, answer keys, family-specific shape controls | ✅ |
| `ReadingV2MetadataPanel.tsx` | 5.3 KB (155 lines) | Material metadata: title, kind, duration, difficulty, tags, visibility | ✅ |
| `ReadingV2SettingsPanel.tsx` | 3.3 KB (84 lines) | Publish-facing settings: title shortcut, visibility, readiness | ✅ |
| `ReadingV2ImportReviewPanel.tsx` | 2.8 KB (80 lines) | Import review: evidence, uncertainty, publish-blocking placeholders | ✅ |
| `ReadingV2StudioModalAdapter.tsx` | 1.2 KB (45 lines) | Modal host wrapper for Teacher Lobby entry | ✅ |
| `ReadingV2StudioOperationalStates.ts` | 2.7 KB (55 lines) | 11-state operational state machine | ✅ |

**Test coverage:** 9 test files, 489 lines total, covering structure, action emission, publish blocking, ID preservation, multi-mode reuse, answer-rule editing, boundary enforcement, and import fail-closed behavior.

---

## 2. Structural Compliance vs PRD Page Schema

### 2.1 What Matches the PRD

| PRD §4 Visual Schema Element | Implementation Status |
|---|---|
| Two-column layout: left = stimulus/reference, right = task logic | ✅ `reading-v2-studio__columns` with `grid-template-columns: minmax(280px,0.78fr) minmax(520px,1.42fr)` |
| Three top-level tabs: Stimulus, Questions, Settings | ✅ `STUDIO_TABS` array, enforced by test (no Answer Key tab) |
| Header with Title + Status + action buttons | ✅ Header grid with Save Draft, Validate, Preview, Publish, Discard, Exit |
| Bottom utility rail | ✅ Footer with warnings, provenance, import evidence labels |
| Modal vs page host | ✅ `data-host="page"` / `data-host="modal"`, CSS adjusts `min-height` |
| Six entry modes | ✅ All 6 modes declared in `ReadingV2StudioMode` type |
| Operational state system (12 states) | ✅ 11 states with title/message/severity/actionLabel contracts |
| Return context tracking | ✅ `ReadingV2ReturnContext` with `surface` + `label` |
| Answer keys inside Questions tab, not separate tab | ✅ `ReadingV2AnswerRuleEditor` renders inside `ReadingV2TaskGroupEditor` |
| Settings ownership boundary (no homework/session/course) | ✅ Tested via absence assertions in `ReadingV2SettingsPanel.test.tsx` |
| Import evidence retained and inspectable | ✅ `ReadingV2ImportReviewPanel` shows evidence/uncertainty/blocking lists |
| Unsupported upload fails closed | ✅ `unsupportedUpload` disables accept button, shows `role="alert"` |
| Stable ID preservation on reorder | ✅ `reorderReadingV2TopLevelTaskGroups` tested for ID stability |
| Published-edit creates revision, not live mutation | ✅ `revise-published` mode shows safety message, tested |

### 2.2 What Doesn't Match or Is Missing

| PRD Requirement | Section | Status | Detail |
|---|---|---|---|
| **§9.1 Stimulus Tab: passage editing** | Stimulus tab | 🔴 Missing | Right column shows a static `<h2>Selected Stimulus Editor</h2>` with two `<p>` placeholders. No text editing surface, no rich editor, no anchor map. The entire left column is a read-only structural outline. |
| **§9.1 Stimulus Tab: paragraph and anchor map** | Stimulus tab | 🔴 Missing | No anchor visualization, no paragraph highlights, no clickable anchor repair surface. |
| **§9.1 Stimulus Tab: structured stimulus editing** | Stimulus tab | 🔴 Missing | Tables, flowcharts, and diagrams have no editing UI at all. |
| **§9.2 Questions Tab: left column stimulus reference** | Questions tab | 🟡 Partial | Left column shows structure outline + passage asset reference, but doesn't show "read-only or lightly editable stimulus reference" or "paragraph or anchor highlighting" as specified. |
| **§9.2 Questions Tab: interaction ordering** | Questions tab | 🟡 Partial | Interactions render in a numbered list but have no add/remove/reorder controls. |
| **§9.2 Questions Tab: question preview** | Questions tab | 🔴 Missing | No inline question preview exists. |
| **§9.3 Settings Tab: where-used/dependency reference** | Settings tab | 🟡 Partial | Shows material kind and provenance but not where-used references. |
| **§9.3 Settings Tab: revision summary** | Settings tab | 🔴 Missing | No revision history or diff summary. |
| **§8 Authoring Interaction Contract: direct repair controls** | All tabs | 🔴 Missing | Anchor Repair section is documentation-only text. No actual repair buttons, broken-anchor detection, or resolution UI. |
| **§4 Visual Schema: Diff button** | Header | 🔴 Missing | PRD schema shows "Diff" in the header action bar. Not implemented. |
| **§4 Visual Schema: Validation panel** | Right column | 🟡 Partial | Validation issues render as a list of error messages, but there is no dedicated panel with severity filtering, grouping by object, or click-to-navigate. |
| **§4 Visual Schema: Question preview / diff** | Right column | 🔴 Missing | Neither question preview nor diff views exist. |

---

## 3. UI Quality Assessment

### 3.1 Design System

The CSS is well-structured with a proper custom-property design system:

```
Palette:  --rv2-bg, --rv2-surface, --rv2-border, --rv2-text, --rv2-muted,
          --rv2-teal (primary), --rv2-amber (warning), --rv2-red (error)
Font:     Inter, system-ui fallback stack
Sizing:   clamp() for h1, rem-based throughout
Shadow:   Single token --rv2-shadow for cards
Radius:   Consistent 6-8px across all panels
```

**Strengths:**
- Consistent token-based color system (no ad-hoc hex values in components)
- Proper `focus-visible` outline styles for keyboard navigation
- Inter font family with appropriate weight hierarchy
- Subtle hover transitions on buttons (translateY, box-shadow)
- Clean pill-style status badges with semantic coloring

**Weaknesses:**

| Issue | Severity | Detail |
|---|---|---|
| **No dark mode** | 🟡 Low | Palette is light-only; no `prefers-color-scheme` or data-attribute toggle |
| **No loading/skeleton states** | 🟡 Medium | Operational states define `loading` semantically but the UI shows the same layout with different text — no shimmer, no spinner, no progressive disclosure |
| **No animations** | 🟡 Low | Tab switching, panel expansion, and state transitions are instant. No CSS transitions on content swap. |
| **No empty-state illustration** | 🟢 Low | Empty panels show text only ("No task group selected.") |
| **Flat visual hierarchy** | 🟡 Medium | All sections (header, state bar, metadata, columns, footer) look structurally similar — white cards with `#d8ded2` borders. The eye has no strong hierarchy anchor. |
| **Information density is high** | 🟡 Medium | Context-line, meta-row, subtitle, and eyebrow in the header create 5+ lines of chrome before the user reaches the editor content. |

### 3.2 Responsiveness

Three breakpoints are defined:

| Breakpoint | Behavior |
|---|---|
| `> 1120px` | Full two-column layout, sticky left column |
| `≤ 1120px` | Single-column collapse, header/state/columns/task-group-editor all stack vertically |
| `≤ 680px` | Compact padding, full-width buttons, single-column form grid, single-column tabs |

**Issues:**
- The `≤ 680px` breakpoint stacks tabs vertically (3 rows), which is unusual — most tab-bar patterns stay horizontal even on mobile
- No `min-width` protection — extreme narrow viewports could cause overflow
- Left column `position: sticky` is disabled at ≤1120px, which is correct behavior

### 3.3 Accessibility

| Feature | Status |
|---|---|
| `aria-label` on all major regions | ✅ Present on every `<section>` and `<aside>` |
| `aria-pressed` on active tab | ✅ Used correctly on tab buttons |
| `aria-current` on selected task group | ✅ Used on list buttons |
| `aria-disabled` + `disabled` on publish | ✅ Both attributes set |
| `aria-live="polite"` for readiness | ✅ On metadata readiness indicator |
| `role="alert"` for import failure | ✅ On unsupported file message |
| `role="dialog"` on modal adapter | ✅ With `aria-modal="true"` |
| Keyboard navigation | 🟡 Partial — focus-visible styles exist but no focus trapping in modal, no keyboard shortcuts |
| Color contrast | ✅ Teal-on-white, red-on-light-red pass WCAG AA |
| Screen reader flow | ✅ Semantic HTML structure (header → nav → main sections) |

---

## 4. Component-by-Component Deep Dive

### 4.1 ReadingV2StudioShell (651 lines)

**What it does well:**
- Clean mode-to-tab initialization (`create-from-import` → Stimulus tab, others → Questions)
- Immutable document updates via spread patterns (no mutation)
- Centralized action emission with `emitAction()` pattern
- Diagnostic logging gated behind `import.meta.env.DEV`
- Proper syncing when `mode` or `document` prop changes via `useEffect`

**What it gets wrong:**
- **The Stimulus tab is literally a placeholder:**
  ```tsx
  {activeTab === 'Stimulus' ? (
    <section className="reading-v2-studio__empty-panel" aria-label="Stimulus editor">
      <h2>Selected Stimulus Editor</h2>
      <p>Stimulus editing keeps passages, anchors, tables, flow steps, and diagrams in canonical draft structure.</p>
      <p>Linked task groups: <strong>{orderedTaskGroups.length}</strong></p>
    </section>
  ) : null}
  ```
  This is the **single biggest UI gap** in the entire Studio. The PRD's §9.1 specifies passage editing, paragraph/anchor mapping, and structured stimulus editing as primary Stimulus tab responsibilities.

- **Header information is duplicated:** The context-line (`Mode: ... | Schema v... | Return: ...`) and the meta-row below it display the exact same three pieces of information in slightly different formats. This wastes vertical space.

- **Button bar lacks visual grouping:** Save Draft, Validate, Preview, Publish, Discard, and Exit are all equally weighted in a flat flex row. PRD §4 groups them as `Save Draft | Validate | Preview | Publish | Diff | Exit` — with Diff present and Discard implied but not called out at the same level.

- **No unsaved changes indicator:** The header doesn't show a dirty-state dot, asterisk, or badge. Teachers can't tell if they have unsaved work.

- **No confirmation dialog for Discard:** The discard button emits `outcome: 'confirmation-required'` but the component renders no confirmation UI. The parent must handle it.

### 4.2 ReadingV2TaskGroupEditor (164 lines)

**What it does well:**
- Clean two-sub-column layout: rail (list) + main (editor)
- Task group selection with `aria-current` for screen readers
- Shows engineering family badge on each list item
- Editable instruction blocks with add-block capability

**What it gets wrong:**
- **No interaction CRUD:** The interaction list is display-only — no "Add Interaction," "Remove Interaction," or reorder controls exist. This is PRD §8 requirement: "direct editing for answer rules" implies the ability to create the interactions that hold those rules.
- **No delete task group:** Only add + reorder — no removal capability.
- **No drag-and-drop reorder:** Only "Move Selected Up"/"Move Selected Down" buttons. While functional, this is a poor UX for multi-group documents.
- **Anchor Repair section is documentation text only:**
  ```tsx
  <h3>Anchor Repair</h3>
  <p>Broken paragraph, inline blank, table-cell, flow-step, diagram hotspot, and annotation anchors are repaired...</p>
  <p>Document anchors: {Object.keys(document.anchors).length}</p>
  ```
  No actual repair controls, no broken anchor detection, no visual indicators.

### 4.3 ReadingV2AnswerRuleEditor (267 lines)

**What it does well:**
- Group-level normalization controls (casing, punctuation) write to `taskGroup.answerRule`
- Per-interaction controls are family-aware: free-text shows word limit, binary-judgement shows vocabulary, matching shows option reuse, structured-entry shows structure type
- Pipe-separated acceptable answers with proper parsing
- Score value editing per interaction

**What it gets wrong:**
- **No option-set editor:** Matching interactions reference `optionSetId` but there's no UI to create, view, or edit the actual option choices. This makes matching task authoring incomplete.
- **No answer key preview:** Teachers enter `alpha | beta` as text but see no visual preview of how students will experience the answer validation.
- **No bulk answer operations:** No "apply word limit to all interactions" or "copy scoring rule" convenience actions.

### 4.4 ReadingV2MetadataPanel (155 lines)

**What it does well:**
- All 10 metadata fields are exposed with proper labels
- Material kind dropdown with 3 values (full-test, task-group-material, extracted-task-group-material)
- Comma-separated tag parsing
- Read-only ownership and provenance in definition list
- Live readiness indicator with `aria-live="polite"`

**What it gets wrong:**
- **Product marker is read-only but displayed as an input** — misleading UX, should be a badge or text display.
- **Difficulty is a free-text input** — should be a constrained dropdown or slider for consistent data quality.
- **Target band is a free-text input** — same issue, should be a dropdown (Band 4-5, Band 5-6, etc.).
- **Tags use comma-separated string input** — a tag chip component would be more intuitive and prevent duplicates.
- **No validation indicators on individual fields** — only a single "Needs title" / "Ready" badge at the top. Fields like duration (could be 0 or negative) have `min={1}` but no visual error state if invalid.

### 4.5 ReadingV2SettingsPanel (84 lines)

**What it does well:**
- Correctly scoped to material-level settings only
- Explicit ownership boundary text ("Assignment targets, session state, course placement... stay with their owning platform features")
- Shows publish readiness and validation issue count
- Tested for absence of homework/session/course/result controls

**What it gets wrong:**
- **Duplicates metadata fields:** Title and visibility appear in both MetadataPanel and SettingsPanel. The SettingsPanel calls its title field "Metadata shortcut title" but they write to the same state — confusing.
- **No revision history:** PRD §9.3 requires "revision summary" in Settings. Not present.
- **Runtime advisories section is static text only** — no actual advisory detection or structured warnings.
- **Very thin panel:** Only 84 lines with 3 form fields and 3 static text sections. It feels like a placeholder expansion rather than a fully designed settings surface.

### 4.6 ReadingV2ImportReviewPanel (80 lines)

**What it does well:**
- Clean three-section structure: Evidence, Uncertainty, Publish-Blocking Placeholders
- `role="alert"` for unsupported file type
- Accept button disabled for unsupported uploads
- Default candidate object for development/preview

**What it gets wrong:**
- **Not connected to any parsing pipeline** — `onAcceptImport` fires but there's no import engine that produces real `ReadingV2ImportCandidate` objects. The panel only works with hardcoded or passed-in data.
- **No progress indicator** — if import parsing takes time, there's no loading state.
- **No inline editing of uncertainty** — teachers see "Question range needs teacher confirmation" but can't resolve it within the panel.
- **Only visible on Stimulus and Settings tabs** — hidden on Questions tab, which seems inconsistent given that import affects questions too.

### 4.7 ReadingV2StudioModalAdapter (45 lines)

**What it does well:**
- Minimal wrapper that hosts the exact same Studio shell
- Correct `role="dialog"` + `aria-modal="true"`
- Context label enrichment with materialId/draftId

**What it gets wrong:**
- **No overlay/backdrop** — renders as an inline `<section>`, not a proper modal with backdrop.
- **No focus trap** — modal accessibility requires focus to stay within the dialog.
- **No close-on-Escape** — standard modal interaction pattern is missing.
- **No size constraints** — the modal host CSS (`min-height: min(92vh, 980px)`) is defined but no `max-width` or centering is applied by the adapter itself.

---

## 5. Data Flow Assessment

```
ReadingV2StudioPage
  ├── resolveStudioMode(pathname) → ReadingV2StudioMode
  ├── ReadingV2ReturnContext from URL params
  └── ReadingV2StudioShell
        ├── [state] draftDocument: ReadingV2Document (from fixture or prop)
        ├── [state] metadata: ReadingV2StudioMetadata
        ├── [state] activeTab: ReadingV2StudioTab
        ├── [state] selectedTaskGroupId: string | null
        ├── [derived] orderedTaskGroups → flatMap sections → taskGroupIds
        ├── [derived] visibleNumbers → deriveReadingV2VisibleNumbers()
        ├── [derived] publishBlocked → validation issues + metadata title
        │
        ├── ReadingV2MetadataPanel ← metadata, validationIssues
        │
        ├── [left column]
        │   ├── Structure outline (sections → stimuli → task groups)
        │   ├── Passage assets info
        │   └── ReadingV2ImportReviewPanel (on Stimulus/Settings tab)
        │
        └── [right column]
            ├── ReadingV2TaskGroupEditor (on Questions tab)
            │   ├── Rail: task group list with selection
            │   └── Main: selected task group editor
            │       ├── Instruction block textareas
            │       ├── Interaction list (display only)
            │       ├── ReadingV2AnswerRuleEditor
            │       └── Anchor Repair (static text)
            ├── ReadingV2SettingsPanel (on Settings tab)
            └── Stimulus placeholder (on Stimulus tab)
```

**Key concern:** All state lives in `useState` within the shell. There is no persistence layer, no autosave implementation, and no draft-resume data source. The `revisionToken` prop is passed through but never used for conflict detection.

---

## 6. Test Coverage Assessment

| Test File | Tests | What's Covered | What's Missing |
|---|---|---|---|
| `StudioShell.test.tsx` | 7 | Two-column structure, tab enforcement, publish blocking, action tracking, conflict recovery, mode reuse, reorder ID stability | No test for mode switching UI changes, no test for metadata-to-title binding |
| `TaskGroupEditor.test.tsx` | 3 | Instruction editing, multi-block preservation, anchor repair text | No test for add/select/reorder task groups |
| `AnswerRuleEditor.test.tsx` | 3 | Answer entry, normalization rules, matching option reuse | No test for binary-judgement vocabulary, structured-entry type, word limit sync |
| `MetadataPanel.test.tsx` | 3 | Title capture, readiness indicator, material kind/visibility | No test for tag parsing edge cases, duration validation |
| `SettingsPanel.test.tsx` | 2 | Ownership boundaries (absence assertions), publish readiness | No test for settings editing behavior |
| `ImportReviewPanel.test.tsx` | 2 | Evidence visibility + actions, unsupported file fail-closed | No test for default candidate, file type display |
| `ModalAdapter.test.tsx` | 2 | Dialog role, host attribute, no legacy editor | No test for close/onExit behavior |
| `OperationalStates.test.ts` | 1 | Exhaustive key check | No test for severity/actionLabel contracts |

**Total: 23 unit tests.** Coverage is structurally sound but shallow — tests verify elements exist and actions emit, but don't test interaction flows, edge cases, or visual regression.

---

## 7. Gap Severity Matrix

| # | Gap | Category | Severity | Blocks |
|---|---|---|---|---|
| **S1** | Stimulus tab is a static placeholder | Content editing | 🔴 Critical | Passage authoring, anchor editing, structured stimulus editing |
| **S2** | No interaction add/remove/reorder controls | Task editing | 🔴 Critical | Question authoring within task groups |
| **S3** | No option-set creation/editing UI | Task editing | 🔴 Critical | Matching and choice task authoring |
| **S4** | Anchor repair is static documentation text | Content integrity | 🟡 Significant | Broken anchor detection and resolution |
| **S5** | No question preview or diff view | Authoring quality | 🟡 Significant | Author confidence, error checking |
| **S6** | No unsaved changes indicator | UX | 🟡 Significant | Data loss awareness |
| **S7** | No confirmation dialog for discard | UX safety | 🟡 Significant | Accidental data loss |
| **S8** | Modal adapter lacks backdrop, focus trap, Escape handling | Accessibility | 🟡 Significant | Modal usability, WCAG compliance |
| **S9** | Import panel not connected to parsing pipeline | Import flow | 🟡 Significant | AI import end-to-end flow |
| **S10** | No revision history or diff summary in Settings | Pipeline | 🟡 Significant | Revision tracking for published-edit mode |
| **S11** | Header duplicates context information | UI cleanliness | 🟢 Minor | Visual noise |
| **S12** | Difficulty/target band are free-text instead of constrained | Data quality | 🟢 Minor | Inconsistent metadata |
| **S13** | Tags use comma-string instead of chip component | UX polish | 🟢 Minor | User experience |
| **S14** | No loading/skeleton states for operational transitions | UX polish | 🟢 Minor | Perceived performance |
| **S15** | No dark mode | Aesthetic | 🟢 Minor | User preference |
| **S16** | Flat visual hierarchy across all panels | Design | 🟢 Minor | Scannability |
| **S17** | Product marker rendered as read-only input | UX clarity | 🟢 Minor | Misleading interaction affordance |

---

## 8. Positive Findings

Despite the gaps, the implementation makes several strong architectural decisions that should be preserved:

1. **Immutable state updates** — all document mutations use spread operators and return new objects. No direct mutation anywhere.
2. **Action emission pattern** — centralized `emitAction()` with metadata makes observability and analytics integration straightforward.
3. **Type safety** — all props are `readonly`, all component interfaces use explicit types, satisfies-checked constant objects.
4. **Operational state machine** — the 11-state machine is a clean contract that separates "what happened" from "what to show." Easy to extend.
5. **Test philosophy** — tests verify **architectural invariants** (no Answer Key tab, no legacy TestEditor, Settings doesn't own homework) rather than just rendering. These are contract tests, not snapshot tests.
6. **CSS design system** — custom properties, consistent spacing, proper responsive breakpoints. The foundation is solid even if the visual hierarchy needs refinement.
7. **Family-aware answer editing** — the `ReadingV2AnswerRuleEditor` correctly branches rendering by `responseShape.kind`, which means adding new families only requires new conditional blocks.
8. **Boundary compliance** — zero imports from legacy Reading V1. The V2 Studio is architecturally isolated.

---

## 9. Conclusion

The Studio UI is a **well-typed, well-tested structural scaffold** that correctly implements the PRD's layout contract, mode system, and authoring action vocabulary. It would pass a **code architecture review** cleanly.

However, it would **fail a design review or usability review** because:

- 1 of 3 tabs (Stimulus) is entirely non-functional
- The functional tabs (Questions, Settings) are form-heavy wireframes with no preview, no visual feedback, and no interactive richness
- Critical authoring operations (add/remove interactions, create option sets, edit passage text) have no UI surfaces
- The modal adapter lacks fundamental modal behavior (backdrop, focus trap, Escape)

**The Studio is approximately 35% of a production authoring tool by UI capability, but ~85% by architectural correctness.**

## 2026-05-01 Update: Task-Type Editor Phase

The Build Workspace now contains the production-facing task-type editor path for this phase. The older assessment above remains useful for the original Studio shell, but the active teacher Build Workspace has advanced beyond the generic forms-and-lists state for question groups.

Implemented updates:

- Shared `ReadingV2QuestionGroupCard` shell.
- Exhaustive `ReadingV2TaskEditorRegistry` keyed by `ReadingV2CanonicalTaskType`.
- Active registry entries for 14 visible task editors: completion, choice, binary judgement, matching, short answer, and Table Completion.
- Inactive registry entries for Flowchart Completion and Diagram Labelling, kept disabled because their end-to-end authoring/runtime path is not complete.
- Table Completion builder now supports durable cell IDs, rectangular selection, merge selected cells, split selected merged cells, multi-anchor merged blanks, and answer-key preservation through merge/split.

Updated companion notes:

- `documentation/tasks/PRD0048/reading-v2-task-editor-architecture-notes.md`
- `documentation/tasks/PRD0048/reading-v2-table-merge-split-notes.md`
- `documentation/tasks/PRD0048/reading-v2-validation-notes.md`
- `documentation/tasks/PRD0048/reading-v2-runtime-preview-notes.md`
- `documentation/tasks/PRD0048/reading-v2-deferred-feature-flagged-gaps.md`

## 2026-06-08 Update: Review Issues Panel Replaces Hover Tooltip

The Build Workspace warning surface no longer treats the topbar warning pill tooltip as the primary review UI.

Canonical contract: `documentation/architecture/reading-v2-studio-review-issues-contract.md`.

Current contract:

- The warning pill is a click trigger for a stable `Review issues` panel.
- The pill count must match the number of visible actionable rows in that panel.
- Teacher-facing rows use short labels such as `Q12: Missing answer` or `Questions 31-35: Question text changed`.
- Clicking a question-level row moves the editor to the owning task group and emits diagnostic question-link navigation.
- Affected question-group cards show inline issue chips from the same normalized issue list.
- The old full-detail hover/title tooltip behavior is deprecated. A tooltip may remain only as a short hint, for example `Click to review issues`.
- Backend messages remain available in diagnostic exports, but they are hidden by default from teacher-facing row titles.
