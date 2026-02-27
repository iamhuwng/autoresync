---
title: Lessons Learned
createdAt: '2026-02-27T15:26:04.718Z'
updatedAt: '2026-02-27T15:26:05.996Z'
description: Key lessons learned from migrations and implementation work
tags:
  - migration
  - lessons
  - retrospective
---
# Lessons Learned from Current Parser Implementation

> **Task**: 0.13 - Document lessons learned from current implementation  
> **Date**: 2026-02-05  
> **Purpose**: Extract valuable patterns and identify anti-patterns for the new system

---

## 1. Executive Summary

After thorough analysis of the existing parser system, we identified:
- **5 patterns to ADOPT** (proven valuable)
- **4 patterns to IMPROVE** (good concept, poor execution)
- **3 anti-patterns to AVOID** (caused problems)

---

## 2. Patterns to ADOPT ✅

### 2.1 Result<T> Type Pattern
**Why it works**: Consistent, type-safe error handling without exceptions.

```typescript
// GOOD: From file.extractor.ts
return { success: true, data: text };
return { success: false, error: 'Message' };
```

**Adopt in new system**: Continue using `Result<T>` for all service methods.

---

### 2.2 Progress Callback Pattern
**Why it works**: Provides real-time feedback during long operations.

```typescript
// GOOD: From reading.parser.ts
onProgress?: (stage: string, progress: number) => void

// Usage
onProgress?.('Extracting sections...', 30);
```

**Adopt in new system**: Use for all async operations (AI calls, parsing).

---

### 2.3 Dynamic Imports for Heavy Libraries
**Why it works**: Reduces initial bundle size, loads on-demand.

```typescript
// GOOD: From file.extractor.ts
const mammoth = await import('mammoth');
const pdfjsLib = await import('pdfjs-dist');
```

**Adopt in new system**: Apply to AI SDK imports and any heavy dependencies.

---

### 2.4 canHandle() Router Pattern
**Why it works**: Allows parsers to self-declare capabilities.

```typescript
// GOOD: From listening.parser.ts
canHandle(text: string): CanHandleResult {
  return { canHandle, confidence, reason };
}
```

**Adopt in new system**: Use for type classifiers and format detectors.

---

### 2.5 Priority-Based Detection
**Why it works**: Resolves ambiguity when multiple patterns match.

```typescript
// GOOD: From question-type-detector.ts
const sorted = [...this.patterns].sort((a, b) => b.priority - a.priority);
```

**Adopt in new system**: Apply to question type classification with explicit priorities.

---

## 3. Patterns to IMPROVE ⚠️

### 3.1 Separation of AI and Rule-Based Logic

**Current Problem**: Hybrid parsers mix AI calls with regex patterns, making debugging difficult.

```typescript
// PROBLEMATIC: hybrid-document.parser.ts
// AI extracts sections, then rules detect types
// When it fails, unclear which layer caused it
```

**Improvement for new system**:
```typescript
// BETTER: Clear layer separation
Layer 1: AI Extraction (sections, passages, raw questions)
Layer 2: Rule Classification (type detection only)
Layer 3: Validation (structural checks only)
```

---

### 3.2 Single Source of Truth for Types

**Current Problem**: Question types defined in multiple places.

```typescript
// BAD: Types scattered across files
- ielts.types.ts: IELTSTaskType (16 types)
- parser.types.ts: StandardQuestionType
- question-type-detector.ts: QuestionType
- document.types.ts: QuestionType (different!)
```

**Improvement for new system**:
```typescript
// BETTER: One file, re-exported everywhere
// src/types/question.types.ts
export type QuestionType = '...' | '...';
export const QUESTION_TYPES = [...] as const;
```

---

### 3.3 Validation as Separate Layer

**Current Problem**: Validation mixed into parsing logic.

```typescript
// PROBLEMATIC: reading.parser.ts
// Parsing and IELTS validation intertwined
async parseReadingTest(...) {
  // Parse...
  // Validate IELTS structure...
  // Apply fixes...
  // Re-validate...
}
```

**Improvement for new system**:
```typescript
// BETTER: Pure validation service
const parsed = await parser.parse(text);
const validation = await validator.validate(parsed, 'IELTS');
// Handle validation result separately
```

---

### 3.4 Error Messages for Users vs Developers

**Current Problem**: Error messages mix technical and user-friendly content.

```typescript
// BAD: Technical details exposed
error: `Failed to extract DOCX: ${error.message}`
```

**Improvement for new system**:
```typescript
// BETTER: Separate user message and technical details
return {
  success: false,
  error: 'Could not read the document. Please try a different file.',
  debug: { originalError: error, stack: error.stack }
};
```

---

## 4. Anti-Patterns to AVOID ❌

### 4.1 Tight Coupling Between Parsers

**Problem**: Parsers import each other, creating circular dependencies.

```typescript
// BAD: parser.router.ts imports all parsers
import { listeningParser } from './listening.parser';
import { readingParser } from './reading.parser';
import { quizParser } from './quiz.parser';
import { documentParser } from './document.parser';
```

**Avoid in new system**: Use dependency injection or factory pattern.

---

### 4.2 Hardcoded Question Number Patterns

**Problem**: Some detection relies on specific question numbers.

```typescript
// BAD: From old question-type-detector.ts (removed)
// Q14-21 → matching-sentence-endings
// Q31-35 → multiple-choice
```

**Avoid in new system**: Detect types from content/instructions only, never from question numbers.

---

### 4.3 Silent Fallbacks Without Logging

**Problem**: When primary parser fails, fallback happens silently.

```typescript
// BAD: User doesn't know which parser ran
if (result.questions.length === 0) {
  return this.parseWithQuizParser(text, onProgress);
}
```

**Avoid in new system**: Always log fallbacks and include parser info in result.

---

## 5. Code Quality Observations

### What Worked Well
| Aspect | Example |
|--------|---------|
| JSDoc comments | All major functions documented |
| TypeScript interfaces | Clear type definitions |
| Console logging | Debug-friendly with emojis |
| File organization | Service/types separation |

### What Needs Improvement
| Aspect | Problem |
|--------|---------|
| Regex complexity | Some patterns are unreadable |
| Dead code | Unused functions remain |
| Test coverage | Not all edge cases covered |
| Magic numbers | Hardcoded values without constants |

---

## 6. AI Integration Lessons

### Token Efficiency
```typescript
// CURRENT: Full document sent to AI
const result = await aiService.parseChunk(entireDocument);

// BETTER: Section-by-section with context
const sections = splitDocument(text);
for (const section of sections) {
  await aiService.extractQuestions(section, { context: adjacent });
}
```

### Prompt Engineering
```typescript
// CURRENT: Complex multi-purpose prompts
"Extract passages, questions, and answer keys..."

// BETTER: Focused single-purpose prompts
Prompt 1: "Extract reading passages only..."
Prompt 2: "Extract questions from this section..."
```

---

## 7. Recommendations for New System

### Architecture Principles
1. **Layer Separation**: File → Text → AI Extract → Rule Classify → Validate
2. **Single Responsibility**: Each service does ONE thing well
3. **Explicit Dependencies**: No hidden imports, DI-ready
4. **Observable**: Every step logged with context

### Naming Conventions
```typescript
// Services: noun.service.ts
ai-extractor.service.ts
type-classifier.service.ts

// Types: noun.types.ts
question.types.ts
passage.types.ts

// Hooks: use[Noun].ts
useReadingParser.ts
useTestCreation.ts
```

### Error Handling Strategy
```typescript
// Every layer returns Result<T>
// Errors aggregate with context
interface EnrichedError {
  userMessage: string;      // Show to user
  technicalMessage: string; // For developers
  layer: string;            // Which layer failed
  recoverable: boolean;     // Can we continue?
  suggestions: string[];    // How to fix
}
```

---

## 8. Migration Checklist Summary

Based on lessons learned, the new system should:

- [x] Use `Result<T>` pattern throughout
- [x] Implement progress callbacks for all async operations
- [x] Use dynamic imports for heavy libraries
- [x] Implement canHandle() for format detection
- [x] Use priority-based type classification
- [ ] Separate AI extraction from rule classification (Phase 3-4)
- [ ] Create single source of truth for types (Phase 1)
- [ ] Implement separate validation layer (Phase 5)
- [ ] Improve error messages with user/dev separation (Phase 3+)
- [ ] Avoid tight coupling with dependency injection (Phase 2+)
- [ ] Log all fallbacks with context (Phase 3+)

---

## 9. Files to Reference

| Document | Content |
|----------|---------|
| `question-type-detector-migration-reference.md` | Detection patterns |
| `listening-parser-dependency-analysis.md` | Dependency map |
| `ui-integration-points.md` | UI touchpoints |
| `hooks-importing-parsers.md` | Hook patterns |
| `file-extractor-audit.md` | Reusable service |
