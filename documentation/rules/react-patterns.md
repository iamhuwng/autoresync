# React Pattern Safety Rules

> Rules for React component patterns, state management, and effect hooks.
> **Load this file when:** writing `useEffect` with intervals, creating state with 'pending'/'loading', or creating new components.

> [!NOTE]
> **dnd-kit rules (former Rules 4 & 5)** are now embedded as inline comments in the 3 files that use dnd-kit:
> - `THCSDndSectionsContainer.tsx` — has Rule 4 (re-measurement) and Rule 5 (no setPointerCapture) comments
> - `DragDropMatchingInput.tsx` — has `RemeasureOnCollapse` pattern with explanatory comments
> - `ModuleList.tsx` — simple sortable, no layout shift risk

---


## Rule 6 — Hot Values → Refs in Intervals

**Trigger:** Writing a `useEffect` that contains `setInterval`, `setTimeout`, or any periodic callback that reads frequently-changing state.

**Why it exists:**
On 2026-02-24, `useSoloAutoSave` had `answers`, `currentQuestion`, and `timeElapsed` in its `useEffect` deps. Every keystroke tore down and recreated the 30-second auto-save interval — effectively making it never fire.

**The rule:**
For periodic effects, use `useRef` for values that change frequently. Only put stable identifiers in the dependency array.

```tsx
// ❌ WRONG — interval torn down on every keystroke
useEffect(() => {
    const id = setInterval(() => {
        save(answers, currentQuestion);
    }, 30000);
    return () => clearInterval(id);
}, [answers, currentQuestion]);  // 💥 changes on every keystroke

// ✅ CORRECT — refs for hot values, stable deps
const answersRef = useRef(answers);
answersRef.current = answers;

useEffect(() => {
    const id = setInterval(() => {
        save(answersRef.current);
    }, 30000);
    return () => clearInterval(id);
}, [materialId, studentId, enabled]);  // only stable identifiers
```

**Self-check:** *"Do any of my `useEffect` deps change on every user interaction?"*
If yes AND the effect creates a timer → extract those values to refs.

**Canonical reference:** `src/hooks/solo/useSoloAutoSave.ts`

---

## Rule 7 — Guaranteed Resolution for All State Branches

**Trigger:** Creating any state variable initialized as `'pending'`, `'loading'`, `'initializing'`, or similar intermediate states.

**Why it exists:**
On 2026-02-24, `resumeDecision = 'pending'` was never resolved to `'fresh'` when there was NO saved progress. The auto-save hook was gated by `enabled: resumeDecision !== 'pending'` — permanently disabled for new sessions.

**The rule:**
Every intermediate state must have resolution paths for ALL branches — including "nothing happened":

```tsx
// ❌ WRONG — no resolution for the null case
const [decision, setDecision] = useState<'pending' | 'resume' | 'fresh'>('pending');

// ✅ CORRECT — guaranteed resolution for all branches
useEffect(() => {
    if (!checking && savedProgress === null) {
        setDecision('fresh');  // resolve the "nothing to resume" case
    }
}, [checking, savedProgress]);
```

**Self-check:** *"If I set this state to 'pending', what happens when the condition I'm waiting for NEVER arrives?"*

**Canonical reference:** `src/pages/StudentPracticePage.tsx`

---

## Rule 8 — Component Exists ≠ Component Integrated

**Trigger:** Creating a new component intended for use in another page, or when a task list has "Create component X" and "Wire component X into page Y" as separate subtasks.

**Why it exists:**
On 2026-02-24, `TestHeader.tsx` had working `mode="solo"` code and `SoloSettingsModal.tsx` existed with full UI — but neither was imported or rendered in the practice page. Both passed unit tests. The gap was invisible until E2E testing.

**The rule:**
After creating any component, immediately verify:
1. It is **imported** in the target page
2. It is **rendered** in the JSX
3. All required **props** are passed
4. The **user action** that triggers it works end-to-end

```bash
# Verification grep:
grep -r "import.*MyComponent" src/pages/    # Is it imported?
grep -r "<MyComponent" src/pages/           # Is it rendered?
```

**Self-check:** *"Have I actually OPENED the page in a browser and triggered the new component?"*
