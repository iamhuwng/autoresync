---
title: 'Pattern: THCS Pipeline Branch Guard & Merge Correctness'
createdAt: '2026-03-05T08:25:21.614Z'
updatedAt: '2026-03-05T08:26:25.500Z'
description: >-
  Correctness rules for the THCS three-layer parser's branch decision logic:
  confidence window guards, compromise merge-back, classification ordering, and
  result handoff between stages. Drawn from a 9-bug micro-interaction audit of
  the pipeline (March 2026).
tags:
  - pattern
  - thcs
  - pipeline
  - AI
  - correctness
---
# Pattern: THCS Pipeline Branch Guard & Merge Correctness

> Source: 9-bug micro-interaction audit, March 2026 (commit `5bb6d23`)
> Files: `thcsDocumentParser.service.ts`, `thcs-pass1-restructure.ts`, `thcs-pass2-repair.ts`, `thcs-compromise-step.ts`, `thcs-draft-converter.ts`, `thcs-external-retry.ts`, `thcs-diagnostic-log.ts`

---

## Problem

The THCS three-layer pipeline (External AI → Pass 1 → Code Validator → Branch → Regex Engine) has several **non-obvious correctness requirements** that are easy to violate when adding or modifying pipeline stages:

1. Confidence gates need **both** a lower AND upper bound
2. AI-generated sub-results must be **merged back** into the live `bestText` — simply computing them is not enough
3. Classification must run **once**, at the right stage, or Phase-0 tag assignments get silently overwritten
4. Downstream stages must receive the **current** text state, not a snapshot frozen by a prior stage's `ValidationReport`
5. Provider chains (retry) must stay **synchronized** across docstring, constant, and array

---

## Rule 1: Confidence Windows Need Both Bounds

### Problem
Pass 2 Repair has a minimum confidence threshold (≥ 50) but no upper bound. A 99%-confidence test with a single minor `NUMBERING_GAP` issue fires an AI repair call that can **degrade** an already-correct document.

### Correct Pattern
```typescript
// ✅ CORRECT: window [50, 80) — matches architecture spec
if (conf >= 50 && conf < 80 && issues.length > 0) {
    await executePass2Repair(...);
}

// ❌ WRONG: no upper bound — AI repair runs even on near-perfect results
if (conf >= 50 && issues.length > 0) { ... }
```

### Rule
Every conditional AI repair stage must define an explicit **[min, max)** confidence window. For Pass 2: `50 ≤ conf < 80`. For external retry: `conf < 50`.

---

## Rule 2: Compromise Results Must Be Merged Back Into bestText

### Problem
`executeCompromiseStep()` returns `compromisedSections[].convertedText`, but the original code never applied these to `bestText`. The compromise step was a no-op that only generated teacher warnings.

### Correct Pattern
```typescript
// ✅ CORRECT: compute, then merge in reverse-index order
const result = await executeCompromiseStep(...);
if (result.compromisedSections.length > 0) {
    const lines = [...bestText.split('
')];
    // Reverse order prevents index shift during splice
    const sorted = [...result.compromisedSections].sort((a, b) => b.sectionIndex - a.sectionIndex);
    for (const cs of sorted) {
        const boundary = boundaries[cs.sectionIndex];
        if (boundary && cs.convertedText.trim()) {
            lines.splice(boundary.headerLine, boundary.endLine - boundary.headerLine, ...cs.convertedText.split('
'));
        }
    }
    bestText = lines.join('
');
}

// ❌ WRONG: result computed, never applied
compromiseResult = await executeCompromiseStep(...);
// bestText unchanged — compromise had no effect
```

### Additional: Section-Scope the Prompt
```typescript
// ✅ CORRECT: pass only the relevant section text
const sectionTexts = new Map<number, string>();
unsupportedTypes.forEach(entry => {
    const boundary = boundaries[entry.sectionIndex];
    if (boundary) {
        sectionTexts.set(entry.sectionIndex, textLines.slice(boundary.headerLine, boundary.endLine).join('
'));
    }
});
await executeCompromiseStep(..., sectionTexts);

// ❌ WRONG: AI gets the full document — risks mutating other sections
await executeCompromiseStep(..., fullProcessedText);
```

---

## Rule 3: classifyQuestionTypes Must Have ONE Authoritative Call Site

### Problem
`classifyQuestionTypes()` was called inside `parseThcsTextRegex()` AND again in Stage 6 of the main orchestrator. The second call overwrote **Phase-0** `[TYPE: xxx]` tag assignments (confidence 99) with lower-confidence heuristic inferences.

### Correct Pattern
```typescript
// ✅ CORRECT: classification done once, after all text processing, in the orchestrator
// Stage 6 is the only call site:
classifyQuestionTypes(parsedTest.sections);
reclassifyByContent(parsedTest.sections);

// Inside parseThcsTextRegex — explicitly document the omission:
// NOTE: Type classification is intentionally NOT done here.
// classifyQuestionTypes() is called exclusively in Stage 6 of parseThcsText().
// Calling it here would overwrite Phase-0 [TYPE: xxx] tag assignments (confidence 99).
```

### Rule
Classification functions that assign confidence scores must have **exactly one call site**, positioned after all text transformations are complete.

---

## Rule 4: Downstream Stages Must Use Current bestText, Not Frozen Snapshots

### Problem
`ValidationReport` captures `processedText` at validation time (before compromise). When Pass 2 runs after compromise, it reads `validationReport.processedText` — the pre-compromise snapshot — as its repair input.

### Correct Pattern
```typescript
// ✅ CORRECT: pass current bestText as override
const pass2 = await executePass2Repair(
    validationReport,
    pass1.confidence,
    retrySession,
    repairCallAI,
    bestText,  // <-- post-compromise current state
);

// In executePass2Repair:
export async function executePass2Repair(
    validationReport: ValidationReport,
    aiConfidence: number,
    retrySession: RetrySession,
    callAI: AICallFn,
    currentText?: string,  // overrides validationReport.processedText
): Promise<Pass2Result> {
    const repairPrompt = buildRepairPrompt(
        issueCodes,
        validationReport.originalInput,
        currentText ?? validationReport.processedText,  // use current if available
    );
}
```

### Rule
Any pipeline stage that modifies `bestText` must propagate the new value to all subsequent stages as an explicit parameter. Do not rely on `ValidationReport.processedText` after the compromise stage.

---

## Rule 5: AI Response Header Scanning Must Allow for Preamble

### Problem
`extractConfidence()` only checked `lines[0]` for `[CONFIDENCE: N]`. If the AI emits a blank line or metadata header before the confidence tag, the function returns `0`, which triggers a `confidenceDisagreement` warning on every successful parse.

### Correct Pattern
```typescript
// ✅ CORRECT: scan first N lines
function extractConfidence(lines: string | string[]): number {
    const candidates = Array.isArray(lines) ? lines : [lines];
    for (const line of candidates) {
        const match = line.match(/\[?CONFIDENCE:\s*(\d+)\]?/i);
        if (match) return Math.max(0, Math.min(100, parseInt(match[1] ?? '0', 10)));
    }
    return 0;
}
// Call: extractConfidence(lines.slice(0, 5))

// ❌ WRONG: only checks line 0
const confidence = extractConfidence(lines[0] ?? '');
```

### Rule
When parsing structured tags from AI responses, always scan a **small window** (5 lines) at the expected location rather than exactly one line. Generative models frequently emit whitespace or metadata before content.

---

## Rule 6: Keep Provider Chain, Constant, and Docstring Synchronized

### Problem
`MAX_ATTEMPTS = 3` but `EXTERNAL_CHAIN` only had 2 entries. The docstring listed a 3-provider chain (Gemini Flash → Pro → GPT-4o-mini) from an old design. This causes confusion about what the pipeline actually does.

### Correct Pattern
```typescript
const EXTERNAL_CHAIN = [
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    { provider: 'gemini', model: 'gemini-2.5-flash' },
] as const;

// Constant derived from array — impossible to desync:
const MAX_ATTEMPTS = EXTERNAL_CHAIN.length; // Must equal EXTERNAL_CHAIN.length — they are coupled
```

### Rule
Never hardcode a count that is already expressed as `array.length`. Derive it. Update docstrings whenever the chain changes.

---

## Rule 7: Data Type Unions Must Reflect All Actual Values

### Problem
`ParseDebugData.provider` was typed `'groq' | 'gemini' | 'regex-fallback'` but the pipeline stored `'pipeline-v2'` and `'external-retry'`. The diagnostic log rendered `unknown` for successful pipeline runs.

### Rule
When adding a new enum-style string value to a pipeline result, **immediately update the union type** in the corresponding data interface. Never let actual values diverge from type definitions.

---

## Rule 8: Tuple Casts Require Explicit Length Enforcement

### Problem
`options: (pq.options || ['', '', '', '']) as [string, string, string, string]` — if `pq.options` had 5 items (Vietnamese MCQs sometimes have an E option), the cast silently passed 5 items through to a 4-tuple consumer, breaking `THCSMCQBlock`.

### Correct Pattern
```typescript
// ✅ CORRECT: enforce exactly 4, pad if shorter
options: (['', '', '', ''] as string[]).map((_, i) => pq.options?.[i] ?? '') as [string, string, string, string]

// ❌ WRONG: cast doesn't enforce length
options: (pq.options || ['', '', '', '']) as [string, string, string, string]
```

### Rule
A TypeScript `as [T, T, T, T]` cast does not truncate or pad arrays at runtime — it only satisfies the type checker. Always use `slice(0, N)` + padding (or equivalent) to enforce exact length.

---

## Audit Checklist

Use this when modifying any stage of the three-layer pipeline:

- [ ] Every conditional AI call has both a **lower and upper bound** on confidence
- [ ] Every stage that produces transformed text **assigns it back to `bestText`** before the next stage runs
- [ ] `classifyQuestionTypes()` is called **exactly once**, in Stage 6 of the main orchestrator
- [ ] Stages downstream of compromise receive the **post-compromise `bestText`**, not `validationReport.processedText`
- [ ] AI response header parsing scans a **small window**, not a single line
- [ ] Provider chain arrays, max-attempt constants, and docstrings are **kept in sync** (derive counts from `.length`)
- [ ] Union type definitions include **all actual values** assigned at runtime
- [ ] Tuple casts are paired with **explicit length enforcement** (slice + pad)

---

## Related Docs
- @doc/patterns/pattern-thcs-hybrid-parser-reconciliation-pipeline — AI↔regex reconciliation layer
- @doc/patterns/pattern-ai-provider-fallback-chain-with-key-rotation — Provider retry chain design
- @doc/specs/ai-pipeline-redesign — Three-layer architecture specification
