# TestCreationPage Deep Analysis for Integration with TestReviewPage

## Overview

This document provides a **comprehensive deep-dive** analysis of `TestCreationPage` and its entire ecosystem, including all micro-interactions, workflows, and component chains. The goal is to plan proper integration with `TestReviewPage`.

---

## 1. TWO DIFFERENT USER STORIES

### 1.1 TestCreationPage Story

```
Teacher wants to create a NEW test from scratch:
  1. Upload PDF/DOC or paste text ─► TestUploadWizard
  2. Wait for AI parsing ─► ParsingProgressScreen
  3. Review parsed questions & passages ─► ParseReviewPanel
  4. Fix uncertain items (type conflicts, low confidence)
  5. Fill missing answers
  6. Publish or save draft
```

### 1.2 TestReviewPage Story

```
Teacher wants to continue editing a SAVED draft:
  1. Load draft from Firebase ─► LoadingState
  2. Review/edit saved questions & passages ─► ParseReviewPanel
  3. Fix remaining issues (missing answers)
  4. Publish or continue saving
```

---

## 2. COMPLETE COMPONENT HIERARCHY

```
TestCreationPage
├── TeacherHeader
├── [Phase: upload]
│   └── TestUploadWizard
│       ├── File Upload / Text Paste modes
│       ├── Format selection (Academic/General)
│       └── onStartParsing(input) →→→
├── [Phase: parsing]
│   └── ParsingProgressScreen
│       ├── Stage indicators (converting → extracting → classifying → validating)
│       ├── Progress bar with percentage
│       ├── Cancel / Retry buttons
│       └── Error display with resume option
├── [Phase: review]
│   └── ParseReviewPanel
│       ├── Left Column: leftSidebarContent (340px)
│       │   └── [Passed from parent]
│       │       ├── Tabs
│       │       │   ├── Tab: "Need Review" ⚠️
│       │       │   │   └── UncertainItemsSidebar
│       │       │   │       ├── Grouped by severity (High/Medium/Low)
│       │       │   │       ├── Click item → scrolls to question in panel
│       │       │   │       ├── ✓ Resolve button → marks resolved
│       │       │   │       ├── ✕ Dismiss button → removes from list
│       │       │   │       └── "Resolve All" button
│       │       │   └── Tab: "Publish" ✅
│       │       │       └── CompletionChecklist
│       │       │           ├── Reading Passages check (3 required)
│       │       │           ├── Questions check (40 expected)
│       │       │           ├── Answer Key check (click → opens AnswerKeyModal!)
│       │       │           ├── Diagram Images check (if diagram questions exist)
│       │       │           ├── Uncertain Items check (if unresolved)
│       │       │           ├── Progress bar
│       │       │           ├── 🚀 Publish button (disabled until requirements met)
│       │       │           └── Save Draft button
│       │       ├── 📥 Debug Data download button (admin only)
│       │       └── ← Re-upload button
│       └── Right Column: Main Content
│           ├── Passage Tabs
│           ├── Passage Content Editor
│           ├── Section Instruction Headers (editable)
│           └── Questions List (grouped by section)
│               ├── Question Card
│               │   ├── Question number badge
│               │   ├── Type selector (categorized dropdown)
│               │   ├── Question text editor
│               │   ├── Options editor (for MCQ types)
│               │   ├── Answer field
│               │   ├── Confidence indicator
│               │   ├── AI vs Rules conflict badge (click → ComparisonModal!)
│               │   ├── 🗑️ Delete button
│               │   └── Diagram upload button (if diagram type)
│               └── + Add Question button
├── [Phase: complete]
│   └── Success Screen
│       └── "Back to Materials" button
└── AnswerKeyModal (rendered separately, opened via onAnswerKeyClick)
    ├── Tab: "Fill Missing" - Individual answer entry
    │   ├── List of questions missing answers
    │   ├── Each has text input + Enter to submit
    │   └── Updates in real-time as answers are filled
    ├── Tab: "Bulk Input" - Mass answer entry
    │   ├── Textarea with format "1. A\n2. B\n3. TRUE"
    │   ├── Parser shows "X valid entries detected"
    │   └── "Apply X Answers" button
    └── Tab: "AI Suggestions" - Get AI help
        ├── "Generate Suggestions" button
        ├── Loading state while AI processes
        ├── List of suggested answers with confidence
        ├── "Apply" button per suggestion
        └── "Apply All" button
```

---

## 3. MICRO-INTERACTIONS & WORKFLOWS

### 3.1 Answer Key Warning → Modal Flow

**Trigger:** In `CompletionChecklist`, clicking the "Answer Key" check when status ≠ complete

**Chain:**
```
CompletionChecklist (check.id === 'answers' && status !== 'complete')
  │
  ├── onClick={onAnswerKeyClick}
  │
  └── TestCreationPage: onAnswerKeyClick={() => setAnswerKeyModalOpen(true)}
          │
          └── Renders <AnswerKeyModal>
                  │
                  ├── questions={state.questions}
                  └── onUpdateAnswer={(num, answer) => actions.updateQuestion(num, { answer })}
```

**3 Input Modes in AnswerKeyModal:**

| Mode | Description | Use Case |
|------|-------------|----------|
| **Fill Missing** | Shows only Q without answers, type answer + Enter | Quick individual fixes |
| **Bulk Input** | Textarea with "1. A" format | Copy-paste answer key from source |
| **AI Suggestions** | Request AI to generate answers | When answers are unknown |

### 3.2 Uncertain Item → Question Navigation

**Trigger:** Click item in `UncertainItemsSidebar`

**Chain:**
```
UncertainItemsSidebar
  │
  ├── onItemClick(questionNumber)
  │
  └── TestCreationPage: handleItemClick(questionNumber)
          │
          ├── actions.setHighlightedQuestion(questionNumber)  // Updates state
          │
          └── document.getElementById(`question-${questionNumber}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
              });
```

**Visual Effect:**
- Question card gets highlighted styling (via `highlightedQuestion` prop)
- Smooth scroll brings question into view

### 3.3 Type Conflict Resolution → ComparisonModal

**Trigger:** Question has `aiType` ≠ `rulesType` (type mismatch detected during parsing)

**Chain:**
```
ParseReviewPanel: Question Card shows conflict badge
  │
  ├── onOpenComparison(questionNumber)  // Prop from parent
  │
  └── TestCreationPage: Would open ComparisonModal with data:
          {
            questionNumber,
            questionText,
            aiType,
            aiConfidence,
            rulesType,
            rulesConfidence,
            recommendation: 'ai' | 'rules',
            reason: string
          }
          │
          └── onConfirm(selectedType, source)
                  │
                  └── actions.resolveTypeMismatch(questionNumber, selectedType, source)
```

**Note:** `onOpenComparison` is defined in `ParseReviewPanelProps` but NOT currently wired in `TestCreationPage`. This is a gap!

### 3.4 Resolve Uncertain Item

**Trigger:** Click ✓ button in `UncertainItemsSidebar`

**Chain:**
```
UncertainItemsSidebar
  │
  ├── onItemResolve(itemId)
  │
  └── TestCreationPage: handleItemResolve(itemId)
          │
          └── actions.resolveUncertainItem(itemId)
                  │
                  └── setUncertainItems(prev => prev.map(item =>
                          item.id === itemId ? { ...item, resolved: true } : item
                      ));
```

**Effect:** Item stays in list but marked resolved, excluded from counts

### 3.5 Dismiss Uncertain Item

**Trigger:** Click ✕ button in `UncertainItemsSidebar`

**Chain:**
```
UncertainItemsSidebar
  │
  ├── onItemDismiss(itemId)
  │
  └── TestCreationPage: handleItemDismiss(itemId)
          │
          └── actions.dismissUncertainItem(itemId)
                  │
                  └── setUncertainItems(prev => prev.filter(item => item.id !== itemId));
```

**Effect:** Item removed completely from list

### 3.6 Add Question

**Trigger:** Click "+ Add Question" in `ParseReviewPanel`

**Chain:**
```
ParseReviewPanel: "Add" button
  │
  ├── onQuestionAdd(currentPassageId)
  │
  └── TestCreationPage: handleQuestionAdd(passageId)
          │
          └── actions.addQuestion(passageId)
                  │
                  ├── Calculate maxNumber + 1
                  ├── Create new question object with defaults
                  ├── Add to questions list
                  └── setHighlightedQuestion(newQuestion.questionNumber)
```

**New Question Defaults:**
```ts
{
  questionNumber: maxNumber + 1,
  questionText: '',
  type: 'multiple-choice',
  options: ['A', 'B', 'C', 'D'],
  answer: undefined,
  passageId: passageId || passages[0]?.id,
  confidence: 100,
  uncertain: false,
}
```

### 3.7 Delete Question

**Trigger:** Click 🗑️ button on question card

**Chain:**
```
ParseReviewPanel: Delete button
  │
  ├── onQuestionDelete(questionNumber)
  │
  └── TestCreationPage: handleQuestionDelete(questionNumber)
          │
          └── actions.deleteQuestion(questionNumber)
                  │
                  ├── Filter out question from list
                  └── Filter out related uncertain items
```

### 3.8 Upload Diagram Image

**Trigger:** Click upload button on diagram-labeling question

**Chain:**
```
ParseReviewPanel: Diagram upload button
  │
  ├── onDiagramUpload(questionNumber, file)
  │
  └── TestCreationPage: handleDiagramUpload(questionNumber, file)
          │
          └── actions.uploadDiagramImage(questionNumber, file)
                  │
                  ├── Create object URL for preview
                  ├── Update question: { diagramImage: url, diagramRequired: false }
                  └── TODO: Upload to Firebase Storage for permanent URL
```

### 3.9 Section Instruction Editing

**Trigger:** Click edit button on section instruction header

**Chain:**
```
ParseReviewPanel: SectionInstructionHeader edit button
  │
  ├── Toggle edit mode
  ├── Show textarea
  └── On save: onSectionInstructionChange(instructionId, { text, wordLimit, ... })
          │
          └── TestCreationPage: handleSectionInstructionChange
                  │
                  └── actions.updateSectionInstruction(instructionId, updates)
```

### 3.10 Publish Test

**Trigger:** Click "Publish Test" button in `CompletionChecklist` OR header

**Chain:**
```
CompletionChecklist: onPublish() OR Header: onPublish()
  │
  └── TestCreationPage: handlePublish()
          │
          └── actions.publishTest()
                  │
                  ├── Check canPublish
                  ├── setIsPublishing(true)
                  ├── setPhase('publishing')
                  ├── Prepare metadata
                  ├── Transform passages to storage format
                  ├── Transform questions to storage format
                  ├── Call saveTestToFirebase(metadata, passages, questions, ...)
                  ├── If success: setPhase('complete')
                  └── If error: setPhase('review'), show alert
```

### 3.11 Save Draft

**Trigger:** Click "Save Draft" button in `CompletionChecklist`

**Chain:**
```
CompletionChecklist: onSaveDraft()
  │
  └── TestCreationPage: handleSaveDraft()
          │
          └── actions.saveDraft()
                  │
                  └── TODO: Currently just console.log('Draft saved')
```

**Note:** In `TestReviewPage`, draft saving is handled by `useDraftAutoSave` hook instead.

### 3.12 Re-upload / Go Back

**Trigger:** Click "← Re-upload" button in sidebar

**Chain:**
```
Sidebar: Re-upload button
  │
  └── actions.goToUpload()
          │
          ├── parsingActions.reset()
          └── setPhase('upload')
```

### 3.13 Debug Data Download

**Trigger:** Click "📥 Debug Data" button (admin only)

**Chain:**
```
Sidebar: Debug Data button
  │
  └── actions.downloadDebugData()
          │
          ├── Check debugData exists
          ├── Create Blob from JSON
          ├── Create download link
          └── Trigger download as .json file
```

**Debug data includes:**
- Original input (type, format, filename, size)
- Document text
- Metadata
- Full validation result
- All parsed questions with AI/Rules types
- All discrepancies
- All passages
- All uncertain items

---

## 4. STATE MANAGEMENT COMPARISON

### 4.1 useTestCreation Hook State (TestCreationPage)

```typescript
interface TestCreationState {
  // Phase & Progress
  phase: 'upload' | 'parsing' | 'review' | 'publishing' | 'complete';
  parsingStage: ParsingStage;
  parsingProgress: number;
  parsingMessage: string;
  parsingError?: string;
  hasCheckpoint: boolean;
  estimatedTimeRemaining?: number;
  isParsing: boolean;
  
  // Parsed Data
  passages: ParsedPassage[];
  questions: ParsedQuestion[];
  sectionInstructions: SectionInstruction[];
  
  // Review State
  uncertainItems: UncertainItem[];        // ❌ MISSING in TestReviewPage
  highlightedQuestion?: number;           // ❌ MISSING in TestReviewPage
  previewMode: boolean;                   // ❌ MISSING in TestReviewPage
  
  // Completeness
  completenessChecks: CompletenessCheck[];    // ❌ MISSING in TestReviewPage
  completenessPercent: number;                 // ❌ MISSING in TestReviewPage
  canPublish: boolean;                         // ❌ MISSING (only draft.missingAnswerCount > 0)
  
  // Publishing
  isPublishing: boolean;
  
  // Debug (admin)
  debugData: Record<string, unknown> | null;  // ❌ MISSING in TestReviewPage
}
```

### 4.2 TestReviewPage Current State

```typescript
// Page state
const [state, setState] = useState<PageState>({
  loading: boolean;
  error: string | null;
  accessDenied: boolean;
  draft: DraftDocument | null;
});

// Local editing
const [localPassages, setLocalPassages] = useState<ReviewParsedPassage[]>([]);
const [localQuestions, setLocalQuestions] = useState<ReviewParsedQuestion[]>([]);
const [localSectionInstructions, setLocalSectionInstructions] = useState({});

// Auto-save
const { isSaving, lastSaved, save: triggerSave } = useDraftAutoSave(...);

// Other
const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
const [isPublishing, setIsPublishing] = useState(false);
const [isPublic, setIsPublic] = useState(false);

// MISSING:
// - uncertainItems
// - highlightedQuestion
// - completenessChecks / completenessPercent / canPublish
// - previewMode
// - answerKeyModalOpen
// - comparisonModalOpen / comparisonData
```

### 4.3 State Gap Summary

> **Update Note (2026-02-07):** All critical state gaps now resolved.

| State | TestCreationPage | TestReviewPage | Priority | Status |
|-------|-----------------|----------------|----------|--------|
| `uncertainItems` | ✅ From AI parsing | ✅ Derived from questions | HIGH | ✅ FIXED |
| `completenessChecks` | ✅ Computed | ✅ Full 5 checks | HIGH | ✅ FIXED |
| `completenessPercent` | ✅ Computed | ✅ Computed | MEDIUM | ✅ FIXED |
| `canPublish` | ✅ Full validation | ✅ Full validation | HIGH | ✅ FIXED |
| `highlightedQuestion` | ✅ Tracked | ✅ Tracked | MEDIUM | ✅ FIXED |
| `answerKeyModalOpen` | ✅ State + Modal | ✅ State + Modal | HIGH | ✅ FIXED |
| `dismissedItemIds` | N/A | ✅ Tracked locally | N/A | ✅ NEW |
| `resolvedItemIds` | N/A | ✅ Tracked locally | N/A | ✅ NEW |
| `debugData` | ✅ Stored | ❌ N/A for drafts | LOW | N/A |

---

## 5. COMPLETENESS CHECKS LOGIC

The `completenessChecks` in `useTestCreation` include:

### 5.1 Passages Check
```ts
{
  id: 'passages',
  label: 'Reading Passages',
  description: 'At least 3 passages are required for IELTS Reading',
  status: passageCount >= 3 ? 'complete' : passageCount > 0 ? 'warning' : 'incomplete',
  count: { current: passageCount, required: 3 },
}
```

### 5.2 Questions Check
```ts
{
  id: 'questions',
  label: 'Questions',
  description: 'IELTS Reading typically has 40 questions',
  status: questionCount >= 40 ? 'complete' : questionCount >= 30 ? 'warning' : 'incomplete',
  count: { current: questionCount, required: 40 },
}
```

### 5.3 Answer Key Check ← CLICKABLE!
```ts
{
  id: 'answers',
  label: 'Answer Key',
  description: 'All questions must have answers',
  status: missingCount === 0 ? 'complete' : missingCount <= 3 ? 'warning' : 'incomplete',
  count: { current: answeredCount, required: questionCount },
  details: missingQuestions.slice(0, 5).map(q => `Q${q.questionNumber}: Missing answer`),
}
```

**CRITICAL INTERACTION:** In `CompletionChecklist`, clicking this check opens `AnswerKeyModal`:
```tsx
const isClickable = check.id === 'answers' && check.status !== 'complete' && onAnswerKeyClick;
// ...
onClick={isClickable ? onAnswerKeyClick : undefined}
```

### 5.4 Diagram Images Check (conditional)
```ts
if (diagramQuestions.length > 0) {
  {
    id: 'images',
    label: 'Diagram Images',
    description: 'Diagram-labeling questions require images',
    status: 'warning', // Always warning until images uploaded
    count: { current: 0, required: diagramQuestions.length },
    details: diagramQuestions.map(q => `Q${q.questionNumber}: Needs diagram image`),
  }
}
```

### 5.5 Uncertain Items Check (conditional)
```ts
if (unresolvedUncertain.length > 0) {
  {
    id: 'uncertain',
    label: 'Uncertain Items',
    description: 'Review and resolve uncertain items',
    status: 'warning',
    count: { current: resolved, required: total },
    details: unresolvedUncertain.slice(0, 5).map(...),
  }
}
```

---

## 6. UNCERTAIN ITEMS DERIVATION

### 6.1 Current Source (TestCreationPage)
Uncertain items come from **AI parsing discrepancies**:
```ts
const uncertainItems: UncertainItem[] = result.validationResult.discrepancies.map(d => ({
  id: `uncertain-${d.questionNumber}`,
  questionNumber: d.questionNumber,
  type: d.field === 'type' ? 'type_mismatch' : 'low_confidence',
  severity: d.severity,
  message: `${d.field} mismatch: AI suggested ${d.aiValue}, rules suggested ${d.rulesValue}`,
  aiSuggestion: String(d.aiValue),
  rulesSuggestion: String(d.rulesValue),
  resolved: false,
}));
```

### 6.2 For TestReviewPage (Draft-based)
Since drafts don't have parsing discrepancies, derive from:
1. **Missing answers** → `type: 'missing_answer'`
2. **Low confidence** → `type: 'low_confidence'` (if question.confidence < 70)
3. **Diagram questions without images** → `type: 'diagram_question'`

```ts
// Proposed derivation for TestReviewPage
const uncertainItems = useMemo(() => {
  const items: UncertainItem[] = [];
  
  localQuestions.forEach(q => {
    // Missing answer
    if (!q.answer || (Array.isArray(q.answer) && q.answer.length === 0)) {
      items.push({
        id: `uncertain-missing-${q.questionNumber}`,
        questionNumber: q.questionNumber,
        type: 'missing_answer',
        severity: 'high',
        message: 'Question is missing an answer',
        resolved: false,
      });
    }
    
    // Low confidence
    if (q.confidence < 70) {
      items.push({
        id: `uncertain-confidence-${q.questionNumber}`,
        questionNumber: q.questionNumber,
        type: 'low_confidence',
        severity: 'medium',
        message: `Low confidence (${q.confidence}%)`,
        resolved: false,
      });
    }
    
    // Diagram without image
    if (q.type === 'diagram-labeling' && !q.diagramImage) {
      items.push({
        id: `uncertain-diagram-${q.questionNumber}`,
        questionNumber: q.questionNumber,
        type: 'diagram_question',
        severity: 'medium',
        message: 'Diagram image needed',
        resolved: false,
      });
    }
  });
  
  return items;
}, [localQuestions]);
```

---

## 7. HANDLER COMPARISON

> **Update Note (2026-02-07):** All handlers now implemented in TestReviewPage.

| Handler | TestCreationPage | TestReviewPage |
|---------|-----------------|----------------|
| `handlePassageChange` | ✅ | ✅ |
| `handleQuestionChange` | ✅ | ✅ |
| `handleSectionInstructionChange` | ✅ | ✅ |
| `handleQuestionDelete` | ✅ | ✅ |
| `handleQuestionAdd` | ✅ | ✅ |
| `handleItemClick` (uncertain) | ✅ | ✅ |
| `handleItemResolve` | ✅ | ✅ |
| `handleItemDismiss` | ✅ | ✅ |
| `handleDiagramUpload` | ✅ | ✅ |
| `handlePublish` | ✅ | ✅ |
| `handleSaveDraft` | ✅ (manual) | ✅ (auto-save + manual button) |
| `setAnswerKeyModalOpen` | ✅ | ✅ |
| `handleQuestionClick` | ✅ | ✅ |

---

## 8. IMPLEMENTATION PLAN

### Phase 1: Immediate Fixes (This Session)

#### 1.1 Add Missing State
```tsx
const [uncertainItems, setUncertainItems] = useState<UncertainItem[]>([]);
const [highlightedQuestion, setHighlightedQuestion] = useState<number | undefined>();
const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false);
```

#### 1.2 Compute Uncertain Items from Questions
```tsx
const uncertainItems = useMemo(() => {
  // ... derive from localQuestions
}, [localQuestions]);
```

#### 1.3 Compute Completeness Checks
```tsx
const completenessChecks = useMemo(() => {
  // ... port logic from useTestCreation
}, [localPassages, localQuestions, uncertainItems]);
```

#### 1.4 Add Tabbed Sidebar
Replace current sidebar with:
```tsx
<Tabs defaultValue="review">
  <Tabs.List grow>
    <Tabs.Tab value="review" leftSection={<span>⚠️</span>} rightSection={...}>
      Need Review
    </Tabs.Tab>
    <Tabs.Tab value="publish" leftSection={<span>✅</span>}>
      Publish
    </Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="review">
    <UncertainItemsSidebar ... />
  </Tabs.Panel>
  <Tabs.Panel value="publish">
    <CompletionChecklist onAnswerKeyClick={() => setAnswerKeyModalOpen(true)} />
  </Tabs.Panel>
</Tabs>
```

#### 1.5 Add AnswerKeyModal
```tsx
<AnswerKeyModal
  opened={answerKeyModalOpen}
  onClose={() => setAnswerKeyModalOpen(false)}
  questions={localQuestions}
  onUpdateAnswer={(num, answer) => handleQuestionChange(num, { answer })}
/>
```

#### 1.6 Add Missing Handlers
- `handleQuestionDelete`
- `handleQuestionAdd`
- `handleItemClick` (with scroll behavior)
- `handleItemResolve`
- `handleItemDismiss`
- `handleDiagramUpload`

### Phase 2: Future Refactoring

- Extract `useCompletenessCalculation` shared hook
- Extract `useUncertainItemsDerivation` shared hook
- Create `useTestReview` hook that combines everything
- Consolidate `TestCreationPage` and `TestReviewPage` state management

---

## 9. CHECKLIST FOR FEATURE PARITY

> **Update Note (2026-02-07):** Phase 1 COMPLETE! All must-have items integrated into TestReviewPage.

### Must Have (Phase 1) ✅ ALL COMPLETE
- [x] Tabbed sidebar (Need Review + Publish)
- [x] UncertainItemsSidebar with derived items
- [x] CompletionChecklist with full checks (5 checks: passages, questions, answers, diagrams, review)
- [x] AnswerKeyModal integration (click answer warning → opens modal)
- [x] Item click → scroll to question
- [x] Item resolve/dismiss handlers
- [x] Add/Delete question handlers
- [x] Highlight question state
- [x] Section instruction editing handler
- [x] Diagram upload handler
- [x] canPublish computed state (replaced draft.missingAnswerCount)

### Nice to Have (Phase 2)
- [ ] Preview mode toggle (not implemented anywhere yet)
- [x] ~~Debug data download~~ N/A for drafts (no debug data stored)
- [x] Section instruction editing ✅ DONE
- [x] Diagram upload ✅ DONE
- [ ] ComparisonModal for type conflicts (N/A - drafts don't have AI vs Rules data)

---

## 10. ECOSYSTEM CONTEXT (THREE ENTRY FLOWS)

The test creation feature has **three distinct entry flows** built across two PRDs:

### 10.1 Flow A: Direct Upload (PRD-0020 Phase 9)

```
TeacherLobbyPage → "Create Reading Test (AI)" button
  → /teacher/test/create → TestCreationPage
  → Upload/Paste → AI Parsing → Review → Publish
```

- **Page:** `TestCreationPage.tsx` (428 lines)
- **Hook:** `useTestCreation.ts` (699 lines)
- **Entry point:** TeacherLobbyPage "Create Reading Test (AI)" button
- **State:** All managed in `useTestCreation` hook
- **Publish:** Direct `saveTestToFirebase()` call
- **Draft save:** `actions.saveDraft()` (currently `console.log` stub)
- **Full feature set:** All components wired

### 10.2 Flow B: Modal Wizard → Draft → Review (PRD-0022)

```
AdminMaterialsPage → "Create New Test" button
  → TestCreationModal (5-step wizard: type → skill → metadata → upload → parsing)
  → Creates draft in Firebase → Navigates to review route
  → /teacher/test/review/:draftId → TestReviewPage
  → Edit → Auto-save → Publish
```

- **Modal:** `TestCreationModal.tsx` (874 lines)
- **Page:** `TestReviewPage.tsx` (782 lines)
- **Hook:** `useDraftAutoSave.ts` for auto-save
- **Entry point:** AdminMaterialsPage "Create New Test" + TeacherLobbyPage "Create New Test"
- **State:** Manual `useState` calls (no shared hook)
- **Publish:** Full Firebase save + draft deletion + audit logging
- **Draft save:** Auto-save via `useDraftAutoSave` (2s debounce, 30s periodic)
- **LIMITED feature set:** Missing many interactive components

### 10.3 Flow C: Legacy Create (Pre-PRD)

```
AdminMaterialsPage → Old create flow
  → /teacher/test/create → CreateTestPage
  → Uses TestReviewEditor (different component)
```

- **Page:** `CreateTestPage.tsx` (500 lines)
- **Component:** `TestReviewEditor` (different from `ParseReviewPanel`)
- **Entry point:** Legacy flow, may be deprecated
- **Note:** Uses separate `parser.parsedPassages` / `parser.parsedQuestions` state

### 10.4 Flow Comparison Matrix

| Feature | Flow A (Direct) | Flow B (Modal+Draft) | Flow C (Legacy) |
|---------|----------------|---------------------|-----------------|
| **PRD** | PRD-0020 | PRD-0022 | Pre-PRD |
| **Entry** | AI button | Create New Test | Old create |
| **Upload** | TestUploadWizard | TestCreationModal step 4 | Built-in |
| **Parsing** | ParsingProgressScreen | ParsingProgressScreen (in modal) | parser hook |
| **Review** | ParseReviewPanel | ParseReviewPanel | TestReviewEditor |
| **Sidebar** | Tabbed (Review+Publish) | Simple Answer Keys list | None |
| **UncertainItems** | ✅ Full | ❌ Missing | ❌ N/A |
| **CompletionChecklist** | ✅ Full | ❌ Missing | ❌ N/A |
| **AnswerKeyModal** | ✅ Integrated | ❌ Missing | ❌ N/A |
| **ComparisonModal** | ⚠️ Defined not wired | ❌ Missing | ❌ N/A |
| **Add/Delete Q** | ✅ | ❌ Missing | ✅ |
| **Diagram Upload** | ✅ | ❌ Missing | ❌ |
| **Auto-save** | ❌ (manual only) | ✅ useDraftAutoSave | ❌ |
| **Ownership** | ❌ (no check) | ✅ Full RBAC | ❌ |
| **Visibility toggle** | ❌ | ✅ super_admin | ❌ |
| **Audit logging** | ❌ | ✅ Full | ❌ |
| **beforeunload** | ❌ | ✅ | ❌ |
| **Breadcrumbs** | ❌ (uses TeacherHeader) | ✅ Materials → Review Draft | ❌ |

---

## 11. VERIFIED PROPS COMPARISON: ParseReviewPanel

### 11.1 Props Passed by TestCreationPage

```tsx
<ParseReviewPanel
    passages={state.passages}                           // ✅
    questions={state.questions}                         // ✅
    sectionInstructions={state.sectionInstructions}     // ✅
    onPassageChange={handlePassageChange}               // ✅
    onQuestionChange={handleQuestionChange}             // ✅
    onSectionInstructionChange={handleSectionInstructionChange}  // ✅
    onQuestionDelete={handleQuestionDelete}             // ✅
    onQuestionAdd={handleQuestionAdd}                   // ✅
    onDiagramUpload={handleDiagramUpload}               // ✅
    highlightedQuestion={state.highlightedQuestion}     // ✅
    onQuestionClick={handleQuestionClick}               // ✅
    leftSidebarContent={/* Rich tabbed sidebar */}      // ✅
/>
```

**All 12 props wired.** The `leftSidebarContent` includes:
- Tabbed layout (Need Review / Publish)
- UncertainItemsSidebar with items, click, resolve, dismiss
- CompletionChecklist with checks, percent, canPublish, publish, saveDraft, answerKeyClick
- Debug Data download button
- Re-upload button

### 11.2 Props Passed by TestReviewPage

```tsx
<ParseReviewPanel
    passages={localPassages}                            // ✅
    questions={localQuestions}                           // ✅
    sectionInstructions={sectionInstructions}            // ✅
    onPassageChange={handlePassageChange}                // ✅
    onQuestionChange={handleQuestionChange}              // ✅
    leftSidebarContent={/* Simple answer key list */}    // ✅
    // onSectionInstructionChange                        ❌ NOT PASSED
    // onQuestionDelete                                  ❌ NOT PASSED
    // onQuestionAdd                                     ❌ NOT PASSED
    // onDiagramUpload                                   ❌ NOT PASSED
    // highlightedQuestion                               ❌ NOT PASSED
    // onQuestionClick                                   ❌ NOT PASSED
/>
```

**Only 6 of 12 props wired.** The `leftSidebarContent` is a basic static sidebar with:
- Header: "🔑 Answer Keys" with completion count
- List of missing answer questions (click to scroll)
- "All Complete!" message when done
- Footer with passage/question counts

### 11.3 Missing Props Impact

| Missing Prop | Impact | Severity |
|-------------|--------|----------|
| `onQuestionDelete` | Teacher cannot remove incorrectly parsed questions | **HIGH** |
| `onQuestionAdd` | Teacher cannot add missing questions manually | **HIGH** |
| `onSectionInstructionChange` | Section instructions are read-only | MEDIUM |
| `onDiagramUpload` | Diagram questions can't get images uploaded | MEDIUM |
| `highlightedQuestion` | No visual highlighting when navigating to questions | LOW |
| `onQuestionClick` | Click on question doesn't trigger any parent action | LOW |

---

## 12. DETAILED GAP ANALYSIS WITH SEVERITY

### 12.1 CRITICAL GAPS (Must Fix)

| # | Gap | TestCreationPage | TestReviewPage | Impact |
|---|-----|-----------------|----------------|--------|
| G1 | **No question add/delete** | ✅ Full CRUD | ❌ Read+Update only | Teachers stuck with whatever AI parsed |
| G2 | **No CompletionChecklist** | ✅ 5 checks computed | ❌ Only `missingAnswerCount` | Can't see overall test health |
| G3 | **No AnswerKeyModal** | ✅ 3-mode modal | ❌ No modal | Tedious one-by-one answer entry |
| G4 | **`canPublish` too simple** | ✅ Full validation | ⚠️ Only checks `missingAnswerCount > 0` | Could publish incomplete tests |

### 12.2 HIGH GAPS (Should Fix)

| # | Gap | Impact |
|---|-----|--------|
| G5 | **No UncertainItemsSidebar** | No way to review AI-flagged issues in draft context |
| G6 | **No uncertainItems derivation** | Even if sidebar added, no items to show |
| G7 | **No tabbed sidebar** | Single purpose sidebar vs multi-purpose |
| G8 | **No onSectionInstructionChange** | Section instructions stuck as read-only |

### 12.3 MEDIUM GAPS (Nice to Have)

| # | Gap | Impact |
|---|-----|--------|
| G9 | **No highlightedQuestion** | No visual feedback on question navigation |
| G10 | **No onDiagramUpload** | Diagram questions can't get images |
| G11 | **No previewMode** | Can't preview test as student would see it |
| G12 | **No ComparisonModal** | No type conflict resolution (also missing in TestCreationPage) |

### 12.4 LOW GAPS (Future)

| # | Gap | Impact |
|---|-----|--------|
| G13 | **No debugData** | Admin can't download parsing debug info |
| G14 | **No re-upload** | Can't discard and start over (different flow) |

---

## 13. TestReviewPage PUBLISHING FLOW (Verified)

The TestReviewPage publish flow is actually **more complete** than TestCreationPage in some ways:

### 13.1 TestReviewPage Publish (782 lines, verified)

```
handlePublish()
  ├── Guard: !state.draft || !draftId || !user → return
  ├── Guard: draft.missingAnswerCount > 0 → return
  ├── Confirm dialog with title, question count, visibility
  ├── setIsPublishing(true)
  │
  ├── 1. Prepare TestMetadata from draft
  │     └── Maps skillType → capitalized Skill enum
  ├── 2. Transform localPassages → StoragePassage[]
  │     └── Calculates questionStart/questionEnd from questions
  ├── 3. Transform localQuestions → StorageQuestion[]
  │     └── Maps fields (questionText, answer, passageId, etc.)
  ├── 4. saveTestToFirebase(metadata, passages, questions, userId, undefined, ownerId, isPublic)
  │
  ├── 5. Delete draft after publish (non-fatal on failure)
  │     └── testDraftService.deleteDraft(draftId)
  ├── 6. Audit log (non-fatal on failure)
  │     └── auditService.logTestPublished(userId, role, testId, draftId, isPublic)
  ├── 7. Navigate to materials with success state
  │     └── navigate(ROUTES.ADMIN_MATERIALS, { state: { publishSuccess, publishedTestId, publishedTitle } })
  │
  └── Error: alert() + setIsPublishing(false)
```

### 13.2 TestCreationPage Publish (via useTestCreation hook)

```
actions.publishTest()
  ├── Guard: canPublish
  ├── setIsPublishing(true), setPhase('publishing')
  │
  ├── 1. Prepare TestMetadata (title, type, skill, duration)
  ├── 2. Transform passages → StoragePassage[]
  ├── 3. Transform questions → StorageQuestion[]
  ├── 4. saveTestToFirebase(metadata, passages, questions, userId)
  │
  ├── Success: setPhase('complete')
  └── Error: setPhase('review'), alert()
```

### 13.3 Publishing Comparison

| Feature | TestCreationPage | TestReviewPage |
|---------|-----------------|----------------|
| Pre-publish validation | ✅ `canPublish` (5 checks) | ⚠️ Only `missingAnswerCount > 0` |
| Confirmation dialog | ❌ None | ✅ With title, count, visibility |
| Draft cleanup | ❌ No draft to clean | ✅ Deletes draft after publish |
| Audit logging | ❌ None | ✅ Full audit trail |
| Visibility control | ❌ None | ✅ `isPublic` toggle (super_admin) |
| `ownerId` tracking | ❌ Not passed | ✅ `user.uid` as ownerId |
| Success navigation | Shows success screen | Navigates to materials page |
| Error handling | Alert + return to review | Alert + stop publishing |

---

## 14. SUPPORTING SERVICES VERIFIED

### 14.1 TestCreationService (index.ts, 551 lines)

Unified facade orchestrating the complete parsing pipeline:

```
parseDocument(file, options)
  ├── Stage 1: Document Conversion (documentConverter.convertToText)
  ├── Stage 2: AI Extraction (aiExtractor.extractReadingTest) OR offline fallback
  ├── Stage 3: Type Classification (typeClassifier.detectFromSectionContext)
  ├── Stage 4: Validation (validator.compareAIvsRules)
  └── Returns: { success, documentText, passages, validationResult, metadata }
```

**Key capabilities:**
- `parseDocument(file, options)` - Full pipeline with progress callbacks
- `parseText(text, options)` - Paste-text shorthand
- `hasCheckpoint()` / `resumeFromCheckpoint()` - Mid-parse recovery
- `logCorrection()` - Teacher correction learning
- Online/offline detection with automatic fallback
- Checkpoint save/restore via localStorage

### 14.2 testStorage.ts (449 lines)

Firebase test persistence:

```typescript
saveTestToFirebase(metadata, passages, questions, createdBy, materialLink?, ownerId?, isPublic?)
  → Formats passages with word counts and question ranges
  → Formats questions with optional fields
  → Checks missing answer keys → sets isComplete flag
  → Saves to Firebase: tests/${testId}
  → Returns: { success, testId }
```

**Key fields on TestData:**
- `ownerId` - Who owns this test
- `isPublic` - Visible to all teachers?
- `isComplete` - All answers provided?
- `missingAnswerCount` - How many answers missing

### 14.3 validatorService (validator.service.ts)

Four core methods:
1. `compareAIvsRules()` - Weighted confidence merging, discrepancy detection
2. `validateAnswerKey()` - Format validation for strict types
3. `detectIncomplete()` - Missing passages/answers/options/images
4. `generateUncertainItems()` - Creates review items from mismatches + low confidence

### 14.4 draftCloudService (testDraftService)

Firestore-backed draft management:
- `createDraft()` / `loadDraft()` / `updateDraft()` / `deleteDraft()`
- `getUserDrafts()` - Ordered by updatedAt
- `updateDraftStatus()` - Status transitions
- `saveParsedContent()` - Saves parsing results + auto-status change

---

## 15. IMPLEMENTATION HISTORY (From Conversation Logs)

### 15.1 PRD-0020 Timeline (Phase 9)

| Date | What | Session |
|------|------|---------|
| Feb 6 | Phase 4: Type classifier (90 tests) | Session 1-2 |
| Feb 6 | Phase 5: Validator service (39 tests) | Session 4 |
| Feb 6 | Phase 6: All UI components created | Session 5 |
| Feb 6 | Phase 9: Service facade + wiring | Session 6-7 |
| Feb 6 | Phase 9: E2E testing, prop fix after crash | Session 8 |
| Feb 6 | Phase 9: Accessibility audit | Session 9 |

### 15.2 PRD-0022 Timeline

| Date | What | Session |
|------|------|---------|
| Feb 7 | Track A Phase 1: TestCreationModal shell | Session 1 §1 |
| Feb 7 | Track B Phase 1: draftCloudService + security | Session 1 §2 |
| Feb 7 | Component integration (2.6-2.8) | Session 1 §3 |
| Feb 7 | MetadataStep tests (31 tests) | Session 1 §4 |
| Feb 7 | Materials Tab UI (4.0) | Session 1 §5-6 |
| Feb 7 | Phase 1 Merge Assessment (9.6/10) | Session 1 §7 |
| Feb 7 | Test fixes + Review Page (5.0) | Session 1 §8-9 |
| Feb 7 | Draft management + auto-save | Session 1 §10-11 |
| Feb 7 | TestReviewPage tests (33 tests) | Session 1 §12 |
| Feb 7 S2 | Publishing (6.1-6.5) + visibility (6.6-6.9) | Session 2 §1-2 |
| Feb 7 S2 | Task 8.0 testing & polish | Session 2 §4 |
| Feb 7 | E2E tests (13/13 passing) | Session 1 §9 (late) |
| Feb 7 | React state batching bug fix | Session 1 §9 |

### 15.3 Current Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|---------|
| `TestCreationModal.test.tsx` | 86 | Modal wizard flow |
| `TestReviewPage.test.tsx` | 42 | Draft review flow |
| `MetadataStep.test.tsx` | 31 | Form validation |
| `type-classifier.service.test.ts` | 90 | All 16 IELTS types |
| `validator.service.test.ts` | 39 | AI vs Rules comparison |
| `useDraftAutoSave.test.ts` | ~10 | Auto-save hook |
| `draftCloudService.test.ts` | ~10 | Draft CRUD |
| `e2e/test-creation-modal.spec.ts` | 13 | Full E2E flow |
| `e2e/draft-management.spec.ts` | ~5 | Draft list & filters |
| **Total** | **~326** | |

---

## 16. REVISED IMPLEMENTATION PLAN

### Phase 1: Critical Feature Parity (Estimated: 2-3 hours)

#### 1.1 Add Missing Handlers to TestReviewPage

```tsx
// New handlers needed:
const handleQuestionDelete = useCallback((questionNumber: number) => {
    setLocalQuestions(prev => {
        const updated = prev.filter(q => q.questionNumber !== questionNumber);
        triggerSave({ questions: updated as any });
        return updated;
    });
    setHasUnsavedChanges(true);
}, [triggerSave]);

const handleQuestionAdd = useCallback((passageId?: string) => {
    setLocalQuestions(prev => {
        const maxNum = Math.max(0, ...prev.map(q => q.questionNumber));
        const newQuestion: ReviewParsedQuestion = {
            questionNumber: maxNum + 1,
            questionText: '',
            type: 'multiple-choice',
            options: ['A', 'B', 'C', 'D'],
            answer: undefined,
            passageId: passageId || localPassages[0]?.id || 'default',
            confidence: 100,
            uncertain: false,
        };
        const updated = [...prev, newQuestion];
        triggerSave({ questions: updated as any });
        return updated;
    });
    setHasUnsavedChanges(true);
}, [triggerSave, localPassages]);
```

#### 1.2 Add Uncertain Items Derivation

```tsx
const uncertainItems = useMemo(() => {
    const items: UncertainItem[] = [];
    localQuestions.forEach(q => {
        if (!q.answer || (Array.isArray(q.answer) && q.answer.length === 0)) {
            items.push({
                id: `uncertain-missing-${q.questionNumber}`,
                questionNumber: q.questionNumber,
                type: 'missing_answer' as any,
                severity: 'high',
                message: 'Question is missing an answer',
                resolved: false,
            });
        }
        if (q.confidence < 70) {
            items.push({
                id: `uncertain-confidence-${q.questionNumber}`,
                questionNumber: q.questionNumber,
                type: 'low_confidence',
                severity: 'medium',
                message: `Low confidence (${q.confidence}%)`,
                resolved: false,
            });
        }
    });
    return items;
}, [localQuestions]);
```

#### 1.3 Add Completeness Checks

Port the logic from `useTestCreation`:
- Passages check (3 required)
- Questions check (40 expected)
- Answer Key check (clickable → AnswerKeyModal)
- Diagram Images check (conditional)
- Uncertain Items check (conditional)

#### 1.4 Replace Sidebar with Tabbed Layout

Replace the current simple "Answer Keys" sidebar with the same tabbed layout used in TestCreationPage:
- Tab 1: "Need Review" → UncertainItemsSidebar
- Tab 2: "Publish" → CompletionChecklist

#### 1.5 Add AnswerKeyModal

```tsx
<AnswerKeyModal
    opened={answerKeyModalOpen}
    onClose={() => setAnswerKeyModalOpen(false)}
    questions={localQuestions}
    onUpdateAnswer={(num, answer) => handleQuestionChange(num, { answer })}
/>
```

#### 1.6 Wire All Missing ParseReviewPanel Props

Pass all 12 props matching TestCreationPage's usage.

### Phase 2: Enhanced Features (Estimated: 1-2 hours)

- 2.1 Add `highlightedQuestion` state + scroll behavior
- 2.2 Wire `onSectionInstructionChange` handler
- 2.3 Wire `onDiagramUpload` handler
- 2.4 Add preview mode toggle
- 2.5 Strengthen `canPublish` validation to match TestCreationPage

### Phase 3: Unification (Estimated: 3-4 hours)

- 3.1 Extract `useCompletenessCalculation` shared hook
- 3.2 Extract `useUncertainItemsDerivation` shared hook
- 3.3 Create `useTestReview` hook that combines shared state management
- 3.4 Refactor both pages to use shared hooks
- 3.5 Consider deprecating Flow C (CreateTestPage / TestReviewEditor)

---

## 17. RISK ASSESSMENT

### 17.1 Low Risk

- Adding handlers (add/delete/diagram) — straightforward state management
- Adding AnswerKeyModal — already built, just needs integration
- Adding highlighting — simple state tracking

### 17.2 Medium Risk

- Completeness checks — needs careful porting from `useTestCreation` useMemo
- Tabbed sidebar — significant JSX restructuring in TestReviewPage render
- Auto-save interaction — new handlers must trigger `triggerSave()` correctly

### 17.3 High Risk

- **Type compatibility**: `ReviewParsedQuestion` (from ParseReviewPanel) vs `ParsedQuestion` (from document.types) — need to verify `type` field enum compatibility
- **Draft data sync**: Adding/deleting questions changes `draft.questionCount` and `draft.missingAnswerCount` which are read from the original draft object — need to recompute these locally
- **Regression**: TestReviewPage has 42 unit tests — all must continue passing after changes

### 17.4 Open Questions

1. Should TestReviewPage reuse `useTestCreation` hook, or keep separate state management with `useDraftAutoSave`?
2. Should Flow C (CreateTestPage) be deprecated in favor of Flow B (Modal → Draft → Review)?
3. Should `ComparisonModal` be wired in TestCreationPage first before porting to TestReviewPage?
4. How should `uncertainItems` be persisted in drafts? Currently not saved — lost on page reload.

---

## 18. COMPLETION STATUS (2026-02-07)

### Phase 1: ✅ 100% COMPLETE

All critical feature parity items implemented:
- Tabbed sidebar with UncertainItemsSidebar + CompletionChecklist
- Full uncertain items derivation (missing answers, low confidence, diagram questions)
- Full completeness checks (passages, questions, answers, diagrams, review items)
- AnswerKeyModal integration with click-to-open from answer warning
- All 12 handlers wired to ParseReviewPanel
- canPublish computed state replaces draft.missingAnswerCount
- handlePublish uses localQuestions for validation (not stale draft data)

### Phase 2: Partial

- [x] Section instruction editing
- [x] Diagram upload
- [ ] Preview mode toggle (not implemented anywhere)
- [x] Debug data download (N/A for drafts)
- [x] ComparisonModal (N/A - drafts don't have AI vs Rules data)

### Build Status: ✅ PASSING

---

*Document created: 2026-02-07*  
*Last updated: 2026-02-07 @ 14:30 (Phase 1 completion)*  
*Purpose: Deep analysis for TestCreationPage ↔ TestReviewPage integration*  
*Sources: TestCreationPage.tsx (428L), TestReviewPage.tsx (942L), useTestCreation.ts (699L), test-creation/index.ts (551L), testStorage.ts (449L), conversation logs (Feb 6-7)*
