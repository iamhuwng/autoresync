---
title: Question Type Detector Migration Reference
createdAt: '2026-02-27T15:26:09.964Z'
updatedAt: '2026-02-27T15:26:11.353Z'
description: Reference for question type detection logic during migration
tags:
  - migration
  - question-type
  - detector
---
# Question Type Detector - Migration Reference

> **Source File**: `src/utils/parsers/question-type-detector.ts`  
> **Lines**: 549  
> **Created**: 2026-02-05  
> **Purpose**: Preserve detection patterns for migration to new `type-classifier.service.ts`

---

## 1. QuestionType Union Type

```typescript
export type QuestionType =
  | 'multiple-choice'
  | 'multiple-select'
  | 'sentence-completion'
  | 'summary-completion-text'
  | 'summary-completion-list'
  | 'note-completion'
  | 'table-completion'
  | 'flowchart-completion'
  | 'diagram-labeling'
  | 'true-false-not-given'
  | 'yes-no-not-given'
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'matching-sentence-endings'
  | 'short-answer'
  | 'completion'; // Legacy fallback
```

---

## 2. DetectionPattern Interface

```typescript
interface DetectionPattern {
  type: QuestionType;
  patterns: RegExp[];
  optionCheck?: (options: string[]) => boolean;
  priority: number; // Higher = check first
}
```

---

## 3. Detection Patterns (by Priority)

### Priority 12 (Highest - Very Specific)

| Type | Patterns | Notes |
|------|----------|-------|
| `matching-headings` | `/choose\s+the\s+(correct|appropriate)\s+heading/i`, `/match.*heading/i`, `/list\s+of\s+headings/i`, `/heading\s+for\s+(each\s+)?(paragraph|section)/i`, `/which\s+heading\s+best/i` | No Roman numeral requirement |
| `matching-sentence-endings` | `/complete.*sentence.*with.*ending/i`, `/complete.*sentence.*correct\s+ending/i`, `/complete\s+each\s+sentence.*ending/i`, `/correct\s+ending.*A[-–]?[A-Z]/i`, `/list\s+of\s+endings/i`, `/sentence\s+endings/i`, `/endings?[:.]?\s*$/im` | High priority to avoid matching-features confusion |

### Priority 11

| Type | Patterns | Notes |
|------|----------|-------|
| `matching-features` | `/list\s+of\s+(people|names|theories|scientists|researchers|features)/i`, `/match.*statement.*with.*(?!ending)/i`, `/match\s+each\s+statement.*(?!ending)/i`, `/which\s+(person|scientist|researcher|theory)/i`, `/statements?\s+below.*match/i`, `/match.*with\s+the\s+(correct|appropriate)\s+(person|researcher|scientist)/i`, `/NB\s+You\s+may\s+use\s+any\s+letter\s+more\s+than\s+once/i` | Must NOT match "ending" |

### Priority 10

| Type | Patterns | Option Check | Notes |
|------|----------|--------------|-------|
| `true-false-not-given` | `/true.*false.*not given/i` | `hasTrueFalseNotGivenOptions(opts)` | Checks options array |
| `yes-no-not-given` | `/yes.*no.*not given/i` | `hasYesNoNotGivenOptions(opts)` | Checks options array |
| `short-answer` | `/answer\s+the\s+questions?\s+below/i`, `/no\s+more\s+than\s+three\s+words\s+and\/or\s+a\s+number/i`, `/what\s+(is|are|was|were|does|do|did).*\?/i` | - | Direct questions |

### Priority 9

| Type | Patterns | Notes |
|------|----------|-------|
| `matching-information` | `/which\s+(section|paragraph).*contains/i`, `/information.*section/i`, `/section.*information/i` | - |
| `diagram-labeling` | `/label\s+the\s+diagram/i`, `/diagram\s+(shows|illustrates)/i`, `/label\s+the\s+(parts|components)/i` | - |
| `flowchart-completion` | `/complete\s+the\s+flow-?chart/i`, `/flow-?chart.*below/i` | - |
| `table-completion` | `/complete\s+the\s+table/i`, `/table.*below/i` | - |
| `note-completion` | `/complete\s+the\s+notes/i`, `/one\s+word\s+and\/or\s+a\s+number/i` | - |
| `summary-completion-list` | `/complete\s+the\s+summary.*using\s+the\s+list/i`, `/list\s+of\s+phrases/i`, `/summary.*A-[A-Z]/i` | From provided list |

### Priority 8

| Type | Patterns | Notes |
|------|----------|-------|
| `summary-completion-text` | `/complete\s+the\s+summary/i`, `/no\s+more\s+than\s+two\s+words/i` | From passage text |
| `sentence-completion` | `/complete\s+the\s+sentences?/i`, `/one\s+word\s+only/i`, `/_{3,}/`, `/\.{4,}/` | Underscore/dot blanks |

### Priority 7

| Type | Patterns | Notes |
|------|----------|-------|
| `multiple-select` | `/choose\s+all/i`, `/select\s+all/i`, `/all\s+that\s+apply/i`, `/which\s+of\s+the\s+following.*\(select.*\)/i` | Multiple answers |

### Priority 6

| Type | Patterns | Notes |
|------|----------|-------|
| `completion` | `/_{3,}/`, `/\.{4,}/`, `/complete/i`, `/choose\s+no\s+more\s+than/i`, `/no\s+more\s+than.*word/i` | Legacy fallback |

### Priority 5 (Lowest)

| Type | Patterns | Notes |
|------|----------|-------|
| `multiple-choice` | `/[A-D]\)\s+\w+/`, `/[A-D]\.\s+\w+/` | Default with options |

---

## 4. Option Check Helper Functions

### hasTrueFalseNotGivenOptions

```typescript
private hasTrueFalseNotGivenOptions(options: string[]): boolean {
  if (!options || options.length !== 3) return false;

  const normalized = options.map(o =>
    o.toLowerCase().replace(/[^a-z]/g, '')
  );

  return (
    normalized.includes('true') &&
    normalized.includes('false') &&
    normalized.includes('notgiven')
  );
}
```

### hasYesNoNotGivenOptions

```typescript
private hasYesNoNotGivenOptions(options: string[]): boolean {
  if (!options || options.length !== 3) return false;

  const normalized = options.map(o =>
    o.toLowerCase().replace(/[^a-z]/g, '')
  );

  return (
    normalized.includes('yes') &&
    normalized.includes('no') &&
    normalized.includes('notgiven')
  );
}
```

### hasRomanNumerals

```typescript
private hasRomanNumerals(options: string[]): boolean {
  if (!options || options.length === 0) return false;

  // Check if at least one option starts with roman numeral
  return options.some(opt => {
    const trimmed = opt.trim().toLowerCase();
    return /^[ivx]+\./i.test(trimmed);
  });
}
```

---

## 5. detectOptionLabelFormat Function

```typescript
detectOptionLabelFormat(options: string[]): 'letter' | 'roman' {
  if (!options || options.length === 0) {
    return 'letter'; // Default to letter
  }

  let romanCount = 0;
  let letterCount = 0;

  for (const opt of options) {
    const trimmed = opt.trim();

    // Check for roman numeral prefix (i., ii., iii., iv., v., vi., vii., viii., ix., x.)
    if (/^[ivx]+[\.)]]\s*/i.test(trimmed)) {
      romanCount++;
    }
    // Check for letter prefix (A., B., C., A), B), etc.)
    else if (/^[A-Z][\.)]]\s*/i.test(trimmed)) {
      letterCount++;
    }
  }

  // If more options have roman numerals, use roman; otherwise use letter
  return romanCount > letterCount ? 'roman' : 'letter';
}
```

---

## 6. detectFromSectionContext Function

**Purpose**: More accurate detection using section instruction + question text.

### Detection Order (Critical - Order Matters!)

1. **Try instruction-based detection first** (`detectFromInstructions`)
2. If confidence >= 90%, return immediately
3. **Enhanced edge case handling**:
   - `sentence` + `ending` → `matching-sentence-endings` (95%)
   - `complete` + `ending` + `/A[-–][A-Z]/` → `matching-sentence-endings` (95%)
   - `list of endings` → `matching-sentence-endings` (95%)
   - `list of` + (`people`|`researcher`|`scientist`|`feature`) & NOT `ending` → `matching-features` (95%)
4. **Fallback to first question text** if available (70% confidence)

---

## 7. detectFromInstructions Function

### Detection Logic (Exact Order)

```typescript
// 1. TRUE/FALSE/NOT GIVEN
'statements agree with' OR 'claims agree with' → true-false-not-given (95%)
'true' + 'false' + 'not given' → true-false-not-given (95%)
'true or false' OR 'true/false' → true-false-not-given (95%)

// 2. YES/NO/NOT GIVEN
'yes' + 'no' + 'not given' → yes-no-not-given (95%)
'views agree with' OR 'opinions agree with' → yes-no-not-given (95%)

// 3. MATCHING (Order matters - sentence endings FIRST)
'sentence' + 'ending' → matching-sentence-endings (95%)
'complete' + 'ending' → matching-sentence-endings (95%)
'list of endings' → matching-sentence-endings (95%)
'which section contains' OR 'which paragraph contains' → matching-information (90%)
'list of headings' OR ('match' + 'heading') → matching-headings (90%)
'match' + 'information' → matching-information (90%)
'list of' + (people|names|features) & NOT 'ending' → matching-features (90%)

// 4. COMPLETION
'complete the summary' → summary-completion-text (95%)
'complete the notes' OR 'complete the form' → note-completion (95%)
'complete the table' → table-completion (95%)
'complete the sentences' OR 'complete each sentence' → sentence-completion (95%)
'label the diagram' OR 'label the map' → diagram-labeling (95%)
'complete the' OR 'one word' OR 'no more than' → completion (90%)

// 5. MULTIPLE CHOICE
'choose the correct letter' OR ('choose' + 'letter') → multiple-choice (90%)
'choose' + (two|three|four|five) → multiple-select (85%)

// 6. SHORT ANSWER
'answer the following questions' OR 'answer the questions' → short-answer (80%)

// 7. DEFAULT
→ multiple-choice (50%)
```

---

## 8. Fallback Logic

```typescript
// In detect() method:
1. If has blank → return 'completion'
2. If has options → return 'multiple-choice'
3. Ultimate fallback → 'multiple-choice'
```

**Issue Identified**: No `uncertain` flag for teacher review.
**New System Should**: Flag as `{ type: 'completion', uncertain: true }` instead of silent fallback.

---

## 9. Key Lessons for New System

### ✅ Keep

1. **Priority-based pattern matching** - higher priority checked first
2. **Option check functions** - validate TFNG/YNNG options
3. **Option label format detection** - letter vs roman numeral
4. **Section context detection** - instruction text more reliable than question text
5. **Confidence scoring** - return confidence % with type

### ⚠️ Improve

1. **Add `uncertain` flag** for fallback cases
2. **Avoid duplicate code** (lines 449-525 duplicated in detectFromInstructions)
3. **Standardize confidence levels** (currently 50, 70, 80, 85, 90, 95, 100)

---

## 10. Migration Checklist

- [ ] Copy QuestionType union type to `QuestionSchema.ts`
- [ ] Copy DetectionPattern interface to `type-classifier.service.ts`
- [ ] Copy all regex patterns (maintain priority order)
- [ ] Copy option check helper functions
- [ ] Copy detectOptionLabelFormat function
- [ ] Add `uncertain: boolean` to classification result
- [ ] Remove duplicate detection code
- [ ] Add unit tests for all 16 types
