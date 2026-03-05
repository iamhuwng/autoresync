---
title: AI Formative Assessment Feedback
createdAt: '2026-03-04T21:14:09.968Z'
updatedAt: '2026-03-04T21:24:26.265Z'
description: >-
  Specification for auto-generating topic-level formative feedback after THCS
  test auto-marking, including per-question AI explanations
tags:
  - spec
  - approved
---
## Overview

After a THCS test is auto-marked by `markThcsTest()`, the system generates a comprehensive **AI-powered formative assessment feedback** that:

1. **Classifies each question** into its specific grammar/vocabulary/phonetics topic (e.g., "Past Simple Passive Voice", not just "Grammar")
2. **Generates per-question explanations** for every wrong answer (why the student's choice is incorrect + why the correct answer is right)
3. **Produces a narrative feedback summary** organized into strengths, areas for revision, and critical knowledge gaps

The feedback is stored alongside the test result and displayed in the Student's Results view — below the score and above the question review.

### Motivation

- Current system shows only a score and correct/incorrect markers
- Teachers rarely write explanations for all 40 questions manually
- Students leave with no understanding of *why* they got answers wrong
- The `intentBreakdown` (from auto-marking) only distinguishes "Grammar" vs "Vocabulary" — it cannot identify specific topics like "Conditionals Type 2" vs "Passive Voice"

### Architecture

Single Gemini 2.5 Flash API call that receives all question texts + student answers + correct answers and returns:
- Per-question topic tags
- Per-question explanations (wrong answers only)
- Narrative feedback (strengths / revision / critical)

Deterministic bucketing (using `intentBreakdown`) runs instantly as a fallback if AI is unavailable.

---

## Requirements

### Functional Requirements

- FR-1: After auto-marking completes, generate formative feedback asynchronously (non-blocking)
- FR-2: Deterministic analysis (intent-level bucketing into strengths/revision/critical) MUST run instantly and always succeed
- FR-3: AI call (Gemini 2.5 Flash) classifies each question into a specific topic (e.g., "Present Perfect vs Past Simple", "Passive Voice", "Subject-Verb Agreement")
- FR-4: AI generates a per-question explanation for each **wrong** answer that includes: (a) why the chosen answer is wrong, (b) what the correct answer is and why, (c) the relevant grammar/vocabulary rule
- FR-5: AI generates a narrative feedback with 4 sections: summary, strengths, revision needed, critical gaps
- FR-6: Teacher-written explanations take priority over AI-generated explanations (if `question.explanation?.text` exists, show it instead)
- FR-7: Feedback is stored in RTDB under the existing test result record
- FR-8: Feedback is displayed in `StudentTestResultsPage` below the score section, above the question pills grid
- FR-9: Per-question AI explanations are displayed in `THCSQuestionRenderer` review mode, in the existing explanation slot
- FR-10: If the AI call fails, the system gracefully falls back to deterministic feedback (intent-level only, no per-question explanations)
- FR-11: If all Gemini API keys are exhausted/rate-limited, fall back to Groq (Llama 3.3 70B) using the same prompt and expected JSON schema before falling back to deterministic-only
### Non-Functional Requirements

- NFR-1: AI call should complete within 5 seconds for a 40-question test
- NFR-2: Total input + output tokens should stay under 10,000 tokens per call
- NFR-3: No new RTDB nodes — feedback stored as a child property of the existing result
- NFR-4: Backward compatible — old results without feedback render normally
- NFR-5: AI explanations should be in English, addressing the student directly ("you")
- NFR-6: Must use existing Gemini provider infrastructure (API key rotation, error handling)

---

## Acceptance Criteria

- [x] AC-1: After auto-marking a THCS test, formative feedback is generated and stored in the result record
- [x] AC-2: The deterministic analysis (intent-level bucketing) produces correct strengths/revision/critical groupings based on percentage thresholds (≥80% / 50-79% / <50%)
- [x] AC-3: The AI call returns a per-question topic tag for all questions (e.g., `{ topic: "Passive Voice (Past Simple)", category: "Voice" }`)
- [x] AC-4: The AI call returns a per-question explanation for each wrong answer
- [x] AC-5: The narrative feedback contains summary, strengths, revision, and critical sections with question number references
- [x] AC-6: When a teacher-written explanation exists, it is shown instead of the AI explanation
- [x] AC-7: When the AI call fails, the deterministic feedback is shown and no error is exposed to the student
- [x] AC-8: The FormativeFeedbackPanel is visible in StudentTestResultsPage below the score
- [x] AC-9: Per-question AI explanations appear in THCSQuestionRenderer review mode for wrong answers
- [x] AC-10: Existing test results without feedback continue to render without errors
- [x] AC-11: When all Gemini API keys are exhausted, Groq is attempted with the same prompt before falling back to deterministic-only
## Scenarios

### Scenario 1: Happy Path — AI Succeeds
**Given** a student submits a 40-question THCS test
**When** `markThcsTest()` completes and triggers feedback generation
**Then** the system:
1. Instantly computes deterministic bucketing (intent-level)
2. Sends all questions + results to Gemini 2.5 Flash
3. Receives topic tags, per-question explanations, and narrative feedback
4. Stores all data in the result record
5. Student sees the FormativeFeedbackPanel with strengths/revision/critical
6. Student sees AI explanations on each wrong question in review mode

### Scenario 2: AI Fails — Graceful Fallback
**Given** the Gemini API is unavailable or returns an error
**When** feedback generation runs
**Then** the system:
1. Still shows the deterministic feedback (intent-level groupings)
2. No per-question explanations are shown (falls back to teacher explanations if any)
3. No error message is shown to the student
4. A console warning is logged for debugging

### Scenario 3: Teacher Explanation Priority
**Given** a teacher wrote an explanation for Q5 during test creation
**And** the AI also generated an explanation for Q5
**When** the student reviews Q5 in review mode
**Then** the teacher's explanation is displayed (not the AI's)

### Scenario 4: Perfect Score
**Given** a student gets 40/40 correct
**When** feedback is generated
**Then** all questions go to the "strengths" bucket, no "revision" or "critical" sections appear, and no per-question explanations are generated (all correct)

### Scenario 5: Existing Results Without Feedback
**Given** a test result was created before this feature was deployed
**When** the student views their old result
**Then** the page renders normally without the feedback panel (no errors)

### Scenario 6: Gemini Keys Exhausted — Groq Fallback
**Given** all Gemini API keys are rate-limited or exhausted
**When** feedback generation attempts the AI call
**Then** the system:
1. Detects Gemini failure (all keys exhausted)
2. Falls back to Groq (Llama 3.3 70B) with the same prompt and JSON schema
3. Groq returns topic tags, explanations, and narrative
4. Feedback is stored with `aiModel: "groq-llama-3.3-70b"`
5. Student sees feedback identical in quality to Gemini-generated

### Scenario 7: Both AI Providers Fail
**Given** all Gemini keys AND all Groq keys are exhausted or failing
**When** feedback generation runs
**Then** the system:
1. Falls back to deterministic-only feedback (intent-level bucketing)
2. No per-question AI explanations are shown
3. Teacher-written explanations still appear if they exist
4. No error exposed to student; console warning logged
## Technical Notes

### Data Available After Auto-Marking
- `THCSGradingResult`: `totalPoints`, `maxPoints`, `scaledScore`, `sectionResults`, `questionResults`
- `SectionResult.intentBreakdown`: `{ "mcq-grammar": { correct: 2, total: 4 } }`
- `QuestionResult`: `isCorrect`, `pointsEarned`, `studentAnswer`, `correctAnswer`
- `THCSQuestion`: `questionText`, `options`, `type`, `intent`, `explanation`
- `THCSTestMetadata`: `gradeLevel`, `title`

### AI Model
- **Primary**: `GeminiProvider` (existing in `src/services/ai/gemini.provider.ts`) — Model: `gemini-2.5-flash`
- **Fallback**: `GroqProvider` (existing in `src/services/ai/groq.provider.ts`) — Model: Llama 3.3 70B Versatile
- Both use the same prompt and expect the same JSON output schema
- Fallback chain: **Gemini → Groq → Deterministic-only**
- Output: `responseMimeType: 'application/json'` (Gemini) / JSON-instructed prompt (Groq)
- Temperature: 0.2 (low for consistency, slightly higher than parsing's 0.1 for natural tone)

### AI Prompt Design
The AI receives ALL question texts + student answers + correct answers in a single call and produces a structured JSON response with three fields:
- `questionTopics`: per-question topic classification for ALL questions — `Record<string, { topic: string, category: string }>`
- `questionExplanations`: per-question explanations for WRONG answers only — `Record<string, string>`
- `feedback`: narrative feedback object — `{ summary, strengths, revision, critical }`

Full prompt template with SYSTEM/USER format, example JSON output, and 8 generation rules: see conversation artifact `formative_feedback_research.md` Section 3.6.

### Topic Taxonomy (AI-Inferred)
The AI classifies each question into granular topics, not just broad intent categories. Expected categories for Vietnamese THCS English exams include:
- **Grammar** (16 categories): Tenses (10 types), Voice, Conditionals (5 types), Reported Speech, Clauses, Comparisons, Articles, Agreement, Modals, Gerunds & Infinitives, Prepositions, Connectors, Word Order, Tag Questions, Wish/If only
- **Vocabulary** (6 categories): Word Formation, Phrasal Verbs, Collocations, Idioms, Topic Vocabulary, Synonyms/Antonyms
- **Phonetics** (5 categories): Vowel Sounds, Consonant Sounds, Stress Patterns, -ed Endings, -s Endings

Full taxonomy with specific subtopics: see conversation artifact `formative_feedback_research.md` Section 3.5.

### Storage Location
- Path: `test_results/{resultId}` — add `formativeFeedback` property
- Type: `FormativeFeedback` interface (new)
- Optional field — null/undefined for old results

### FormativeFeedback Storage Schema
```typescript
interface FormativeFeedback {
    analysis: {
        strengths: SkillAnalysis[];
        revision: SkillAnalysis[];
        critical: SkillAnalysis[];
    };
    questionTopics?: Record<string, { topic: string; category: string }>;
    questionExplanations?: Record<string, string>;
    aiFeedback?: { summary: string; strengths: string; revision: string; critical: string };
    aiModel?: string;
    deterministicFeedback: string;
    generatedAt: number;
    totalCorrect: number;
    totalQuestions: number;
    scaledScore: number;
}

interface SkillAnalysis {
    intent: THCSQuestionType;
    skillName: string;
    correct: number;
    total: number;
    percentage: number;
    questionNumbers: number[];
    wrongQuestionNumbers: number[];
}
```

### Key Files
| File | Role |
|------|------|
| **NEW** `src/services/formativeFeedback.service.ts` | Deterministic analysis + AI orchestration |
| **NEW** `src/components/results/FormativeFeedbackPanel.tsx` | UI: overall feedback display |
| **MODIFY** `src/types/thcs-test.types.ts` | Add `FormativeFeedback` interface |
| **MODIFY** `src/services/thcsAutoMarking.service.ts` or caller | Trigger feedback generation after marking |
| **MODIFY** `src/pages/StudentTestResultsPage.tsx` | Integrate FormativeFeedbackPanel |
| **MODIFY** `src/components/thcs-student/THCSQuestionRenderer.tsx` | Show AI explanations in review mode |
| **MODIFY** `src/services/testResults.service.ts` | Save/load feedback with result |

### Intent-to-Skill Mapping (for deterministic fallback)
```
pronunciation → Phonetics: Pronunciation
word-stress → Phonetics: Word Stress
mcq-grammar → Grammar
mcq-vocabulary → Vocabulary
dialogue-response → Communication: Dialogue Responses
reading-comprehension → Reading: Comprehension
reading-cloze-mcq → Reading: Cloze
error-identification → Grammar: Error Identification
synonym-mcq → Vocabulary: Synonyms
antonym-mcq → Vocabulary: Antonyms
verb-form → Grammar: Verb Forms
word-form → Vocabulary: Word Forms
sentence-rewrite → Writing: Sentence Rewriting
sentence-rewrite-keyword → Writing: Keyword Rewriting
closest-meaning → Grammar: Sentence Meaning
sentence-arrangement → Writing: Sentence Arrangement
reading-announcement → Reading: Announcements
reading-cloze-wordbank → Reading: Cloze (Word Bank)
word-reference → Reading: Word Reference
mcq-sign-notice → Reading: Signs & Notices
```
## Open Questions

- [x] Should AI feedback be in English or Vietnamese? → **English** (matches test language)
- [x] Should correct answers also get topic tags? → **Yes** (for the strengths section narrative)
- [x] Single AI call or two? → **Single call** (topic tags + explanations + narrative all at once)
- [ ] Should the feedback be regenerable? (e.g., teacher clicks "Regenerate Feedback") → TBD
- [ ] Should this also work for IELTS Reading/Listening tests? → Future scope
