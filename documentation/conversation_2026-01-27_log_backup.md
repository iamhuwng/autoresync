# Conversation Log - 2026-01-27

## Session Start: 01:54 AM (UTC+7)

---

## 1. Investigation: Missing Image Controls in Edit Test Dialog

### User Request
The user reported that in the Edit Test Dialog, specifically the "Contacts and Resources" tab, there is no way to view, edit, or adjust images that were uploaded during the Create Test step for listening tests with image input method. While new images can be added, existing images from the test cannot be managed.

### Investigation Findings

**Root Cause Identified:** The `adaptTestToResources` function in `resourceAdapters.ts` fails to create standalone `image` type resources when loading existing test data.

**Technical Details:**

1. **Current Behavior (resourceAdapters.ts lines 26-44):**
   ```typescript
   // Images are only attached to audio resources, not as standalone image resources
   if (test.audioSections && test.audioSections.length > 0) {
       test.audioSections.forEach((section) => {
           const sectionImages = test.questionImages
               ?.filter(img => img.sectionNumber === section.number)
               .map(img => img.imageUrl) || [];

           resources.push({
               id: `audio-${section.number}`,
               type: 'audio',  // <-- images attached here, but editor shows audio controls only
               images: sectionImages.length > 0 ? sectionImages : undefined,
               // ...
           });
       });
   }
   ```

2. **ResourceManager.tsx routing logic (lines 221-232):**
   - The `ImageResourceEditor` only renders when `resource.type === 'image'`
   - The `AudioResourceEditor` renders for `resource.type === 'audio'` but doesn't display attached images
   - No standalone `image` resources are ever created from `test.questionImages`

3. **The Gap:**
   - During Create: ListeningTestBuilder stores images in `test.questionImages[]`
   - During Edit: `adaptTestToResources` attaches images to audio resources BUT doesn't create separate viewable/editable image resources
   - Result: Images exist in data but have no UI to manage them

### Files Examined
- `src/components/test/editor/resourceAdapters.ts` - Adapter functions
- `src/components/test/editor/ResourceManager.tsx` - Resource list and editor routing
- `src/components/test/editor/ImageResourceEditor.tsx` - Image editing UI
- `src/components/test/editor/AudioResourceEditor.tsx` - Audio editing UI (no image display)
- `src/components/TestEditor.tsx` - Main test editor orchestration
- `src/services/testStorage.ts` - Data types

### Proposed Solutions

**Option A (Recommended):** Modify `adaptTestToResources` to create separate `image` type resources from `test.questionImages` in addition to (or instead of) attaching them to audio resources.

**Option B:** Enhance `AudioResourceEditor` to display and manage the `images` array already being attached to audio resources.

### Status
✅ **FIXED** - Implementation complete, build passes.

---

## 2. Implementation: Fix Image Resource Handling in Edit Test Dialog

### Solution Implemented
Modified `resourceAdapters.ts` to create **standalone `image` type resources** from `test.questionImages`. This makes existing images visible and editable in the "Context & Resources" tab.

### Changes Made

**File: `src/components/test/editor/resourceAdapters.ts`**

1. **`adaptTestToResources` function (lines 25-87):**
   - Added new Section 3 to create standalone `image` resources from `test.questionImages`
   - Images are now grouped by section number (e.g., `image-section-1`, `image-section-2`)
   - Each image resource maintains the correct question range
   - Audio resources no longer carry embedded images (cleaner separation)

2. **`adaptResourcesToTest` function (lines 119-186):**
   - Updated Section 3 to extract images from `image` type resources (instead of audio resources)
   - Fixed TypeScript lint errors with proper null checking on regex match results
   - Preserves `questionRange` data when saving back to `questionImages`

### Technical Details

**Before (broken):**
```
test.questionImages[] → attached to audio resource as resource.images[] 
                      → AudioResourceEditor (no image UI) 
                      → ❌ Images invisible
```

**After (fixed):**
```
test.questionImages[] → standalone image resource (type: 'image')
                      → ImageResourceEditor (full image management UI)
                      → ✅ Images visible and editable
```

### Build Verification
```
✓ built in 33.22s
Exit code: 0
```

---

## 3. Deeper Investigation: The **REAL** Root Cause

### User Feedback
User reported that even after the initial fix, images still weren't appearing in the Edit Test Dialog.

### Investigation Process

1. **Verified Firebase Data:**
   Used PowerShell to directly query Firebase Realtime Database:
   ```powershell
   $response = Invoke-RestMethod -Uri "https://temp-a1437-default-rtdb.firebaseio.com/tests/listening-1768985441620-nf72gbl.json"
   ```
   
   **Result:**
   - `displayMode: image` ✅
   - `questionImages exists: True` ✅  
   - `questionImages count: 3` ✅
   
   **Conclusion:** The data IS in Firebase. The problem is in the frontend code.

2. **Traced Data Flow:**
   ```
   Firebase → getAllTests() → TeacherLobbyPage state → handleEditTest(test) 
           → TestEditor props → useEffect → adaptTestToResources()
   ```

3. **Found the REAL Root Cause:**
   In `TestEditor.tsx` lines 69-73:
   ```typescript
   if (parsed.resources) {
     setResources(parsed.resources);  // Uses cached resources from localStorage!
   } else {
     setResources(adaptTestToResources(test));  // Only adapts if no cache
   }
   ```
   
   **The Problem:** When the user previously opened the Edit dialog for this test:
   1. Old code ran `adaptTestToResources()` → created resources WITHOUT image resources
   2. These resources were cached to localStorage
   3. After my fix, when opening Edit dialog again:
   4. TestEditor finds cached resources in localStorage → uses them directly
   5. My new `adaptTestToResources()` code is NEVER called
   6. Images remain invisible

### The Complete Fix

**Two issues needed fixing:**

| Issue | File | Fix |
|-------|------|-----|
| 1. `adaptTestToResources` didn't create image resources | `resourceAdapters.ts` | Create standalone `image` type resources from `questionImages` |
| 2. Stale localStorage cache bypassed the fix | `TestEditor.tsx` | Detect stale cache and regenerate resources |

**TestEditor.tsx changes (lines 55-105):**
- Added debug logging for test data received
- Added stale cache detection: If test has `questionImages` but cached resources have no `type: 'image'` resources
- Auto-clear stale cache and regenerate fresh resources

### Final Build
```
✓ built in 47.72s
Exit code: 0
```

### Files Modified
1. `src/components/test/editor/resourceAdapters.ts` - Create image resources from questionImages
2. `src/components/TestEditor.tsx` - Detect and clear stale localStorage cache

### Testing Instructions
1. Refresh the browser (Ctrl+F5 hard refresh)
2. Go to Teacher Lobby → Test Mode
3. Click Edit on a listening test with images
4. Go to "Context & Resources" tab
5. Should now see Image Resources with existing images
6. Console should show:
   - `📝 [TestEditor] Received test data: { hasQuestionImages: 3 }`
   - `🔄 [TestEditor] Stale cache detected - regenerating resources with image support` (if cache was stale)
   - `📋 [adaptTestToResources] Created resources: [{ type: 'image', imageCount: 3 }]`

---

### Key Lesson Learned

**When fixing data transformation bugs, always consider caching layers.** The original fix was correct, but localStorage was caching the old, broken data format. This is a common pattern in React apps where:
- Fresh users see the fix immediately
- Existing users with cached data still see the bug

**Solution pattern:** Add cache version checks or cache invalidation logic when data format changes.

---

## 4. Per-Image Question Range Support

### User Request
Even after images appeared in the Edit Test Dialog, the UI didn't show or allow editing of the per-image question ranges that were set during test creation. All images from a section were grouped together with a single shared question range.

### Investigation

**Firebase Data Structure (confirmed via direct API query):**
```
test "listening-1768677315907-l4rlcpc" questionImages:
- Image 1: Section 1, Range: 1-5
- Image 2: Section 1, Range: 6-10  
- Image 3: Section 2, Range: 11-20
```

Each image in Firebase has its OWN `questionRange` - they should be independently editable.

**Previous (Broken) Design:**
```typescript
// In adaptTestToResources - GROUPED all images per section
imagesBySection.forEach((images, sectionNumber) => {
    resources.push({
        id: `image-section-${sectionNumber}`,
        type: 'image',
        images: images.map(img => img.imageUrl),  // ALL images in one resource
        questionStart: min(allRanges),  // MERGED into single range
        questionEnd: max(allRanges),
    });
});
```

This lost the per-image question ranges by merging them into a single min/max range for the whole section.

### Solution: One Resource Per Image

Changed `adaptTestToResources` to create individual resources for each image:

```typescript
// NEW - One resource per image
test.questionImages.forEach((img, index) => {
    resources.push({
        id: `image-${img.sectionNumber}-${index}`,
        type: 'image',
        title: `Section ${img.sectionNumber} Image ${index + 1}`,
        images: [img.imageUrl],  // Single image
        questionStart: img.questionRange?.start,  // Preserved!
        questionEnd: img.questionRange?.end,
    });
});
```

**Updated Files:**

1. **`resourceAdapters.ts` - `adaptTestToResources`:**
   - Creates one `ContextResource` per image (not grouped by section)
   - New ID format: `image-{sectionNumber}-{index}` e.g., `image-1-0`
   - Each resource has its own `questionStart`/`questionEnd`

2. **`resourceAdapters.ts` - `adaptResourcesToTest`:**
   - Updated to parse both new (`image-1-0`) and legacy (`image-section-1`) ID formats
   - Correctly extracts section number for both formats
   - Preserves per-image question ranges when saving back to Firebase

3. **`TestEditor.tsx` - Cache invalidation:**
   - Enhanced stale cache detection to compare counts: `testQuestionImagesCount !== cachedImageResourcesCount`
   - Catches old grouped-format cache and regenerates with new per-image format

### User Experience After Fix

In the Edit Test Dialog → Context & Resources tab:
- Each image appears as a **separate entry** in the sidebar
  - "Section 1 Image 1" (Questions 1-5)
  - "Section 1 Image 2" (Questions 6-10)
  - "Section 2 Image 1" (Questions 11-20)
- Clicking an image shows its **own question range** which can be edited independently
- Saving preserves all per-image question ranges correctly

### Build
```
✓ built in 30.35s
Exit code: 0
```

---

## 5. Fix Validation Error for Listening Tests with Image Display Mode

### User Report
When trying to save edits to a listening test with image display mode, validation errors appeared:
```
Question 1: Question text is empty
Question 2: Question text is empty
... (all 20 questions)
```

This blocked saving even though for listening tests with image input method, the questions are displayed as images - the question text field is intentionally empty.

### Investigation

**Firebase Data:**
```
test "listening-1768677315907-l4rlcpc":
- displayMode: "image"
- skill: "Listening"
- questions[0]: { resourceId: "", passageId: "", sectionNumber: 1 }
```

**Root Cause:** The validation logic in `TestEditor.tsx` checked if each question's linked resource was an image type. But:
1. Listening test questions have `sectionNumber` instead of `resourceId`/`passageId`
2. The code couldn't find a linked image resource for any question
3. Therefore, it required question text for all 20 questions

### Fix

Modified `validateQuestions()` in `TestEditor.tsx` to check the **test-level** `displayMode` property first:

```typescript
const validateQuestions = () => {
  const errors: string[] = [];
  
  // For listening tests with image display mode, question text is not required
  // because questions are displayed as images, not text
  const isListeningImageMode = (test as any)?.displayMode === 'image' && 
                                (test as any)?.skill === 'Listening';
  
  Object.entries(editedQuestions).forEach(([index, question]) => {
    const questionNum = parseInt(index) + 1;

    // Skip question text validation for listening image mode tests
    if (!isListeningImageMode) {
      // ... existing resource-based validation
    }
    
    // ... rest of validation (options, answer) still applies
  });
};
```

### Build
```
✓ built in 33.50s
Exit code: 0
```

### Testing
1. Refresh browser
2. Edit a listening test with image mode
3. Click Save - should work without "Question text is empty" errors

---

## 6. Investigation: Browser Tool Failure and Remediation

### User Request
Investigate why the agent is unable to use the browser tool to investigate live websites, provide an absolute fix for the root causes, and clean up all symptoms.

### Investigation Findings
1. **Tool Failure Reproduction**:
   - Attempted to use `browser_subagent` to navigate to `google.com`.
   - Result: **Failed**.
   - Error: `failed to create browser context: failed to install playwright: $HOME environment variable is not set`.

2. **Root Cause**:
   - The agent's browser tool (Playwright) running on Windows expects the `$HOME` environment variable to be set (common in POSIX-ported tools), but Windows uses `%USERPROFILE%` by default.
   - While the `run_command` shell (PowerShell) had `$HOME` mapped to `C:\Users\The Lord`, the separated process for the `browser_subagent` did not inherit this or was strictly checking for the environment variable which was missing in its scope.

3. **Symptoms Observed**:
   - Persistent failure of browser tasks.
   - Accumulation of debugging script debris in the project root from previous (failed) investigation attempts:
     - `check-env.js`, `fix-json.mjs`, `test-google-api.html`, `after-login-click.png`, etc.

### Remediation Actions

#### 1. System Environment Fix
Executed command to permanently set the `HOME` environment variable for the user, mapping it to the existing User Profile path.

```powershell
setx HOME "$env:USERPROFILE"
```
*Note: This change requires a restart of the agent/IDE to take effect for the browser tool process.*

#### 2. Symptom Cleanup
Identified and moved scattered debugging artifacts and temporary files to a backup directory `scripts/cleanup_backup_2026_01_27` to clean up the project root.

**Files Cleaned:**
- `after-login-click.png`, `before-login-click.png`
- `check-env.js`, `debug_sections.js`, `extract-quiz.js`
- `find-json-error.mjs`, `fix-json.mjs`, `validate-json.js`, `validate-json.mjs`
- `test-google-api.html`, `test-google-drive-audio-api.html`, `test-groq.html`
- `claude_api_test.py`, `list_models.py`, `test_claude.py`
- `temp_extract.js`, `temp_test_data.json`

### Verification
- **Environment Variable:** `setx` returned `SUCCESS`.
- **Cleanup:** Files are verified moved and root directory is decluttered.

### Conclusion
The root cause (missing `HOME` env var) is patched at the system level. The user must restart their session for the agent's internal tools to pick up this change and restore browser functionality.

---

## 7. Inspera IELTS Reading UI Refactor

### User Request
Reorganize and relocate content in the current reading test UX/UI in student test view to mimic the Inspera IELTS demo interface (https://demo-ielts.inspera.com/player/). Key requirements:
- Match the Inspera layout and design
- Change T/F/NG question type from horizontal radio buttons to vertical stacked layout
- Add footer navigation with section tabs and question strip
- No feature functionality changes, only placement and appearance
- Maintain teacher test monitor compatibility

### Reference Analysis (Inspera IELTS Demo)

**Inspera Interface Structure:**
1. **Header**: Test title (left), Test taker ID (center), status icons + menu (right)
2. **Sub-header**: Grey bar with section instructions (e.g., "Part 1: Read the text and answer questions 1–13")
3. **Two-column layout**: Passage (left) | Questions (right) with resizable divider
4. **Footer Navigation** (KEY FEATURE):
   - Section/Part tabs with progress counters (e.g., "Part 1: 0 of 13")
   - Horizontal question number strip for direct navigation
   - Previous/Next arrows for sequential navigation

**Question Type Styling (Inspera):**
- T/F/NG: Vertical radio buttons stacked TRUE / FALSE / NOT GIVEN
- Fill-in-blank: Inline text inputs
- MCQ: Radio buttons with letter labels
- Multiple Select: Checkboxes

### Implementation

#### 1. Created `InspiraFooterNav.tsx` (New Component)
**Path:** `src/components/test/InspiraFooterNav.tsx`

Features:
- **Section/Part tabs** with progress counters ("Part 1: 0 of 13")
- **Horizontal question number strip** with:
  - Scroll left/right buttons for overflow handling
  - Active question highlighting
  - Answered status indicators (blue) / Unanswered (gray)
  - Auto-scroll active question into view
- **Previous/Next arrows** for sequential navigation
- **Cross-passage navigation** - automatically switches passage when navigating to questions in different passages

#### 2. Updated `AuthenticAnswerInput.tsx`
**Changed T/F/NG and Y/N/NG layouts:**

**Before (horizontal):**
```tsx
<div style={{ display: 'flex', gap: '1.5rem' }}>
  {options.map(option => <label>...</label>)}
</div>
```

**After (vertical with styled cards):**
```tsx
<div style={{ flexDirection: 'column', gap: '0.5rem' }}>
  {options.map(option => 
    <label style={{ 
      border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
      background: isSelected ? '#eff6ff' : 'white',
      padding: '0.625rem 1rem',
      borderRadius: '6px',
    }}>
      <input type="radio" ... />
      <span>{option}</span>
    </label>
  )}
</div>
```

**Features:**
- Vertical stacked layout matching IELTS CBT standard
- Selected state with blue border and light blue background
- Hover effects for better interactivity
- Disabled state handling preserved

#### 3. Updated `StudentTestPage.tsx`
**Major changes:**

**Added Section Instruction Sub-header:**
```tsx
{/* Section Instruction Sub-header (Inspera-style) */}
{currentPassage && (
  <div style={{ background: '#f1f5f9', padding: '0.625rem 1.5rem' }}>
    <span>Part {passageIndex + 1}:</span>
    <span>Read the text and answer questions {first}–{last}</span>
  </div>
)}
```

**Removed passage tabs from left column:**
- Passage navigation now handled by footer tabs
- Left column now starts directly with PassageControls

**Added InspiraFooterNav:**
```tsx
<InspiraFooterNav
  questions={testData.questions}
  passages={testData.passages}
  answers={answers}
  activePassageId={activePassageId}
  activeQuestionNumber={currentQuestionNumber}
  onPassageChange={setActivePassageId}
  onQuestionClick={goToQuestion}
  testSubmitted={testSubmitted}
  questionResults={mergedQuestionResults}
/>
```

#### 4. Simplified `IELTSQuestionsPanel.tsx` Header
**Before:** Full question number navigation strip (duplicate of footer)
**After:** Simple header showing question range and answered count

```tsx
<div>Questions 1 – 13</div>
<div>5 of 13 answered</div>
```

### Files Modified
1. `src/components/test/InspiraFooterNav.tsx` (NEW)
2. `src/components/test/AuthenticAnswerInput.tsx` (MODIFIED)
3. `src/pages/StudentTestPage.tsx` (MODIFIED)
4. `src/components/test/IELTSQuestionsPanel.tsx` (MODIFIED)

### Build Verification
```
✓ built in 1m 47s
Exit code: 0
```

### Teacher Monitor Compatibility
The changes are purely UI/UX on the student side. The answer format and data flow remain unchanged:
- Answers stored in same format
- Real-time sync with Firebase unchanged
- Teacher monitor receives same data structure
- No breaking changes to teacher-student relationship

### Testing Instructions
1. Hard refresh browser (Ctrl+F5)
2. Join a reading test session as a student
3. Verify:
   - Footer navigation with section tabs and question strip
   - T/F/NG questions display vertically
   - Section instruction sub-header shows current part
   - Clicking footer question numbers navigates correctly
   - Previous/Next buttons work across passages
   - Progress indicators update in real-time

---

## 8. Inspera UI Refactor - Reading Test Page Specifics

### Issue Found
After completing the refactor in `StudentTestPage.tsx`, browser testing revealed that Reading tests were NOT showing the new UI.

**Investigation:**
- The application uses a `TestPageRouter.tsx` which routes based on skill type.
- **Reading** tests route to `src/skills/reading/components/ReadingTestPage.tsx`.
- Other tests (or generic ones) route to `StudentTestPage.tsx`.
- Therefore, the changes made to `StudentTestPage.tsx` were essentially "hidden" for Reading tests.

### Remediation
Applied the same Inspera-style UI changes to `ReadingTestPage.tsx`.

#### Changes Implementation
1. **Imported `InspiraFooterNav`** into `ReadingTestPage.tsx`.
2. **Added Section Instruction Sub-header** (gray bar) below the main header.
3. **Removed Passage Tabs** from the left column header (now handled by footer).
4. **Integrated `InspiraFooterNav`** component at the bottom of the page.

#### Verification
- **Screenshot Verification:** `footer_detail_*.png` confirmed:
  - ✅ Gray sub-header visible ("Part 1: Read the text...")
  - ✅ Footer navigation bar visible with question strip and Part tabs
  - ✅ Passage tabs removed from left column
  - ✅ Layout consistent with Inspera IELTS CBT design

### Files Modified
- `src/skills/reading/components/ReadingTestPage.tsx`

---

## 9. Highlighter Tool Bug Fix in Reading Test Student View

**Time:** 14:04+

### User Request
Investigate highlighter tool in reading test student view. When highlighting a combination of letters, all matching text gets highlighted. Deep investigation and root fix requested.

### Investigation

1. **Searched codebase** for highlighter-related code
2. **Found documentation:**
   - [0011-text-highlighter-system.md](../system/0011-text-highlighter-system.md) - System architecture
   - [SOP-0031](../SOP/0031-text-highlighter-bug-fix-nov11.md) - Previous bug fix from Nov 11, 2025
3. **Identified affected components:**
   - `src/components/PassageRenderer_v2.jsx` - Used by StudentTestPage.tsx
   - `src/skills/reading/components/PassageRenderer.tsx` - Used by ReadingTestPage.tsx

### Root Cause

Both components store highlights as `{id, text, color}` and use regex to find **ALL** occurrences:

```javascript
const regex = new RegExp(highlight.text, 'gi');
while ((match = regex.exec(text)) !== null) {
  // Finds ALL matches, not just the selected one!
}
```

This differs from the position-based approach documented in SOP-0031, which stores `startPos` and `endPos` to identify the exact selection.

**This was a REGRESSION** - the bug was previously fixed in SOP-0031 but the fix was lost during component refactoring.

### Fix Applied

1. **Updated Highlight data structure** to include `startPos` and `endPos`
2. **Modified `handleMouseUp`** to calculate character positions using `document.createRange()`
3. **Updated `processTextWithHighlights`** to use stored positions instead of regex matching
4. **Added paragraph position tracking** to correctly map highlights across paragraphs

### Files Modified

- `src/components/PassageRenderer_v2.jsx`
- `src/skills/reading/components/PassageRenderer.tsx`

### Verification

- ✅ Build succeeded (`npm run build` - Exit code 0)
- ⏳ Manual testing pending (user should verify in browser)

### Key Technical Changes

**Before (buggy):**
```javascript
// Store only text
const newHighlight = { id, text: selectedText, color };

// Find ALL matches with regex
const regex = new RegExp(highlight.text, 'gi');
while ((match = regex.exec(text)) !== null) { ... }
```

**After (fixed):**
```javascript
// Store positions
const newHighlight = { 
  id, 
  text: selectedText, 
  color,
  startPos: startPos,  // Exact position
  endPos: endPos 
};

// Use stored positions directly
sortedHighlights.forEach((h) => {
  result.push(fullText.substring(h.startPos, h.endPos));
});
```

---

## AGENT ERROR: Conversation Log Overwrite Incident

### What Happened
When creating the log entry for Section 9, the agent incorrectly used `write_to_file` with `Overwrite: true` instead of appending to the existing file. This deleted all previous content (Sections 1-8).

### Root Cause
The agent did not check if the conversation log file already existed before writing. It assumed it was creating a new file for a new session.

### User Action
User rejected the edit and restored the original content via VS Code undo.

### Preventive Measures Added
See new rule in CLAUDE.md.

---

## 10. PassageRenderer Component Consolidation

**Time:** 14:27+

### User Request
The codebase has multiple `PassageRenderer` components. Keep only the most efficient one, remove the unused ones and all traces related to/associated with/link to them.

### Investigation Results

**Found 4 PassageRenderer components:**

| File | Location | Used By | Status |
|------|----------|---------|--------|
| `PassageRenderer.jsx` | components/ | CollapsiblePassagePanel → TeacherQuizPage | Legacy (canvas-based) |
| `PassageRenderer_v2.jsx` | components/ | StudentTestPage | ✅ KEEP (DOM-based, fixed) |
| `PassageRenderer_DOM.jsx` | components/ | **Nothing** | ❌ DELETE (unused) |
| `PassageRenderer.tsx` | skills/reading/components/ | ReadingTestPage | ✅ KEEP (TypeScript, fixed) |

### Analysis

1. **PassageRenderer_v2.jsx** - Modern DOM-based approach, has highlighter fix, used by StudentTestPage fallback
2. **PassageRenderer.tsx** - TypeScript version of v2, used by ReadingTestPage, has highlighter fix
3. **PassageRenderer.jsx** - Old canvas-based approach, has unused props (`gameSessionId`, `onHeaderControlsChange` declared but never used)
4. **PassageRenderer_DOM.jsx** - Completely unused, dead code

### Changes Made

#### 1. Updated `CollapsiblePassagePanel.jsx`
- Changed import from `PassageRenderer` to `PassageRenderer_v2`
- Removed unused props: `gameSessionId`, `onHeaderControlsChange`, `headerControls` state
- Simplified component interface

#### 2. Updated `TeacherQuizPage.jsx`
- Removed unused `gameSessionId` prop from `CollapsiblePassagePanel` usage

#### 3. Deleted Unused Files
- `src/components/PassageRenderer.jsx` ❌ DELETED
- `src/components/PassageRenderer_DOM.jsx` ❌ DELETED

### Final Component Structure

```
src/
├── components/
│   └── PassageRenderer_v2.jsx    ← Generic student test (StudentTestPage.tsx)
└── skills/reading/components/
    └── PassageRenderer.tsx        ← Reading tests (ReadingTestPage.tsx)
```

### Build Verification
```
✓ built in 36.71s
Exit code: 0
```

### Net Result
- **Deleted:** 2 files (~27KB code removed)
- **Remaining:** 2 components with consistent position-based highlighting
- **All usages updated:** No broken imports

