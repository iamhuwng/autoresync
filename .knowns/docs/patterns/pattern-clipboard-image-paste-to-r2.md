---
title: 'Pattern: Clipboard Image Paste to R2'
createdAt: '2026-03-12T09:51:14.000Z'
updatedAt: '2026-03-12T09:52:19.688Z'
description: >-
  Canonical pattern for implementing clipboard image paste upload to Cloudflare
  R2 storage. Covers events, features, implementations, lessons learned, logic
  flow, and moving forward standard.
tags:
  - pattern
  - clipboard
  - image-upload
  - r2
  - standard
---
# Pattern: Clipboard Image Paste to R2

> Canonical pattern for implementing clipboard screenshot paste → R2 upload in any editor component.

---

## 1. Events (Where Clipboard Images Enter)

### 1A. `paste` DOM Event (Ctrl+V)
**Source:** `window` or specific container element
**API:** `e.clipboardData.items` → `DataTransferItemList`
**When:** User hits Ctrl+V while focus is inside the component

```typescript
// The paste event fires on the DOM element that has focus
window.addEventListener('paste', (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      const file = items[i].getAsFile(); // ← This is a File object
      processImageFile(file);
      break;
    }
  }
});
```

**Key behavior:**
- Works in all browsers (Chrome, Firefox, Edge, Safari)
- Must check `items[i].type.indexOf('image') !== -1` (not strict equality)
- Must call `e.preventDefault()` to stop default paste behavior
- Returns a `File` object directly — compatible with R2 upload

### 1B. `navigator.clipboard.read()` API (Button Click)
**Source:** User clicks a "Paste" button
**API:** `navigator.clipboard.read()` → `ClipboardItem[]`
**When:** User explicitly clicks a paste button (requires user gesture + permission)

```typescript
const handlePasteClick = async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File([blob], `clipboard-${Date.now()}.png`, { type: imageType });
        processImageFile(file);
        return;
      }
    }
    alert('No image found in clipboard!');
  } catch (err) {
    alert('Clipboard access denied. Use Ctrl+V instead.');
  }
};
```

**Key behavior:**
- Requires HTTPS (won't work on localhost in some browsers — but Vite dev server is fine)
- Chrome shows a permission prompt on first use per origin
- Firefox support is inconsistent — always provide Ctrl+V fallback
- Must be called from a user gesture (click handler)
- Returns `Blob`, not `File` — must wrap: `new File([blob], name, { type })`

---

## 2. Features per Implementation

| Component | File Picker | Paste Event (Ctrl+V) | Paste Button | Scope |
|-----------|:-----------:|:--------------------:|:------------:|-------|
| `QuestionEditorPanel.jsx` | ✅ | ✅ (window-level, gated by modal open + auth) | ❌ | Per-question (IELTS) |
| `PassageEditorPanel.jsx` | ✅ | ✅ (window-level, gated by modal open + auth) | ❌ | Per-passage (IELTS) |
| `ListeningTestBuilder.tsx` | ✅ | ✅ (window-level, gated by step) | ✅ (`navigator.clipboard.read()`) | Per-section (Listening) |
| `THCSQuestionBlock.tsx` | ✅ | ❌ | ❌ | Per-question (THCS) — **TO ADD** |

---

## 3. Implementation Variants

### Variant A: Modal-Gated Paste (QuestionEditorPanel, PassageEditorPanel)
- Image upload is behind an "Upload Image" modal
- Paste listener activates ONLY when modal is open AND authenticated
- **Pro:** No accidental clipboard interception
- **Con:** Extra clicks (open modal → authenticate → paste)
- **Legacy pattern** — originated when Google Drive auth was needed

### Variant B: Always-On Paste with Guard (ListeningTestBuilder)
- Paste listener on `window` when on `questions-images` step
- Guards: skips if target is `<input>` or `<textarea>`
- If multiple sections exist, shows alert to use per-section paste button
- **Pro:** Most natural UX — just Ctrl+V
- **Con:** Can intercept text paste if user isn't careful

### Variant C: Inline Paste Button + Zone (PROPOSED for THCS — Moving Forward Standard)
- "📋 Paste Screenshot" button next to "🖼️ Add Image"
- Ctrl+V listener scoped to the question block div (not window)
- No modal, no auth gate (R2 doesn't need auth)
- **Pro:** Minimal friction, clear affordance, no accidental interception
- **Con:** None significant — this is the recommended pattern going forward

---

## 4. Lessons Learned from Trials & Failures

### ❌ Lesson 1: The Authentication Gate is Vestigial
**Context:** `QuestionEditorPanel` and `PassageEditorPanel` both have an "authenticate" step before allowing paste.
**Reality:** R2 doesn't need authentication — the Worker handles security. The `handleAuthenticate` function just sets `isAuthenticated = true`.
**Lesson:** When migrating from Google Drive to R2, the auth gate became dead code but was never removed. New implementations should NOT include this gate.

### ❌ Lesson 2: `document.execCommand('paste')` Doesn't Work for Images
**Context:** `ListeningTestBuilder.tsx` has a fallback using `document.execCommand('paste')` with an invisible textarea.
**Reality:** `execCommand('paste')` only works for text content. For images, it always fails.
**Lesson:** Don't bother with `execCommand` fallback for images. Just show "Use Ctrl+V" message as fallback.

### ❌ Lesson 3: `FileReader.readAsDataURL` Creates Huge Data URLs
**Context:** `ListeningTestBuilder` uses `reader.readAsDataURL(blob)` and stores the result as `imageUrl`.
**Reality:** A 2MB PNG screenshot becomes a ~2.7MB base64 string stored in React state and potentially Firebase.
**Lesson:** Always upload to R2 first, then store the R2 URL. Never store base64 data URLs in state/database. The THCS pattern (upload → store URL) is correct.

### ❌ Lesson 4: Window-Level Paste Listeners Conflict
**Context:** If multiple components add `window.addEventListener('paste', ...)`, they fight.
**Reality:** When `QuestionEditorPanel` and `ListeningTestBuilder` are both mounted (unlikely but possible in future), both handlers fire.
**Lesson:** Prefer component-scoped paste listeners (`onPaste` prop on a div) or at least use strict activation guards and `e.stopPropagation()`.

### ❌ Lesson 5: Missing File Name for Clipboard Images
**Context:** `clipboardData.items[i].getAsFile()` returns a File with name `"image.png"` (generic).
**Reality:** R2 upload uses `Date.now()-${file.name}` for the key, so all clipboard pastes get identical-looking names.
**Lesson:** Generate a descriptive filename: `clipboard-${Date.now()}.png` or `q${questionNumber}-screenshot-${Date.now()}.png`.

---

## 5. Logic Flow (Canonical)

```
User copies screenshot (PrtSc, Snipping Tool, etc.)
         │
         ├──► Ctrl+V on question block
         │    └── paste event fires on div[tabIndex=0]
         │         └── e.clipboardData.items → find image type
         │              └── items[i].getAsFile() → File object
         │
         └──► Click "📋 Paste Screenshot" button
              └── navigator.clipboard.read() → ClipboardItem[]
                   └── item.getType('image/png') → Blob
                        └── new File([blob], name, {type}) → File object
                             │
                             ▼
                    processImageFile(file: File)
                             │
                    ┌────────┴────────┐
                    │ Validate        │
                    │ • type ∈ valid  │
                    │ • size ≤ 5MB    │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │ Upload to R2    │
                    │ uploadImage()   │
                    │ → temp/images/  │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │ Update state    │
                    │ • imageUrl      │
                    │ • _imageKey     │
                    └─────────────────┘
```

---

## 6. Moving Forward Standard

### ✅ ALWAYS DO:
1. **Provide BOTH input methods**: File picker button + paste (Ctrl+V and/or button)
2. **Upload to R2 first**, then store the URL — never store base64
3. **Use `processImageFile(file)` helper** — single function for both file picker and clipboard
4. **Validate before upload**: type whitelist + size limit
5. **Reset file input** after selection: `e.target.value = ''`
6. **Show loading state** during upload (disable buttons, show spinner)
7. **Generate descriptive filenames** for clipboard images
8. **Guard paste handlers**: skip if target is `<input>` or `<textarea>`
9. **Cleanup listeners** in `useEffect` return function

### ❌ NEVER DO:
1. Never add auth gates for R2 uploads (no OAuth needed)
2. Never store base64 data URLs in state or database
3. Never use `document.execCommand('paste')` for images
4. Never add window-level paste listeners without strict guards
5. Never use `readAsDataURL` for upload — pass File directly to R2 service

### 📐 Reference Implementation Template:

```typescript
// ── processImageFile: shared upload logic ──
const processImageFile = async (file: File | null) => {
  if (!file) return;
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    setUploadError('Invalid image type');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setUploadError('Max 5MB');
    return;
  }
  setUploading(true);
  setUploadError(null);
  try {
    const result = await r2StorageService.uploadImage(file, 'images');
    onUpdate({ ...question, imageUrl: result.url, _imageKey: result.key });
  } catch (err) {
    setUploadError(err instanceof Error ? err.message : 'Upload failed');
  } finally {
    setUploading(false);
  }
};

// ── Paste handler (Ctrl+V on component div) ──
const handlePaste = (e: React.ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      e.stopPropagation();
      const file = items[i].getAsFile();
      processImageFile(file);
      break;
    }
  }
};

// ── Paste button handler (navigator.clipboard API) ──
const handlePasteClick = async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File(
          [blob],
          `clipboard-${Date.now()}.png`,
          { type: imageType }
        );
        processImageFile(file);
        return;
      }
    }
    alert('No image in clipboard');
  } catch {
    alert('Clipboard access denied — use Ctrl+V instead');
  }
};
```

### JSX:
```tsx
<div onPaste={handlePaste} tabIndex={-1}>
  {/* File picker */}
  <input ref={fileInputRef} type="file" accept="image/*" hidden
    onChange={(e) => { processImageFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
  <button onClick={() => fileInputRef.current?.click()}>🖼️ Add Image</button>
  <button onClick={handlePasteClick}>📋 Paste Screenshot</button>
</div>
```

---

## 7. Source Components (Existing Implementations)

| File | Lines | Pattern Used |
|------|-------|--------------|
| `src/components/QuestionEditorPanel.jsx` | 134–207 | Variant A (modal-gated) |
| `src/components/PassageEditorPanel.jsx` | 91–168 | Variant A (modal-gated) |
| `src/skills/listening/builders/ListeningTestBuilder.tsx` | 641–695, 1558–1603 | Variant B (always-on + button) |
| `src/components/thcs-editor/THCSQuestionBlock.tsx` | 120–143 | File-only (no paste yet) |
