---
id: vu13lx
title: Redesign External AI Prompt
status: done
priority: high
labels:
  - from-spec-v2
  - foundation
createdAt: '2026-03-04T22:45:46.688Z'
updatedAt: '2026-03-05T01:05:04.222Z'
timeSpent: 1522
assignee: '@me'
spec: specs/ai-pipeline-redesign
fulfills:
  - AC-1
order: 2
---
# Redesign External AI Prompt

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite `thcs-pdf-extraction-prompt.txt` with: `[TYPE: xxx]` tags (20 slugs), remove section name lookup table (AI copies verbatim), targeted formatting rules (not blanket markdown ban), per-type extraction rules (`{{target_word}}`, `[WORD BANK:]`, `(N điểm)`), `reading-announcement` distinction. The prompt should be LEANER than the current one — focused on faithful extraction + visual-only markers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prompt includes all 20 type slug codenames with descriptions
- [x] #2 Section name lookup table removed, verbatim copy instruction added
- [x] #3 Per-type extraction table matches FR-1g
- [x] #4 {{target_word}} convention for synonym/antonym
- [x] #5 [WORD BANK:] instruction for cloze-wordbank
- [x] #6 Point allocation (N điểm) copy instruction
- [x] #7 Blanket markdown ban replaced with targeted formatting rules
- [x] #8 reading-announcement vs reading-comprehension distinction
- [x] #9 Order: 1 (start here)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Target file
`src/services/test-creation/thcs-pdf-extraction-prompt.txt` (198 lines → rewrite)

### Key Design Decisions
- This is the **external/teacher-facing** prompt (teachers paste to ChatGPT/Gemini to extract PDF images to text)
- Output format: **structured plain text** (NOT JSON) — designed for regex parser consumption
- The current 18-line section name lookup table (lines 23-39) forces AI to rename sections → REMOVE, replace with "copy verbatim"
- The blanket markdown ban (line 185) conflicts with **bold**/__underline__ in passages → REPLACE with targeted rules
- Classification rules are currently missing from this prompt — the Engine handles classification, so the external prompt just needs `[TYPE: xxx]` tags

### Changes (section by section)

#### 1. METADATA HEADER (keep as-is)
Lines 5-12 — no change needed.

#### 2. SECTION HEADERS — REWRITE
- Remove the 18-line lookup table (lines 23-39)
- Replace with: "Copy the section name EXACTLY as written in the original document"
- Add instruction: "Append `[TYPE: xxx]` tag at END of each section header line"
- Include the full 20-slug codename table with short descriptions

#### 3. TYPE SLUG TABLE — NEW
Add the 20 type slugs from `THCSQuestionType`:
```
| pronunciation       | underlined part differs in pronunciation |
| word-stress          | primary stress position differs |
| mcq-grammar          | grammar gap-fill MCQ |
| mcq-vocabulary       | vocabulary/phrasal verb MCQ |
| mcq-sign-notice      | sign/notice interpretation |
| dialogue-response    | conversation response selection |
| reading-cloze-mcq    | passage cloze with MCQ per blank |
| reading-comprehension | long passage + MCQ |
| reading-announcement  | short notice/ad + MCQ |
| sentence-arrangement  | arrange sentences in order |
| closest-meaning       | sentence closest in meaning |
| error-identification  | underlined part needing correction |
| synonym-mcq           | CLOSEST in meaning (word) |
| antonym-mcq           | OPPOSITE in meaning (word) |
| word-reference         | pronoun/word reference in passage |
| verb-form             | supply correct verb form |
| word-form             | supply correct word form |
| reading-cloze-wordbank | passage cloze from word bank |
| sentence-rewrite       | rewrite with given start |
| sentence-rewrite-keyword | rewrite using keyword |
```

#### 4. PER-TYPE EXTRACTION RULES — NEW (FR-1g)
Add specific extraction instructions per type:
- pronunciation: `{{underlined_letters}}` in each option
- error-identification: `{{underlined_word_or_phrase}}` in each option
- synonym-mcq / antonym-mcq: `{{tested_word}}` in question text
- reading passages: `**bold**` vocabulary + `__underline__` sentences
- reading-cloze: `(N)______` numbered blanks
- reading-cloze-wordbank: `[WORD BANK: word1 / word2 / ...]`
- sentence-rewrite: `=>` separator
- verb-form / word-form: `(verb)` / `(WORD)` brackets

#### 5. FORMATTING RULES — REWRITE
Replace blanket "Do NOT add markdown" with:
- Inside PASSAGE: blocks: `**bold**` and `__underline__` are REQUIRED
- Outside PASSAGE: blocks: no markdown formatting
- `{{}}` markers for pronunciation/error/synonym/antonym throughout

#### 6. POINT ALLOCATION — NEW (FR-1f)
Add instruction: "If point allocation is visible (e.g., '(2 điểm)'), copy it on the section header line"

#### 7. WORD BANK — NEW (FR-1e)
Add instruction for `[WORD BANK: word1 / word2 / ...]` tag

#### 8. reading-announcement DISTINCTION — NEW (FR-1h)
Add explicit rule: short notices/ads/letters = `[TYPE: reading-announcement]`, long articles = `[TYPE: reading-comprehension]`

#### 9. GENERAL RULES — UPDATE
- Remove "Do NOT add markdown formatting OUTSIDE of PASSAGE: blocks" (already in section 5)
- Keep: verbatim extraction, Vietnamese diacritics, no reordering, no commentary

### What stays the same
- METADATA HEADER format (lines 5-12)
- QUESTIONS FORMAT (lines 48-64) — mostly unchanged
- PRONUNCIATION QUESTIONS (lines 66-77) — keep
- ERROR CORRECTION (lines 79-86) — keep
- READING SECTIONS (lines 88-103) — keep + add {{}} markers
- READING CLOZE (lines 131-150) — keep + add word bank
- FILL-IN (lines 152-159) — keep
- SENTENCE REWRITING (lines 161-168) — keep
- ANSWER KEY (lines 170-182) — keep
- GENERAL RULES (lines 184-196) — update

### Files changed
- `src/services/test-creation/thcs-pdf-extraction-prompt.txt` (REWRITE)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation Notes
- Rewrote `thcs-pdf-extraction-prompt.txt` (198 → 157 lines, leaner)
- Key changes:
  - Removed 18-line section name lookup table → replaced with \"copy verbatim\" + [TYPE: xxx] tag instruction
  - Added full 20-slug type table with descriptions
  - Added per-type extraction rules: {{}} for pronunciation/error/synonym/antonym/word-reference, [WORD BANK:] for cloze-wordbank, (N điểm) for points, => for sentence-rewrite
  - Replaced blanket \"no markdown\" rule → PASSAGE: blocks use **bold**/__underline__, outside uses {{}} only
  - Added reading-announcement vs reading-comprehension distinction with explicit examples
  - Added sentence-rewrite-keyword example
  - NOTE: `thcs-ai-extraction-prompt.txt` (the internal AI JSON prompt) is a SEPARATE file — unchanged here, will be removed in task 8085zl
<!-- SECTION:NOTES:END -->

