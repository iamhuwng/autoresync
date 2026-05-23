---
title: AI Parsing Extraction
description: Dual AI provider (Gemini/Groq), extraction pipeline, IELTS type classification, THCS regex parser, error handling.
createdAt: '2026-02-27T17:10:22.717Z'
updatedAt: '2026-05-23T21:41:08.977Z'
tags:
  - architecture
  - ai
  - parsing
  - gemini
  - groq
  - extraction
---

# AI Parsing & Extraction Architecture

## Overview

AI-powered extraction system that converts uploaded documents (PDFs, images, text) into structured test questions. Uses a dual-provider approach (Gemini primary, Groq fallback) with automatic failover for reliability.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Upload Phase                             │
│  Teacher uploads PDF/image/text                              │
│  → FileReaderService → raw text extraction                   │
├─────────────────────────────────────────────────────────────┤
│                   Classification Phase                       │
│  TypeClassifierService (type-classifier.service.ts)          │
│  → Confidence scoring per question type                      │
│  → If confidence < 70% → AI extraction                       │
│  → If confidence ≥ 70% → regex-based extraction              │
├─────────────────────────────────────────────────────────────┤
│                    Parsing Pipeline                           │
│                                                              │
│  Step 1: Passage extraction (regex/manual)                   │
│  Step 2: Question parsing → Gemini → (fail?) → Groq         │
│  Step 3: Answer key parsing → Gemini → (fail?) → Groq       │
│                                                              │
│  Files:                                                      │
│  ├── aiParser.js            — Gemini/Groq API wrappers       │
│  ├── aiQuestionParser.js    — Question extraction            │
│  ├── aiAnswerKeyParser.js   — Answer key extraction          │
│  └── questionTypeDetector.ts — IELTS type detection          │
├─────────────────────────────────────────────────────────────┤
│                   Validation Phase                            │
│  ValidationService → IELTS standards check                   │
│  ParseReviewPanel → Teacher verification UI                  │
│  → Approve/edit/reject individual questions                  │
├─────────────────────────────────────────────────────────────┤
│                   THCS Text Parser                            │
│  Regex-based parser for Vietnamese test format               │
│  → Supports: MCQ, pronunciation, error correction, cloze    │
│  → AI extraction prompt template: @doc/guides/ai-test-extraction-prompt │
│  → Section detection via Roman numeral headers               │
└─────────────────────────────────────────────────────────────┘
```

## Dual AI Provider Strategy

| Provider | Model | Role | Rate Limits |
|----------|-------|------|-------------|
| **Gemini** | Google Gemini Pro | Primary | Google-tier limits |
| **Groq** | Llama 3.1 70B | Fallback | 30 RPM, 6K TPM |

### Failover Logic
```
Try Gemini (3 retries with exp backoff)
  → Success → return result
  → Fail (503/network) → Try Groq
    → Success → return result  
    → Fail → return error with both messages
```

### Critical Bug Fixed
**Groq prompt format mismatch**: `parseWithGroq()` was double-wrapping pre-formatted prompts. Fixed by adding same prompt detection as Gemini:
```javascript
const prompt = text.includes('**CRITICAL INSTRUCTIONS:**')
  ? text   // Pre-formatted, use as-is
  : createQuizParsingPrompt(text, fileName);
```

## Error Handling

| Error | Detection | User Message |
|-------|-----------|-------------|
| 503 Overload | HTTP status | "AI service temporarily overloaded. Wait 2-3 min" |
| DNS failure | ERR_NAME_NOT_RESOLVED | "Cannot reach AI servers. Check internet" |
| Disconnected | ERR_INTERNET_DISCONNECTED | "No internet connection" |
| Partial failure | Some passages fail | Show partial results + warning |

## Key Files

| File | Purpose |
|------|---------|
| `src/utils/parsers/aiParser.js` | Gemini + Groq API wrappers |
| `src/utils/parsers/aiQuestionParser.js` | Question extraction (with Groq fallback) |
| `src/utils/parsers/aiAnswerKeyParser.js` | Answer key extraction |
| `src/services/test-creation/type-classifier.service.ts` | Question type detection |
| `src/services/ai/router.service.ts` | AI routing service |
| `src/services/parser/listening.router.ts` | Listening test parser |
| `src/context/QuizCreationContext.jsx` | Parsing orchestration |
| `src/components/quiz-creation/QuestionSection.jsx` | Error UI |

## Related Docs
- @doc/guides/ai-test-extraction-prompt — THCS extraction prompt template
- @doc/sop/groq-fallback-fix — Groq fallback bug fix (detailed)
- @doc/sop/network-error-handling-fix — Error handling improvements
- @doc/prd/prd-ai-quiz-creation-wizard — AI quiz wizard PRD
- @doc/prd/prd-automated-ielts-reading — Automated IELTS extraction PRD
- @doc/migration/lessons-learned — Parser migration lessons
- @doc/architecture/quiz-editor-architecture — Quiz editor (cross-ref)


## 2026-04-09 Amendment - IELTS Reading Creator Failure Handling

### Current runtime rule
- `src/services/test-creation/index.ts` owns the parse success contract for teacher-side IELTS Reading creation.
- `AIExtractorService.extractReadingTest()` returning `success: false` or missing `data` is treated as extraction failure, not partial success.
- Non-throwing AI failures must enter the same offline fallback branch as thrown provider errors.
- Offline fallback must map its questions and passages into the same review payload consumed by the validator and draft-save flow.
- Parser success now requires at least one merged question; zero-question results must surface an error instead of opening a blank review page.

### Important boundary
- This contract does not remove provider-level failures such as Gemini referrer `403` responses or Groq `429` limits.
- It guarantees those failures degrade into offline fallback or a surfaced parse error instead of silently materializing an empty review draft.

### Related docs
- @doc/architecture/test-system-architecture
- @doc/prd/prd-automated-ielts-reading


## 2026-04-09 Amendment - Reading Creation Fail-Closed Fallback

The teacher IELTS Reading creator now treats non-success AI extraction results as failures, not as usable partial output.

Current operational rules:
- `testCreationService.parseDocument()` must throw into the offline/rules fallback path when `aiExtractor.extractReadingTest()` returns `success: false` or no data.
- Offline fallback is allowed to produce the review payload, but it must materialize reviewable `passages` and validator `mergedQuestions`, not just background rule classifications.
- A parse that ends with zero merged questions is a terminal error. The parser must fail closed instead of returning success with blank review content.
- Provider problems such as Gemini referrer-blocked `403` responses or Groq `429` exhaustion are upstream availability issues; the parser contract is to surface a retryable failure or a real offline fallback result, never an empty success.

Current implementation anchors:
- `src/services/test-creation/index.ts`
- `src/services/test-creation/ai-extractor.service.ts`
- `src/services/test-creation/offline-parser.service.ts`
- `src/services/test-creation/index.test.ts`

Source: @task-1bch3u


## 2026-04-10 Amendment - Gemini Legacy Key Exclusion

Standalone Gemini probes on April 10, 2026 confirmed that `VITE_GEMINI_API_KEY_1` and `VITE_GEMINI_API_KEY_3` succeed from both `https://mstu.work` and `https://kahoot.mstu.work`, while the legacy `VITE_GOOGLE_API_KEY` returns `API_KEY_INVALID` because it is expired.

Current operational rules:
- `loadAllGeminiApiKeys()` must load only numbered Gemini env keys plus active Firestore Gemini keys.
- `VITE_GOOGLE_API_KEY` must not participate in Gemini schema validation, runtime rotation, provider diagnostics, or admin Gemini env-key counts.
- The legacy Google key remains valid only for the old `googleDrive.js` browser service until that service is retired or given its own dedicated configuration.

Current implementation anchors:
- `src/config/env.config.ts`
- `src/pages/AdminSettingsPage.tsx`
- `src/config/env.config.test.ts`

Operational consequence:
- teacher IELTS Reading creation no longer rotates onto the expired legacy Google key during Gemini parsing.
- any further Gemini failure should be treated as a real provider failure, referrer issue, or prompt-size problem instead of legacy-key contamination.

## 2026-04-10 Amendment - Reading Question Extraction Resilience

The teacher IELTS Reading extraction flow now has explicit runtime rules for transient provider failures during the question stage.

### Current runtime rule

- Gemini `503` / `high demand` failures during passage or question extraction are treated as transient availability failures and retried across the remaining Gemini keys before the router drops to Groq.
- Groq `413` / `request too large` failures during question extraction are treated as prompt-budget failures, not exhausted-key failures.
- When Groq question extraction is oversized, the provider retries with smaller `max_tokens` budgets before it benches or rotates the current key.
- The offline parser now recognizes markdown-numbered IELTS questions such as `**35.**`, bullet-prefixed numbered items, and `Question 35.` so pasted markdown remains recoverable when AI providers fail.

### Important boundary

These rules improve stage-local recovery but do not change the broader architecture: the reading creator still uses a provider-first extraction chain rather than a staged parse job with durable intermediate artifacts.

## 2026-04-10 Amendment - Reading Staged Parse Job
The teacher IELTS Reading creator now exposes an internal staged parse-job model in `src/services/test-creation/index.ts`.

Current stages:
- `normalized-source`
- `extraction`
- `classification`
- `validation`
- `review-draft`

Current runtime rule:
- the staged job is an internal architecture boundary only; the public teacher-facing contract remains `documentText`, `passages`, `validationResult`, and fail-closed parse metadata
- canonical Reading question data must still be assembled before any draft persistence boundary
- future provider recovery and resume work should extend these stage artifacts rather than reintroducing one opaque orchestration block

Related docs:
- @doc/architecture/reading-staged-parse-job
- @doc/architecture/test-system-architecture


## 2026-04-12 Amendment - Legacy Chunking Config Retirement
The live teacher IELTS Reading creation path no longer uses chunking as part of the shared environment contract.

Current runtime rule:
- the staged extraction pipeline MUST not read `VITE_CHUNK_SIZE`, `VITE_CHUNK_OVERLAP`, or `VITE_MAX_DOCUMENT_SIZE`
- legacy chunking helpers may remain only as isolated internal utilities with local defaults
- future parser work must not reintroduce chunking env variables without restoring a documented runtime consumer first

Operational consequence:
- removing the chunking env keys does not change the live teacher Reading creation flow
- parser cleanup can further prune legacy chunking utilities without changing app setup requirements

Related docs:
- @doc/architecture/reading-staged-parse-job
- @doc/architecture/test-system-architecture


## 2026-05-13 Amendment - Reading V2 Auto Answer-Key Binding

Reading V2 Auto import uses `src/services/reading-v2/readingV2AutoImport.service.ts` and `geminiProvider.generateStructuredJson(...)` for structured draft creation. For Studio answer-key binding, the effective carrier is top-level `answerKeyText`, not `answerKeyAudit` and not local extraction alone.

Current rules:

- Preserve locally extracted answer-key rows plus Gemini-returned top-level `answerKeyText` rows when they are copied from visible source answer-key text.
- If both row carriers are missing but the raw source has a visible answer-key heading, Auto may synthesize `answerKeyText` from Gemini `questions[].answer` as a guarded bridge into the normal Studio binding path.
- If the raw source has no visible answer-key section, Gemini answers are stripped before Studio handoff.
- Retired wording: "extracted answer key" no longer means only local preflight `extractedAnswerKeyText`; it means the effective trusted `answerKeyText` rows passed to Studio.

Verification from this fix: focused Vitest passed for `readingV2AutoImport.service.test.ts`, `readingV2AutoImportPrompt.test.ts`, and `readingV2ExternalAiPrompt.service.test.ts`; UTF-8 and `git diff --check` passed for touched files.


## 2026-05-24 Amendment - Reading V2 Auto V4 Provider Review Contract

Reading V2 Auto V4 uses a split-provider workflow: Gemini is the topology and answer-key witness, Groq is the per-passage question-area structured JSON normalizer, and local code is the verifier/assembler/Studio guardrail.

The durable rule is that local code must not become a brittle parser for every messy source format. Low Groq completion or unsafe transcript output must feed precise coverage/verifier feedback back to Groq for self-repair before bounded local audit/repair decides whether Studio receives a `needs_review` draft or the import fails closed.

Cloud Functions are off-limit for new Reading V2 work. The approved trusted backend boundary is Cloudflare Worker or another explicitly approved small backend service.

See @doc/architecture/reading-v2-auto-v4-provider-review-contract.
