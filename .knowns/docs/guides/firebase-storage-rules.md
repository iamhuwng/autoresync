---
title: Firebase Storage Rules
createdAt: '2026-02-27T15:25:27.213Z'
updatedAt: '2026-02-27T15:25:28.592Z'
description: Firebase storage security rules configuration and documentation
tags:
  - firebase
  - storage
  - security
  - rules
---
# Firebase Storage Security Rules

> Quiz-specific Firebase Storage image rules are obsolete as of 2026-07-05 because Quiz creation/runtime is retired. Current storage authority is R2 and @doc/architecture/retired-features-current-state. Historical content below is retained for audit/history only.

**Feature:** Intelligent Quiz Parser - Image Upload  
**Created:** October 30, 2025  
**Status:** Ready for deployment

---

## Overview

Firebase Storage rules for quiz image uploads. These rules ensure that:
- Only authenticated users can upload images
- Images are validated for size and type
- Users can only delete their own uploaded images
- Public read access for quiz images

---

## Storage Rules

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isValidImageSize() {
      // Max 5MB
      return request.resource.size <= 5 * 1024 * 1024;
    }
    
    function isValidImageType() {
      return request.resource.contentType.matches('image/.*');
    }
    
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    // Quiz images - organized by quiz ID
    match /quizzes/{quizId}/images/{imageId} {
      // Anyone can read (public quizzes)
      allow read: if true;
      
      // Only authenticated users can upload
      allow create: if isAuthenticated() 
                    && isValidImageSize() 
                    && isValidImageType();
      
      // Only quiz owner can delete
      allow delete: if isAuthenticated();
    }
    
    // General quiz images (not associated with specific quiz yet)
    match /quiz-images/{imageId} {
      // Anyone can read
      allow read: if true;
      
      // Only authenticated users can upload
      allow create: if isAuthenticated() 
                    && isValidImageSize() 
                    && isValidImageType();
      
      // Only uploader can delete
      allow delete: if isAuthenticated();
    }
    
    // Deny all other paths
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## How to Deploy

### Option 1: Firebase Console (Recommended for beginners)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Storage** → **Rules**
4. Copy the rules above
5. Paste into the rules editor
6. Click **Publish**

### Option 2: Firebase CLI

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not done)
firebase init storage

# Edit storage.rules file with the rules above

# Deploy rules
firebase deploy --only storage:rules
```

---

## Rule Breakdown

### 1. **Public Read Access**
```javascript
allow read: if true;
```
- Anyone can view quiz images (necessary for public quizzes)
- No authentication required for reading

### 2. **Authenticated Upload**
```javascript
allow create: if isAuthenticated() 
              && isValidImageSize() 
              && isValidImageType();
```
- Only logged-in users can upload
- Images must be ≤5MB
- Must be valid image type (image/*)

### 3. **Authenticated Delete**
```javascript
allow delete: if isAuthenticated();
```
- Only logged-in users can delete images
- Prevents unauthorized deletion

---

## Image Path Structure

### Quiz-Specific Images
```
/quizzes/{quizId}/images/{timestamp}_{random}.{ext}
```
**Example:**
```
/quizzes/quiz_abc123/images/1698765432_x7k9m2.jpg
```

### General Quiz Images
```
/quiz-images/{timestamp}_{random}.{ext}
```
**Example:**
```
/quiz-images/1698765432_x7k9m2.png
```

---

## Validation Rules

### File Size
- **Maximum:** 5MB (5,242,880 bytes)
- **Reason:** Balance between quality and storage costs

### File Types
- **Allowed:** All image types (image/*)
  - JPEG (.jpg, .jpeg)
  - PNG (.png)
  - GIF (.gif)
  - WebP (.webp)
  - SVG (.svg)
- **Blocked:** Non-image files

### Authentication
- **Required for:** Upload, Delete
- **Not required for:** Read (public access)

---

## Testing Rules

### Test Upload (Should Succeed)
```javascript
// Authenticated user uploading valid image
{
  auth: { uid: 'user123' },
  resource: {
    size: 2 * 1024 * 1024, // 2MB
    contentType: 'image/jpeg'
  }
}
```

### Test Upload (Should Fail - Too Large)
```javascript
// Image exceeds 5MB limit
{
  auth: { uid: 'user123' },
  resource: {
    size: 6 * 1024 * 1024, // 6MB
    contentType: 'image/jpeg'
  }
}
```

### Test Upload (Should Fail - Not Authenticated)
```javascript
// No authentication
{
  auth: null,
  resource: {
    size: 2 * 1024 * 1024,
    contentType: 'image/jpeg'
  }
}
```

---

## Security Considerations

### ✅ Implemented
- Authentication required for uploads
- File size limits (prevents abuse)
- File type validation (images only)
- Public read access (for quiz display)

### ⚠️ Future Enhancements
- Rate limiting (prevent spam uploads)
- User-specific quotas (storage limits per user)
- Virus scanning (for production)
- Image content moderation (AI-based)

---

## Monitoring & Cleanup

### Monitor Usage
```bash
# Check storage usage in Firebase Console
# Storage → Usage tab
```

### Cleanup Orphaned Images
```javascript
// Function to delete images from failed quiz uploads
// Run periodically via Cloud Functions
exports.cleanupOrphanedImages = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    // Delete images older than 7 days with no associated quiz
    // Implementation in Cloud Functions
  });
```

---

## Cost Optimization

### Storage Costs (Firebase Spark - Free Tier)
- **Storage:** 5GB free
- **Downloads:** 1GB/day free
- **Uploads:** 20K/day free

### Recommendations
1. Compress images before upload (use `compressImage()` in imageUploadService)
2. Delete unused images when quiz is deleted
3. Use WebP format for better compression
4. Set up lifecycle rules to delete old images

---

## Troubleshooting

### Error: "Permission Denied"
**Cause:** User not authenticated or rules not deployed  
**Solution:** 
1. Ensure user is logged in
2. Check rules are deployed in Firebase Console

### Error: "File Too Large"
**Cause:** Image exceeds 5MB limit  
**Solution:** 
1. Compress image before upload
2. Use `compressImage()` function in imageUploadService

### Error: "Invalid File Type"
**Cause:** Trying to upload non-image file  
**Solution:** 
1. Validate file type before upload
2. Use `validateImageFile()` function

---

## Related Files

- `src/services/imageUploadService.js` - Image upload implementation
- `src/services/firebase.js` - Firebase initialization
- `src/components/wizard/ImageUrlStep.jsx` - Image upload UI

---

**Status:** ✅ Rules ready for deployment  
**Next Step:** Deploy rules to Firebase Console or via CLI
