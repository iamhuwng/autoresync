---
id: 2gv1pn
title: Implement AI feedback generation (Gemini + Groq fallback)
status: done
priority: high
labels:
  - from-spec
  - formative-feedback
createdAt: '2026-03-04T21:25:10.710Z'
updatedAt: '2026-03-04T22:25:51.797Z'
timeSpent: 404
spec: specs/ai-formative-assessment-feedback
fulfills:
  - AC-3
  - AC-4
  - AC-5
  - AC-7
  - AC-11
order: 3
---
# Implement AI feedback generation (Gemini + Groq fallback)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add AI feedback generation to formativeFeedback.service.ts. Build the prompt from all question texts + student answers + correct answers + test metadata. Call Gemini 2.5 Flash first; if all keys exhausted, fall back to Groq with same prompt. Parse structured JSON response containing questionTopics, questionExplanations, and feedback narrative. Fall back to deterministic-only if both providers fail. See research artifact Section 3.6 for full prompt template and Section 3.5 for topic taxonomy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prompt includes all question texts, options, student answers, correct answers, and test metadata
- [x] #2 AI returns per-question topic tags (topic + category) for ALL questions
- [x] #3 AI returns per-question explanations for WRONG answers only
- [x] #4 AI returns narrative feedback (summary/strengths/revision/critical) with question number references
- [x] #5 Gemini → Groq fallback works when all Gemini keys exhausted
- [x] #6 Graceful fallback to deterministic-only if both AI providers fail (no error exposed to student)
- [x] #7 Response validated against expected JSON schema before storing
- [x] #8 aiModel field records which provider was used
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: AI Feedback Generation (Gemini + Groq Fallback)

### File: `src/services/formativeFeedback.service.ts` (extends Task 23fbgf)

**Step 1: Import AI providers + define types**
```typescript
import { GeminiProvider } from './ai/gemini.provider';
import { GroqProvider } from './ai/groq.provider';
```
Define local type for AI response validation:
```typescript
interface AIFeedbackResponse {
    questionTopics: Record<string, { topic: string; category: string }>;
    questionExplanations: Record<string, string>;
    feedback: { summary: string; strengths: string; revision: string; critical: string };
}
```

**Step 2: Implement `buildFeedbackPrompt()`**
Inputs: `gradingResult`, `sections`, `testMetadata`
Logic:
1. Build header: score, grade level, test title
2. For each question in each section:
   - Format: `Q{num} [{intent}] {CORRECT|WRONG}`
   - Include: questionText, options (for MCQ), studentAnswer, correctAnswer
   - Include: teacher explanation if exists (so AI doesn't duplicate)
3. Append the JSON output schema instructions with 8 rules (from research Section 3.6)
4. Return { systemPrompt, userPrompt }

**Step 3: Implement `callGeminiForFeedback()`**
Pattern: mirrors `GeminiProvider.gradeWritingAnswer()` structure
1. Get GeminiProvider singleton (lazy-init)
2. Use round-robin key selection + exhausted key cleanup
3. Call `model.generateContent()` with:
   - model: 'gemini-2.5-flash'
   - temperature: 0.2
   - maxOutputTokens: 8192
   - responseMimeType: 'application/json'
4. Parse response with extractJSON
5. Validate against AIFeedbackResponse shape
6. On rate limit (429), mark key exhausted
7. On all keys exhausted, throw 'ALL_KEYS_EXHAUSTED' error

**Step 4: Implement `callGroqForFeedback()`**
Pattern: mirrors `GroqProvider.gradeWritingAnswer()` structure
1. Get GroqProvider singleton (lazy-init)
2. Use same prompt (systemPrompt as system message, userPrompt as user message)
3. Call `client.chat.completions.create()` with:
   - model: 'llama-3.3-70b-versatile'
   - temperature: 0.2
   - max_tokens: 8192
4. Parse response, validate same shape
5. On failure, return error Result

**Step 5: Implement `generateAIFeedback()` with fallback chain**
```typescript
async function generateAIFeedback(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    testMetadata: { title: string; gradeLevel: number },
): Promise<AIFeedbackResponse | null>
```
Logic:
1. Build prompt
2. Try Gemini first
   - Success → return data with aiModel='gemini-2.5-flash'
   - ALL_KEYS_EXHAUSTED → fall to step 3
   - Other error → fall to step 3
3. Try Groq fallback
   - Success → return data with aiModel='groq-llama-3.3-70b'
   - Failure → return null (deterministic only)
4. Console.warn on any fallback for debugging

**Step 6: Implement `validateAIFeedbackResponse()`**
Validates the raw JSON against expected shape:
- `questionTopics` is Record<string, { topic: string, category: string }>
- `questionExplanations` is Record<string, string>
- `feedback` has summary, strengths, revision, critical (all strings)
- Return validated + sanitized object or null

**Step 7: Update main `generateFormativeFeedback()` to call AI**
```typescript
export async function generateFormativeFeedback(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    testMetadata: { title: string; gradeLevel: number },
): Promise<FormativeFeedback>
```
1. First: run deterministic (sync, instant) → get base FormativeFeedback
2. Then: try AI enhancement (async)
3. If AI succeeds: merge questionTopics, questionExplanations, aiFeedback, aiModel into result
4. If AI fails: return deterministic-only result (no error to caller)

### Key Decisions
- **NOT** extending IAIService interface — feedback gen is a separate concern from parsing
- **Reusing** provider instances (singleton pattern already in GeminiProvider/GroqProvider)
- **Direct Gemini SDK call** (same pattern as gradeWritingAnswer), not through IAIService.parseChunk
- **Single service file** for both deterministic + AI (keeps it cohesive)

### Verification
- Test with mock: construct a fake THCSGradingResult, verify prompt contains all questions
- Test fallback: temporarily disable Gemini keys, verify Groq is called
- Test deterministic fallback: disable both, verify no error + deterministic feedback returned
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Enhanced `src/services/formativeFeedback.service.ts` with complete AI feedback generation pipeline:

**New functions added:**
- `buildFeedbackPrompt()` — constructs system+user prompts with all question data, student answers, correct answers, and test metadata. Includes 8 structured rules for AI output.
- `validateAIFeedbackResponse()` — validates raw AI JSON against expected schema (questionTopics, questionExplanations, feedback narrative). Returns null on invalid data.
- `callGeminiForFeedback()` — calls Gemini 2.5 Flash with JSON mode, iterates all API keys on rate limit, uses extractJSON from shared ai-json-repair module
- `callGroqForFeedback()` — calls Groq Llama 3.3 70B as fallback, same key rotation pattern, loads keys from .env + Firestore
- `generateAIFeedback()` — orchestrates Gemini → Groq fallback chain, returns null if both fail

**Updated functions:**
- `generateFormativeFeedback()` — now calls AI pipeline, merges AI data into deterministic baseline, records aiModel field

**Key design decisions:**
- Direct SDK calls (not through IAIService) — feedback gen is a separate concern
- Shared extractJSON from ai-json-repair module (5-strategy recovery)
- Same prompt sent to both Gemini and Groq (systemPrompt + userPrompt)
- Fire-and-forget: errors caught and logged, never thrown to student

**TypeScript compilation verified** — no new errors introduced.

📚 Extracted to @doc/patterns/pattern-ai-provider-fallback-chain-with-key-rotation
<!-- SECTION:NOTES:END -->

