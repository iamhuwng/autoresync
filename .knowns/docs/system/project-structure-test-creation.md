---
title: Project Structure Test Creation
createdAt: '2026-02-27T15:25:51.308Z'
updatedAt: '2026-02-27T15:25:52.603Z'
description: Project structure and patterns for the test creation system
tags:
  - project-structure
  - test-creation
  - architecture
---
# Project Structure - Test Creation Module

> Last Updated: 2026-02-06
> PRD Reference: PRD-0020 - Automated IELTS Reading Test Creation

## Overview

This document describes the architecture of the test creation module after the PRD-0020 refactor. The new architecture separates concerns into specialized services with a clean pipeline flow.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Test Creation Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ TestUploadWizard │ ─► │ ParsingProgress  │                   │
│  │     (Upload)     │    │    (Progress)    │                   │
│  └──────────────────┘    └────────┬─────────┘                   │
│                                   │                              │
│                                   ▼                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    TypeClassifierService                   │ │
│  │  • detectTestType() - IELTS/TOEFL/Cambridge                │ │
│  │  • analyzeQuestionTypes() - Multiple choice, completion... │ │
│  │  • Rule-based confidence scoring                           │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                               │                                  │
│                    ┌──────────┴──────────┐                      │
│                    │ confidence >= 70%?  │                      │
│                    └──────────┬──────────┘                      │
│                       Yes │        │ No                          │
│                           ▼        ▼                             │
│  ┌────────────────────┐    ┌────────────────────┐              │
│  │  Rule-Based Parse  │    │  AIExtractorService │              │
│  │     (Direct)       │    │  • Gemini/Groq AI   │              │
│  └─────────┬──────────┘    │  • Checkpoint/Resume│              │
│            │               │  • Fallback support │              │
│            │               └─────────┬──────────┘              │
│            └──────────┬──────────────┘                          │
│                       ▼                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   ValidationService                        │ │
│  │  • validatePassages() - IELTS passage requirements         │ │
│  │  • validateQuestions() - Question structure & answers      │ │
│  │  • calculateConfidence() - Overall parsing confidence     │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                               ▼                                  │
│  ┌───────────────────┐    ┌──────────────────┐                  │
│  │ ParseReviewPanel  │ ─► │ UncertainItems   │                  │
│  │ (Teacher Review)  │    │    Sidebar       │                  │
│  └───────────────────┘    └──────────────────┘                  │
│                               │                                  │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  CompletionChecklist                       │ │
│  │  • Passage validation complete?                            │ │
│  │  • All questions reviewed?                                 │ │
│  │  • Answer keys verified?                                   │ │
│  └───────────────────────────┬────────────────────────────────┘ │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    TestCreatorService                      │ │
│  │  • saveTest() - Persist to Firestore                       │ │
│  │  • updateTest() - Edit existing tests                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── services/
│   ├── test-creation/           # PRD-0020 New Services
│   │   ├── type-classifier.service.ts    # Detect test/question types
│   │   ├── ai-extractor.service.ts       # AI-powered extraction
│   │   ├── validator.service.ts          # Validation rules
│   │   └── *.test.ts                     # Unit tests
│   │
│   ├── parser/                  # Parser Services
│   │   ├── listening.parser.ts           # Listening test parser
│   │   ├── listening.router.ts           # Router for listening
│   │   └── types/                        # Shared parser types
│   │
│   └── ai/                      # AI Provider Services
│       ├── router.service.ts             # Provider selection
│       ├── gemini.provider.ts            # Gemini implementation
│       └── groq.provider.ts              # Groq fallback
│
├── hooks/
│   └── test/                    # Test Creation Hooks
│       ├── useTestCreation.ts            # Main state management
│       ├── useParsingProgress.ts         # Progress tracking
│       ├── useCreateTestForm.ts          # Form state (legacy)
│       └── useTestSaver.ts               # Save operations (legacy)
│
├── components/
│   └── test/                    # Test Creation UI
│       ├── TestUploadWizard.tsx          # Upload interface
│       ├── ParsingProgressScreen.tsx     # Progress display
│       ├── ParseReviewPanel.tsx          # Teacher review
│       ├── UncertainItemsSidebar.tsx     # Low-confidence items
│       ├── ComparisonModal.tsx           # Before/after comparison
│       └── CompletionChecklist.tsx       # Final validation
│
├── pages/
│   ├── TestCreationPage.tsx     # PRD-0020 Reading test builder
│   ├── TestBuilderRouter.tsx    # Routes to skill builders
│   └── CreateTestPage.tsx       # Legacy (deprecated)
│
└── utils/
    └── parsers/                 # Legacy Stubs (deprecated)
        ├── textParser.js                 # Stub for BulkQuestionCreator
        └── aiParser.js                   # Stub for AIParserSettings
```

---

## Service Responsibilities

### TypeClassifierService (`type-classifier.service.ts`)

**Purpose:** Rule-based detection of test types and question types.

**Key Methods:**
- `detectTestType(text)` - Returns IELTS/TOEFL/Cambridge with confidence
- `analyzeQuestionTypes(text)` - Detects question type distribution
- `shouldTriggerAI(confidence)` - Determines if AI fallback is needed

**Design Decisions:**
- Uses regex patterns for instant classification
- Returns confidence scores (0-100)
- AI fallback threshold: 70%

---

### AIExtractorService (`ai-extractor.service.ts`)

**Purpose:** AI-powered extraction when rule-based parsing has low confidence.

**Key Methods:**
- `extractReadingTest(text, options)` - Full extraction with checkpoints
- `resumeFromCheckpoint(checkpointId)` - Resume interrupted parsing
- `getActiveCheckpoints()` - List available checkpoints

**Features:**
- Checkpoint/resume capability for long documents
- localStorage persistence for browser refresh recovery
- Dual-provider support (Gemini primary, Groq fallback)
- Progress callbacks for UI updates
- Timeout handling (30s default)

---

### ValidationService (`validator.service.ts`)

**Purpose:** Validate parsed content against IELTS standards.

**Key Methods:**
- `validatePassages(passages)` - Check word count, structure
- `validateQuestions(questions)` - Check answer keys, types
- `validateFullTest(test)` - Complete validation with scoring

**Validation Rules:**
- Passages: 750+ words, proper structure
- Questions: 40 total for IELTS, valid answer keys
- Confidence: Weighted scoring across all fields

---

## Hook Responsibilities

### useTestCreation (`useTestCreation.ts`)

**Purpose:** Central state management for test creation flow.

**State:**
- Current step (upload, parsing, review, complete)
- Parsed data (passages, questions, metadata)
- Validation status

**Actions:**
- `startParsing(file)` - Begin parsing pipeline
- `updateQuestion(id, data)` - Edit parsed question
- `saveTest()` - Persist to Firestore

---

### useParsingProgress (`useParsingProgress.ts`)

**Purpose:** Track parsing progress with visualization support.

**Features:**
- Stage-based progress (extract, classify, validate)
- Error/warning tracking
- Estimated time remaining

---

## Deprecated Components

The following files are deprecated stubs kept for backward compatibility:

| File | Reason | Replacement |
|------|--------|-------------|
| `CreateTestPage.tsx` | Replaced by TestCreationPage | `TestCreationPage.tsx` |
| `textParser.js` | Used by BulkQuestionCreator | `TypeClassifierService` |
| `aiParser.js` | Used by AIParserSettings | `AIExtractorService` |
| `useTestDocumentParser.ts` | Deleted | `useTestCreation.ts` |

---

## Migration Notes

### For Developers

1. **New test creation features** should use `TestCreationPage.tsx` and the new hooks
2. **AI parsing** should use `AIExtractorService` directly or via `useTestCreation`
3. **Question type detection** should use `TypeClassifierService`
4. **Listening tests** continue to use `listening.parser.ts` (unchanged)

### File Deletions (PRD-0020)

The following legacy files were deleted:
- `parser.router.ts` - Replaced by skill-specific routers
- `reading.parser.ts` - Replaced by test-creation services
- `document.parser.ts` - Replaced by test-creation services
- `useTestDocumentParser.ts` - Replaced by useTestCreation

---

## Testing

```bash
# Run all test-creation tests
npx vitest run src/services/test-creation

# Run specific service tests
npx vitest run src/services/test-creation/validator.service.test.ts
npx vitest run src/services/test-creation/ai-extractor.service.test.ts
```

---

## Related Documentation

- [PRD-0020: Automated IELTS Reading Test Creation](../tasks/0020-prd-automated-ielts-reading-test-creation.md)
- [Task List](../tasks/tasks-0020-prd-automated-ielts-reading-test-creation.md)
