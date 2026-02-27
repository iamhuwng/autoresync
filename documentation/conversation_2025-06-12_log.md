# Conversation Log - 2025-06-12

## 1. IELTS Reading Test Creation - Diagnostic Review (Continued from previous session)

### Request
Continue systematic diagnosis of low question type detection accuracy and extracted content quality in the IELTS Reading test creation feature (PRD-0020).

### Investigation Summary
Analyzed the complete data pipeline from AI extraction through type classification to validation.

### Critical Bugs Found (3 Critical, 2 High)
1. **[CRITICAL] `instructions` field never populated** - AI doesn't return `sectionInstruction`; `ExtractedQuestion.instructions` never set; type classifier always gets empty string
2. **[CRITICAL] AI type overridden by rules** - In `index.ts`, AI's type replaced with rules type before validator sees it, defeating hybrid comparison
3. **[CRITICAL] Completion subtypes collapsed** - Gemini prompt says `(use type: "completion")` for 5 subtypes, all normalized to `sentence-completion`
4. **[HIGH] No section instruction extraction** - AI prompt doesn't ask for section-level instructions
5. **[HIGH] Validator weights imbalanced** - Rules 70% / AI 30% instead of equal weighting

---

## 2. Implementation Fixes (User-Requested)

### User Clarification
- Rule-based should run **independently and silently** as second classifier
- Provides comparison data for teacher review step (not compulsory)
- Teacher can rate correct/incorrect, data saved for optimization
- Should NOT override AI results
- PRD and task list implementation was problematic

### PRD vs Implementation Assessment
**PRD Intent (FR-15/16/17):** AI and rules run independently, results compared side-by-side, teacher decides
**Actual Code:** Rules type replaced AI type before comparison, empty instructions, fake consensus

### Fixes Implemented

#### Fix #1: Add `sectionInstruction` to AI pipeline
- **`src/services/ai/ai.service.ts`**: Added `sectionInstruction?: string | null` to `AIQuestion` interface
- **`src/services/ai/response.validator.ts`**: Added `sectionInstruction` to Zod `AIQuestionSchema`
- **`src/services/ai/gemini.provider.ts`**: Updated prompt to extract `sectionInstruction` per question, added examples in JSON output
- **`src/services/ai/groq.provider.ts`**: Same prompt updates for Groq fallback
- **`src/services/test-creation/ai-extractor.service.ts`**: Piped `q.sectionInstruction` → `instructions` field; also added `suggestedType` mapping

#### Fix #2: Stop overriding AI type
- **`src/services/test-creation/index.ts`**: Changed from `type: rulesResult[index]?.type || 'multiple-choice'` to `type: q.suggestedType || 'multiple-choice'` — AI's own type classification now used in validator

#### Fix #3: Fix completion subtype prompt
- **`src/services/ai/gemini.provider.ts`**: Removed all `(use type: "completion")` instructions from 5 completion subtypes. AI now returns specific type names (`note-completion`, `table-completion`, `summary-completion-text`, etc.)

#### Fix #4: Adjust validator weights
- **`src/services/test-creation/validator.service.ts`**: Changed from RULES_WEIGHT=0.7/AI_WEIGHT=0.3 to 0.5/0.5 for balanced independent comparison per PRD intent

### PRD/Task List Updates
- **`0020-prd-automated-ielts-reading-test-creation.md`**: Updated Core Architecture section to clarify rule-based independence; Updated FR-9 to explicitly mention section instructions extraction
- **`tasks-0020-prd-automated-ielts-reading-test-creation.md`**: Updated task 5.4 to reflect corrected weights

### Files Modified
| File | Change |
|------|--------|
| `src/services/ai/ai.service.ts` | Added `sectionInstruction` to `AIQuestion` |
| `src/services/ai/response.validator.ts` | Added `sectionInstruction` to Zod schema |
| `src/services/ai/gemini.provider.ts` | Removed `(use type: "completion")`, added `sectionInstruction` extraction |
| `src/services/ai/groq.provider.ts` | Added `sectionInstruction` extraction |
| `src/services/test-creation/ai-extractor.service.ts` | Piped `sectionInstruction` → `instructions`, added `suggestedType` |
| `src/services/test-creation/index.ts` | Use actual AI type, not rules override |
| `src/services/test-creation/validator.service.ts` | Changed weights to 50/50 |
| `documentation/tasks/0020-prd-*.md` | Clarified rule-based independence |
| `documentation/tasks/tasks-0020-prd-*.md` | Updated task 5.4 weights |
