# Reading V2 Student Mobile Runtime Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Reading V1-equivalent mobile tools, navigation, scroll safety, accessibility, and phone layout behavior in shared Reading V2 student runtime.

**Architecture:** Keep `ReadingV2RuntimeShell` as shared projection-bound owner. Add one focused V2 mobile utilities component, use host-supplied V1-compatible student preference key, and unify phone behavior behind `data-layout="phone"`. Preserve existing submit, timer, anti-cheat, and route ownership.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, CSS, platform storage and screen hooks.

---

## File Map

- Create `src/components/reading-v2/runtime/ReadingV2MobileUtilities.tsx`: text-size and projected-instructions dialogs only.
- Create `src/components/reading-v2/runtime/ReadingV2MobileUtilities.test.tsx`: component dialog/focus behavior.
- Modify `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`: phone detection, utility state, preference hydration, overlay state, question-sheet scroll/navigation, dialog semantics.
- Modify `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css`: phone-layout selectors, content-size variable, safe-area/touch/input rules.
- Modify `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`: shared runtime mobile parity regressions.
- Modify `src/pages/StudentPracticePage.tsx` and `.test.tsx`: student-scoped text-size key.
- Modify `src/pages/TestPageRouter.tsx` and `.test.tsx`: live-player-scoped text-size key.

### Task 1: Restore dependency baseline and add phone-mode contract

**Files:**
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`

- [ ] **Step 1: Restore packages**

Run:

```powershell
npm ci
```

Expected: exit 0 and local `node_modules/.bin/vitest` exists.

- [ ] **Step 2: Write failing phone-mode tests**

Add tests that set `390x844`, `767x500`, and a phone UA at `844x390`. Assert:

```tsx
expect(screen.getByLabelText('Phone passage-first runtime')).toBeInTheDocument();
expect(screen.getByLabelText('Student Reading runtime header')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
```

Mock only `navigator.userAgent` for landscape; retain existing `setViewport` helper.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx vitest run src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx -t "phone landscape"
```

Expected: landscape assertion fails because runtime currently uses width only.

- [ ] **Step 4: Implement combined mobile detection**

Use existing platform hooks:

```tsx
const { isMobile: isNarrowViewport } = useScreenSize();
const { isMobileExamMode } = useMobileExamMode();
const isMobile = isNarrowViewport || isMobileExamMode;
```

Do not read `window` directly.

- [ ] **Step 5: Verify GREEN**

Run targeted test file. Expected: phone-mode tests pass and desktop test remains desktop.

### Task 2: Add text-size and instructions utilities

**Files:**
- Create: `src/components/reading-v2/runtime/ReadingV2MobileUtilities.tsx`
- Create: `src/components/reading-v2/runtime/ReadingV2MobileUtilities.test.tsx`
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css`

- [ ] **Step 1: Write failing utility tests**

Exercise wished-for API:

```tsx
<ReadingV2MobileUtilities
  panel="text-size"
  textSize={18}
  taskGroups={projection.content.taskGroups}
  onTextSizeChange={onTextSizeChange}
  onClose={onClose}
/>
```

Assert `role="dialog"`, `aria-modal="true"`, 14-22 slider, current value, projected instruction text, Escape close, and initial focus.

- [ ] **Step 2: Verify RED**

Run new test file. Expected: import/module failure because component does not exist.

- [ ] **Step 3: Implement minimal utility component**

Export:

```tsx
export type ReadingV2MobileUtilityPanel = 'text-size' | 'instructions';

export interface ReadingV2MobileUtilitiesProps {
  readonly panel: ReadingV2MobileUtilityPanel;
  readonly textSize: number;
  readonly taskGroups: readonly ReadingV2ProjectedTaskGroup[];
  readonly onTextSizeChange: (size: number) => void;
  readonly onClose: () => void;
}
```

Render a labelled modal surface; use `ReadingV2InstructionText` for each current-section task group. Close on Escape and focus Close/Done on mount. Keep storage and runtime state outside this component.

- [ ] **Step 4: Verify utility GREEN**

Run new test file. Expected: all utility tests pass.

- [ ] **Step 5: Write failing shell integration tests**

At `390x844`, open More options and assert menuitems `Review answers`, `Text size`, `Instructions`. Open text size, change slider to 20, and assert runtime root has `--reading-v2-runtime-mobile-content-size: 20px`. Open instructions and assert current projected instructions render. Assert no `Preserved passage scroll position` element exists.

- [ ] **Step 6: Verify shell RED**

Run matching tests. Expected: missing menuitems/dialogs, missing CSS variable, and diagnostic still present.

- [ ] **Step 7: Integrate utilities and preference storage**

Add optional prop:

```tsx
readonly textSizeStorageKey?: string;
```

Hydrate through `storage.get<number>(textSizeStorageKey)` with cancellation guard; accept only integer 14-22. Persist changes through `storage.set`. Add utility state:

```tsx
const [mobileUtilityPanel, setMobileUtilityPanel] =
  useState<ReadingV2MobileUtilityPanel | null>(null);
```

Add three menu actions, close competing overlays before opening utilities, apply root CSS variable, and delete `preservedScrollLabel` state/DOM.

- [ ] **Step 8: Verify shell GREEN**

Run shell and utility test files. Expected: new utility tests pass without changing desktop controls.

### Task 3: Repair question navigation, sheet scroll, and review restoration

**Files:**
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`

- [ ] **Step 1: Write failing navigation tests**

Use existing `mockScrollablePanel`, `mockElementRect`, and question anchor helpers. Assert:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));
expect(questionTwo).toHaveFocus();
expect(sheet.scrollTop).toBeGreaterThan(0);
```

Also set sheet scroll, close/reopen, and expect restoration; open review from an open sheet, press Back to Test, and expect sheet restored at same scroll.

- [ ] **Step 2: Verify RED**

Expected: target not focused/scrolled and sheet position resets after unmount.

- [ ] **Step 3: Implement dual scroll maps**

Add:

```tsx
const phoneQuestionSheetRef = useRef<HTMLElement | null>(null);
const phoneQuestionScrollTopBySectionRef = useRef<Record<string, number>>({});
const questionSheetWasOpenBeforeReviewRef = useRef(false);
```

Save current sheet scroll before close, section switch, or review. Restore per section in `useLayoutEffect`. Generalize navigation queue so desktop targets `desktopQuestionPanelRef` and mobile targets `phoneQuestionSheetRef`. Explicit question navigation wins over stored scroll.

- [ ] **Step 4: Implement stable review transitions**

Create `openReviewSummary()` and `closeReviewSummary()` handlers. Opening records sheet state and closes it. Back restores prior sheet state. Review question selection opens sheet and queues target scroll.

- [ ] **Step 5: Verify GREEN**

Run shell tests. Expected: question target focus/scroll, sheet scroll restoration, passage scroll preservation, review return, and existing submit tests pass.

### Task 4: Complete overlay accessibility and mobile geometry

**Files:**
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- Modify: `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css`

- [ ] **Step 1: Write failing accessibility tests**

Assert question sheet and review expose `role="dialog"`, `aria-modal="true"`; Escape closes sheet and restores focus to Questions FAB; review Back restores focus/surface; overflow closes on Escape.

- [ ] **Step 2: Verify RED**

Expected: current `aside`/`section` lack dialog roles and Escape/focus restoration.

- [ ] **Step 3: Implement modal semantics**

Add labelled headings/IDs, dialog attributes, trigger refs, Escape handling, initial focus, and focus restoration. Use component-local DOM behavior permitted by mobile-portability rule. Do not add a new global modal framework.

- [ ] **Step 4: Convert phone CSS authority**

Move existing `@media (max-width: 720px)` behavior under `.reading-v2-runtime[data-layout="phone"]` selectors. Add:

```css
.reading-v2-runtime[data-layout="phone"] {
  --reading-v2-runtime-mobile-content-size: 16px;
}

.reading-v2-runtime[data-layout="phone"] .reading-v2-runtime__questions-fab {
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}
```

Include safe-top header/tabs offsets, safe-bottom passage/sheet padding, 44px controls/inputs, and 16px input/select text. Apply content-size variable to passage and question reading text only.

- [ ] **Step 5: Verify GREEN**

Run shell tests and `npm run build`. Expected: tests pass; TypeScript/CSS build exits 0.

### Task 5: Wire student-scoped preference keys

**Files:**
- Modify: `src/pages/StudentPracticePage.test.tsx`
- Modify: `src/pages/StudentPracticePage.tsx`
- Modify: `src/pages/TestPageRouter.test.tsx`
- Modify: `src/pages/TestPageRouter.tsx`

- [ ] **Step 1: Write failing host tests**

Assert captured runtime props:

```tsx
expect(runtimeProps.textSizeStorageKey).toBe(`reading_text_size_${studentId}`);
```

Cover one non-live launch and one live launch.

- [ ] **Step 2: Verify RED**

Run two host test files with matching test names. Expected: prop is undefined.

- [ ] **Step 3: Pass keys from hosts**

Practice host uses authenticated `user?.uid`; live host uses `sessionService.getPlayerId()`. Omit key when ID is absent. Do not change answer persistence keys.

- [ ] **Step 4: Verify GREEN**

Run host tests. Expected: new assertions and existing timer/submit/exit tests pass.

### Task 6: Regression verification and mobile QA

**Files:**
- Verify only: Reading V1, Listening, route hosts, runtime boundary.

- [ ] **Step 1: Run focused suites**

```powershell
npx vitest run src/components/reading-v2/runtime/ReadingV2MobileUtilities.test.tsx src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx src/pages/StudentPracticePage.test.tsx src/pages/TestPageRouter.test.tsx src/__tests__/readingV2BoundaryImports.test.ts
```

- [ ] **Step 2: Run V1/Listening regression suites**

```powershell
npx vitest run src/__tests__/integration/ReadingTestPage.test.tsx src/__tests__/integration/ListeningTestPage.test.tsx
```

- [ ] **Step 3: Run repository verification**

```powershell
npm run lint
npm run build
npm test
```

Record any pre-existing failures separately; do not claim full pass without exit 0.

- [ ] **Step 4: Browser QA**

Use `http://localhost:5174`, Student quick login, and 320x568, 390x844, Pixel-like portrait, and small landscape. Verify Questions, target jump, input reachability, text size, instructions, section scroll, review Back, submit, reload persistence, and locally available practice/homework/live routes. Inspect console and horizontal overflow.

- [ ] **Step 5: Final review**

Review diff against design, confirm teacher files untouched, confirm V1/Listening production files untouched, and run independent spec then code-quality review.
