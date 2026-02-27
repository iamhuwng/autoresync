---
title: Parser Accuracy Analysis
createdAt: '2026-02-27T15:27:23.710Z'
updatedAt: '2026-02-27T15:27:25.059Z'
description: Accuracy analysis of IELTS parser for Cambridge 10 Test 1
tags:
  - sop
  - parser
  - accuracy
  - analysis
---
# Parser Accuracy Analysis Report

## Test Reference
- **Test ID**: `test-1770275660747-cuau3w4`
- **Title**: IELTS Cambridge Reading Test 1
- **Source Document**: `Cam 10 reading Test 1.docx`
- **Analysis Date**: February 5, 2025

---

## Executive Summary

| Metric | Result | Status |
|--------|--------|--------|
| **Total Questions Parsed** | 40 | ✅ Correct |
| **Total Passages Parsed** | 3 | ✅ Correct |
| **Question Type Accuracy** | ~75% | ⚠️ Issues Found |
| **Answer Key Accuracy** | 100% (sampled) | ✅ Excellent |

### Critical Finding
The parser incorrectly maps **True/False/Not Given** and **Yes/No/Not Given** questions to `multiple-choice` type instead of their dedicated IELTS types.

---

## Source Document Structure

The source document contains 3 reading passages with 40 questions across various IELTS question types:

### Passage 1: Stepwells (Questions 1-13)
| Questions | Expected Type | Description |
|-----------|---------------|-------------|
| Q1-5 | `true-false-not-given` | Statement agreement questions |
| Q6-8 | `short-answer` / `sentence-completion` | ONE WORD ONLY answers |
| Q9-13 | `table-completion` | Complete table with ONE WORD AND/OR A NUMBER |

### Passage 2: European Transport Systems (Questions 14-26)
| Questions | Expected Type | Description |
|-----------|---------------|-------------|
| Q14-21 | `matching-headings` | Match paragraphs A-I to headings i-xi |
| Q22-26 | `true-false-not-given` | Statement agreement questions |

### Passage 3: The Psychology of Innovation (Questions 27-40)
| Questions | Expected Type | Description |
|-----------|---------------|-------------|
| Q27-30 | `multiple-choice` | Choose A, B, C, or D |
| Q31-35 | `sentence-completion-endings` | Match sentence beginnings to endings A-G |
| Q36-40 | `yes-no-not-given` | Writer's claims agreement questions |

---

## Detailed Question Analysis (Questions 1-8)

### Questions 1-5: True/False/Not Given

**Source Instructions:**
> "Do the following statements agree with the information given in Reading Passage 1? In boxes 1-5 on your answer sheet, write:
> - TRUE if the statement agrees with the information
> - FALSE if the statement contradicts the information
> - NOT GIVEN if there is no information on this"

| Q# | Question Text | Expected Type | Parsed Type | Answer | Status |
|----|---------------|---------------|-------------|--------|--------|
| 1 | "Examples of ancient stepwells can be found all over the world." | `true-false-not-given` | `multiple-choice` | FALSE | ❌ Type Wrong |
| 2 | "Stepwells had a range of functions, in addition to those related to water collection." | `true-false-not-given` | `multiple-choice` | TRUE | ❌ Type Wrong |
| 3 | "The few existing stepwells in Delhi are more attractive than those found elsewhere." | `true-false-not-given` | `multiple-choice` | NOT GIVEN | ❌ Type Wrong |
| 4 | "It took workers many years to build the stone steps characteristic of stepwells." | `true-false-not-given` | `multiple-choice` | NOT GIVEN | ❌ Type Wrong |
| 5 | "The number of steps above the water level in a stepwell altered during the course of a year." | `true-false-not-given` | `multiple-choice` | TRUE | ❌ Type Wrong |

### Questions 6-8: Short Answer / Sentence Completion

**Source Instructions:**
> "Answer the questions below. Choose ONE WORD ONLY from the passage for each answer."

| Q# | Question Text | Expected Type | Parsed Type | Answer | Status |
|----|---------------|---------------|-------------|--------|--------|
| 6 | "Which part of some stepwells provided shade for people?" | `short-answer` | `sentence-completion` | pavilions | ✅ Acceptable |
| 7 | "What type of serious climatic event, which took place in southern Rajasthan, is mentioned in the article?" | `short-answer` | `sentence-completion` | drought | ✅ Acceptable |
| 8 | "Who are frequent visitors to stepwells nowadays?" | `short-answer` | `sentence-completion` | tourists | ✅ Acceptable |

---

## Root Cause Analysis

### Issue 1: T/F/NG Detection Failure
The parser does not properly detect True/False/Not Given or Yes/No/Not Given question blocks. Instead, it:
1. Sees questions with multiple answer options (TRUE, FALSE, NOT GIVEN)
2. Incorrectly categorizes them as `multiple-choice`

### Affected Code Location
The detection logic likely resides in:
- `src/services/parser/reading.parser.ts`
- `src/services/parser/hybrid-document.parser.ts`
- AI prompts in `src/services/ai/providers/`

### Detection Patterns Needed
The parser should detect these instruction patterns:
```
"Do the following statements agree with the information..."
"TRUE if the statement agrees..."
"FALSE if the statement contradicts..."
"NOT GIVEN if there is no information..."

"YES if the statement agrees with the claims..."
"NO if the statement contradicts the claims..."
```

---

## Impact Assessment

### User Experience Impact
| Impact | Severity | Description |
|--------|----------|-------------|
| **Question Display** | Medium | Questions may not display the correct T/F/NG UI widget |
| **Scoring** | Low | Answers are still correct, so scoring works |
| **Analytics** | Medium | Question type analytics will be inaccurate |
| **Test Validity** | Low | Students can still answer correctly |

### Technical Debt
- Parser accuracy reporting will show false positives for "multiple-choice"
- Future question-type-specific features won't apply correctly

---

## Recommendations

### Short-term Fixes
1. Add explicit pattern matching for T/F/NG and Y/N/NG question blocks
2. Update AI prompts to specifically identify IELTS question types
3. Add post-processing validation for IELTS tests

### Long-term Improvements
1. Create IELTS-specific parser configuration
2. Add question type confidence scoring
3. Implement user override for question types
4. Add parser accuracy dashboard

---

## Next Steps
- [ ] Complete analysis for Questions 9-40
- [ ] Identify all misclassified question types
- [ ] Create implementation plan for parser fixes
- [ ] Test fixes with multiple IELTS sources

---

## Appendix: Test Data Location

- **Firebase Path**: `tests/test-1770275660747-cuau3w4`
- **Source Document**: `documentation/Cam 10 reading Test 1.docx`
- **Extracted HTML**: `documentation/Cam 10 reading Test 1.html`
