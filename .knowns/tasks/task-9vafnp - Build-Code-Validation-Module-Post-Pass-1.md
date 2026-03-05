---
id: 9vafnp
title: Build Code Validation Module (Post-Pass 1)
status: done
priority: high
labels:
  - from-spec-v2
  - core-module
createdAt: '2026-03-04T22:46:13.892Z'
updatedAt: '2026-03-05T01:50:35.160Z'
timeSpent: 640
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-3
order: 7
---
# Build Code Validation Module (Post-Pass 1)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create `thcs-text-validator.ts`. Scans restructured text **AFTER Pass 1** (not raw text) to produce `ValidationReport` with: `formatConfidence` (0-100), `issues[]` (16 issue codes with section text + line ranges), `unsupportedTypes[]`, and `stats`. Determines whether Pass 2 (repair), Compromise, or External Retry are needed. Depends on @task-{Pass1} (runs on its output).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ValidationReport interface with all required fields
- [x] #2 All 16 issue codes detectable (one test per code)
- [x] #3 unsupportedTypes[] detection for matching, true-false, translation, etc.
- [x] #4 stats object with section/question/answer/typeTag counts
- [x] #5 Carries originalInput and processedText for downstream
- [x] #6 formatConfidence weighted by issue severity
- [x] #7 Runs on Pass 1 output (not raw text)
- [x] #8 Order: 3 (depends on T6 q6lxtq - Pass 1)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### New file
`src/services/test-creation/thcs-text-validator.ts`

### Architecture
A pure, deterministic text scanner — NO AI calls. Receives the restructured text from Pass 1, runs 16 regex-based checks, detects unsupported types, computes a weighted confidence score, and returns a `ValidationReport` that determines the pipeline's next step.

### Interfaces

```typescript
// The 16 issue codes
type IssueCode =
  | 'MERGED_QUESTIONS' | 'MISSING_Q_PREFIX' | 'OPTIONS_INLINE'
  | 'COMPRESSED_ANSWER_KEY' | 'MISSING_ANSWER_KEY' | 'MISSING_TYPE_TAG'
  | 'TYPE_CONTENT_MISMATCH' | 'MISSING_PASSAGE_BLOCK' | 'PASSAGE_NO_PARAGRAPHS'
  | 'SECTION_NO_QUESTIONS' | 'AMBIGUOUS_SECTION_SPLIT' | 'NUMBERING_GAP'
  | 'BLANK_FORMAT_WRONG' | 'MISSING_BRACKETS' | 'MISSING_ARROW'
  | 'WORD_BANK_NOT_TAGGED';

// Unsupported type slugs
type UnsupportedType =
  | 'matching' | 'true-false' | 'translation' | 'matching-headings'
  | 'gap-fill-open' | 'word-ordering' | 'picture-description'
  | 'listening' | 'speaking' | 'essay' | 'composition';

interface ValidationIssue {
  code: IssueCode;
  severity: 'critical' | 'major' | 'minor';
  sectionIndex: number;           // which section (0-based), -1 for global
  lineRange: [number, number];    // start/end line in the text
  sectionText: string;            // snippet of offending text (max 200 chars)
  message: string;                // human-readable description
}

interface ValidationStats {
  sectionCount: number;
  questionCount: number;
  answerCount: number;
  typeTagCount: number;
}

interface ValidationReport {
  formatConfidence: number;       // 0-100 weighted score
  issues: ValidationIssue[];
  unsupportedTypes: Array<{
    type: UnsupportedType;
    sectionIndex: number;
    canCompromise: boolean;        // true if FR-10 has a route
  }>;
  stats: ValidationStats;
  originalInput: string;          // raw teacher text (for repair prompt)
  processedText: string;          // Pass 1 output (what was scanned)
  aiConfidence: number;           // Pass 1's self-reported confidence (for FR-13 comparison)
  confidenceDisagreement: boolean; // |aiConfidence - formatConfidence| > 25
}
```

### Detection Functions (16 issue code detectors)

Each detector receives `lines: string[]` and section boundaries. Returns `ValidationIssue[]`.

#### Structural (severity: critical/major)
1. **`detectMergedQuestions(lines, sections)`** — P:critical
   - Regex: line matches `Question \d+.*.+Question \d+` or `Câu \d+.*.+Câu \d+`
   - Also catches `\d+\.\s+.+\d+\.\s+` patterns (numbered questions on same line)

2. **`detectMissingQPrefix(lines, sections)`** — P:major
   - Lines with A/B/C/D options on following lines but no `Question \d` or `Câu \d` prefix
   - Heuristic: look for option blocks where the preceding line doesn't match question pattern

3. **`detectOptionsInline(lines, sections)`** — P:major
   - Regex: `Question \d+.+\bA\.\s.+\bB\.\s` (question + options on single line)

4. **`detectNumberingGap(lines)`** — P:minor
   - Collect all question numbers, check for non-sequential gaps

5. **`detectSectionNoQuestions(lines, sections)`** — P:major
   - Section header (e.g., line with `[TYPE:]` or all-caps instruction) with no subsequent questions before next section

6. **`detectAmbiguousSectionSplit(lines, sections)`** — P:major
   - Heuristic: within one section boundary, detect mixed patterns (e.g., some questions have MCQ options AND some have `______` fill-in blanks)

#### Content & Type (severity: major)
7. **`detectMissingTypeTag(lines, sections)`** — P:major
   - Section header lines without `[TYPE: xxx]` tag

8. **`detectTypeContentMismatch(lines, sections)`** — P:major
   - `[TYPE: word-stress]` but content has `______` blanks (should be fill-in)
   - `[TYPE: verb-form]` but content has A/B/C/D options (should be MCQ)
   - Cross-reference type tag against content pattern signatures

9. **`detectMissingPassageBlock(lines, sections)`** — P:major
   - Section with reading type tag (`reading-*`) but no `PASSAGE:` delimiter and no substantial text block before questions

10. **`detectPassageNoParagraphs(lines, sections)`** — P:minor
    - Passage text > 200 chars with no `

` breaks

#### Marker & Formatting (severity: minor)
11. **`detectBlankFormatWrong(lines, sections)`** — P:minor
    - Fill-in sections where blanks are `...` or `___` (less than 6 underscores) instead of `______`

12. **`detectMissingBrackets(lines, sections)`** — P:minor
    - verb-form/word-form sections without `(verb)` or `(WORD)` markers in question text

13. **`detectMissingArrow(lines, sections)`** — P:minor
    - sentence-rewrite sections where questions lack `=>` separator

14. **`detectWordBankNotTagged(lines, sections)`** — P:minor
    - Section with cloze pattern + word list in text but not wrapped in `[WORD BANK: ...]`

#### Key & Metadata (severity: critical)
15. **`detectCompressedAnswerKey(lines)`** — P:critical
    - Regex: `\d+\s*[-–]\s*\d+\s*[:：]\s*[A-D]{2,}` (e.g., "1-5: BACDC")

16. **`detectMissingAnswerKey(lines)`** — P:critical
    - No lines matching answer key patterns (`\d+\.\s*[A-D]`, `Answer Key`, `Đáp án`)

### Unsupported Type Detection

```typescript
function detectUnsupportedTypes(lines: string[], sections: SectionBoundary[]): UnsupportedType[]
```
Scans `[TYPE: xxx]` tags and content patterns for:
- `matching` — column A/B pattern, "Match" in header
- `true-false` — "True/False/Not Given" in options
- `translation` — "Translate", "Dịch" in header
- `matching-headings` — "Match heading" patterns
- `gap-fill-open` — fill-in blanks with NO word bank and NO brackets
- `word-ordering` — "Put words in order", numbered word fragments
- `picture-description` — "Look at picture", "Describe"
- `listening` — "Listen", "Nghe" in header
- `speaking` — "Speak", "Nói" in header
- `essay`/`composition` — "Write an essay", "Write about"

### Confidence Calculation

```typescript
function computeFormatConfidence(issues: ValidationIssue[], stats: ValidationStats): number
```
- Start at 100
- Deduct per issue by severity:
  - `critical`: -20 per issue (capped at -60)
  - `major`: -10 per issue (capped at -40)
  - `minor`: -3 per issue (capped at -15)
- Bonus adjustments:
  - +5 if all sections have type tags
  - +5 if answer coverage > 90%
- Floor at 0, cap at 100

### Main Entry Point

```typescript
function validateRestructuredText(
  processedText: string,
  originalInput: string,
  aiConfidence: number
): ValidationReport
```
1. Split text into lines
2. Detect section boundaries (headers, type tags, blank line groups)
3. Run all 16 detectors → collect issues
4. Detect unsupported types
5. Compute stats (count sections, questions, answers, type tags)
6. Compute `formatConfidence`
7. Check confidence disagreement: `|aiConfidence - formatConfidence| > 25`
8. Return `ValidationReport`

### Pipeline Decision Logic (consumed by integration task)
```
if (report.unsupportedTypes.length > 0)
  → route unsupported sections to Compromise (task 78pz92)
if (report.formatConfidence >= 80 && report.issues.length === 0)
  → proceed directly to Regex Engine (no Pass 2 needed)
if (report.formatConfidence >= 50)
  → route to Pass 2 Repair with relevant issue codes (task pqr0rq)
if (report.formatConfidence < 50)
  → route to External Retry (task le05g6)
```

### Files changed
- `src/services/test-creation/thcs-text-validator.ts` (NEW — ~300-350 lines)

### Dependencies
- None (pure regex + heuristic logic, no AI calls, no imports beyond types)

### Consumed by
- Task `wei3uc` (Prompt Builder) — uses `IssueCode` type to select repair fragments
- Task `pqr0rq` (Pass 2 Repair) — reads `ValidationReport.issues`
- Task `78pz92` (Compromise) — reads `unsupportedTypes`
- Task `le05g6` (External Retry) — triggered by `formatConfidence < 50`
- Task `8085zl` (Integration) — calls `validateRestructuredText()` in main pipeline
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Created `thcs-text-validator.ts` (~390 lines)
- 16 issue detectors: MERGED_QUESTIONS, MISSING_Q_PREFIX, OPTIONS_INLINE, NUMBERING_GAP, SECTION_NO_QUESTIONS, AMBIGUOUS_SECTION_SPLIT, MISSING_TYPE_TAG, TYPE_CONTENT_MISMATCH, MISSING_PASSAGE_BLOCK, PASSAGE_NO_PARAGRAPHS, BLANK_FORMAT_WRONG, MISSING_BRACKETS, MISSING_ARROW, WORD_BANK_NOT_TAGGED, COMPRESSED_ANSWER_KEY, MISSING_ANSWER_KEY
- 11 unsupported types: matching, true-false, translation, matching-headings, gap-fill-open, word-ordering, picture-description, listening, speaking, essay, composition (7 can compromise, 4 skip)
- Weighted confidence: critical -20/ea (cap 60), major -10/ea (cap 40), minor -3/ea (cap 15), bonuses for type tags + answer coverage
- Section boundary detection via Roman numeral / Part / Section regex + [TYPE:] tag extraction
- 29 unit tests passing
- Zero TypeScript errors
<!-- SECTION:NOTES:END -->

