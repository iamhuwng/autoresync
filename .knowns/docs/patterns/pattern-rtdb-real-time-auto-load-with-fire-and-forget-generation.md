---
title: 'Pattern: RTDB Real-Time Auto-Load with Fire-and-Forget Generation'
description: Architecture pattern for async content generation (AI feedback, reports) that uses fire-and-forget at submission time combined with RTDB onValue() real-time listeners in the viewer to auto-load content without refresh or manual triggers.
createdAt: '2026-03-12T14:23:42.958Z'
updatedAt: '2026-03-29T04:48:35.459Z'
tags:
  - pattern
  - rtdb
  - real-time
  - ai
  - ux
  - fire-and-forget
---

# Pattern: RTDB Real-Time Auto-Load with Fire-and-Forget Generation

## Problem

Async operations (AI feedback, report generation, image processing) take 3-30+ seconds. Forcing users to:
- Click a button to trigger generation → friction, discoverable only if users know to click
- Refresh the page to see results → terrible UX
- Wait on a blocking spinner → blocks the entire UI

## Solution: Three-Layer Architecture

### Layer 1: Fire-and-Forget at Source

At the moment the data is created (e.g., test submission), trigger the async operation as fire-and-forget. Don't block the main flow.

```typescript
// In handleSubmit() — after saving result, before navigation
import('../../services/formativeFeedback.service').then(({ generateFormativeFeedback }) => {
    generateFormativeFeedback(gradingResult, sections, metadata, resultId)
        .catch(err => console.warn('Feedback generation failed:', err));
}).catch(err => console.warn('Failed to load service:', err));

// Navigate immediately — don't wait
navigate('/results', { replace: true });
```

### Layer 2: RTDB Real-Time Subscription in Viewer

The viewer component subscribes to the RTDB path via `onValue()`. When the async operation writes its result, the UI updates automatically.

```typescript
useEffect(() => {
    const resultRef = ref(database, `test_results/${resultId}`);
    const unsubscribe = onValue(resultRef, (snapshot) => {
        if (snapshot.exists()) {
            setResult(snapshot.val()); // Includes formativeFeedback when ready
        }
    });
    return () => unsubscribe();
}, [resultId]);
```

### Layer 3: Auto-Trigger with Deduplication Guard

If the viewer opens before the async operation is complete (or if it failed silently), auto-trigger a new generation with a ref-based deduplication guard.

```typescript
const feedbackAttemptedRef = useRef(false);
const [feedbackError, setFeedbackError] = useState(false);

// Auto-trigger when modal opens with no feedback
useEffect(() => {
    if (!result || loading) return;
    const hasFeedback = !!result.formativeFeedback;
    
    if (!hasFeedback && !formativeFeedbackLoading && !feedbackError) {
        if (!feedbackAttemptedRef.current) {
            feedbackAttemptedRef.current = true;
            handleGenerateFormativeFeedback();
        }
    }
}, [result, loading, formativeFeedbackLoading, feedbackError]);

// Reset guard on modal reopen
useEffect(() => {
    feedbackAttemptedRef.current = false;
    setFeedbackError(false);
}, [resultId, opened]);
```

## Visual States

| State | UI | Duration |
|-------|-----|----------|
| **Loading** (auto-triggered) | Shimmer skeleton + "🤖 Generating..." | 3-15s |
| **Success** (RTDB listener fires) | Full content panel appears seamlessly | Instant transition |
| **Error** (rare) | Subtle "⚠️ Unavailable" + Retry link | Permanent until retry |

### Shimmer Skeleton Example

```tsx
{[85, 70, 55, 40].map((width, i) => (
    <div key={i} style={{
        height: 10, borderRadius: 5, marginBottom: 8,
        width: `${width}%`,
        background: 'linear-gradient(90deg, rgba(139,92,246,0.08) 25%, rgba(139,92,246,0.18) 50%, rgba(139,92,246,0.08) 75%)',
        backgroundSize: '200% 100%',
        animation: 'feedbackShimmer 1.5s ease-in-out infinite',
    }} />
))}
```

## Key Design Decisions

1. **No `loadResult()` after generation** — The RTDB `onValue` listener handles it automatically. Calling `loadResult()` would be redundant.
2. **Ref-based deduplication** — Prevents React effect re-fires from triggering duplicate API calls.
3. **Reset on `resultId` change** — Allows retry for different results without stale guard state.
4. **Error shows retry, not re-auto** — Prevents infinite retry loops on persistent failures.

## Lessons Learned

### Trial 1: Manual "Add Feedback" Button
- **What:** Students had to click a button to generate AI feedback
- **Problem:** Poor discoverability. Students didn't know the button existed. Results appeared incomplete.
- **Lesson:** Don't require manual triggers for operations that should be automatic.

### Trial 2: Fire-and-Forget Only (No Auto-Trigger in Viewer)
- **What:** Feedback generated at submission time only
- **Problem:** If the browser closed before generation finished, or if the API failed, feedback was permanently missing.
- **Lesson:** Fire-and-forget alone isn't enough — the viewer must have a fallback auto-trigger.

### Key Insight: RTDB onValue() is the Bridge
The real-time RTDB subscription eliminates the "refresh to see" problem. The viewer is already listening. The only question is: what to show while waiting. Answer: shimmer skeleton.

## Applicability

This pattern works for ANY scenario where:
- Content is generated asynchronously after a user action
- The viewer is a separate page/modal from the trigger
- The storage layer supports real-time subscriptions (RTDB, Firestore snapshots)

Examples: AI feedback, report generation, image processing results, grading results.

## Affected Files

- `ResultDetailModal.tsx` — Auto-trigger + shimmer + RTDB listener
- `THCSTestLayout.tsx` — Fire-and-forget at submission (Layer 1)
- `THCSPracticeView.tsx` — Fire-and-forget at submission (Layer 1)
- `formativeFeedback.service.ts` — The async generator (writes to RTDB)

## Moving Forward Standard

> **All async content generation MUST follow this three-layer pattern:**
> 1. Fire-and-forget at source (non-blocking)
> 2. Real-time subscription in viewer (auto-update)
> 3. Auto-trigger with dedup guard in viewer (fallback)
>
> **Manual trigger buttons for async content are BANNED.**
> Show shimmer/skeleton loading states instead.


## 2026-03-29 Amendment — Writer-Owned Saved-Result Generation and Gated Auto-Heal

### Additional failure class

The original three-layer pattern breaks down when the fire-and-forget trigger is owned by submit hooks instead of the canonical saved-result writer. In a system with multiple result writers, one path eventually bypasses the trigger.

The observed failure set was:
- normal submit created feedback correctly
- teacher-end auto-submit saved the canonical IELTS result but never triggered feedback
- legacy result writers drifted from the main flow
- viewer shells treated missing IELTS feedback differently from THCS

### Updated standard

For saved-result features, the trigger order is now:
1. canonical writer persists the result and owns the initial fire-and-forget generation
2. viewer shell auto-heals missing or weak saved feedback when the shell is allowed to do so
3. manual retry remains available as a recovery action

This is stricter than the older rule. The source of truth is no longer "the submit flow"; it is the canonical persistence boundary.

### Trigger ownership rule

If multiple flows can create the same saved-result row, only the canonical writer should own the initial async generation trigger.

Why:
- submit-hook ownership drifts as new save paths appear
- teacher tools and disconnect recovery often bypass the original hook stack
- duplicated trigger code creates coverage gaps and inconsistent metadata

### Viewer policy rule

Viewer auto-triggering is now a fallback, not the primary trigger.

The viewer may:
- generate when eligible saved feedback is missing
- upgrade when saved feedback exists but is weak or deterministic-only
- remain locked when release governance says the feedback should not yet be visible

The viewer should not be the only place that guarantees generation.

### Manual retry rule

Manual retry buttons are allowed for saved-result recovery paths.

Use this rule:
- if feedback is missing, retry means generate
- if feedback exists but is weak, retry means upgrade
- do not hide manual retry behind the old blanket rule that all async generation must be invisible to the user

The older wording in this doc is too broad for saved-result systems with release gating and historical repair needs.

### Metadata rule

Persist lightweight generation metadata next to the saved result, separate from the feedback blob itself.

Recommended fields:
- `kind`
- `lastAttemptAt`
- `lastTriggerSource`
- `lastOutcome`
- `lastError`

This turns missing-feedback incidents from guesswork into inspectable state.

### Current operational state

The saved-result feedback system now uses:
- writer-owned initial generation from `saveTestResult()`
- shared classification for THCS, IELTS Reading, and IELTS Listening
- release-gated auto-heal in shared result shells
- manual retry for generate-or-upgrade semantics
- targeted backfill tooling for historical missing-feedback rows

### Related docs
- @doc/patterns/pattern-deterministic-first-ai-enhancement
- @doc/architecture/test-system-architecture
- @doc/architecture/results-academic-record
- @doc/patterns/pattern-canonical-result-persistence-invariants
