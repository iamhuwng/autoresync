---
title: THCS Parser Robustness Fixes
createdAt: '2026-03-01T18:32:40.428Z'
updatedAt: '2026-03-01T18:32:40.428Z'
description: >-
  Specification for fixing 7 identified THCS parsing failures: AI hallucination,
  missing sub-sections, answer key limitations, and more
tags:
  - spec
  - draft
  - thcs
  - parser
  - ai
---
## Overview

The THCS AI-first parsing pipeline has 7 identified failure modes discovered from parsing a real test document (THPT Chuyên Lam Sơn 2025-2026, 50 questions). The parser produced incorrect output: only 39 questions detected, 11 missing, fabricated MCQ options for fill-in-blank questions, collapsed sub-sections, and broken answer key mapping for non-MCQ types.

This spec covers all fixes needed to make the parser handle the full range of Vietnamese THCS/THPT test formats reliably.

## Source Files

| File | Role |
|------|------|
| `src/services/test-creation/thcs-ai-extraction-prompt.txt` | AI extraction prompt template |
| `src/services/test-creation/thcsDocumentParser.service.ts` | Main parser service (1359 lines) |
| `src/components/thcs-editor/THCSParseReviewPanel.tsx` | Review UI (290 lines) |

## Requirements

### Functional Requirements

- FR-1: **Non-MCQ Option Stripping** — When the AI returns options for question types that are inherently fill-in-blank (`verb-form`, `word-form`, `sentence-rewrite`, `sentence-rewrite-keyword`), the post-processing layer MUST strip those options and leave `options: []`.
- FR-2: **Sub-Section Detection** — When a section (e.g., \"PART B: GRAMMAR AND VOCABULARY\") contains multiple sub-instruction blocks with Roman numeral headers (I., II., III.) and different instruction texts, the parser MUST split them into separate sections with correct types.
- FR-3: **Full-Text Answer Key Support** — The answer key extraction MUST support full-sentence answers (not just single letters A-H) for writing/fill-in question types. Example: `\"6\": \"goes\"`, `\"41\": \"Camping is not as expensive as staying in a hotel.\"`
- FR-4: **Conditional Answer Normalization** — `toUpperCase()` MUST only be applied to single-letter answers (`/^[A-H]$/i`). Full-text answers must preserve original casing.
- FR-5: **Word Bank Classification** — Instruction text containing \"word in the box\", \"word bank\", \"suitable word\", \"từ cho sẵn\" MUST be classified as `reading-cloze-wordbank` (not `reading-comprehension`).
- FR-6: **Orphaned Answer Key Detection** — When the answer key references question numbers that don't exist in any parsed section, emit a warning: \"Answer key references questions X-Y but no matching questions found. The pasted text may be incomplete.\"
- FR-7: **Debug Summary Fix** — The \"Copy Summary\" button in THCSParseReviewPanel must use `data.sections` (not `data.questions`) to avoid showing \"undefined\".

### Non-Functional Requirements

- NFR-1: All fixes must work for both the AI-first pipeline AND the regex fallback pipeline.
- NFR-2: No new npm dependencies.
- NFR-3: Post-processing validation must not increase parse time by more than 50ms.
- NFR-4: No Mantine imports in any new or modified code (existing Mantine in THCSParseReviewPanel is legacy — don't add more).

## Acceptance Criteria

- [ ] AC-1: Given a test with `verb-form` questions (fill-in-blank, no original options), the parsed result has `options: []` for those questions — no AI-fabricated distractors.
- [ ] AC-2: Given a test with `word-form` questions (\"Supply correct form of the word\"), the parsed result has `options: []` and `correctAnswer` set to the text answer (e.g., \"collector\").
- [ ] AC-3: Given a test where Part B has sub-sections I (verb-form), II (word-form), III (mcq-grammar), the parser produces 3 separate sections with correct `detectedType` for each.
- [ ] AC-4: Given an answer key with full-sentence writing answers (e.g., `41. Camping is not as expensive as staying in a hotel.`), those answers are extracted and mapped to the corresponding writing questions.
- [ ] AC-5: Single-letter answers (A-H) are uppercased; full-text answers preserve original casing.
- [ ] AC-6: A passage with \"Choose the most suitable word in the box\" is classified as `reading-cloze-wordbank`, not `reading-comprehension`.
- [ ] AC-7: When answer key has entries for questions 30-40 but no matching questions exist, a warning is displayed in the review panel.
- [ ] AC-8: The \"Copy Summary\" debug button produces valid text without \"undefined\".
- [ ] AC-9: The Lam Sơn test document (50 questions, 4 parts with sub-sections) parses successfully with all sections correctly typed and all available answers mapped.

## Scenarios

### Scenario 1: Fill-In-Blank Questions (Happy Path)
**Given** a THCS test with questions 6-10 under instruction \"Supply the correct form of the verbs in brackets\"
**When** the parser processes the text
**Then** questions 6-10 have `type: \"verb-form\"`, `options: []`, and `correctAnswer` set to the verb-form answer (e.g., \"goes\")

### Scenario 2: Mixed Sub-Sections
**Given** a section \"PART B: GRAMMAR AND VOCABULARY\" containing sub-sections I (verb-form, Q6-10), II (word-form, Q11-15), III (MCQ, Q16-25)
**When** the parser processes the text
**Then** 3 separate sections are produced: \"Supply correct form of verbs\" (verb-form), \"Supply correct form of words\" (word-form), \"Choose the best answer\" (mcq-grammar)

### Scenario 3: Incomplete Paste Detection
**Given** a test where only Part A and Part B were pasted, but the answer key includes answers for questions 30-40
**When** the parser completes
**Then** a warning reads: \"Answer key references questions 30-40 but no matching questions were found. The pasted text may be incomplete.\"

### Scenario 4: Word Bank Passage
**Given** a reading section with instruction \"Choose the most suitable word in the box to fill in each gap\" and a word list `major | biodiversity | that | with | identified`
**When** the parser classifies the section type
**Then** the section is typed as `reading-cloze-wordbank` with the word list preserved

### Scenario 5: Writing Answer Key
**Given** a writing section (Q41-50) with rewrite answers in the answer key section
**When** the parser extracts the answer key
**Then** each writing question has `correctAnswer` set to the full rewrite sentence

## Technical Notes

### Files to modify:
1. **`thcs-ai-extraction-prompt.txt`** — Add non-MCQ example, sub-section splitting rule, word bank instruction
2. **`thcsDocumentParser.service.ts`** — Modify `validateAIResult()` for option stripping, `extractAnswerKey()` for full-text support, add orphaned answer detection, fix uppercase logic
3. **`THCSParseReviewPanel.tsx`** — Fix debug summary template string
4. **`INSTRUCTION_TYPE_MAP`** in thcsDocumentParser — Add `reading-cloze-wordbank` pattern

### Integration Safety Rules triggered:
- Rule #17 (Producer-Consumer Contract): Answer key format change affects downstream grading
- Rule #9 (Codebase-Wide Grep): \"options\" stripping must not break existing MCQ question rendering

## Open Questions

- [ ] Should the parser attempt to auto-detect incomplete pastes before sending to AI (by checking question number continuity)?
- [ ] Should we add a \"Re-parse\" button that allows teachers to paste missing sections and merge results?
- [ ] For fill-in answers with multiple valid forms (e.g., \"hasn't spoken / has not spoken\"), should we store all variants or just the first?
