# IELTS Types Migration Reference

> **Source File**: `src/services/parser/types/ielts.types.ts`  
> **Purpose**: Document all patterns and types before migration to new `QuestionSchema.ts`  
> **Created**: 2026-02-05  
> **Status**: Phase 0 - Transition Documentation

---

## 1. Type Definitions

### 1.1 IELTS Skill Type
```typescript
export type IELTSSkill = 'listening' | 'reading' | 'writing' | 'speaking';
```
**Migration Note**: Keep for test metadata. May rename to `SkillType`.

---

### 1.2 IELTS Test Format
```typescript
export type IELTSTestFormat = 'Academic' | 'General Training';
```
**Migration Note**: Keep for Reading tests. Affects passage count and difficulty.

---

### 1.3 IELTS Task Types (All 16)

This is the **most critical type** to migrate. It defines all 16 question types supported by IELTS.

```typescript
export type IELTSTaskType =
  // Completion types (7)
  | 'sentence-completion'
  | 'summary-completion-text'   // Write words from text
  | 'summary-completion-list'   // Choose from list
  | 'note-completion'
  | 'table-completion'
  | 'flowchart-completion'
  | 'diagram-labeling'

  // True/False/Yes/No types (2)
  | 'true-false-not-given'
  | 'yes-no-not-given'

  // Matching types (4)
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'matching-sentence-endings'

  // Choice types (2)
  | 'multiple-choice'
  | 'multiple-select'           // Choose multiple answers

  // Short answer (1)
  | 'short-answer';
```

**Migration Note**: Map directly to `QuestionType` in new schema. Consider:
- `sentence-completion` → `CompletionQuestion` with `subtype: 'sentence'`
- `summary-completion-text` → `CompletionQuestion` with `subtype: 'summary'` and `source: 'text'`
- `summary-completion-list` → `CompletionQuestion` with `subtype: 'summary'` and `source: 'list'`

---

### 1.4 Task Type Categories

Grouping for UI/logic organization:

```typescript
export type IELTSTaskCategory =
  | 'completion'
  | 'true-false'
  | 'matching'
  | 'choice'
  | 'short-answer';

export const TASK_TYPE_CATEGORIES: Record<IELTSTaskType, IELTSTaskCategory> = {
  'sentence-completion': 'completion',
  'summary-completion-text': 'completion',
  'summary-completion-list': 'completion',
  'note-completion': 'completion',
  'table-completion': 'completion',
  'flowchart-completion': 'completion',
  'diagram-labeling': 'completion',
  'true-false-not-given': 'true-false',
  'yes-no-not-given': 'true-false',
  'matching-headings': 'matching',
  'matching-information': 'matching',
  'matching-features': 'matching',
  'matching-sentence-endings': 'matching',
  'multiple-choice': 'choice',
  'multiple-select': 'choice',
  'short-answer': 'short-answer',
};
```

**Migration Note**: Useful for grouping in review UI. Keep mapping.

---

## 2. Regex Patterns for Task Type Detection

### 2.1 TASK_TYPE_PATTERNS

This is the **core detection engine**. Each pattern array identifies a specific task type.

```typescript
export const TASK_TYPE_PATTERNS: Record<IELTSTaskType, RegExp[]> = {
```

#### Completion Types (7)

| Task Type | Patterns | Example Match |
|-----------|----------|---------------|
| `sentence-completion` | `/complete\s+(the\s+)?sentences?/i` | "Complete the sentences" |
| | `/finish\s+(the\s+)?sentences?/i` | "Finish the sentence" |
| `summary-completion-text` | `/complete\s+(the\s+)?summary.*words\s+from/i` | "Complete the summary using words from the text" |
| | `/complete\s+(the\s+)?summary.*using\s+words/i` | "Complete the summary using words" |
| `summary-completion-list` | `/complete\s+(the\s+)?summary.*from\s+(the\s+)?list/i` | "Complete the summary from the list below" |
| | `/choose.*from\s+(the\s+)?box/i` | "Choose words from the box" |
| `note-completion` | `/complete\s+(the\s+)?notes?/i` | "Complete the notes below" |
| | `/complete\s+(the\s+)?form/i` | "Complete the form" |
| `table-completion` | `/complete\s+(the\s+)?table/i` | "Complete the table below" |
| `flowchart-completion` | `/complete\s+(the\s+)?flow\s*chart/i` | "Complete the flow chart" |
| | `/complete\s+(the\s+)?diagram/i` | "Complete the diagram" |
| `diagram-labeling` | `/label\s+(the\s+)?(diagram\|map\|plan)/i` | "Label the diagram" |
| | `/choose\s+.*labels?/i` | "Choose the correct labels" |

#### True/False Types (2)

| Task Type | Patterns | Example Match |
|-----------|----------|---------------|
| `true-false-not-given` | `/true\s*[,/]\s*false\s*[,/]\s*not\s*given/i` | "TRUE, FALSE, NOT GIVEN" |
| `yes-no-not-given` | `/yes\s*[,/]\s*no\s*[,/]\s*not\s*given/i` | "YES, NO, NOT GIVEN" |

#### Matching Types (4)

| Task Type | Patterns | Example Match |
|-----------|----------|---------------|
| `matching-headings` | `/match.*headings?/i` | "Match the headings" |
| | `/choose.*headings?/i` | "Choose the correct heading" |
| | `/list\s+of\s+headings?/i` | "List of Headings" |
| `matching-information` | `/match.*information/i` | "Match the information" |
| | `/which\s+paragraph/i` | "Which paragraph contains..." |
| `matching-features` | `/match.*people\|match.*researchers?\|match.*scientists?/i` | "Match the researchers" |
| | `/match.*features?/i` | "Match the features" |
| `matching-sentence-endings` | `/complete.*sentence.*with.*ending/i` | "Complete the sentence with the correct ending" |
| | `/complete.*sentence.*correct\s+ending/i` | "Complete with correct ending" |
| | `/complete\s+each\s+sentence.*ending/i` | "Complete each sentence" |
| | `/match.*sentence\s+endings?/i` | "Match sentence endings" |
| | `/complete.*sentences?\s+by\s+choosing/i` | "Complete sentences by choosing" |
| | `/list\s+of\s+endings/i` | "List of Endings" |
| | `/correct\s+ending.*A[-–]?[A-Z]/i` | "correct ending A-H" |

#### Choice Types (2)

| Task Type | Patterns | Example Match |
|-----------|----------|---------------|
| `multiple-choice` | `/choose\s+(the\s+)?correct\s+(letter\|answer\|option)/i` | "Choose the correct letter" |
| | `/circle\s+(the\s+)?correct/i` | "Circle the correct answer" |
| `multiple-select` | `/choose\s+(two\|three\|four\|2\|3\|4)/i` | "Choose TWO letters" |
| | `/which\s+(two\|three\|four\|2\|3\|4)/i` | "Which TWO statements" |

#### Short Answer (1)

| Task Type | Patterns | Example Match |
|-----------|----------|---------------|
| `short-answer` | `/answer\s+(the\s+)?questions?/i` | "Answer the questions" |
| | `/write\s+no\s+more\s+than/i` | "Write no more than three words" |

---

### 2.2 Pattern Detection Priority

**Important**: Some patterns overlap. The recommended detection order (highest priority first):

1. **P0 (Most Specific)**:
   - `true-false-not-given` - Very specific pattern
   - `yes-no-not-given` - Very specific pattern
   - `matching-headings` - Keyword "headings" is distinctive
   - `multiple-choice` - "correct letter/answer" is clear

2. **P1 (Specific)**:
   - `matching-sentence-endings` - Multiple patterns for safety
   - `summary-completion-list` - "from list/box" is key
   - `summary-completion-text` - "words from text" is key
   - `matching-information` - "which paragraph" is strong signal
   - `matching-features` - "match people/researchers" is specific

3. **P2 (General - Check Last)**:
   - `sentence-completion` - Can overlap with summary
   - `note-completion` - Can overlap with table
   - `table-completion` - General "complete table"
   - `flowchart-completion` - Can match "diagram"
   - `diagram-labeling` - "label" is key
   - `multiple-select` - Count words are key
   - `short-answer` - Most generic, check last

---

## 3. Word Limit Patterns

Used to extract answer length restrictions from instructions:

```typescript
export const WORD_LIMIT_PATTERNS = [
  { pattern: /no\s+more\s+than\s+one\s+word/i, maxWords: 1 },
  { pattern: /one\s+word\s+only/i, maxWords: 1 },
  { pattern: /no\s+more\s+than\s+two\s+words?/i, maxWords: 2 },
  { pattern: /no\s+more\s+than\s+three\s+words?/i, maxWords: 3 },
  { pattern: /no\s+more\s+than\s+(\d+)\s+words?/i, maxWords: -1 }, // Dynamic extraction
  { pattern: /one\s+word\s+and\/or\s+a\s+number/i, maxWords: 1, allowNumber: true },
  { pattern: /two\s+words?\s+and\/or\s+a\s+number/i, maxWords: 2, allowNumber: true },
  { pattern: /three\s+words?\s+and\/or\s+a\s+number/i, maxWords: 3, allowNumber: true },
] as const;
```

**Migration Note**: 
- Pattern with `maxWords: -1` requires dynamic extraction using captured group
- `allowNumber: true` means "10", "15th", etc. don't count as words
- These patterns should be migrated to new classifier service

---

## 4. Interfaces to Migrate

### 4.1 IELTSWordLimit
```typescript
export interface IELTSWordLimit {
  maxWords: number;
  numbersCountAsWords: boolean;
  hyphenatedAsOne: boolean;
  instruction: string;
}
```
**Migration Note**: Include in `QuestionSchema.ts` as `wordLimit` property.

---

### 4.2 IELTSQuestionMetadata
```typescript
export interface IELTSQuestionMetadata {
  taskType: IELTSTaskType;
  wordLimit?: IELTSWordLimit;
  sectionNumber?: number;      // For Listening
  passageNumber?: number;      // For Reading
  hasOptionsBox?: boolean;
  optionsBox?: string[];
}
```
**Migration Note**: Merge into base `Question` interface in new schema.

---

### 4.3 IELTSAnswer
```typescript
export interface IELTSAnswer {
  primary: string;
  alternatives?: string[];
  caseSensitive?: boolean;
  allowSpellingVariations?: boolean;
}
```
**Migration Note**: This is valuable for answer validation. Keep in new schema.

---

## 5. Migration Checklist

- [ ] Create `QuestionType` union from `IELTSTaskType`
- [ ] Create `QUESTION_TYPE_PATTERNS` from `TASK_TYPE_PATTERNS`
- [ ] Create `WORD_LIMIT_PATTERNS` in classifier service
- [ ] Implement priority-based pattern matching
- [ ] Create `Answer` interface from `IELTSAnswer`
- [ ] Add `wordLimit` property to base Question
- [ ] Add `optionsBox` support for matching types
- [ ] Map `TASK_TYPE_CATEGORIES` to new category enum

---

## 6. Patterns Not Yet in ielts.types.ts

These patterns were identified in `question-type-detector.ts` but NOT in `ielts.types.ts`:

*(To be documented in Task 0.2)*

---

> **End of Migration Reference for ielts.types.ts**
