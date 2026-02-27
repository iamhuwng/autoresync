# SOP: File Upload Patterns & R2 Storage Strategy

> **Purpose**: Document the correct patterns for file uploads to prevent data loss and ensure proper storage lifecycle management.
> 
> **Created**: 2026-02-04
> **Last Updated**: 2026-02-04
> **Related**: `r2Storage.ts`, `AvatarUploader.tsx`

---

## 📋 Summary

Our application uses Cloudflare R2 for file storage with a **two-path strategy**:

| Path | Purpose | Auto-Delete | Use Case |
|------|---------|-------------|----------|
| `temp/` | Temporary staging | ✅ Yes (24hr) | Files during creation workflows |
| Permanent folders | Long-term storage | ❌ No | User uploads, saved content |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        R2 Storage Bucket                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  temp/                          (24-hour auto-delete lifecycle) │
│  ├── audio/                     Test audio during creation      │
│  ├── images/                    Test images during creation     │
│  └── uploads/                   Other temp files                │
│                                                                 │
│  audio/                         (Permanent - no auto-delete)    │
│  ├── {timestamp}-{filename}     Saved test audio files          │
│                                                                 │
│  images/                        (Permanent - no auto-delete)    │
│  ├── {timestamp}-{filename}     Saved test images               │
│                                                                 │
│  avatars/                       (Permanent - no auto-delete)    │
│  ├── {timestamp}-{filename}     User profile pictures           │
│                                                                 │
│  announcements/                 (Permanent - no auto-delete)    │
│  ├── {timestamp}-{filename}     Course announcement attachments │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

> **Audit Note (2026-02-04):** All upload patterns verified. CourseAnnouncementEditor was fixed to use permanent storage. See audit section at bottom of this document.

---

## 🎯 Decision Matrix: Which Upload Method to Use?

Ask these questions to determine the correct upload pattern:

### Question 1: Can the user abandon this upload mid-process?

| Answer | Pattern | Example |
|--------|---------|---------|
| **YES** - User is in a creation flow that might be cancelled | Temp → Permanent | Test creation, Quiz builder |
| **NO** - Upload is immediately "saved" | Direct Permanent | Avatar upload, Profile image |

### Question 2: Is there a "Save" action after the upload?

| Answer | Pattern | Example |
|--------|---------|---------|
| **YES** - File is part of a larger entity being saved | Temp → Permanent | Audio in a test question |
| **NO** - File is saved immediately on upload | Direct Permanent | User avatar |

### Question 3: Would orphaned files be a problem?

| Answer | Pattern | Example |
|--------|---------|---------|
| **YES** - Abandoned files waste storage | Temp → Permanent | Test creation audio |
| **NO** - Each file is intentionally uploaded | Direct Permanent | Avatar, document uploads |

---

## 📝 Available Methods in `r2StorageService`

### For Temp → Permanent Workflow (Test Creation)

```typescript
// Step 1: Upload to temp folder
const result = await r2StorageService.uploadFile(file, 'audio');
// Result: { key: 'temp/audio/123-file.mp3', isTemp: true, ... }

// Step 2: When user saves, move to permanent
const moved = await r2StorageService.moveToPermanent(result.key);
// Result: { newKey: 'audio/123-file.mp3', ... }
```

**Use for:**
- Test creation (audio files)
- Test creation (question images)
- Quiz builder media
- Any multi-step wizard with potential abandonment

### For Direct Permanent Upload

```typescript
// Single step - directly to permanent storage
const result = await r2StorageService.uploadFilePermanent(file, 'documents');
// Result: { key: 'documents/123-file.pdf', isTemp: false, ... }

// Convenience method for avatars
const result = await r2StorageService.uploadAvatar(file, userId);
// Result: { key: 'avatars/userId/123-file.jpg', isTemp: false, ... }
```

**Use for:**
- User avatars
- Profile pictures
- Document uploads (PDFs, etc.)
- Any upload that should persist immediately

---

## ⚠️ Common Pitfalls

### Pitfall 1: Using Temp Folder for Immediate Uploads

❌ **WRONG**: Using `uploadImage()` for avatars
```typescript
// This uploads to temp/ which gets auto-deleted after 24 hours!
const result = await r2StorageService.uploadImage(file, 'avatars');
// Even if you call moveToPermanent(), the /move endpoint might fail
```

✅ **CORRECT**: Using `uploadAvatar()` for avatars
```typescript
// This uploads directly to permanent storage
const result = await r2StorageService.uploadAvatar(file);
```

### Pitfall 2: Forgetting to Move Files on Save

❌ **WRONG**: Uploading to temp but never moving
```typescript
// When test is saved, you MUST move files!
const audioResult = await r2StorageService.uploadAudio(file, 'audio');
// ... user saves test ...
// BUG: Audio is still in temp/ and will be deleted in 24 hours!
```

✅ **CORRECT**: Move files when saving
```typescript
const audioResult = await r2StorageService.uploadAudio(file, 'audio');
// ... user saves test ...
const moved = await r2StorageService.moveToPermanent(audioResult.key);
// Now audio is in permanent storage
```

### Pitfall 3: Relying on Move Endpoint Without Fallback

The `/move` endpoint might fail (404/405 if not implemented on worker). The code handles this gracefully but logs a warning:

```typescript
// In moveToPermanent():
if (response.status === 404 || response.status === 405) {
    console.warn('⚠️ Move endpoint not available. File remains in temp storage');
    return { success: false, newUrl: tempUrl, newKey: tempKey };
}
```

Always check the `success` field if you need to ensure the file was moved.

---

## 📁 File Type Reference

| File Type | Method | Destination | Auto-Delete |
|-----------|--------|-------------|-------------|
| Test audio | `uploadAudio()` → `moveToPermanent()` | `temp/audio/` → `audio/` | 24hr (temp only) |
| Test images | `uploadImage()` → `moveToPermanent()` | `temp/images/` → `images/` | 24hr (temp only) |
| User avatars | `uploadAvatar()` | `avatars/` | Never |
| Profile images | `uploadFilePermanent()` | `{folder}/` | Never |
| Documents | `uploadFilePermanent()` | `documents/` | Never |

---

## 🔍 Debugging File Upload Issues

### Issue: File disappears after ~24 hours

**Cause**: File was uploaded to temp folder but never moved to permanent.

**Solution**: 
1. Check if the upload URL contains `/temp/`
2. If yes, ensure `moveToPermanent()` is called when saving
3. Or switch to `uploadFilePermanent()` if appropriate

### Issue: Avatar not displaying after re-upload

**Cause**: Using temp folder for avatars + profile form overwrites URL with null.

**Solution**: 
1. Use `uploadAvatar()` for permanent storage
2. Track if avatar was explicitly changed in form state
3. Only include `avatarUrl` in update if it was changed

### Issue: Move operation silently fails

**Cause**: R2 Worker's `/move` endpoint might not be implemented.

**Solution**: 
1. Check console for warning: "Move endpoint not available"
2. Implement `/move` endpoint in Cloudflare Worker
3. Or handle `success: false` from `moveToPermanent()`

---

## 📚 Related Files

- **Storage Service**: `src/services/r2Storage.ts`
- **Avatar Uploader**: `src/components/profile/AvatarUploader.tsx`
- **Profile Form**: `src/components/profile/ProfileCompletionForm.tsx`
- **Test Editor**: (uses temp → permanent for audio/images)

---

## ✅ Checklist for New Upload Features

When implementing a new file upload feature, ask:

- [ ] Can the user abandon this upload? (→ Use temp folder)
- [ ] Is there a "Save" action? (→ Use temp, move on save)
- [ ] Should the file persist immediately? (→ Use permanent)
- [ ] Am I moving files when the parent entity saves?
- [ ] Am I using the correct method from r2StorageService?
- [ ] Have I tested the 24-hour lifecycle behavior?

---

> **Update Note (2026-02-04)**: This SOP was created after fixing a bug where user avatars were disappearing after 24 hours due to incorrect use of the temp folder strategy. The lesson learned: **Always match the upload strategy to the use case**.

---

## 📊 Full Codebase Audit (2026-02-04)

This section documents all file upload patterns currently in the codebase.

### Upload Pattern Summary

| Component | Method | Folder | Pattern | Status |
|-----------|--------|--------|---------|--------|
| `AvatarUploader.tsx` | `uploadAvatar()` | `avatars/` | Direct permanent | ✅ Correct |
| `ListeningTestBuilder.tsx` | `uploadAudio()` | `temp/audio/` | Temp → Permanent | ✅ Correct |
| `listeningTestStorage.ts` | `moveToPermanent()` | `audio/` | Move on save | ✅ Correct |
| `TestEditor.tsx` | `isTempFile()` + `moveMultipleToPermanent()` | Various | Move on save | ✅ Correct |
| `AudioResourceEditor.tsx` | `uploadAudio()` | `temp/audio/` | Temp → Permanent | ✅ Correct |
| `ImageResourceEditor.tsx` | `uploadImage()` | `temp/images/` | Temp → Permanent | ✅ Correct |
| `PassageEditorPanel.jsx` | `uploadImage()` | `temp/images/` | Temp → Permanent | ✅ Correct |
| `QuestionEditorPanel.jsx` | `uploadImage()` | `temp/images/` | Temp → Permanent | ✅ Correct |
| `CourseAnnouncementEditor.tsx` | `uploadFilePermanent()` | `announcements/` | Direct permanent | ✅ Fixed |

### Issues Found & Fixed

#### Issue 1: CourseAnnouncementEditor (Fixed 2026-02-04)

**Problem:** Was using `uploadFile()` which uploads to `temp/` folder, causing announcement attachments to be deleted after 24 hours.

**Fix:** Changed to `uploadFilePermanent()` with folder `announcements/`.

```typescript
// BEFORE (buggy):
const result = await r2StorageService.uploadFile(file, 'attachments');

// AFTER (fixed):
const result = await r2StorageService.uploadFilePermanent(file, 'announcements');
```

### Current Permanent Folders in Use

1. **`audio/`** - Test audio files (after save)
2. **`images/`** - Test images (after save)
3. **`avatars/`** - User profile pictures
4. **`announcements/`** - Course announcement attachments

### Temp Folders (24-hour auto-delete)

1. **`temp/audio/`** - Test audio during creation
2. **`temp/images/`** - Test images during creation
3. **`temp/uploads/`** - Generic temp uploads

---

*Last audited: 2026-02-04*
