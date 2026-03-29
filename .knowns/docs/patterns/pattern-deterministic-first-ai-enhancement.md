---
title: 'Pattern: Deterministic-First AI Enhancement'
description: Architecture pattern where a deterministic baseline is always computed first, then optionally enhanced with AI-generated content that merges on top. Guarantees output even when AI fails.
createdAt: '2026-03-04T22:24:40.015Z'
updatedAt: '2026-03-29T04:48:35.548Z'
tags:
  - pattern
  - ai
  - architecture
  - resilience
---

# Pattern: Deterministic-First AI Enhancement

## Problem

AI-powered features have an inherent reliability problem:
- API calls fail (rate limits, outages, malformed responses)
- Generation takes time (latency-sensitive paths can't wait)
- Users must ALWAYS get a useful result, even when AI is unavailable

Building AI-only features means: AI down → feature broken.

## Solution

**Always compute a deterministic baseline first, then optionally enhance with AI.**

The deterministic layer provides:
1. **Guaranteed output** — works offline, instantly, with zero API calls
2. **Structured data** — analysis/bucketing from existing data (no hallucination risk)
3. **Merge target** — AI data overlays on top, never replaces the baseline

The AI layer provides:
1. **Narrative text** — human-readable summaries, explanations
2. **Inferred metadata** — topics, categories that require understanding
3. **Per-item explanations** — contextual content that rules can't generate

## Architecture

```
Input Data
    │
    ├─→ [1] Deterministic Engine (sync, always runs)
    │     ├─ Analyze structured data
    │     ├─ Bucket/categorize by thresholds
    │     ├─ Generate fallback text
    │     └─ Return: baseline FormativeFeedback
    │
    ├─→ [2] AI Enhancement (async, may fail)
    │     ├─ Build prompt from input data
    │     ├─ Call provider chain (see: AI Provider Fallback Chain)
    │     ├─ Validate response shape
    │     └─ Return: { narratives, topics, explanations } | null
    │
    └─→ [3] Merge
          ├─ Start with deterministic baseline
          ├─ Overlay AI fields if available
          └─ Return: enhanced FormativeFeedback
```

## Key Implementation Details

### 1. Baseline always returns a complete object

```typescript
function generateDeterministicFeedback(data): FormativeFeedback {
    const analysis = bucketByPerformance(buildSkillList(data));
    return {
        analysis,                          // ← Structured, always present
        deterministicFeedback: buildText(), // ← Readable fallback text
        generatedAt: Date.now(),
        totalCorrect, totalQuestions, scaledScore,
        // AI fields ABSENT — that's fine, UI handles it
    };
}
```

### 2. AI fields are optional on the type

```typescript
interface FormativeFeedback {
    analysis: { strengths: SkillAnalysis[]; revision: SkillAnalysis[]; critical: SkillAnalysis[] };
    deterministicFeedback: string;        // ← Always present
    generatedAt: number;
    // Optional AI enhancements:
    questionTopics?: Record<string, { topic: string; category: string }>;
    questionExplanations?: Record<string, string>;
    aiFeedback?: { summary: string; strengths: string; revision: string; critical: string };
    aiModel?: string;
}
```

### 3. Merge is simple property assignment

```typescript
const feedback = generateDeterministicFeedback(data);  // Always works
const aiResult = await generateAIFeedback(data);       // May return null

if (aiResult) {
    feedback.questionTopics = aiResult.data.questionTopics;
    feedback.questionExplanations = aiResult.data.questionExplanations;
    feedback.aiFeedback = aiResult.data.feedback;
    feedback.aiModel = aiResult.model;
}
// feedback is ALWAYS valid — with or without AI
```

### 4. UI renders both layers with graceful degradation

```tsx
{aiFeedback?.summary || (
    <span>You achieved {totalCorrect}/{totalQuestions} correct</span>
)}

{aiModel && <Badge>AI-enhanced</Badge>}
```

## When to Use This Pattern

| Scenario | Use This Pattern? |
|----------|-------------------|
| Feature MUST work even when AI is down | ✅ Yes |
| Structured data exists to analyze deterministically | ✅ Yes |
| AI adds narrative/explanation value beyond rules | ✅ Yes |
| Feature is purely generative (no structured input) | ❌ No — use retry/queue instead |
| AI response IS the entire value (e.g., image generation) | ❌ No — use loading states instead |

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|--------------|-------------|
| AI-only with "loading" fallback | User gets nothing when AI is down |
| Deterministic-only | Misses the value AI provides (explanations, narratives) |
| AI replaces deterministic | Merging is safer; deterministic data is ground truth |
| Showing loading spinner while AI generates | Blocks user from seeing structured results |

## Source

- @task-23fbgf (deterministic feedback engine)
- @task-2gv1pn (AI feedback pipeline)
- @task-86hnh4 (FormativeFeedbackPanel — UI handles both layers)
- `src/services/formativeFeedback.service.ts`
- `src/components/thcs-student/FormativeFeedbackPanel.tsx`

## Related

- @doc/patterns/pattern-ai-provider-fallback-chain-with-key-rotation — The AI provider layer of this pattern
- @doc/patterns/pattern-fire-and-forget-notification-wiring — Fire-and-forget wiring for async AI calls



## UI Display Rule: Narrative-Sufficient Rendering

### Problem

When the AI narrative text already explains the skill performance in natural language (e.g., *"You performed well on grammar questions Q1, Q3-Q5..."*), showing the raw skill breakdown table underneath is **redundant and adds noise**:

```
✅ Strengths          4 skills
• Error Identification — 3/3 correct
• Dialogue Response — 2/2 correct
• Grammar — 11/13 correct
• Closest Meaning — 4/5 correct
You performed well on many grammar questions (Q1, Q3, Q4...)...
```

The bullet list repeats information the narrative already covers — worse, it exposes internal category names students don't need to understand.

### Solution

**When AI narrative text is available, render ONLY the narrative.** The section header (icon + tier label) provides enough structural context.

```tsx
// ✅ Correct: narrative-only when aiText is present
function TierSection({ aiText, config }) {
    if (!aiText || aiText.trim().length === 0) return null;  // hide if no narrative

    return (
        <div style={{ background: config.bg, border: `1px solid ${config.border}`, ... }}>
            {/* Header: icon + tier name only — no skill count badge */}
            <div>
                <span>{config.icon}</span>
                <span>{config.title}</span>
            </div>
            {/* Narrative only */}
            <div style={{ fontStyle: 'italic', borderLeft: `3px solid ${config.accent}`, ... }}>
                {aiText}
            </div>
        </div>
    );
}
```

```tsx
// ❌ Avoid: showing skill bullets PLUS narrative (redundant)
<>
    {skills.map(s => <SkillBullet skill={s} />)}  {/* redundant */}
    <div>{aiText}</div>                            {/* already covers this */}
</>
```

### Key Rules

| Rule | Rationale |
|------|-----------|
| Section visibility gated on `aiText`, not `skills.length` | Skills without narrative have nothing useful to show students |
| No "N skills" count badge | Implementation detail; irrelevant to the student |
| No per-skill bullet list when narrative is present | The narrative is the canonical human-readable output |
| Deterministic fallback text shown only when no AI narrative | Ensures graceful degradation still works |

### When to Apply

✅ Apply when the AI narrative **references the skill content** (mentions question numbers, topic names, or gives actionable advice)

❌ Do NOT apply if the narrative is generic (e.g., *"Good job"*) — in that case, the structured list adds real value

### Source
This session — `src/components/thcs-student/FormativeFeedbackPanel.tsx` (March 2026)


## 2026-03-29 Amendment — Snapshot Reuse, Repair Tooling, and Outcome Metadata

### Additional pattern refinement

A deterministic-first AI feature is easier to repair if the generation stack can produce a reusable snapshot without immediately writing to storage.

Instead of coupling generation and persistence into one function, expose a snapshot step that returns:
- the deterministic baseline
- any merged AI enhancement
- whether AI was actually applied
- the final mode (`ai` or `deterministic`)

This lets the same engine support:
- normal online generation
- viewer-triggered upgrades
- one-off backfill and repair scripts

### Why this matters

Historical repair paths usually need more control than the online flow:
- they may need to rebuild from saved result data when the original source test is missing
- they may need to write through a different operational path
- they still need the exact same deterministic + AI merge behavior as production generation

If the only API is "generate and save now", repair tools either duplicate logic or become fragile.

### Recommended shape

Keep a reusable snapshot helper plus a thin persistence wrapper.

Pattern:
- `generateDeterministicFeedback(...)`
- `generateAIFeedback(...)`
- `generate...Snapshot(...)`
- `persist...(...)`

### Outcome metadata

Deterministic-first systems should also persist coarse generation outcomes so support and repair tools can tell what happened without diffing the full output blob.

Useful outcomes:
- `saved-ai`
- `saved-deterministic`
- `reused`
- `skipped-ineligible`
- `failed`

### Current operational state

The formative-feedback system now supports snapshot reuse for both live generation and IELTS saved-result backfill. Historical repairs no longer need a separate explanation engine.

### Related docs
- @doc/patterns/pattern-rtdb-real-time-auto-load-with-fire-and-forget-generation
- @doc/architecture/test-system-architecture
