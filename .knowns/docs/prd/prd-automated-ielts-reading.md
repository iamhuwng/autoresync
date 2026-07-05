---
title: PRD Automated IELTS Reading
description: Product requirements for automated IELTS reading test creation
createdAt: '2026-02-27T15:28:03.169Z'
updatedAt: '2026-04-10T08:35:22.425Z'
tags:
  - prd
  - ielts
  - reading
  - automated
---

# 0020-prd-automated-ielts-reading-test-creation

> Obsolete as of 2026-07-05: Reading V1 creation/runtime is retired. Current authority: @doc/architecture/retired-features-current-state. Historical content below is retained as implementation history; unfinished Reading V1 work is cancelled by feature retirement.

> **Status**: Draft - Pending Review  
> **Created**: 2026-02-05  
> **Target**: Replace current parser system with new automated test creation flow

---

## 1. Introduction/Overview

### Problem Statement
Teachers currently face a time-consuming, manual process to create IELTS Reading tests. The existing parser system is fragmented, unreliable with varied document formats, and lacks proper support for all 16 IELTS question types. Teachers must manually configure each question, leading to errors and frustration.

### Solution
Build a **completely new automated test creation system** that allows teachers to:
1. Upload a file (.docx, .md, .pdf) or paste text
2. Have AI automatically extract and structure the test
3. Review, edit, and publish with minimal effort

### Core Architecture
**Hybrid AI Parsing** approach:
- **AI Layer (Gemini 2.5 Flash / Groq Llama 3.3)**: Extracts raw content (passages, questions, answers, section instructions) AND classifies question types
- **Rule-Based Layer**: Runs **independently and silently** as a second classifier using regex patterns on section instructions and question text. Does NOT override AI results.
- **Validation Layer**: Compares AI vs. rules results side-by-side. Flags discrepancies for teacher review. Teacher decides which to trust (not compulsory to accept either). Teacher corrections are saved as input for future optimization.

---

## 1.5 Phase 0: Transition (Pre-Implementation)

> **CRITICAL**: Complete this phase BEFORE any new implementation begins.

### 1.5.1 Current System Documentation

Document the existing parser system before removal:

| File | Lines | Purpose | Action |
|------|-------|---------|--------|
| `services/parser/parser.router.ts` | 391 | Central routing | Document patterns |
| `services/parser/reading.parser.ts` | 798 | IELTS-specific parsing | Extract IELTS patterns |
| `services/parser/hybrid-document.parser.ts` | 359 | AI + rules hybrid | Document architecture |
| `services/parser/document.parser.ts` | 512 | Legacy fallback | Archive only |
| `services/parser/listening.parser.ts` | ~1000 | Listening-specific | Keep (separate skill) |
| `services/parser/types/ielts.types.ts` | 361 | IELTS type definitions | **Migrate to new schema** |
| `utils/parsers/question-type-detector.ts` | 549 | Rule-based detection | **Migrate patterns** |
| `utils/parsers/aiParser.js` | 808 | Legacy JS parser | Delete |
| `utils/parsers/textParser.js` | 480 | Legacy JS parser | Delete |
| `services/ai/section-extractor.service.ts` | 162 | AI extraction | Refactor for new system |

### 1.5.2 Valuable Code to Preserve

Extract and migrate these proven patterns:

```
FROM ielts.types.ts:
├── TASK_TYPE_PATTERNS (16 regex patterns)
├── WORD_LIMIT_PATTERNS (8 patterns)
├── IELTSTaskType type definition
└── TASK_TYPE_CATEGORIES mapping

FROM question-type-detector.ts:
├── DetectionPattern interface
├── Priority-based pattern matching
├── detectFromSectionContext() logic
└── detectOptionLabelFormat() helper
```

### 1.5.3 Data Cleanup Steps

| Step | Action | Timing |
|------|--------|--------|
| 1 | Export list of all existing tests (for reference) | Before deploy |
| 2 | Notify teachers of migration (if any active tests) | 1 week before |
| 3 | Backup Firestore `tests` collection | Day of deploy |
| 4 | Delete all Reading tests from Firestore | During deploy |
| 5 | Deploy new system | After cleanup |
| 6 | Verify no orphaned data | After deploy |

### 1.5.4 Files to Delete (After Migration)

```
services/parser/
├── parser.router.ts          ← DELETE
├── reading.parser.ts         ← DELETE
├── hybrid-document.parser.ts ← DELETE
├── document.parser.ts        ← DELETE
├── quiz.parser.ts            ← DELETE
├── section.detector.ts       ← DELETE
├── diagnostics.ts            ← DELETE
└── types/
    └── ielts.types.ts        ← MIGRATE then DELETE

utils/parsers/
├── aiParser.js               ← DELETE
├── textParser.js             ← DELETE
└── question-type-detector.ts ← MIGRATE then DELETE

services/ai/
└── section-extractor.service.ts ← REFACTOR
```

### 1.5.5 Files to Keep

```
services/parser/
└── listening.parser.ts       ← KEEP (different skill, separate system)

services/ai/
└── providers/                ← KEEP (AI providers still needed)
    └── hybrid.gemini.provider.ts
```

### 1.5.6 Transition Checklist

- [ ] Document all regex patterns from `ielts.types.ts`
- [ ] Document all detection patterns from `question-type-detector.ts`
- [ ] Export test count and metadata from Firestore
- [ ] Create backup of current `tests` collection
- [ ] Notify affected teachers (if any)
- [ ] Prepare rollback script (restore backup)
- [ ] Verify `listening.parser.ts` has no dependencies on deleted files
- [ ] Run full test suite before deletion

### 1.5.7 Critical Dependencies (NEW - Must Address)

> **WARNING**: The following dependencies MUST be resolved before deleting any parser files.

#### A. Listening Parser Dependency on Deleted Files

```typescript
// listening.parser.ts imports:
import type { IELTSTaskType } from './types/ielts.types'; // ← BEING DELETED!
```

**Solution**: Copy `IELTSTaskType` to `src/types/ielts.types.ts` (global types) before deleting.

#### B. ListeningTestBuilder Uses parserRouter

```typescript
// ListeningTestBuilder.tsx line 15
import { parserRouter } from '../../../services/parser/parser.router';
// Used at lines 464, 600
```

**Solution**: Create `src/services/parser/listening.router.ts` with only listening methods before deleting `parser.router.ts`.

#### C. useTestDocumentParser Hook

```typescript
// hooks/test/useTestDocumentParser.ts line 4
import { readingParser } from '../../services/parser/reading.parser';
// Used in CreateTestPage.tsx
```

**Solution**: This hook will be completely replaced by new `useTestCreation.ts` hook.

#### D. File Extractor Service (Potential Reuse)

Existing `src/services/file-extractor/file.extractor.ts` already handles:
- TXT extraction (via `file.text()`)
- DOCX extraction (via `mammoth`)
- PDF extraction (via `pdfjs-dist`)
- 10MB file size limit

**Decision**: **REUSE** this service instead of creating new `document-converter.service.ts` with LlamaParse. Only add markdown support.

### 1.5.8 Lessons Learned from Current Implementation

> Apply these learnings to make the new system better.

#### ✅ Pattern 1: Priority-Based Detection (ADOPT)

The current `question-type-detector.ts` uses priority scoring:

```typescript
interface DetectionPattern {
  type: QuestionType;
  patterns: RegExp[];
  priority: number;  // Higher = check first
}
// Example: matching-sentence-endings (12) > matching-features (11) > matching-information (9)
```

**Lesson**: Keep this pattern. It resolves conflicts when multiple patterns match.

#### ✅ Pattern 2: Section Context Detection (ADOPT)

The `detectFromSectionContext()` method provides more accurate detection than question-level analysis:

```typescript
// Instruction: "Complete each sentence with the correct ending A-I"
// → Detects matching-sentence-endings with 95% confidence
```

**Lesson**: Always pass section instruction to type classifier, not just question text.

#### ✅ Pattern 3: Option Format Detection (ADOPT)

`detectOptionLabelFormat()` distinguishes between:
- Letter format: A, B, C, D
- Roman numeral format: i, ii, iii, iv (IELTS headings)

**Lesson**: Store `optionLabelFormat: 'letter' | 'roman'` in question schema.

#### ✅ Pattern 4: Type Mapping for Display (ADOPT)

The listening parser maps internal types to display types:

```typescript
const mapToQuestionType = (type: ListeningSectionType): QuestionType => {
  'note-completion' → 'completion',
  'form-completion' → 'completion',
  'map-labelling' → 'diagram-labeling',
  // etc.
}
```

**Lesson**: Have separate internal types (granular) and display types (simplified).

#### ⚠️ Pattern 5: Fallback Logic (IMPROVE)

Current fallback chain:
1. If has blank → `completion`
2. If has options → `multiple-choice`
3. Ultimate fallback → `multiple-choice`

**Problem**: No "uncertain" flag for teacher review.
**New approach**: Instead of silent fallback, flag as `{ type: 'completion', uncertain: true }`.

#### ⚠️ Pattern 6: AI + Rules Hybrid (IMPROVE)

Current architecture:
```
AI (sectionExtractor) → extract sections
Rules (questionTypeDetector) → classify types
```

**Problem**: AI and rules are sequential, no comparison.
**New approach**: Run both in parallel, compare results, flag discrepancies.

#### ❌ Pattern 7: Progress Callbacks (KEEP BUT STANDARDIZE)

Current system has inconsistent progress reporting:
- `onProgress('Detecting...', 10)` - Listening parser
- `onProgress(stage, progress)` - Reading parser

**New approach**: Standardize to `{ stage: string, percent: number, message?: string }`.

### 1.5.9 Test Files to Delete

| Test File | Reason |
|-----------|--------|
| `document.parser.test.ts` | Tests deleted file |
| `diagnostics.test.ts` | Tests deleted file |
| `section.detector.test.ts` | Tests deleted file |
| `aiParser.test.js` | Tests deleted file |
| `textParser.test.js` | Tests deleted file |
| `questionTypeDetector.test.js` | Logic migrated to new classifier |
| `docxParser.test.js` | Not testing new system |
| `pdfParser.test.js` | Not testing new system |

**Keep**: `listening.parser.test.ts` (listening stays)

---

## 2. Goals

| Goal | Metric | Target |
|------|--------|--------|
| **Reduce test creation time** | Time from upload to published test | < 5 minutes |
| **Accuracy** | Correctly identified question types | > 95% |
| **Support all IELTS types** | Question types supported | 16/16 |
| **Teacher satisfaction** | Usability rating | > 4/5 |
| **Reliability** | Successful parse rate | > 90% |

---

## 3. User Stories

### Primary User: Teacher

| ID | User Story | Priority |
|----|------------|----------|
| US-1 | As a teacher, I want to upload a Cambridge IELTS test PDF so that the system creates a complete test automatically | P0 |
| US-2 | As a teacher, I want to paste test content directly so that I don't need to create a file first | P0 |
| US-3 | As a teacher, I want to see uncertain question types highlighted so that I can correct them easily | P0 |
| US-4 | As a teacher, I want to edit questions inline during review so that I don't need to re-upload | P0 |
| US-5 | As a teacher, I want incomplete tests marked as "Draft" so that students can't access unfinished work | P1 |
| US-6 | As a teacher, I want the system to learn from my corrections so that future parsing improves | P2 |
| US-7 | As a teacher, I want automatic answer verification so that I catch errors before publishing | P2 |

---

## 4. Functional Requirements

### 4.1 Input Processing

| ID | Requirement |
|----|-------------|
| FR-1 | System MUST accept `.docx`, `.md`, `.pdf` file uploads |
| FR-2 | System MUST accept plain text paste input |
| FR-3 | System MUST extract text from documents using LlamaParse (for .docx/.pdf) |
| FR-4 | System MUST store extracted text only (not original files) |
| FR-5 | System MUST reject files that are corrupted or unreadable |
| FR-6 | System MUST reject input missing major structure (no passage OR no questions) |

### 4.2 AI Parsing Engine

| ID | Requirement |
|----|-------------|
| FR-7 | System MUST use Gemini 2.5 Flash as primary AI model |
| FR-8 | System MUST fallback to Groq Llama 3.3 70B when Gemini rate-limited |
| FR-9 | System MUST extract: passages, questions, options, answer key, **section instructions** (the instruction text that applies to each question group, e.g., "Do the following statements agree with the information given in Reading Passage 1?") |
| FR-10 | System MUST save parsing progress for resume on failure |
| FR-11 | System MUST auto-retry 3 times on transient failures before aborting |
| FR-12 | System MUST complete parsing within 2 minutes for full IELTS test |

### 4.3 Question Type Detection

| ID | Requirement |
|----|-------------|
| FR-13 | System MUST support all 16 IELTS Reading question types (see Appendix A) |
| FR-14 | System MUST use rule-based pattern matching for type classification |
| FR-15 | System MUST run both AI and rule-based detection and compare results |
| FR-16 | System MUST show side-by-side comparison when AI differs from rules |
| FR-17 | System MUST allow teacher to pick between AI/rule suggestion (with option button) |
| FR-18 | System MUST save original source text to allow teacher to change type later |
| FR-19 | System MUST auto-detect "reuse letters" rule from instruction text (e.g., "NB: You may use...") |
| FR-20 | System MUST default to "no reuse" when instruction text not found |

### 4.4 Data Structures

| ID | Requirement |
|----|-------------|
| FR-21 | System MUST use unified `QuestionSchema.ts` shared between parser and display |
| FR-22 | For table/flowchart questions, System MUST store both original text AND structured JSON |
| FR-23 | For matching questions, System MUST store options list in question metadata |
| FR-24 | System MUST support case-insensitive answer matching (mixed/upper letters allowed) |

### 4.5 Review & Editing

| ID | Requirement |
|----|-------------|
| FR-25 | System MUST show full preview of parsed test |
| FR-26 | System MUST show validation warnings/errors prominently |
| FR-27 | System MUST show sidebar with all uncertain items (confidence < 90%) |
| FR-28 | System MUST allow full inline editing (questions, options, answers) |
| FR-29 | System MUST always ask teacher when answer format is ambiguous (e.g., "A/B") |
| FR-30 | System MUST flag diagram labeling questions for manual image upload |
| FR-31 | System MUST allow placeholder for diagram questions, remind teacher later |

### 4.6 Incomplete Tests

| ID | Requirement |
|----|-------------|
| FR-32 | System MUST allow saving incomplete tests (missing passages/answers) |
| FR-33 | Incomplete tests MUST be marked as "Draft" status |
| FR-34 | System MUST block all teacher actions (assign, share, publish) until test is complete |
| FR-35 | System MUST show clear completion checklist to teacher |

### 4.7 Publishing

| ID | Requirement |
|----|-------------|
| FR-36 | System MUST auto-publish test immediately when complete and saved |
| FR-37 | System MUST run answer key verification in background after save |
| FR-38 | System MUST notify teacher if verification finds issues |

### 4.8 Learning System

| ID | Requirement |
|----|-------------|
| FR-39 | System MUST store all teacher corrections (type, answers, options, passage mapping) |
| FR-40 | System MUST use corrections globally to improve parsing for all teachers |
| FR-41 | System MUST track correction patterns per question type |

### 4.9 Offline/Fallback

| ID | Requirement |
|----|-------------|
| FR-42 | System MUST have rule-based local parsing as fallback when no internet |
| FR-43 | System MUST compare local results with AI when connection restored |
| FR-44 | System MUST warn with detailed report if local vs. AI difference > threshold |

---

## 5. Non-Goals (Out of Scope)

| Non-Goal | Rationale |
|----------|-----------|
| Batch processing (multiple tests at once) | Single test at a time is sufficient for initial release |
| Scanned image files (PNG/JPG of tests) | OCR complexity adds risk; focus on digital documents first |
| Listening test support | Separate skill with different requirements; future phase |
| Template library for patterns | Nice-to-have; can be added later |
| Difficulty estimation | Requires separate AI model; future phase |
| Per-teacher learning patterns | Global learning sufficient for MVP |

---

## 6. Design Considerations

### 6.1 Display Integration

The system integrates with the question type display design documented in:
[IELTS-reading-question-type-display-design.md](file:///c:/Users/The%20Lord/Desktop/Homework%20App/documentation/tasks/IELTS-reading-question-type-display-design.md)

**Unified Schema Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                    QuestionSchema.ts                        │
│  (Shared type definitions for all 16 question types)        │
│  - Defines structure for each type                          │
│  - Includes display hints (dropdown vs chips, inline input) │
│  - Validates parser output                                  │
└─────────────────────────────────────────────────────────────┘
                 ↑                           ↑
                 │                           │
    ┌────────────┴──────────────┐   ┌───────┴────────────────┐
    │       Parser Output       │   │    Display Components   │
    │  (Conforms to schema)     │   │  (Renders from schema)  │
    └───────────────────────────┘   └─────────────────────────┘
```

### 6.2 UI Components (New)

| Component | Purpose |
|-----------|---------|
| `TestUploadWizard` | Entry point: file upload or text paste |
| `ParsingProgressScreen` | Shows extraction progress with stages |
| `ParseReviewPanel` | Full preview with inline editing |
| `UncertainItemsSidebar` | Lists items needing teacher attention |
| `ComparisonModal` | Side-by-side AI vs. rules comparison |
| `CompletionChecklist` | Shows missing parts for incomplete tests |

### 6.3 Shared Components (from Display Design)

| Component | Reused For |
|-----------|------------|
| `InstructionBanner` | Show question instructions during review |
| `OptionSelector` | Configure matching options |
| `InlineInput` | Edit completion question blanks |
| `TFNGSelector` | Configure True/False/Not Given options |

---

## 7. Technical Considerations

### 7.1 AI Model Configuration

| Model | Role | Config |
|-------|------|--------|
| **Gemini 2.5 Flash** | Primary extraction | `gemini-2.5-flash`, temp=0.1, max_tokens=8000 |
| **Groq Llama 3.3 70B** | Fallback | `llama-3.3-70b-versatile`, temp=0.1 |
| **LlamaParse** | Document → Text | Free tier (1000 pages/day) |

### 7.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        TEACHER UI                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Upload/Paste │→ │ Review Panel │→ │ Published Test       │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                     PARSING SERVICE                             │
│  ┌────────────┐   ┌───────────────┐   ┌────────────────────┐    │
│  │ Document   │ → │ AI Extraction │ → │ Rule-Based         │    │
│  │ Converter  │   │ (Gemini/Groq) │   │ Type Classification│    │
│  └────────────┘   └───────────────┘   └────────────────────┘    │
│        ↓                 ↓                      ↓               │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              Comparison & Validation Engine            │     │
│  │  - Compare AI vs. Rules                                │     │
│  │  - Flag discrepancies > threshold                      │     │
│  │  - Generate confidence scores                          │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                  │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ Tests        │  │ CorrectionLog    │  │ ParsingCache     │   │
│  │ (Firestore)  │  │ (Learning Data)  │  │ (Resume Support) │   │
│  └──────────────┘  └──────────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Schema Migration

**Strategy**: Remove all old tests created with legacy parser

> **Warning**: This is a breaking change. All existing tests will be deleted on deploy. Teachers must re-create tests using new system.

### 7.4 Cambridge IELTS Optimization

Parsing patterns optimized for Cambridge IELTS book format:
- Standard section headers ("READING PASSAGE 1", "Questions 1-13")
- Consistent instruction formats
- Known answer key layouts

---

## 8. Success Metrics

| Metric | Measurement | Target | Tracking |
|--------|-------------|--------|----------|
| Parse success rate | Successful parses / Total attempts | > 90% | Analytics |
| Type detection accuracy | Correct types / Total questions | > 95% | Correction log |
| Average parse time | Time from submit to review | < 60s | Performance logs |
| Teacher corrections | Avg corrections per test | < 3 | Correction log |
| Learning improvement | Accuracy improvement over time | +5% monthly | Analytics |

---

## 9. Open Questions

| Question | Status | Notes |
|----------|--------|-------|
| What happens to student results when test schema migrates? | **DECIDED**: Delete all old tests | Clean slate approach |
| Should we support multiple languages? | **DEFERRED** | English only for MVP |
| How long to retain correction logs? | **TBD** | Suggest 1 year |
| Rate limit handling for high-volume schools? | **TBD** | May need paid API tier |

---

## Appendix A: Supported Question Types

| # | Type | Detection Priority |
|---|------|-------------------|
| 1 | Sentence Completion | P0 |
| 2 | Summary Completion (From Text) | P0 |
| 3 | Summary Completion (From List) | P1 |
| 4 | Note Completion | P1 |
| 5 | Table Completion | P1 |
| 6 | Flow-Chart Completion | P2 |
| 7 | Diagram Label Completion | P2 |
| 8 | True / False / Not Given | P0 |
| 9 | Yes / No / Not Given | P0 |
| 10 | Matching Headings | P0 |
| 11 | Matching Information | P1 |
| 12 | Matching Features | P1 |
| 13 | Matching Sentence Endings | P1 |
| 14 | Multiple Choice (Single) | P0 |
| 15 | Multiple Choice (Multiple/List) | P1 |
| 16 | Short Answer | P1 |

---

## Appendix B: Design Decisions Summary

| Question | Choice | Rationale |
|----------|--------|-----------|
| Parsing Architecture | Hybrid (AI + Rules) | Best balance of accuracy and consistency |
| Primary AI Model | Gemini 2.5 Flash | Generous free tier, 1M context |
| Fallback AI Model | Groq Llama 3.3 70B | Fast, free tier available |
| File Storage | Extracted text only | Smaller, faster, sufficient |
| Incomplete Tests | Draft status, block actions | Prevent student access to unfinished |
| Uncertain Items | Sidebar display | Non-intrusive, quick access |
| Answer Ambiguity | Always ask teacher | Avoid assumption errors |
| Learning Scope | Global (all teachers) | Faster improvement |
| Migration Strategy | Delete old tests | Clean slate, no legacy debt |
| Schema Integration | Unified QuestionSchema.ts | Single source of truth |

## 2026-04-10 Runtime Resilience Amendment

- The teacher IELTS Reading creator treats Gemini `503` / `high demand` responses during extraction as transient availability failures and retries across the remaining Gemini keys before it falls back to Groq.
- Groq `413` / `request too large` responses during question extraction are treated as prompt-budget failures rather than exhausted-key failures.
- When the Groq question-extraction request is oversized, the provider retries with smaller output budgets before it benches or rotates the key.
- Offline fallback now accepts markdown-numbered IELTS questions such as `**35.**`, bullet-prefixed numbered items, and `Question 35.` so pasted markdown can still produce reviewable question content.
