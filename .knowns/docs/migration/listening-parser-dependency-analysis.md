---
title: Listening Parser Dependency Analysis
createdAt: '2026-02-27T15:26:07.350Z'
updatedAt: '2026-02-27T15:26:08.602Z'
description: Analysis of parser dependencies for listening test components
tags:
  - migration
  - listening
  - parser
  - dependencies
---
# Listening Parser Dependency Analysis

> **Task**: 0.5 - Verify `listening.parser.ts` has no dependencies on files being deleted  
> **Date**: 2026-02-05  
> **Status**: ⚠️ ONE CRITICAL DEPENDENCY FOUND

---

## 1. File Analyzed

- **File**: `src/services/parser/listening.parser.ts`
- **Lines**: ~900
- **Purpose**: IELTS Listening test parser (to be KEPT after migration)

---

## 2. Import Analysis

| Line | Import | Source | Status |
|------|--------|--------|--------|
| 20 | `ParsedQuestion, QuestionType` | `../../types/document.types` | ✅ SAFE |
| 21 | `Result` | `../../types/result.types` | ✅ SAFE |
| 22 | `IELTSTaskType` | `./types/ielts.types` | ⚠️ **PROBLEM** |
| 23 | `CanHandleResult` | `./types/parser.types` | ✅ SAFE |

---

## 3. Critical Issue Details

### ⚠️ Import: `IELTSTaskType` from `./types/ielts.types`

**Problem**: 
- `ielts.types.ts` is being deleted as part of PRD-0020 cleanup
- `listening.parser.ts` imports `IELTSTaskType` from this file
- This will cause a **compile error** if `ielts.types.ts` is deleted

**Usage in listening.parser.ts**:
```typescript
// Line 22
import type { IELTSTaskType } from './types/ielts.types';

// Line 138 - Used in ListeningMetadata interface
export interface ListeningMetadata {
  totalTime: number;
  totalSections: number;
  totalQuestions: number;
  sectionTypes: ListeningSectionType[];
  taskTypeSummary: Partial<Record<IELTSTaskType, number>>; // ← HERE
  overallConfidence: number;
}
```

**Resolution**: Task 0.10 will copy `IELTSTaskType` to `src/types/ielts.types.ts` before deleting.

---

## 4. Files Being Deleted (PRD-0020)

| File | listening.parser.ts Imports From It? |
|------|-------------------------------------|
| `parser.router.ts` | ❌ No |
| `reading.parser.ts` | ❌ No |
| `hybrid-document.parser.ts` | ❌ No |
| `document.parser.ts` | ❌ No |
| `quiz.parser.ts` | ❌ No |
| `section.detector.ts` | ❌ No |
| `diagnostics.ts` | ❌ No |
| `types/ielts.types.ts` | ⚠️ **YES** |
| `aiParser.js` | ❌ No |
| `textParser.js` | ❌ No |
| `question-type-detector.ts` | ❌ No |

---

## 5. Files Being KEPT

| File | Purpose |
|------|---------|
| `types/parser.types.ts` | Shared parser types (CanHandleResult, etc.) |
| `types/index.ts` | Barrel exports |

---

## 6. Resolution Plan

### Step 1: Before deleting `ielts.types.ts`

Create new file `src/types/ielts.types.ts` with:

```typescript
/**
 * IELTS Type Definitions
 * Extracted from services/parser/types/ielts.types.ts for PRD-0020 migration
 */

export type IELTSTaskType =
  | 'READING_MC'
  | 'READING_TFNG'
  | 'READING_YNNG'
  | 'READING_MATCHING_HEADINGS'
  | 'READING_MATCHING_INFORMATION'
  | 'READING_MATCHING_FEATURES'
  | 'READING_MATCHING_ENDINGS'
  | 'READING_COMPLETION'
  | 'READING_SHORT_ANSWER'
  | 'READING_DIAGRAM'
  | 'LISTENING_COMPLETION'
  | 'LISTENING_MC'
  | 'LISTENING_MATCHING'
  | 'LISTENING_DIAGRAM'
  | 'LISTENING_SHORT_ANSWER'
  | 'UNKNOWN';
```

### Step 2: Update listening.parser.ts import

Change line 22 from:
```typescript
import type { IELTSTaskType } from './types/ielts.types';
```

To:
```typescript
import type { IELTSTaskType } from '../../types/ielts.types';
```

### Step 3: Delete old file

Only after steps 1-2 are complete, delete `services/parser/types/ielts.types.ts`.

---

## 7. Verification Checklist

- [x] Analyzed all imports in listening.parser.ts
- [x] Identified dependency on ielts.types.ts (IELTSTaskType)
- [x] Confirmed no dependency on other files being deleted
- [x] Created resolution plan (Task 0.10)
- [ ] Resolution implemented (pending)
- [ ] Import updated in listening.parser.ts
- [ ] Build verified after changes
