---
title: File Extractor Audit
createdAt: '2026-02-27T15:25:56.683Z'
updatedAt: '2026-02-27T15:25:57.955Z'
description: Audit results of file extraction utilities during migration
tags:
  - migration
  - audit
  - file-extractor
---
# File-Extractor Service Audit

> **Task**: 0.12 - Audit `file-extractor` service for reuse in new system  
> **Date**: 2026-02-05  
> **Verdict**: ✅ **REUSE AS-IS** - No modifications needed

---

## 1. Service Overview

**Location**: `src/services/file-extractor/file.extractor.ts`  
**Size**: 197 lines  
**Dependencies**: 
- `mammoth` (DOCX extraction)
- `pdfjs-dist` (PDF extraction)
- `Result` type from `../../types/result.types`

---

## 2. Exported Functions

| Function | Purpose | Reusable? |
|----------|---------|-----------|
| `extractTextFromFile(file)` | Main entry - routes to correct extractor | ✅ Yes |
| `getSupportedExtensions()` | Returns `['txt', 'docx', 'pdf']` | ✅ Yes |
| `getFileInputAccept()` | Returns `.txt,.docx,.pdf` | ✅ Yes |
| `isFileTypeSupported(file)` | Validates file type | ✅ Yes |
| `getMaxFileSize()` | Returns 10MB limit | ✅ Yes |

---

## 3. Supported File Types

| Extension | Extractor | Library | Status |
|-----------|-----------|---------|--------|
| `.txt` | `extractTxt()` | Native `file.text()` | ✅ Working |
| `.docx` | `extractDocx()` | `mammoth` | ✅ Working |
| `.pdf` | `extractPdf()` | `pdfjs-dist` | ✅ Working |
| `.doc` | N/A | Not supported | ⚠️ Error message |

---

## 4. Key Features

### 4.1 File Size Validation
```typescript
const maxSize = 10 * 1024 * 1024; // 10MB
if (file.size > maxSize) { ... }
```

### 4.2 Dynamic Imports (Code Splitting)
```typescript
// Only load mammoth when needed
const mammoth = await import('mammoth');

// Only load pdf.js when needed  
const pdfjsLib = await import('pdfjs-dist');
```

### 4.3 Result Type Pattern
```typescript
// Consistent error handling
return { success: true, data: text };
return { success: false, error: 'Error message' };
```

### 4.4 PDF Worker Configuration
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
```

---

## 5. Current Usage

| File | Usage |
|------|-------|
| `useTestDocumentParser.ts` | Dynamic import in `handleFileUpload()` |

```typescript
// Example usage in hook
const { extractTextFromFile, isFileTypeSupported } = 
  await import('../../services/file-extractor/file.extractor');
```

---

## 6. Recommendation for New System

### ✅ REUSE AS-IS

**Reasons**:
1. **Clean design** - Single responsibility, well-structured
2. **Type-safe** - Uses `Result<string>` pattern
3. **No parser dependencies** - Completely standalone
4. **Dynamic imports** - Good for bundle size
5. **Error handling** - Comprehensive, user-friendly messages
6. **Tests exist** - `file.extractor.test.ts` (12KB)

### No Modifications Needed

The service is already suitable for Phase 2 (Document Conversion):
- PRD specifies: "File extractors produce **plain text**"
- This service does exactly that

---

## 7. Integration in New System

### Phase 2: Document Conversion Layer

```typescript
// New useReadingParser.ts hook
import { extractTextFromFile, isFileTypeSupported } from '../../services/file-extractor/file.extractor';

async function handleFileUpload(file: File) {
  if (!isFileTypeSupported(file)) {
    // Show error
    return;
  }
  
  const result = await extractTextFromFile(file);
  
  if (result.success) {
    // Pass to new parser pipeline
    await parseReadingTest(result.data);
  }
}
```

---

## 8. Potential Enhancements (Optional)

| Enhancement | Priority | Effort |
|-------------|----------|--------|
| Add Markdown (.md) support | Low | 1 hour |
| Add progress callback for large PDFs | Low | 2 hours |
| Add RTF support | Very Low | 3 hours |

**Note**: These are NOT required for PRD-0020. The current implementation is sufficient.

---

## 9. Test Coverage

**File**: `file.extractor.test.ts` (12KB)

Tests cover:
- TXT extraction
- DOCX extraction  
- PDF extraction
- File size validation
- Unsupported file types
- Error handling

**Verdict**: ✅ Tests should continue to pass with new system

---

## 10. Summary

| Aspect | Status |
|--------|--------|
| Code Quality | ✅ Excellent |
| Type Safety | ✅ Full Result<T> |
| Error Handling | ✅ Comprehensive |
| Test Coverage | ✅ Exists |
| Bundle Impact | ✅ Dynamic imports |
| Reusability | ✅ **REUSE AS-IS** |
