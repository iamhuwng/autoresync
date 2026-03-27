---
title: Quiz Editor Architecture
description: 'IELTS + THCS quiz editors: two-modal pattern, wizard pattern, question types, adaptive layout, AI extraction.'
createdAt: '2026-02-27T16:33:51.435Z'
updatedAt: '2026-03-25T18:08:12.087Z'
tags:
  - architecture
  - quiz
  - editor
  - question-types
---

# Quiz Editor Architecture

## Overview

Two quiz editing systems exist: the legacy IELTS editor (QuizEditor/EditQuizModal) and the THCS editor (THCSTestEditorModal). Both support question creation, editing, and preview, but with different approaches.

## Editors

### IELTS Editor (Legacy)
```
QuizEditor.jsx (Container — 35KB)
├── EditQuizModal.jsx (Question list — 42KB, LARGEST file)
│   ├── Question List (scrollable)
│   ├── Drag-and-drop reordering
│   └── Auto-save
└── QuestionEditorPanel.jsx (Per-question editor)
    ├── Question text, options, answer key
    ├── Image upload (R2)
    └── Question type selector
```
- **Two-modal pattern**: Left modal (question list) + right modal (editor)
- **Dynamic width**: 450px alone → 350px when editor open
- **Legacy glassmorphism styling** (not student view standard)
- See @doc/sop/two-modal-quiz-editor

### THCS Editor (Modern)
```
THCSTestEditorModal.tsx (Container)
├── THCSWizardLayout.tsx (3-step wizard)
│   ├── THCSSetupStep.tsx (metadata, timer, subject)
│   ├── THCSQuestionsStep.tsx (question editor)
│   │   ├── THCSSectionBlock.tsx (sections)
│   │   ├── THCSQuestionBlock.tsx (per-question)
│   │   ├── THCSClozeWordBankBlock.tsx
│   │   ├── THCSFillInBlock.tsx
│   │   ├── THCSWritingBlock.tsx
│   │   └── THCSErrorIdentification.tsx
│   └── THCSReviewStep.tsx (preview)
├── THCSAnswerKeyStep.tsx (answer key panel)
├── THCSSaveTemplateModal.tsx
└── THCSTemplatePicker.tsx
```
- **Wizard pattern**: Setup → Questions → Review
- **31 component files** in `components/thcs-editor/`
- Supports: MC, fill-in, cloze, writing, error identification, pronunciation
- Template save/load system

## Question Types Supported

### IELTS Question Types
| Type | Rendering | Grading |
|------|-----------|---------|
| Multiple choice | Radio buttons | Auto (exact match) |
| True/False/Yes/No/Not Given | Radio buttons | Auto |
| Matching | Drag-and-drop | Auto |
| Summary completion | Dropdown/input | Auto |
| Gap fill | Text input | Auto (fuzzy match) |
| Sentence completion | Text input | Auto |
| Short answer | Text input | Auto |
| Diagram labeling | Text input | Auto |

### THCS Question Types
| Type | Rendering | Grading |
|------|-----------|---------|
| Multiple choice (A/B/C/D) | Radio buttons | Auto |
| Fill-in-the-blank | Text input | Auto |
| Cloze (word bank) | Drag word bank | Auto |
| Writing | Textarea | Manual |
| Error identification | Select errors | Auto |
| Pronunciation | Select stress/sound | Auto |

## Adaptive Layout System

The `useAdaptiveLayout` hook provides intelligent layout for all question types:
- **Font scaling**: Normal → Medium → Small → Compact based on content length
- **Grid columns**: 1-3 based on option count and text length
- **Layout switching**: Horizontal ↔ vertical for matching questions
- See @doc/sop/student-view-adaptive-layout

## AI-Powered Test Creation

For IELTS tests, the AI extraction pipeline:
```
Upload document → TypeClassifierService (confidence scoring)
  → if confidence < 70% → AIExtractorService (Gemini/Groq)
  → ValidationService (IELTS standards)
  → ParseReviewPanel (teacher verification)
```
- Dual AI provider: Gemini primary, Groq fallback
- Checkpoint/resume for long documents
- See @doc/system/project-structure-test-creation

## Related Docs
- @doc/sop/two-modal-quiz-editor — Two-modal IELTS editor implementation
- @doc/sop/deep-review-question-type-display — Question type rendering review
- @doc/sop/drawing-system-complete — Drawing/annotation system
- @doc/prd/prd-summary-completion-editor — Summary completion editor PRD
- @doc/prd/prd-multi-group-summary-completion — Multi-group summary PRD
- @doc/prd/prd-ai-quiz-creation-wizard — AI quiz wizard PRD
- @doc/architecture/test-system-architecture — Test system (parent doc)

## Reading Review Contract (2026-03-26)

The Reading review/editor flow now distinguishes between two families of answer choices:
- label-bearing option tasks such as `matching-headings` and `summary-completion-list`, edited as `labeledOptions`
- section-reference tasks such as `matching-information`, edited as `sectionReferences`

### Review Behavior
- Review exposes label and text separately so source labels such as `ii`, `iv`, and `ix` are preserved as authored content.
- Publish is blocked when a Reading group mixes labeled and unlabeled entries, repeats labels, or leaves canonical fields empty.
- Preview semantics match the student runtime: question numbers come from `number`, labels come from stored fields, and the editor does not rely on `text || label` fallbacks.

### Feature State
- `matching-information` no longer shares the generic labeled-option renderer path.
- Canonical Reading labels are displayed once in review and once in the student runtime.
- The intended contract targets newly created and newly reviewed Reading tests on this branch.
