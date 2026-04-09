---
title: AI Parsing Extraction
description: Dual AI provider (Gemini/Groq), extraction pipeline, IELTS type classification, THCS regex parser, error handling.
createdAt: '2026-02-27T17:10:22.717Z'
updatedAt: '2026-04-09T17:39:25.499Z'
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
