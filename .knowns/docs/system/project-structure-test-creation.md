---
title: Project Structure Test Creation
description: Project structure and patterns for the test creation system
createdAt: '2026-02-27T15:25:51.308Z'
updatedAt: '2026-03-25T18:08:12.139Z'
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

- `TypeClassifierService`: Detects IELTS task types, question ranges, and section boundaries. It does not invent display labels.
- `AIExtractorService`: Extracts raw question content from uploaded material. It may still return flat Reading strings from source content, but those strings are not the persisted Reading contract.
- `ValidationService`: Enforces the canonical Reading contract before draft save and publish. It strips only matching leading question numbers, decomposes labeled option strings into `{ label, text }`, routes `matching-information` into `sectionReferences`, and rejects mixed, duplicate, or malformed groups.
- `readingQuestionContract` utilities are the shared boundary between extraction, review, storage, and runtime. New Reading option-bearing task types should plug into this contract instead of adding renderer-side label heuristics.

## Hook Responsibilities

- `useTestCreation`: Owns orchestration from upload through classification, extraction, review preparation, draft save, and publish. For Reading drafts it now passes merged questions through the canonical Reading contract so storage and review receive structured fields instead of raw display strings.
- `useParsingProgress`: Reports pipeline progress only. It must remain presentation-only and must not mutate question content or infer label formats.
- Review state managed by `TestReviewPage` and `ParseReviewPanel` is expected to edit canonical Reading fields such as `questionText`, `labeledOptions`, and `sectionReferences` rather than newline-packed raw option strings.

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
