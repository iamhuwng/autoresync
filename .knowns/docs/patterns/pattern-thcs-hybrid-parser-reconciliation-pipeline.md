---
title: 'Pattern: THCS Hybrid Parser Reconciliation Pipeline'
createdAt: '2026-03-04T01:38:18.528Z'
updatedAt: '2026-03-05T08:26:40.299Z'
description: >-
  Documents the THCS parser's hybrid AI + regex reconciliation pipeline,
  including known pitfalls (answer key merging, section sorting, passage title
  extraction, arrangement numbering) and their solutions.
tags:
  - pattern
  - parser
  - thcs
  - reconciliation
---
# Pattern: THCS Hybrid Parser Reconciliation Pipeline

## Problem

The THCS parser uses a hybrid approach: AI extracts structured data first, then a regex parser independently parses the same text, and the results are reconciled. This creates several failure points:

1. **Answer key merging**: AI may return empty answers for writing/arrangement questions, and the merge logic must not overwrite regex-extracted full-text answers with empty values
2. **Section ordering**: The original test document may have non-sequential numbering across sections (e.g., PART A: Q1-2, Q11-12; PART B: Q3-10). Preserving document order causes confusing previews
3. **Sentence-arrangement numbering**: Paragraph-ordering items (`a./b./c.`) lack explicit question numbers, causing dummy sequential numbers (1, 2, 3) to be assigned
4. **Passage title extraction**: Reading passage titles are mixed into the passage body text with no formatting distinction
5. **Final answer application**: After reconciliation and answer key merging, there's no second pass to apply merged answers to questions

## Solution

### Pipeline Architecture

```
Raw Text
  │
  ├─→ AI Pipeline (parseThcsText)
  │     ├─ AI extraction (Groq/Gemini)
  │     ├─ JSON recovery (5-strategy, see @doc/patterns/pattern-llm-json-response-recovery-pipeline)
  │     └─ validateAIResult() → parsedTest
  │
  ├─→ Regex Pipeline (parseThcsTextDirect)
  │     ├─ Section detection
  │     ├─ Question parsing (MCQ, arrangement, cloze)
  │     ├─ fixArrangementQuestionNumbers()
  │     ├─ extractEnhancedAnswerKey()
  │     └─ classifyQuestionTypes()
  │
  └─→ Reconciliation
        ├─ Section merging (prefer regex structure, AI passage text)
        ├─ Answer key merging (prefer non-empty regex answers)
        ├─ Final re-application of merged answers to questions
        ├─ sortSectionsByQuestionNumber()
        └─ classifyQuestionTypes()
```

### Fix 1: Answer Key Merging — Prefer Non-Empty

```typescript
// BAD: AI empty answer overwrites regex full-text answer
if (!parsedTest.answerKey[num]) {
    parsedTest.answerKey[num] = regexAns;
}

// GOOD: Also overwrite when AI provided empty string
if (!parsedTest.answerKey[num] || parsedTest.answerKey[num] === '') {
    parsedTest.answerKey[num] = regexAns;
}
```

### Fix 2: Final Re-Application After Reconciliation

After merging answer keys, re-apply to all questions:

```typescript
for (const section of parsedTest.sections) {
    for (const q of section.questions) {
        const keyAnswer = parsedTest.answerKey[q.questionNumber];
        if (keyAnswer && (!q.correctAnswer || q.correctAnswer === '')) {
            q.correctAnswer = keyAnswer;
        }
    }
}
```

### Fix 3: Section Sorting by Question Number

```typescript
function sortSectionsByQuestionNumber(sections: ParsedSection[]): void {
    sections.sort((a, b) => {
        const aMin = a.questions.length > 0
            ? Math.min(...a.questions.map(q => q.questionNumber))
            : Infinity;
        const bMin = b.questions.length > 0
            ? Math.min(...b.questions.map(q => q.questionNumber))
            : Infinity;
        return aMin - bMin;
    });
}
```

### Fix 4: Arrangement Question Number Inference

Sentence-arrangement questions parsed from `a./b./c.` items get dummy numbers. Fix by finding unclaimed answer key entries in the expected range:

```typescript
function fixArrangementQuestionNumbers(sections, answerKey): void {
    // 1. Collect all claimed question numbers from non-arrangement sections
    // 2. For each arrangement section with dummy numbers:
    //    a. Find range between adjacent sections (e.g., prev max=12, next min=15 → range 13-14)
    //    b. Find unclaimed answer key entries in that range
    //    c. Reassign dummy numbers → real numbers
}
```

### Fix 5: Passage Title Auto-Detection

Extract titles from passage content before building the passage object:

```typescript
// Detect: ALL CAPS first line, or short line (≤80 chars) before a long paragraph
const isAllCaps = line === line.toUpperCase() && line.length > 3 && /[A-Z]/.test(line);
const isShortBeforeLong = line.length <= 80 && nextLine.length > line.length * 2 && !line.endsWith('.');

if (isAllCaps || isShortBeforeLong) {
    passageTitle = line;        // Extract as title
    passageContent = rest;      // Remove from body
}
```

## Canonical Implementation

| File | Function | Role |
|------|----------|------|
| `thcsDocumentParser.service.ts` | `parseThcsText()` | AI-first hybrid pipeline |
| `thcsDocumentParser.service.ts` | `parseThcsTextDirect()` | Regex pipeline |
| `thcsDocumentParser.service.ts` | `fixArrangementQuestionNumbers()` | Numbering fix |
| `thcsDocumentParser.service.ts` | `sortSectionsByQuestionNumber()` | Section sort |
| `thcsDocumentParser.service.ts` | `extractEnhancedAnswerKey()` | Answer key extraction |
| `THCSPassagePanel.tsx` | Passage rendering | Title display (already supports `passage.title`) |
| `THCSQuestionRenderer.tsx` | Question text display | `whiteSpace: 'pre-line'` for multi-line text |

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|--------------|-------------|
| Only applying answer key once (before reconciliation) | Writing/arrangement answers from regex never reach questions |
| Using `!answerKey[num]` without checking `=== ''` | AI empty strings are truthy, block regex answers |
| Preserving document section order | Non-sequential numbering confuses students |
| Rendering `questionText` without `pre-line` | Multi-line arrangement items display horizontally |

## Source

Extracted from THCS parser diagnostic session (2026-03-03). Bugs discovered via the THCS Preview Diagnostic Log panel after parsing a Grade 7 test with sentence-arrangement (paragraph ordering) and word-rearrangement sections.



### Fix 6: Conditional Answer Key Normalization

**Bug:** `validateAIResult()` applied `.toUpperCase()` to ALL answer key values unconditionally. This silently corrupted text answers:
- `"goes"` → `"GOES"` (verb-form answer)
- `"collector"` → `"COLLECTOR"` (word-form answer)
- `"Camping is not as expensive..."` → `"CAMPING IS NOT AS EXPENSIVE..."` (writing answer)

**Fix:** Only uppercase single-letter MCQ answers (A-H). Preserve casing for everything else.

```typescript
// ❌ BAD: destroys text answers
answerKey[qNum] = value.toUpperCase();

// ✅ GOOD: conditional normalization
answerKey[qNum] = /^[A-Ha-h]$/.test(value) ? value.toUpperCase() : value;
```

**General pattern:** When normalizing heterogeneous data (mixed MCQ letters + free-text), always use type-aware normalization. Never apply blanket transforms.

**Location:** `thcsDocumentParser.service.ts` → `validateAIResult()` → answer key loop

**Date:** 2026-03-05



## Related: Branch Guard & Merge Correctness

See @doc/patterns/pattern-thcs-pipeline-branch-guard-merge-correctness for the 8 correctness rules governing the orchestrator's branch decision logic (confidence windows, compromise merge-back, classification ordering, tuple length enforcement, etc.) — drawn from a March 2026 micro-interaction audit of the pipeline.
