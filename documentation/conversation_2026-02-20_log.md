# Conversation Log: 2026-02-20

## 1. Refining Test Content Upload Modal UI

**User Request:**
When in test creation process, after choosing test type is IELTS, Reading; we got to the modal to input test content and parsing with AI before get to review step. This modal design is good but there a discrepancy between the inner components' design of the modal with the standard design language and the previous step. I want a subtle fix to mix the best of both worlds for this modal.

**Investigation:**
1. Reviewed `TestCreationModal.tsx` and `TestUploadWizard.tsx`.
2. Noticed `TestUploadWizard.tsx` (the "upload" step) was recently given a "Premium Redesign" with its own outer styling (borders, shadow, translucent background), header ("Create IELTS Reading Test"), and footer action buttons.
3. This duplicated the UI inside `TestCreationModal.tsx` which already provides a modal border, a "Content" header, and footer controls. The prior step (`MetadataStep.tsx`) correctly integrates into the parent modal.

**Actions Taken:**
1. Modified `TestUploadWizard.tsx`:
   - Stripped out the main container's outer card styling (border, background, boxShadow) so it blends perfectly into `TestCreationModal.tsx`.
   - Removed the duplicate header ("Create IELTS Reading Test") and the top gradient line.
   - Removed the isolated UI footer and `Start Parsing` button, so `TestUploadWizard.tsx` just exposes the premium inputs (Dropzone and Paste Area).
   - Replaced the `onStartParsing` and `handleParse` logic with an `onChange` prop to sync local state (`mode`, `selectedFile`, `pasteText`, `format`) directly back to its parent `TestCreationModal.tsx` on every change. Let React effect pass data back.
2. Modified `TestCreationModal.tsx`:
   - Changed `TestUploadWizard` to receive the `onChange` event, automatically updating `stepData` so `canProceed()` evaluates correctly.
   - Restored and customized the standard modal footer logic so the primary action button explicitly reads `"Start Parsing"` when on the `upload` step instead of `"Continue"`.
   - Pointed the `"Start Parsing"` modal button's `handleNext()` action straight to the standard `parsing` step flow, triggering `startRealParsing` smoothly via `useEffect`.

**Result:**
The `TestUploadWizard.tsx` component is now fully cohesive with the surrounding modal wrapper (`TestCreationModal.tsx`), removing duplicative titles and buttons. The inputs (the best of the premium overhaul) seamlessly sit inside standard modal constraints ("the best of both worlds"), and actions are correctly driven by the primary modal footer.

## 2. Security Audit: Admin Settings for AI API Keys

**User Request:**
Perform a security check for the AI API which an admin can add in the admin settings.

**Investigation:**
1. Traced "AdminSettingsPage" and the `addAPIKey`/`getAPIKeys` logic in `api-keys.service.ts`.
2. Reviewed the usages of `getDecryptedKeys()` in `gemini.provider.ts` and `groq.provider.ts`.
3. Checked Firebase security rules, environment configurations, and the encryption logic.

**Security Findings:**
1. **Critical Vulnerability - Hardcoded Encryption Key:**
   - In `api-keys.service.ts`, the encryption implementation uses a simple symmetric XOR cypher with a hardcoded `ENCRYPTION_KEY = 'mstu-kahoot-api-keys-2026';`. This exposes the key to anyone who views the frontend JavaScript bundle, essentially making the encryption useless to any moderately motivated attacker.
2. **Missing Firestore Rules:**
   - The app reads from and writes to the `settings/api_keys` document. However, `firestore.rules` is completely missing from the project (`database.rules.json` exists, but applies to RTDB). If not protected in the Google Cloud Console, this means any user (even unauthenticated) could potentially read the collection and extract the encrypted API keys, which they could then easily decrypt using the hardcoded key.
3. **Critical Architectural Risk - Client-Side Exposure:**
   - The AI API queries (`GoogleGenerativeAI`, `Groq`) connect directly from the user's browser, bypassing any backend. This requires the API Keys to be transmitted locally into the browser memory. Consequently, any user authorized to use the AI features (e.g. teachers) can intercept the network requests or read the browser memory, obtaining the plaintext Google/Groq API key to use for themselves, exhausting the quote limits.
4. **Functional Bug - Gemini Keys Not Loaded:**
   - While `groq.provider.ts` properly calls `getDecryptedKeys('groq')` to pull from Firestore, `gemini.provider.ts` ONLY reads from `.env` using `loadAllGeminiApiKeys()`. So if an admin adds a Gemini key in the settings UI, the application completely ignores it.

## 3. Security Fixes Implementation + Reassessment

**User Request:** Implement the immediate security fixes, then reassess for any issues.

**Actions Taken (Initial):**
1. Created `firestore.rules` — restricts `settings/api_keys` to authenticated users.
2. Updated `firebase.json` to reference the new rules file.
3. Changed encryption key to derive from env vars (later reverted — see below).
4. Made `loadAllGeminiApiKeys` async to fetch from `.env` + Firestore.
5. Updated `gemini.provider.ts` to await the async key loading.

**Reassessment Findings & Fixes:**
1. 🔴 Encryption key change would break existing stored keys — **Reverted** with migration warning added.
2. 🟡 Circular dependency — **Verified safe** (one-way chain).
3. 🟡 Test mock mismatch in `gemini.provider.test.ts` — **Fixed** (`Promise.resolve(...)` for async).
4. 🟢 Zod validation still requires `.env` keys — acceptable as primary source.

**Verification:** `npm run build` ✅ (exit code 0), no new TypeScript errors, no circular deps.

## 4. Fix IELTS Listening Test Creation Routing

**User Request:** Selecting IELTS + Listening in TestCreationModal routes to Reading instead of Listening.

**Root Cause:** `TestCreationModal` advances all skills to Reading-specific `TestUploadWizard` and `extractReadingTest`, ignoring the dedicated `ListeningTestBuilder`.

**Files Modified:**
- `TestCreationModal.tsx` — Added `useNavigate`, redirect to `/create-test?type=IELTS&skill=Listening` when listening selected

## 5. Remove Info Step from ListeningTestBuilder

**User Request:** Remove redundant Info/metadata step from ListeningTestBuilder since it duplicates data already collected before reaching the builder.

**Actions Taken:**
1. Removed metadata step from `ListeningTestBuilder.tsx` (~140 lines): step type union, `validateMetadata`, `handleNext`/`handleBack` branching, progress indicator, full UI block, footer cancel button
2. Made Review step's title, duration, and description editable inline
3. Updated `TestCreationModal.tsx` to pass metadata via navigation state
4. Cleaned up unused `hasPrefilledMetadata` variable and stale comments

**Files Modified:**
- `TestCreationModal.tsx` — Pass metadata via `navigate` state
- `ListeningTestBuilder.tsx` — Metadata step removed, Review step made editable
