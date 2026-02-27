---
title: Test System Architecture
createdAt: '2026-02-27T16:15:16.855Z'
updatedAt: '2026-02-27T16:15:25.953Z'
description: >-
  Complete test lifecycle architecture: IELTS + THCS creation, editing, session
  management, test-taking, grading, results. The single entry point for
  understanding the test system.
tags:
  - architecture
  - test
  - ielts
  - thcs
  - core
---
# Test System Architecture

## Overview

The test system is the core feature of the platform. It supports two test types (IELTS and THCS) across three modes (live session, solo practice, homework). The system spans the full lifecycle: creation → editing → session management → student test-taking → grading → results.

## Test Types

### IELTS Tests (English Proficiency)
- **Reading:** 3 passages, 40 questions, multiple question types
- **Listening:** Multi-part audio-based questions
- **Question types:** Multiple choice, True/False/Yes/No/Not Given, matching, summary completion, gap fill, sentence completion, short answer
- **Scoring:** Band scoring (1.0-9.0), per-question type breakdown
- **Creation:** AI-powered extraction from uploaded documents (PDF, Word)

### THCS Tests (Vietnamese Curriculum)
- **Multi-choice:** Standard A/B/C/D format
- **Fill-in-the-blank:** Text input answers
- **Cloze:** Word bank gap-fill
- **Writing:** Long-form text responses
- **Error identification:** Find and correct errors
- **Pronunciation:** Stress/sound identification
- **Scoring:** Raw score → scaled score (out of 10)
- **Creation:** Manual wizard-based builder with templates

## Architecture — Full Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                    1. TEST CREATION                              │
│                                                                  │
│  IELTS Path:                    THCS Path:                       │
│  TestCreationPage.tsx           THCSTestEditorPage.tsx            │
│  ├── TestUploadWizard           ├── THCSWizardLayout              │
│  ├── TypeClassifierService      ├── THCSSetupStep (metadata)      │
│  ├── AIExtractorService         ├── THCSQuestionsStep (editor)    │
│  ├── ValidationService          ├── THCSAnswerKeyStep             │
│  └── ParseReviewPanel           └── THCSReviewStep (preview)      │
│                                                                  │
│  Output → /tests/{testId} in RTDB                               │
├──────────────────────────────────────────────────────────────────┤
│                    2. TEST EDITING                               │
│                                                                  │
│  IELTS: EditQuizModal.jsx (legacy, 42KB)                        │
│  THCS: THCSTestEditorModal.tsx (tabbed: Context, Questions,     │
│         Answer Key, Settings)                                    │
│                                                                  │
│  Both support: version history, template save/load              │
├──────────────────────────────────────────────────────────────────┤
│                    3. SESSION MANAGEMENT                        │
│                                                                  │
│  Teacher starts session → /sessions/{sessionId} in RTDB         │
│  Session modes:                                                  │
│    • Live (online class) — real-time sync                       │
│    • Offline class — teacher-paced                              │
│    • Solo practice — student self-directed                      │
│    • Homework — teacher-assigned, deadline-based                │
│                                                                  │
│  Key hooks: useMonitorState, useMonitorControls                 │
│  Monitor page: TeacherTestMonitorPage.tsx                       │
├──────────────────────────────────────────────────────────────────┤
│                    4. STUDENT TEST-TAKING                       │
│                                                                  │
│  Router: TestPageRouter.tsx (detects IELTS vs THCS)             │
│                                                                  │
│  IELTS: StudentTestPage.tsx                                     │
│    ├── Passage panel (reading text)                             │
│    ├── Question panel (answer inputs by type)                   │
│    └── Timer (synced with RTDB)                                 │
│                                                                  │
│  THCS: THCSTestLayout.tsx                                       │
│    ├── THCSPassagePanel (context/resources)                     │
│    ├── THCSQuestionRenderer → per-type renderers:               │
│    │   THCSClozeRenderer, THCSFillInRenderer,                   │
│    │   THCSWritingRenderer                                      │
│    ├── THCSSectionNav (section navigation)                      │
│    └── Timer (synced with RTDB)                                 │
│                                                                  │
│  Key hooks: useTestSession, useTestTimer, useTestSubmission     │
├──────────────────────────────────────────────────────────────────┤
│                    5. SUBMISSION & GRADING                      │
│                                                                  │
│  Auto-submit on timer expiry (useTestTimer → onTimeUp)          │
│  Teacher can end test early → autoSubmitAllUnsubmitted()        │
│                                                                  │
│  IELTS: Auto-graded (answer key matching + band calculation)    │
│  THCS: Auto-graded for MC/fill-in, manual for writing          │
│                                                                  │
│  Results saved to: /test_results/{resultId}                     │
│  Indexes: /test_results_by_session/, /test_results_by_student/  │
│                                                                  │
│  ⚠️ Known bug (fixed): Guest detection used to route            │
│     authenticated users to guest_results/ — fixed by            │
│     checking only startsWith('guest_')                          │
│     See @doc/sop/test-end-flow-debug-retrospective              │
├──────────────────────────────────────────────────────────────────┤
│                    6. RESULTS & ANALYTICS                       │
│                                                                  │
│  Teacher view: TeacherTestResultsPage.tsx                       │
│    • Per-student scores, class averages                         │
│    • Question-by-question analysis                              │
│                                                                  │
│  Student view: StudentTestResultsPage.tsx                       │
│    • Score breakdown, band score (IELTS)                        │
│    • Scaled score (THCS)                                        │
│    • TestReviewPage.tsx — detailed answer review                │
│                                                                  │
│  Academic record: AcademicRecordPage → ResultDetailModal        │
│  See @doc/prd/prd-academic-record, @doc/prd/prd-saved-result-system │
└──────────────────────────────────────────────────────────────────┘
```

## Key Files

### Pages
| Page | Purpose |
|------|---------|
| `TestCreationPage.tsx` | IELTS test creation (AI-powered upload) |
| `THCSTestEditorPage.tsx` | THCS test creation (wizard) |
| `TestPageRouter.tsx` | Routes to correct test-taking UI |
| `StudentTestPage.tsx` | IELTS test-taking interface |
| `TeacherTestMonitorPage.tsx` | Teacher live session monitor |
| `TestReviewPage.tsx` | Post-test answer review |

### Components
| Folder | Count | Purpose |
|--------|-------|---------|
| `components/test/` | 39 files | Shared test UI components |
| `components/thcs-editor/` | 31 files | THCS test builder |
| `components/thcs-student/` | 8 files | THCS test-taking renderers |
| `components/thcs-grading/` | 1 file | THCS grading UI |

### Services
| Service | Purpose |
|---------|---------|
| `services/test-creation/type-classifier.service.ts` | Rule-based test type detection |
| `services/test-creation/ai-extractor.service.ts` | AI-powered question extraction |
| `services/test-creation/validator.service.ts` | IELTS validation rules |
| `services/testStorage.ts` | Test CRUD operations |
| `services/resultsService.ts` | Results aggregation |
| `utils/monitor/autoSubmitDisconnected.ts` | Auto-submit unsubmitted students |

### Hooks
| Hook | Purpose |
|------|---------|
| `hooks/test/useTestSession.ts` | Test session state management |
| `hooks/test/useTestTimer.ts` | Timer sync with RTDB |
| `hooks/test/useTestSubmission.ts` | Answer submission pipeline |
| `hooks/test/useTestCreation.ts` | Test creation state machine |
| `hooks/monitor/useMonitorState.ts` | Live monitor state |
| `hooks/monitor/useMonitorControls.ts` | Monitor actions (end test, etc.) |

## Data Flow — RTDB Paths

```
/tests/{testId}                          — Test definition (questions, passages, metadata)
/sessions/{sessionId}                    — Active session state
/sessions/{sessionId}/participants/      — Connected students
/test_results/{resultId}                 — Individual result records
/test_results_by_session/{sessionId}/    — Session → results index
/test_results_by_student/{studentId}/    — Student → results index
/guest_results/{resultId}               — Guest user results (separate bucket)
```

## Known Patterns & Gotchas

### Timer Synchronization
- Timer state lives in RTDB `/sessions/{id}/timer`
- Both teacher and student read same timer
- ⚠️ `TimerDisplay` must NOT render with `totalTime=0` (causes instant `onTimeUp`)
- See @doc/sop/timer-bug-fix-retrospective

### Auto-Submit Pipeline
- Teacher clicks "End Test" → `endFullSession()` in `useMonitorControls`
- Identifies unsubmitted students → `autoSubmitAllUnsubmittedStudents()`
- ⚠️ Guest detection: ONLY use `startsWith('guest_')`, never pattern-match on UID format
- See @doc/sop/test-end-flow-debug-retrospective

### Test Creation Pipeline (IELTS)
- Upload → TypeClassifier (confidence scoring) → AI Extractor if <70% → Validation → Review
- AI uses Gemini primary, Groq fallback
- Checkpoint/resume for long documents
- See @doc/system/project-structure-test-creation

## Related PRDs
- @doc/prd/prd-thcs-phase-1 — THCS test system foundation
- @doc/prd/prd-thcs-phase-2 — THCS live session & monitoring
- @doc/prd/prd-thcs-phase-3 — THCS solo practice & homework
- @doc/prd/prd-test-creation-modal — Unified test creation modal
- @doc/prd/prd-test-duration-end-flow — Timer & end flow redesign
- @doc/prd/prd-automated-ielts-reading — AI-powered IELTS creation

## Related SOPs
- @doc/sop/test-creation-page-analysis — Creation page deep review
- @doc/sop/test-end-flow-debug-retrospective — End flow debugging journey
- @doc/sop/timer-bug-fix-retrospective — Timer bug investigation
- @doc/sop/tfynng-implementation — True/False/Yes/No/Not Given question type
