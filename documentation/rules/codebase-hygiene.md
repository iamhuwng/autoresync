# Codebase Hygiene Rules

> Rules for codebase-wide patterns, import bans, feature registration, and data contracts.
> **Load this file when:** PRD says "replace ALL", writing import statements, creating user-facing features, or writing data to paths existing code reads.

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

## Rule 15 — No Mantine: Absolute Import Ban

**Trigger:** Writing ANY `import` statement or `npm install` for `@mantine/*`.

**The rule:**
DO NOT import, use, or recommend ANY `@mantine/*` package in new code.

| Mantine Component | Native Replacement |
|---|---|
| `Button` | `<button>` with CSS classes |
| `Modal` | `<dialog>` element or custom portal |
| `TextInput` / `Textarea` | `<input>` / `<textarea>` |
| `Select` | `<select>` or custom dropdown |
| `Stack` / `Group` | `<div>` with flexbox CSS |
| `useMediaQuery` | `window.matchMedia()` or `@media` CSS |
| `notifications` | Custom toast system |

**Scope:**
- **New files:** ❌ ZERO Mantine imports
- **Modifying existing files:** ⚠️ Do NOT add new Mantine imports
- **Full rewrites:** ❌ Replace Mantine with native alternatives

**Self-check:** *"Am I about to write `import { ... } from '@mantine/...'`?"*
If yes → STOP. Use native HTML/CSS.


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
