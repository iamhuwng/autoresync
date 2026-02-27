# Hooks Importing Parser Files

> **Task**: 0.8 - Document hooks that import parser files  
> **Date**: 2026-02-05  
> **Purpose**: Document all React hooks that depend on deprecated parsers for migration

---

## 1. Summary

Only **1 hook** directly imports from the deprecated parser system:

| Hook | File | Parser Import | Status |
|------|------|---------------|--------|
| `useTestDocumentParser` | `src/hooks/test/useTestDocumentParser.ts` | `readingParser` | 🔴 TO DELETE |

---

## 2. useTestDocumentParser.ts - DETAILED ANALYSIS

### 2.1 File Location
`src/hooks/test/useTestDocumentParser.ts` (125 lines)

### 2.2 Imports

```typescript
import { useState, useCallback } from 'react';
import { Passage, ParsedQuestion } from '../../types/document.types';
import { readingParser } from '../../services/parser/reading.parser';  // ⚠️ DEPRECATED
import { validateTestContent } from '../../utils/test-validators';
import { TestMetadata } from '../../config/test.config';
```

### 2.3 Hook Signature

```typescript
export const useTestDocumentParser = (metadata: TestMetadata) => {
  // Returns:
  return {
    parsedPassages,        // Passage[] - Parsed passage content
    parsedQuestions,       // ParsedQuestion[] - Parsed questions
    isParsing,             // boolean - Parsing in progress
    parsingProgress,       // number - 0-100 progress percentage
    parsingStage,          // string - Current stage description
    handleFileUpload,      // (file: File) => Promise<boolean>
    parseDocument,         // (text: string) => Promise<boolean>
    updateParsedContent,   // (passages, questions) => void
    resetParser            // () => void
  };
}
```

### 2.4 Usage Pattern

```typescript
// Line 49 - Core dependency on deprecated readingParser
const result = await readingParser.parseReadingTest(
  documentText,
  {
    validateIELTS: true,
    format: metadata.type === 'IELTS' ? 'Academic' : undefined,
    onProgress: (stage, progress) => {
      setParsingUpdate(stage, progress);
    },
  }
);
```

### 2.5 Used By

| Component | File | Purpose |
|-----------|------|---------|
| `CreateTestPage` | `src/pages/CreateTestPage.tsx` | Reading test creation |

---

## 3. Hook Features to Preserve

The new hook (`useReadingParser`) must replicate these features:

### 3.1 State Management
- `parsedPassages: Passage[]` - Store parsed passages
- `parsedQuestions: ParsedQuestion[]` - Store parsed questions
- `isParsing: boolean` - Loading state
- `parsingProgress: number` - Progress 0-100
- `parsingStage: string` - Current stage name

### 3.2 File Upload Flow
```typescript
handleFileUpload(file: File) {
  1. Check file type (TXT, DOCX, PDF)
  2. Extract text using file-extractor.ts (KEEP)
  3. Pass text to parseDocument()
}
```

### 3.3 Parsing Flow
```typescript
parseDocument(documentText: string) {
  1. Set isParsing = true
  2. Call parser with progress callback
  3. Validate with validateTestContent()
  4. Set passages and questions state
  5. Set isParsing = false
}
```

### 3.4 Progress Callback Interface
```typescript
onProgress: (stage: string, progress: number) => void
```

### 3.5 Validation Integration
- Uses `validateTestContent()` from `utils/test-validators.ts`
- Shows alerts for validation errors
- Shows confirm dialog for warnings

---

## 4. Dependencies to Keep

These imports will be reused in the new hook:

| Import | Source | Keep? |
|--------|--------|-------|
| `Passage, ParsedQuestion` | `types/document.types` | ✅ Yes |
| `validateTestContent` | `utils/test-validators` | ✅ Yes |
| `TestMetadata` | `config/test.config` | ✅ Yes |
| `extractTextFromFile` | `file-extractor` (dynamic) | ✅ Yes |
| `readingParser` | `parser/reading.parser` | ❌ REPLACE |

---

## 5. Migration Plan

### Phase 3 Task: Create New Hook

**New File**: `src/hooks/test/useReadingParser.ts`

**New Imports**:
```typescript
import { useCallback, useState } from 'react';
import { Passage, ParsedQuestion } from '../../types/document.types';
import { validateTestContent } from '../../utils/test-validators';
import { TestMetadata } from '../../config/test.config';
// NEW: Import from new test-creation services
import { readingTestCreator } from '../../services/test-creation/reading-test-creator.service';
```

**Steps**:
1. Create `useReadingParser.ts` with same interface
2. Update `CreateTestPage.tsx` to use new hook
3. Add `@deprecated` notice to `useTestDocumentParser.ts`
4. Delete `useTestDocumentParser.ts` in Phase 10

---

## 6. Other Hooks in `src/hooks/test/`

These hooks do NOT import parser files:

| Hook | Purpose | Parser Import |
|------|---------|---------------|
| `useBeforeUnloadWarning.ts` | Warn on page leave | None |
| `useCreateTestForm.ts` | Form state management | None |
| `useTestCompletionCheck.ts` | Check test completion | None |
| `useTestData.ts` | Fetch test data | None |
| `useTestDataWithClassSupport.ts` | Test data + class | None |
| `useTestSaver.ts` | Save test to Firebase | None |
| `useTestSession.ts` | Student test session | None |
| `useTestSubmission.ts` | Submit test answers | None |
| `useTestTimer.ts` | Timer management | None |
| `useTimerExpiry.ts` | Handle timer end | None |

---

## 7. Verification Checklist

- [x] Searched `src/hooks/` for parser imports
- [x] Found 1 hook: `useTestDocumentParser.ts`
- [x] Documented full interface and usage
- [x] Identified features to preserve
- [x] Identified dependencies to keep vs replace
- [x] Created migration plan for new hook
