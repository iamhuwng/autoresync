# Conversation Log - 2026-02-11

## Session Start: 23:39 (UTC+7)

---

## 1. Console Error Analysis (Test Creation Parsing)

### User Request
User shared console logs from the application during a test creation flow. The logs showed multiple errors during document parsing when attempting to create a new test.

### Errors Identified

#### 🔴 Error 1: Gemini API 403 — HTTP Referrer Blocked
- **File:** `gemini.provider.ts:1024`
- **Error:** `[403] API_KEY_HTTP_REFERRER_BLOCKED` — requests from `http://localhost:5173/` are blocked
- **Root Cause:** Gemini API key 2/3 has HTTP referrer restrictions in Google Cloud Console that don't include `localhost:5173`
- **Impact:** Gemini passages parsing failed, triggering Groq fallback

#### 🔴 Error 2: Groq JSON Recovery Failed
- **File:** `groq.provider.ts:1030`
- **Error:** All 5 JSON recovery strategies failed, Groq returned non-JSON response
- **Root Cause:** `llama-3.3-70b-versatile` model returned garbled output for passages-only prompt
- **Impact:** Combined with Gemini failure, both AI providers failed. System fell back to offline rule-based parser.

#### 🟢 Offline Fallback Succeeded
- `offline-parser.service.ts` successfully parsed the document using rule-based classification
- Checkpoint saved at `classifying, 75%`, then deleted after completion
- Draft saved to Firestore: `hpSaM5MJVp6noRLGWACo`

#### 🟡 Error 3: Multiple Re-renders (4x)
- Navigation Service initialized 4 times
- TeacherLobby `useEffect` triggered 4 times
- Caused by React StrictMode double-render + page navigation
- Not a functional bug but adds unnecessary Firebase queries

#### 🟡 Error 4: Firestore Listen Blocked
- `ERR_BLOCKED_BY_CLIENT` on Firestore streaming endpoint
- Caused by browser extension (ad blocker), not a code issue

### Actions Recommended
1. Fix Gemini API key referrer restriction in Google Cloud Console
2. Improve Gemini provider to detect and skip referrer-blocked keys faster
3. Add `jsonrepair` to Groq provider (Gemini already uses it)

### Status: Awaiting user direction on which fixes to implement
