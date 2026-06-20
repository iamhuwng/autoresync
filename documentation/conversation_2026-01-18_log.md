# Conversation Log - January 18, 2026

> **Historical notice:** Google Drive references in this log are obsolete and non-authoritative. No supported feature uses Google Drive; all active uploads use Cloudflare R2. Implementation residue cleanup is deferred.

## Section 1: Google Drive Audio Streaming Research

**Time:** 6:26 PM UTC+7  
**Request:** Research feasibility of using Google Drive API v3 with `alt=media` for audio streaming in listening tests.

### Problem Statement
The listening test implementation faces a control conundrum:
- Force autoplay ❌ → Student must click play to start
- Hide play button ❌ → Audio can never start  
- Show play button ✅ → Student can also pause (unacceptable for IELTS)

Current iframe embed approach provides no programmatic control.

### Research Conducted

1. **Analyzed current implementation:**
   - `src/services/googleDriveAudio.ts` - Uses `uc?export=download` and iframe embed fallback
   - `src/skills/listening/components/AudioPlayer.tsx` - Falls back to embed on CORS error
   - `src/services/googleDrive.js` - Handles OAuth upload flow

2. **Researched Google Drive API v3 `alt=media` approach:**
   - URL format: `https://www.googleapis.com/drive/v3/files/{fileId}?alt=media&key={API_KEY}`
   - Works for public files without OAuth
   - **BUT: Google Drive does NOT send CORS headers**

3. **Key Findings from research:**
   - Stack Overflow confirms 403 errors and CORS blocking
   - GitHub issues (google-api-javascript-client #600, #704) document CORS problems
   - Google Issue Tracker #150193301: "Accessing files from Google Drive results in CORS error"

### Conclusion

**Google Drive API with `alt=media` will NOT solve the problem** due to CORS restrictions.

### Files Created

1. **Test file:** `test-google-drive-audio-api.html`
   - Interactive test page to verify CORS behavior
   - Tests API v3, direct download, and embed methods
   - Run in browser to confirm findings

2. **Research document:** `documentation/research/GOOGLE_DRIVE_AUDIO_STREAMING_RESEARCH.md`
   - Comprehensive analysis of the problem
   - All alternative solutions evaluated
   - Implementation recommendations

### Recommended Solutions

| Solution | Effort | Recommended |
|----------|--------|-------------|
| **Firebase Function Proxy** | Medium | ✅ For MVP |
| **Firebase Storage Migration** | Medium | ✅ Long-term |
| Cloudflare R2 | High | Alternative |
| Service Worker | N/A | Won't work |
| Blob Download | Low | Poor UX |

### Next Steps (User Decision Required)

1. **Option A - Server Proxy (Quick):** Create Firebase Function to proxy audio with CORS headers
2. **Option B - Firebase Storage (Better):** Migrate audio uploads from Drive to Firebase Storage

---
