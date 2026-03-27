---
title: 'Pattern: AI Flat-Text to Structured Field Decomposition'
description: How to decompose AI-returned flat text (e.g., sentence-rewrite format, fill-in templates) into typed structured fields in a converter layer, rather than requiring the AI to output perfect structured JSON for complex types.
createdAt: '2026-03-05T08:38:54.766Z'
updatedAt: '2026-03-25T18:08:29.745Z'
tags:
  - pattern
  - ai
  - parsing
  - converter
---

# Pattern: AI Flat-Text to Structured Field Decomposition

## Problem

When AI extracts content from documents, it naturally returns **flat text** for fields that the UI expects as **structured typed objects**. Requiring the AI to output perfect nested JSON for every complex type:
- Increases prompt complexity and output token cost
- Makes validation harder (deeply nested schema is fragile)
- Breaks when AI "forgets" a nested field

The better approach: let the AI output simple flat text, then **decompose in a converter layer**.

## Solution

Accept AI flat-text output, then parse/decompose in a dedicated converter function that runs **after** AI extraction and **before** the editor/renderer receives the data.

```
AI Output (flat)           Converter Layer             Editor/Renderer (typed)
───────────────────        ─────────────────           ───────────────────────
"She is tall. => It ___"   decompose()             →   { originalSentence: "She is tall.",
                                                          sentenceStarter: "It" }

"She ___ every day."  →    map sentenceTemplate    →   { sentenceTemplate: "She ___ every day.",
+ correctAnswer: "goes"    + split blankAnswers         blankAnswers: [{ acceptedAnswers:["goes"]}] }

"[WORD BANK: a / b / c]"   extract wordBankWords   →   { wordBank: ["a","b","c"],
+ numbered blanks      →   + number→sequential          passageTemplate: "___(1)___ and ___(2)___" }
```

## Key Examples from `thcs-draft-converter.ts`

### 1. Sentence-Rewrite Decomposition

AI produces: `"She is taller than her sister. => It is her sister"`
UI expects: `{ originalSentence, sentenceStarter, keyword?, modelAnswers[] }`

```typescript
// Arrow separator patterns: =>, →, ➜, ⇒, =>
const arrowMatch = rawText.match(/^(.+?)\s*(?:=>|→|➜|⇒|=\s*>)\s*(.+)$/s);
if (arrowMatch) {
    q.originalSentence = arrowMatch[1].trim();
    q.sentenceStarter = arrowMatch[2]
        .replace(/_{2,}.*$/, '')   // strip trailing blanks
        .replace(/\.{3,}$/, '')    // strip trailing ellipsis
        .trim();
}

// Keyword extraction: "(POSSIBLE)" or "Using: ALTHOUGH"
const parenKw = rawText.match(/\(([A-Z][A-Z\s]*)\)\s*(?:$|(?:=>|→))/);
const usingKw = rawText.match(/(?:Using|KEYWORD)\s*[:\uff1a]\s*([A-Z\s]+)/i);
if (parenKw || usingKw) {
    q.keyword = (parenKw ?? usingKw)![1].trim().toUpperCase();
}
```

### 2. Fill-In Template Mapping

AI produces: `{ questionText: "She ___ to school every day.", correctAnswer: "goes" }`
UI expects: `{ sentenceTemplate: "...", blankAnswers: [{ acceptedAnswers: ["goes"] }] }`

```typescript
if (isFillInType && q.questionText) {
    q.sentenceTemplate = q.questionText;
    const blankCount = (q.questionText.match(/_{2,}/g) || []).length;
    const answers = q.correctAnswer.split(/\s*[\/,]\s*/).filter(Boolean);
    q.blankAnswers = Array.from({ length: Math.max(blankCount, 1) }, (_, b) => ({
        acceptedAnswers: b === 0 ? answers : [answers[b] || ''],
    }));
}
```

### 3. Word-Bank Cloze Extraction

AI produces: passage text with `[WORD BANK: a / b / c]` embedded + numbered blanks `(26) ______`
UI expects: `{ wordBank[], passageTemplate: "___(1)___", blankMapping: { "1": "word" } }`

```typescript
// Extract word bank
const wbMatch = passageText.match(/\[WORD\s*BANK\s*[:\uff1a]\s*(.+?)\]/i);
const wordBankWords = wbMatch?.[1].split(/\s*[\/,|]\s*/).map(w => w.trim()) ?? [];

// Renumber blanks: "(26) ______" → "___(1)___"
questions.forEach((q, idx) => {
    const numRegex = new RegExp(`\\(?${q.questionNumber}\\)?\\s*_{2,}`, 'g');
    templatePassage = templatePassage.replace(numRegex, `___(${idx + 1})___`);
});
```

## Design Rules

| Rule | Reason |
|------|--------|
| **Converter is the sole authority for decomposition** | Keeps AI prompt simple; decomposition logic is testable in isolation |
| **AI output is preserved as-is** | Converter reads `pq.text`, `pq.correctAnswer` — never mutates AI source |
| **Safety-net warnings, not mutations** | If AI returns wrong type, log a warning but don't silently "fix" — forces prompt improvement |
| **Classifier owns type; converter maps fields** | Type re-classification in `reclassifyByContent`, field decomposition in converter — single responsibility |

## When to Apply This Pattern

Use this when:
- AI returns a complex question type as flat text (writing, fill-in, cloze)
- The UI component expects multiple typed sub-fields
- Adding more structured output requirements to the AI would make the prompt brittle

Don't use this when:
- The AI can reliably output the structured format directly (simple MCQ)
- The decomposition rules are ambiguous (multiple valid interpretations)

## Source

`src/services/test-creation/thcs-draft-converter.ts`

## Related

- @doc/patterns/pattern-rule-vs-ai-decision-boundary — When to use rules vs AI for classification
- @doc/patterns/pattern-thcs-hybrid-parser-reconciliation-pipeline — The broader pipeline this converter is part of

## Reading Label-Aware Decomposition (2026-03-26)

When Reading source material includes labels, extraction should promote those labels into structured fields instead of leaving them embedded in free text.

### Example Decompositions
- `A proof` -> `{ label: 'A', text: 'proof' }`
- `**ii** The spread of cities` -> `{ label: 'ii', text: 'The spread of cities' }`
- `27. The burial site was found...` with `questionNumber = 27` -> `questionText = 'The burial site was found...'`

### Rules
- Strip a leading question number only when it matches the authoritative question number for that item.
- Preserve non-sequential source labels exactly. Do not renumber `ii`, `iv`, `ix` to `i`, `ii`, `iii`.
- Reject mixed groups such as `['A proof', 'plantation', 'C burial site']` instead of guessing.
- Downstream renderers should consume the structured result and must not reconstruct labels from array index once labels exist.

This is the converter-layer fix for duplicated labels such as `A A`, `v. v. ...`, and doubled question numbers.
