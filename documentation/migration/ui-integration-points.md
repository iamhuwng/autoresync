# UI Integration Points - Parser System

> **Task**: 0.7 - Document current UI integration points (where parser is called from)  
> **Date**: 2026-02-05  
> **Purpose**: Track all UI components that depend on deprecated parsers for migration

---

## 1. Summary

The deprecated parser system is accessed from the UI through 3 main entry points:

| Entry Point | UI Component | Direct Import |
|------------|--------------|---------------|
| `parserRouter` | ListeningTestBuilder.tsx | `parser.router.ts` |
| `useTestDocumentParser` | CreateTestPage.tsx | `reading.parser.ts` |
| `questionTypeDetector` | (indirect) | via hybrid-document.parser.ts |

---

## 2. Direct UI Integration Points

### 2.1 ListeningTestBuilder.tsx (LISTENING - KEEP)

**File**: `src/skills/listening/builders/ListeningTestBuilder.tsx`

**Imports**:
```typescript
// Line 15
import { parserRouter } from '../../../services/parser/parser.router';
```

**Usage**:
```typescript
// Line 464 - Parse listening test text
const result = await parserRouter.parseListening(...)

// Line 600 - Parse answer key
const parsedAnswers = await parserRouter.parseAnswerKey(bulkAnswerKey);
```

**Migration Impact**: 
- ⚠️ This component uses `parserRouter.parseListening()` which calls `listeningParser`
- The `listeningParser` is NOT being deleted, but `parserRouter` IS
- **Action**: Task 0.9 creates `listening.router.ts` to preserve this functionality

---

### 2.2 CreateTestPage.tsx (READING - REPLACE)

**File**: `src/pages/CreateTestPage.tsx`

**Imports**:
```typescript
// Line 16
import { useTestDocumentParser } from '../hooks/test/useTestDocumentParser';
```

**Usage**:
```typescript
// Line 21
const parser = useTestDocumentParser(form.metadata);
```

**Migration Impact**:
- 🔴 This is the main entry point for READING test creation
- The hook `useTestDocumentParser` imports `readingParser` directly
- **Action**: Phase 3 creates new `useReadingParser.ts` hook to replace this

---

## 3. Indirect Dependencies (Hook → Parser)

### 3.1 useTestDocumentParser.ts

**File**: `src/hooks/test/useTestDocumentParser.ts`

**Imports**:
```typescript
// Line 4
import { readingParser } from '../../services/parser/reading.parser';
```

**Usage**:
```typescript
// Line 49
const result = await readingParser.parseReadingTest(...)
```

**Migration Impact**:
- 🔴 Directly imports deprecated `readingParser`
- **Action**: Task 0.8 documents this hook in detail

---

## 4. Internal Parser Dependencies

### 4.1 parser.router.ts → Multiple Parsers

**Imports**:
```typescript
import { readingParser } from './reading.parser';           // DEPRECATED
import { documentParser } from './document.parser';          // DEPRECATED
import { listeningParser } from './listening.parser';        // KEEP
import { quizParser } from './quiz.parser';                  // DEPRECATED
```

**Routing Logic**:
| Skill | Parser Used |
|-------|-------------|
| `listening` | `listeningParser.parseListeningText()` |
| `reading` | `readingParser.parseReadingTest()` |
| `quiz` | `quizParser.parse()` |
| `unknown` | `documentParser.parseDocument()` |

---

### 4.2 reading.parser.ts → hybrid-document.parser.ts

**Imports**:
```typescript
import { hybridDocumentParser, type HybridParseResult } from './hybrid-document.parser';
```

**Usage**:
```typescript
const result = await hybridDocumentParser.parseDocument(text);
```

---

### 4.3 hybrid-document.parser.ts → question-type-detector.ts

**Imports**:
```typescript
import { questionTypeDetector, type QuestionType } from '../../utils/parsers/question-type-detector';
```

**Usage**:
```typescript
questionTypeDetector.detectFromSectionContext(...)
questionTypeDetector.detect(...)
questionTypeDetector.detectOptionLabelFormat(...)
```

---

## 5. Migration Path Summary

### Keep (Protected)
- `listeningParser` → create `listening.router.ts` to access it (Task 0.9)
- `ListeningTestBuilder.tsx` → update import to use new router

### Replace with New System
- `CreateTestPage.tsx` → use new `useReadingParser.ts` hook (Phase 3)
- `useTestDocumentParser.ts` → deprecate, replace with new hook (Phase 3)
- `readingParser` → replace with new service layers (Phase 2-5)
- `hybridDocumentParser` → replace with new AI extractor (Phase 3)
- `questionTypeDetector` → replace with `type-classifier.service.ts` (Phase 4)

---

## 6. Visual Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    UI LAYER                                  │
├──────────────────────┬──────────────────────────────────────┤
│ ListeningTestBuilder │ CreateTestPage                        │
│         │            │        │                              │
│         ▼            │        ▼                              │
│   parserRouter ──────┼── useTestDocumentParser               │
│         │            │        │                              │
├─────────┼────────────┼────────┼──────────────────────────────┤
│         │            │ PARSER │ LAYER (DEPRECATED)           │
│         ▼            │        ▼                              │
│   ┌─────────┐        │   ┌──────────┐                        │
│   │listening│ ◄──────┼───│ reading  │                        │
│   │ Parser  │ KEEP   │   │ Parser   │ DELETE                 │
│   └─────────┘        │   └────┬─────┘                        │
│                      │        │                              │
│                      │        ▼                              │
│                      │   ┌─────────────┐                     │
│                      │   │hybridDocument│ DELETE              │
│                      │   │   Parser     │                     │
│                      │   └──────┬──────┘                      │
│                      │          │                             │
│                      │          ▼                             │
│                      │   ┌─────────────┐                     │
│                      │   │questionType │ DELETE               │
│                      │   │  Detector   │                      │
│                      │   └─────────────┘                      │
└──────────────────────┴──────────────────────────────────────┘
```

---

## 7. Files to Update After Migration

| File | Current Import | New Import |
|------|----------------|------------|
| `ListeningTestBuilder.tsx` | `parserRouter` | `listeningRouter` |
| `CreateTestPage.tsx` | `useTestDocumentParser` | `useReadingParser` |
| `useTestDocumentParser.ts` | `readingParser` | (DELETE FILE) |
