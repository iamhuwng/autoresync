# Codebase Hygiene Rules

> Rules for codebase-wide patterns, import bans, feature registration, and data contracts.
> **Load this file when:** PRD says "replace ALL", writing import statements, touching code that imports `@mantine/*`, creating user-facing features, or writing data to paths existing code reads.

---

## Rule 9 — Codebase-Wide Grep Audit for "Replace ALL"

**Trigger:** When a PRD or task says "replace ALL", "every", "all instances", or "this replaces existing".

**Why it exists:**
On 2026-02-24, PRD-0025 said "This replaces ALL existing result click handlers." Only one page was updated; two others still used the old route.

**The rule:**
1. Identify the OLD pattern
2. Grep the ENTIRE `src/` for that pattern
3. Fix ALL matches, not just the one file mentioned in the task
4. Grep again to confirm zero remaining instances

**Self-check:** *"Does this PRD/task use 'all', 'every', 'replace existing'?"*
If yes → grep the codebase. Don't assume only one file needs updating.

---

## Rule 15 — No Mantine: Import Ban And Encountered-Use Replacement

**Trigger:** Writing ANY `import` statement or `npm install` for `@mantine/*`, or modifying a UI file/component that already imports `@mantine/*`.

**The rule:**
DO NOT import, use, or recommend ANY `@mantine/*` package in new code.

| Mantine Component | Native Replacement |
|---|---|
| `Button` | `<button>` with CSS classes |
| `Modal` | `<dialog>` element or custom portal |
| `TextInput` / `Textarea` | `<input>` / `<textarea>` |
| `Select` | `<select>` or custom dropdown |
| `Stack` / `Group` | `<div>` with flexbox CSS |
| `useMediaQuery` | `@media` CSS or the approved repo responsive helper |
| `notifications` | Custom toast system |

**Scope:**
- **New files:** zero Mantine imports.
- **Modifying existing files:** do not add Mantine imports.
- **Encountering existing Mantine in the edited UI path:** replace the Mantine component/hook in the touched component or touched region with native HTML/CSS, shared repo primitives, or approved platform helpers.
- **Teacher-facing UI:** same rule as student-facing UI. Do not leave Mantine in the touched teacher surface just because the older rule was student-oriented.
- **Full rewrites:** replace Mantine with native alternatives.

If replacement would expand the task beyond the touched surface, stop and document the deferred Mantine residue with file path, component name, and why it is out of scope. Do not add new Mantine while deferring old Mantine.

**Current enforcement:**
- `npm run lint` runs `npm run lint:mantine`.
- `npm run lint:mantine` runs `scripts/check-mantine-boundary.mjs`.
- `.github/workflows/mantine-boundary.yml` checks changed source on PRs and pushes.
- The old Vite/browser console Rule 15 warning path is obsolete as an
  enforcement boundary. Do not rely on runtime console warnings to catch banned
  imports.

**Self-check:** *"Am I about to write `import { ... } from '@mantine/...'`?"*
If yes → STOP. Use native HTML/CSS.

**Encounter self-check:** *"Am I editing a teacher or student UI file that already imports `@mantine/*`?"*
If yes, replace the encountered Mantine in the touched area or record the explicit deferred residue.


---


## Rule 17 — Producer-Consumer Contract

**Trigger:** Writing new code that creates/saves data to a domain where other code already reads from.

**Why it exists:**
On 2026-02-28, a writing submission service wrote to `test_results_by_student` (the index) but never wrote to `test_results/{resultId}` (the main record). The academic record system uses a two-step lookup: read IDs from index → fetch full record. Writing results were silently dropped.

**The rule:**
When writing new code that produces data consumed by existing code, trace ALL existing consumers BEFORE writing.

### The Consumer-Trace Protocol

1. **Identify** what kind of data you're producing
2. **Find all existing readers:**
   ```bash
   grep -rn "test_results" src/services/ --include="*.ts"
   grep -rn "getTestResult\|getStudentResults" src/
   ```
3. **Trace** the full read chain end-to-end
4. **Ensure** your write satisfies ALL consumers

```typescript
// ❌ WRONG — only wrote to the index
await set(ref(database, `test_results_by_student/${studentId}/${resultId}`), record);

// ✅ CORRECT — write to ALL locations consumers expect
await set(ref(database, `test_results/${resultId}`), record);           // main record
await set(ref(database, `test_results_by_student/${studentId}/${resultId}`), record); // index
```

**Self-check:** *"Does existing code already read the kind of data I'm about to write? Have I traced every reader?"*

**Canonical reference:** `src/services/testResults.service.ts` → `saveTestResult()`
