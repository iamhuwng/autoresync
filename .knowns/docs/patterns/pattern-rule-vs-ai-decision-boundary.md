---
title: 'Pattern: Rule vs AI Decision Boundary'
createdAt: '2026-03-04T22:27:09.242Z'
updatedAt: '2026-03-04T22:28:03.299Z'
description: >-
  Pattern for understanding when AI calls are necessary vs when rule-based
  analysis suffices, using the intentBreakdown → topic-level specificity gap as
  the canonical example
tags:
  - pattern
  - ai
  - architecture
  - analysis
---
# Pattern: Rule vs AI Decision Boundary

## Problem

When building AI-enhanced features, it's tempting to either:
- Use AI for everything (expensive, unreliable, slow)
- Use rules for everything (misses nuance, limited specificity)

The key question: **when do you NEED AI vs when are rules sufficient?**

## Decision Framework

| Data Available | What Rules Can Do | What AI Adds | Verdict |
|---------------|-------------------|--------------|---------|
| Structured categories (e.g., `intent: "mcq-grammar"`) | Count correct/total per category, bucket by %, sort | Nothing — rules handle this perfectly | **Rules only** |
| Free-text content (e.g., question text) + structured answers | Nothing — rules can't read text meaning | Infer specific topic ("Past Perfect Tense"), explain WHY answer is wrong | **AI required** |
| Numerical data (scores, percentages) | Calculate, compare, rank, threshold | Narrative text, pedagogical advice | **Rules for data, AI for narrative** |

## The Canonical Example: `intentBreakdown` → Topic-Level Gap

### What rules know:
```
mcq-grammar: { correct: 2, total: 4 } → "Grammar: 50% correct"
```

### What the student NEEDS to hear:
```
"Subject-Verb Agreement in Present Simple: you chose 'go' instead of 'goes'
 for 3rd-person singular (Q3). Also Passive Voice: 'was written' not 'wrote' (Q7)."
```

The gap is **topic-level specificity**. All three questions (`mcq-grammar`) look identical to rules, but the AI reads the question text and identifies distinct grammar topics.

### Decision: Hybrid Architecture

```
Rules handle:          AI handles:
├─ Bucketing           ├─ Topic classification (reads question text)
├─ Sorting             ├─ Per-question explanations (reads answers)
├─ Thresholds          ├─ Narrative feedback (writes human text)
├─ Question numbers    └─ Pedagogical advice (needs domain knowledge)
└─ Fallback text
```

## When to Use This Pattern

Ask these questions:

1. **Can rules alone answer the user's question?**
   - If YES → rules only (no AI cost/latency)
   - If NO → continue

2. **Does the answer require reading free-text content?**
   - If YES → AI is needed for that specific part

3. **Can the AI part fail without breaking the feature?**
   - If YES → use @doc/patterns/pattern-deterministic-first-ai-enhancement
   - If NO → AI must be on the critical path (add retries, queuing)

## Token Budget Quick Estimation

When deciding if an AI call is feasible, estimate tokens:

```
Input tokens ≈ (num_items × avg_text_per_item) + metadata + prompt
Output tokens ≈ (num_results × avg_output_per_result) + narrative

Example: 40-question THCS test with ~15 wrong answers:
  Input:  ~3,000 tokens (40 questions × 75 tokens each)
  Output: ~2,000 tokens (15 explanations × 50 + 40 topics × 20 + 300 narrative)
  Total:  ~5,000 tokens → well within Gemini Flash's 65K output limit (~7% capacity)
```

If total tokens < 10% of model capacity → single-call approach is safe.
If total tokens > 30% → consider chunking or multi-call.

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|--------------|-------------|
| AI for counting/sorting | Expensive, slow, unreliable for tasks rules handle perfectly |
| Rules for text understanding | Can't infer "Past Perfect Tense" from question text |
| AI on critical path without fallback | Feature breaks when AI is down |
| Separate API call per item | N calls × latency. Batch everything into one call |

## Source

- Research from @task-cybx0j (formative feedback design session)
- @doc/patterns/pattern-deterministic-first-ai-enhancement — The architecture that implements this boundary
- @doc/reference/thcs-english-topic-taxonomy — The domain-specific taxonomy AI classifies into
