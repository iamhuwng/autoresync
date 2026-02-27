---
title: AI Parsing Extraction
createdAt: '2026-02-27T17:10:22.717Z'
updatedAt: '2026-02-27T17:10:51.734Z'
description: >-
  Dual AI provider (Gemini/Groq), extraction pipeline, IELTS type
  classification, THCS regex parser, error handling.
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
