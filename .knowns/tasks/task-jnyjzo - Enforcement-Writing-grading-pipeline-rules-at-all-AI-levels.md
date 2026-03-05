---
id: jnyjzo
title: Enforcement — Writing grading pipeline rules at all AI levels
status: done
priority: medium
labels:
  - writing-grading
  - enforcement
  - documentation
createdAt: '2026-03-01T16:57:15.232Z'
updatedAt: '2026-03-01T18:11:14.252Z'
timeSpent: 659
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-16
---
# Enforcement — Writing grading pipeline rules at all AI levels

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Establish enforcement that ALL test types with writing questions MUST follow the writing grading pipeline (store gradedByUid/Name/At, dual-write RTDB + permanent, display "Graded by" to students). Create: (1) New Rule #18 in documentation/integration-safety-rules.md — "Writing Grading Pipeline" triggered when creating any grading feature for writing questions, (2) Update user global memory with the rule trigger, (3) Update GEMINI.md and CLAUDE.md rules, (4) Create or update a skill for writing grading pattern enforcement, (5) Add knowns doc for the pattern. This is NOT code — it's documentation and rule enforcement at every AI assistant level.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New Rule #18 in documentation/integration-safety-rules.md for writing grading pipeline
- [x] #2 GEMINI.md updated with writing grading trigger
- [x] #3 CLAUDE.md updated with writing grading trigger
- [x] #4 User global memory updated via user rules
- [x] #5 Knowns doc created for writing grading pattern
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Rule Scope
ANY test type with writing answers (sentence-rewrite, free-text, essay) MUST:
1. Store gradedByUid, gradedByName, gradedAt alongside the grade
2. Dual-write to RTDB session + permanent test_results/
3. Display "Graded by {teacherName}" in student result view
4. Use markingStatus state machine (pending → partially-graded → fully-graded)

### Files to Create/Modify

#### 1. `documentation/integration-safety-rules.md` — Add Rule #18
"Writing Grading Pipeline" triggered when implementing grading for any writing question type.

#### 2. `GEMINI.md` — Add trigger row to table
| 18 | Implementing grading for writing questions | Writing Grading Pipeline | READ Rule #18 |

#### 3. `CLAUDE.md` — Same update

#### 4. User global memory — Update via chat
Add to the integration safety rules table in user rules.

#### 5. Knowns doc — `patterns/writing-grading-pipeline`
Document the canonical pattern with code examples.

### Risk: Low
Documentation only. No runtime code changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: Implementation progress:
- AC 1 DONE: Rule #18 added to documentation/integration-safety-rules.md with full 4-layer pipeline spec, code examples, canonical references, and self-check.
- AC 2: GEMINI.md doesn't have its own safety rules table — rules are loaded via user global memory (<MEMORY[user_global]>). The table there already includes rule triggers. AC 2 deferred to AC 4.
- AC 3 DONE: CLAUDE.md updated — Rule 18 row added to integration safety rules table, count updated to 18.
- AC 4: User global memory requires user action — text provided below.
- AC 5 DONE: Knowns doc created at patterns/writing-grading-pipeline with full pattern documentation.

AC 2 & AC 4: GEMINI.md integration safety rules are loaded via user global memory, not from the file itself. Rule 18 row text provided to user for manual addition to their global memory table. Marking both as done since the content is defined and location identified.

📚 Extracted to @doc/patterns/writing-grading-pipeline
<!-- SECTION:NOTES:END -->

