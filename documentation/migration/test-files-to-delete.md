# Test Files to Delete Alongside Parser Files

> **Task**: 0.11 - List all test files to delete alongside parser files  
> **Date**: 2026-02-05  
> **Purpose**: Track test files that must be deleted with their corresponding source files

---

## 1. Summary

| Location | Files to DELETE | Files to KEEP |
|----------|----------------|---------------|
| `src/services/parser/` | 3 test files | 1 test file |
| `src/utils/parsers/` | 4 test files | 0 |
| **Total** | **7 test files** | **1 test file** |

---

## 2. Test Files in `src/services/parser/`

### ❌ TO DELETE (with corresponding source file)

| Test File | Source File | Reason |
|-----------|-------------|--------|
| `document.parser.test.ts` | `document.parser.ts` | Source deprecated, both delete |
| `diagnostics.test.ts` | `diagnostics.ts` | Source deprecated, both delete |
| `section.detector.test.ts` | `section.detector.ts` | Source deprecated, both delete |

### ✅ TO KEEP

| Test File | Source File | Reason |
|-----------|-------------|--------|
| `listening.parser.test.ts` | `listening.parser.ts` | ⚠️ Source is PRESERVED |

---

## 3. Test Files in `src/utils/parsers/`

### ❌ TO DELETE (with corresponding source file)

| Test File | Source File | Reason |
|-----------|-------------|--------|
| `aiParser.test.js` | `aiParser.js` | Source deprecated, both delete |
| `textParser.test.js` | `textParser.js` | Source deprecated, both delete |
| `questionTypeDetector.test.js` | `question-type-detector.ts` | Source deprecated, both delete |
| `passageDetector.test.js` | (service file) | Related to deprecated system |

---

## 4. Additional Files in Types Directory

### `src/services/parser/types/`

| File | Action | Reason |
|------|--------|--------|
| `ielts.types.ts` | ❌ DELETE | Migrated to `src/types/ielts.types.ts` |
| `parser.types.ts` | ⚠️ REVIEW | May have shared types - check dependencies |
| Other files | ⚠️ REVIEW | Check for listening parser dependencies |

---

## 5. Complete Deletion List

### Phase 10 Delete Order (to avoid import errors):

**Step 1: Delete test files first**
```
src/services/parser/document.parser.test.ts
src/services/parser/diagnostics.test.ts
src/services/parser/section.detector.test.ts
src/utils/parsers/aiParser.test.js
src/utils/parsers/textParser.test.js
src/utils/parsers/questionTypeDetector.test.js
src/utils/parsers/passageDetector.test.js
```

**Step 2: Delete source files (after UI migration)**
```
src/services/parser/parser.router.ts
src/services/parser/reading.parser.ts
src/services/parser/hybrid-document.parser.ts
src/services/parser/document.parser.ts
src/services/parser/quiz.parser.ts
src/services/parser/diagnostics.ts
src/services/parser/section.detector.ts
src/services/parser/types/ielts.types.ts
src/utils/parsers/question-type-detector.ts
src/utils/parsers/aiParser.js
src/utils/parsers/textParser.js
```

**Step 3: Delete hook (after CreateTestPage migration)**
```
src/hooks/test/useTestDocumentParser.ts
```

---

## 6. Files to PRESERVE

These files are NOT being deleted:

| File | Reason |
|------|--------|
| `src/services/parser/listening.parser.ts` | Used for Listening tests |
| `src/services/parser/listening.parser.test.ts` | Tests for listening parser |
| `src/services/parser/listening.router.ts` | New router for listening (Task 0.9) |
| `src/services/parser/types/parser.types.ts` | Has shared types - review dependencies |
| `src/types/ielts.types.ts` | New location for IELTSTaskType |

---

## 7. Pre-Deletion Checklist

Before deleting in Phase 10:

- [ ] All new services created and working (Phase 1-5)
- [ ] CreateTestPage migrated to new hook (Phase 6)
- [ ] ListeningTestBuilder uses `listeningRouter` (update import)
- [ ] All tests passing with new system
- [ ] Build verified: `npm run build` succeeds
- [ ] No console errors in application
