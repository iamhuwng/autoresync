# PRD-0022: Test Creation Modal with Draft Management System

**Version:** 1.1  
**Created:** 2026-02-07  
**Updated:** 2026-02-07  
**Status:** Draft  
**Author:** AI Assistant (Antigravity)

---

## ⚠️ IMPORTANT: Current State vs Target State

**Current State (PRD-0020 Implementation):**
- Test creation is a **full-page flow** at `/teacher/test/create`
- Entry point: "Create Reading Test (AI)" button in TeacherLobbyPage
- Components exist: `TestUploadWizard`, `ParseReviewPanel`, `ParsingProgressScreen`
- Publishing to Firebase works (fixed Session 5 - Feb 7)
- No draft management - work is lost on page close

**Target State (This PRD):**
- Test creation becomes a **modal flow** triggered from Materials tab
- Draft management with Firebase persistence
- Existing components **reused inside modal shell**
- Clear Public Library vs My Content distinction

### 🎯 Core Principle: Integration, Not Rebuild

> **The current `TestCreationPage` view (Upload → Parsing → Review) should be INTEGRATED into the new modal, not rebuilt from scratch.**

This means:
1. `TestUploadWizard` becomes **Step 4** of the modal (no changes to its internal logic)
2. `ParsingProgressScreen` becomes **Step 5** of the modal (no changes to its internal logic)
3. The modal acts as a **wrapper/shell** that provides step navigation around existing components
4. Only the **container** changes (from full-page `AppShell` to modal), not the content

---


## 1. Introduction/Overview

### Problem Statement

The current test creation flow navigates users to a separate full-page (`/teacher/test/create`) when clicking "Create New Test" in the Materials tab. This creates a jarring context switch and doesn't match the modal-style UX pattern used elsewhere in the application. Additionally, there is no proper draft management system—if a teacher is interrupted during test review, their work may be lost.

### Solution

Transform the test creation flow into a **multi-step modal** that integrates with the existing `TestTypeSelectionModal`. Add a comprehensive **draft management system** using Firebase Firestore for persistent storage across devices. Include proper distinction between **Public Library** (tests shared with all teachers) and **My Content** (private tests owned by individual teachers).

### Feature Summary

1. **Modal-based Test Creation** - 5-step wizard modal replaces full-page navigation
2. **Draft Management** - Firebase-backed drafts with auto-save during review
3. **Content Visibility Toggle** - "Tests" (Published) vs "Drafts" tabs in Materials
4. **Public/Private Distinction** - Public Library vs My Content classification

---

## 2. Goals

| # | Goal | Metric |
|---|------|--------|
| G1 | Reduce context switching during test creation | Modal flow completes without page navigation |
| G2 | Zero data loss for in-progress tests | 100% of review edits persisted via auto-save |
| G3 | Support cross-device test creation | Drafts accessible from any logged-in device |
| G4 | Clear content ownership model | Teachers can distinguish personal vs shared content |
| G5 | Extensible architecture | Same modal pattern reusable for Quiz, Flashcard, etc. |

---

## 3. User Stories

### US-01: Teacher Creates New IELTS Reading Test
> As a **teacher**, I want to create a new IELTS Reading test **without leaving the Materials page**, so that I can quickly set up content and return to my workflow.

### US-02: Teacher Resumes Draft Test
> As a **teacher**, I want to resume an in-progress test draft from where I left off, so that I don't lose work if I'm interrupted or close my browser.

### US-03: Teacher Saves Test as Private
> As a **teacher**, I want to save a test as "My Content" (private), so that only I can see and use it in my classes.

### US-04: Super Admin Publishes to Public Library
> As a **super admin**, I want to publish a test to the "Public Library", so that all teachers in the system can access and use it.

### US-05: Teacher Views Draft Tests
> As a **teacher**, I want to see a list of my incomplete draft tests separately from published tests, so that I can manage my work-in-progress content.

### US-06: Teacher Deletes Draft
> As a **teacher**, I want to delete a draft test I no longer need, so that I can keep my workspace clean.

---

## 4. Functional Requirements

### 4.1 Modal Flow

| # | Requirement |
|---|-------------|
| FR-01 | The system MUST display "Create New Test" and "Drafts (N)" as tab-style buttons in the Materials tab header |
| FR-02 | Clicking "Create New Test" MUST open the extended `TestTypeSelectionModal` |
| FR-03 | The modal MUST have 5 sequential steps: Type → Skill → Metadata → Upload/Paste → Parsing |
| FR-04 | Each step MUST have a "Back" button (except Step 1) to return to the previous step |
| FR-05 | Step transitions MUST use cross-fade animation within the same modal size |
| FR-06 | The modal MUST be closable with a warning confirmation if any data has been entered |

### 4.2 Step 1: Test Type Selection (Existing)

| # | Requirement |
|---|-------------|
| FR-07 | The system MUST display available test types: IELTS (available), TOEIC, SAT, THCS-THPT, Custom (coming soon) |
| FR-08 | Unavailable test types MUST show "COMING SOON" badge and be non-clickable |
| FR-09 | Selecting a test type MUST advance to Step 2 |

### 4.3 Step 2: Skill Selection (Existing)

| # | Requirement |
|---|-------------|
| FR-10 | The system MUST display skills based on selected test type (e.g., IELTS → Reading, Listening, Writing, Speaking) |
| FR-11 | Available skills for IELTS: Reading (available), Listening (available), Writing, Speaking (coming soon) |
| FR-12 | Selecting a skill MUST advance to Step 3 |

### 4.4 Step 3: Test Metadata (NEW)

| # | Requirement |
|---|-------------|
| FR-13 | The system MUST collect the following required fields: Title (text input, max 100 chars) |
| FR-14 | The system MUST collect: Duration (dropdown: 20, 40, 60 minutes + custom input) |
| FR-15 | The system MUST collect: IELTS Target Band (dropdown: 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0) |
| FR-16 | The system MUST collect: CEFR Level (dropdown: A1, A2, B1, B2, C1, C2) |
| FR-17 | The system MUST collect: Difficulty (dropdown: Beginner, Intermediate, Advanced) |
| FR-18 | The system MAY collect: Description (optional textarea, max 500 chars) |
| FR-19 | The system MUST show: Tags (placeholder/disabled - "Coming Soon") |
| FR-20 | Title field MUST be validated as non-empty before allowing "Continue" |
| FR-21 | Default title suggestion: "{Test Type} {Skill} Test - {Month} {Year}" |
| FR-22 | Clicking "Continue" MUST advance to Step 4 |

### 4.5 Step 4: Upload/Paste Input (Existing Component Integrated)

| # | Requirement |
|---|-------------|
| FR-23 | The system MUST display format toggle: Academic / General |
| FR-24 | The system MUST display input method toggle: Upload / Paste |
| FR-25 | Upload mode MUST accept: PDF, DOCX, TXT, MD files via drag-drop or file picker |
| FR-26 | Paste mode MUST provide a textarea for direct text input |
| FR-27 | "Start Parsing" button MUST be disabled until content is provided |
| FR-28 | Clicking "Start Parsing" MUST create a draft record in Firebase and advance to Step 5 |

### 4.6 Step 5: Parsing Progress (Existing Component Integrated)

| # | Requirement |
|---|-------------|
| FR-29 | The system MUST display parsing progress (percentage, stage messages) |
| FR-30 | The system MUST show checkmarks for completed passages |
| FR-31 | "Cancel Parsing" button MUST abort the AI parsing process |
| FR-32 | Clicking outside the modal (backdrop) during parsing MUST be ignored |
| FR-33 | Pressing ESC during parsing MUST show confirmation: "Parsing in progress. Cancel?" |
| FR-34 | If parsing is cancelled, the draft record MUST be deleted (incomplete data is unusable) |
| FR-35 | Upon successful parsing, the modal MUST show "Parsing Complete! ✅" for 1.5 seconds |
| FR-36 | After success message, the modal MUST close and navigate to `/teacher/test/review/:draftId` |

### 4.7 Draft Management

| # | Requirement |
|---|-------------|
| FR-37 | Drafts MUST be stored in Firebase Firestore collection: `drafts/{draftId}` |
| FR-38 | Each draft MUST be associated with a `userId` (owner) |
| FR-39 | Draft IDs MUST use Firebase auto-generated IDs |
| FR-40 | Clicking "Drafts (N)" MUST change the list below to show draft tests instead of published tests |
| FR-41 | Draft list card MUST show: Title, Format, Level, Duration, Created Date, Status |
| FR-42 | Each draft card MUST have "Resume" button → navigates to `/teacher/test/review/:draftId` |
| FR-43 | Each draft card MUST have "Delete" button → confirmation dialog → deletes from Firebase |
| FR-44 | Users MAY have unlimited drafts |
| FR-45 | Drafts MUST NOT expire automatically (persist until published or deleted) |

### 4.8 Review Page Auto-Save

| # | Requirement |
|---|-------------|
| FR-46 | Draft saving MUST start only after parsing completes (not during parsing) |
| FR-47 | During review, drafts MUST auto-save on every edit (debounced 500ms) |
| FR-48 | The review page MUST show "beforeunload" browser warning when closing/navigating away |
| FR-49 | If auth session expires during review, MUST auto-save before showing re-login prompt |
| FR-50 | Concurrent editing in multiple tabs: last-write-wins (no conflict detection) |

### 4.9 Publishing (Draft → Test)

| # | Requirement |
|---|-------------|
| FR-51 | Publishing MUST move data from `/drafts/{draftId}` to `/tests/{testId}` |
| FR-52 | Upon successful publish, the draft record MUST be deleted |
| FR-53 | Published test MUST include `isPublic: boolean` field |
| FR-54 | Published test MUST include `ownerId: string` field |

### 4.10 Content Visibility: Public Library vs My Content

| # | Requirement |
|---|-------------|
| FR-55 | Tests with `isPublic: true` MUST appear in "Public Library" section |
| FR-56 | Tests with `isPublic: false` MUST appear in "My Content" section (visible only to owner) |
| FR-57 | Super Admins MUST be able to set `isPublic: true` when publishing |
| FR-58 | Regular Teachers MUST default to `isPublic: false` (private/My Content) |
| FR-59 | Super Admins MUST be able to convert private tests to public and vice versa |
| FR-60 | "Public Library" tests MUST be accessible by all teachers for assignment |
| FR-61 | "My Content" tests MUST only be accessible by the owner teacher |

### 4.11 Route Changes

| # | Requirement |
|---|-------------|
| FR-62 | New route MUST be created: `/teacher/test/review/:draftId` |
| FR-63 | Old route `/teacher/test/create` MUST redirect to Materials tab and auto-open modal |
| FR-64 | Route `/teacher/test/review/:draftId` MUST load draft from Firebase and display review page |

### 4.12 Security & RBAC Compliance (per PRD-0016)

#### 4.12.1 Route Protection

| # | Requirement | PRD-0016 Ref |
|---|-------------|--------------|
| FR-65 | Route `/teacher/test/review/:draftId` MUST be wrapped in `<PrivateRoute allowedRoles={['teacher', 'super_admin']}>` | FR-001 |
| FR-66 | Students MUST NOT be able to access test creation routes | US-1 |
| FR-67 | Teachers MUST NOT be able to access other teachers' drafts | US-2 |

#### 4.12.2 Ownership Validation

| # | Requirement | PRD-0016 Ref |
|---|-------------|--------------|
| FR-68 | Draft access MUST verify `draft.userId === currentUser.uid` before loading | FR-014 |
| FR-69 | Super Admins MAY access any draft for support/debugging purposes | US-4 |
| FR-70 | Test access in "My Content" MUST verify `test.ownerId === currentUser.uid` OR `isPublic === true` | FR-014 |
| FR-71 | If ownership check fails, show `AccessDeniedPage` with appropriate message | FR-017 |

#### 4.12.3 Firebase Rules for Drafts

| # | Requirement | PRD-0016 Ref |
|---|-------------|--------------|
| FR-72 | Drafts MUST have Firebase rules: `.read: auth.uid === data.child('userId').val()` | FR-019 |
| FR-73 | Drafts MUST have Firebase rules: `.write: auth.uid === data.child('userId').val() || !data.exists()` | FR-019 |
| FR-74 | Super Admin override in rules: `|| root.child('users').child(auth.uid).child('role').val() === 'super_admin'` | US-4 |

#### 4.12.4 Firebase Rules for Tests (Content Visibility)

| # | Requirement | PRD-0016 Ref |
|---|-------------|--------------|
| FR-75 | Tests with `isPublic: true` MUST be readable by any authenticated teacher/admin | FR-043 |
| FR-76 | Tests with `isPublic: false` MUST only be readable by owner OR super_admin | FR-044 |
| FR-77 | Test write rules: Only owner OR super_admin can update/delete | FR-021 |

#### 4.12.5 Audit Logging

| # | Requirement | PRD-0016 Ref |
|---|-------------|--------------|
| FR-78 | Draft creation MUST log: `{ action: 'draft_created', userId, draftId, testType, timestamp }` | FR-030 |
| FR-79 | Draft deletion MUST log: `{ action: 'draft_deleted', userId, draftId, timestamp }` | FR-030 |
| FR-80 | Test publish MUST log: `{ action: 'test_published', userId, testId, isPublic, timestamp }` | FR-031 |
| FR-81 | Test visibility change MUST log: `{ action: 'test_visibility_changed', userId, testId, oldValue, newValue, timestamp }` | FR-031 |
| FR-82 | Access denied events MUST log: `{ action: 'access_denied', userId, attemptedResource, reason, timestamp }` | FR-042 |

#### 4.12.6 Role Hierarchy

| # | Requirement | PRD-0016 Ref |
|---|-------------|--------------|
| FR-83 | Use `hasPermission(userRole, ['teacher', 'super_admin'])` for test creation access | FR-006 |
| FR-84 | Super Admin inherits all teacher permissions automatically | FR-007 |
| FR-85 | Only Super Admin can set `isPublic: true` when publishing | FR-005 |

---


## 5. Non-Goals (Out of Scope)

| # | Non-Goal |
|---|----------|
| NG-01 | Real-time collaborative editing (only one user edits at a time) |
| NG-02 | Draft version history / undo |
| NG-03 | Tag system implementation (placeholder only) |
| NG-04 | TOEIC, SAT, THCS-THPT, Custom test type implementations |
| NG-05 | Writing and Speaking skill implementations |
| NG-06 | Listening skill creation in this modal (already has separate flow) |
| NG-07 | Mobile-specific optimizations |
| NG-08 | Offline draft access |

---

## 6. Design Considerations

### 6.1 Design System Compliance (MANDATORY)

> **All new components MUST follow the app's Modern Pastel Design System**

#### Design System Files (Reference these when implementing)

| File | Purpose |
|------|---------|
| `src/styles/designSystem.js` | Programmatic access to all design tokens |
| `src/styles/modern.css` | CSS variables and utility classes |
| `src/components/modern/Button.jsx` | Standard button component |
| `src/components/modern/Card.jsx` | Standard card component |
| `src/components/modern/Input.jsx` | Standard input component |

#### Required Design Tokens

| Category | Token | Usage |
|----------|-------|-------|
| **Colors** | `colors.pastel.lavender` | Primary accent (modal headers, buttons) |
| **Colors** | `colors.pastel.mint` | Success states, completion indicators |
| **Colors** | `colors.pastel.rose` | Error states, delete actions |
| **Gradients** | `gradients.lavender` | Modal headers, primary buttons |
| **Gradients** | `gradients.lightBg` | Page backgrounds |
| **Shadows** | `shadows.glass` | Card shadows, modal shadows |
| **Glassmorphism** | `glassmorphism.base` | Modal overlay, card backgrounds |
| **Typography** | `typography.fontFamily.sans` | Body text (Inter) |
| **Typography** | `typography.fontFamily.display` | Headings (Poppins) |
| **Border Radius** | `borderRadius.xl` (20px) | Modal corners, large cards |
| **Border Radius** | `borderRadius.md` (12px) | Buttons, inputs, small cards |
| **Animations** | `animations.duration.base` (250ms) | Standard transitions |
| **Animations** | `animations.easing.easeInOut` | Smooth step transitions |

#### Glassmorphism Pattern (For All New Components)

```css
/* Standard glass card */
.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(16px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 1.25rem; /* 20px */
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
}

/* Modal header gradient */
.modal-header {
  background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 25%, #c4b5fd 50%, #ddd6fe 100%);
  border-radius: 1.25rem 1.25rem 0 0;
}
```

#### Component Style Requirements

| Component | Style Requirement |
|-----------|------------------|
| `TestCreationModal` | Glassmorphism base, lavender gradient header, 20px border-radius |
| `MetadataStep` | Glass card for form container, pastel lavender accents |
| `DraftCard` | Glass card with colored left border (status indicator), hover shadow effect |
| `DraftsListView` | Grid layout with 16px gap, glass background |
| Buttons (Primary) | `gradients.lavender`, white text, 12px border-radius, glass shadow on hover |
| Buttons (Secondary) | Transparent background, lavender border, lavender text |
| Buttons (Danger) | `colors.pastel.rose.500` background for delete actions |
| Inputs | Glass background, lavender focus ring, 8px border-radius |

### 6.2 Modal Visual Design

- **Size:** Large modal (~600px width)
- **Style:** Glassmorphism with lavender accent (use `glassmorphism.base` token)
- **Animation:** Cross-fade between steps using `animations.duration.base` (250ms)
- **Header:** Lavender gradient with step indicator (1/5, 2/5, etc.)

### 6.3 Materials Tab Header

```
┌─────────────────────────────────────────────────────────────┐
│ Materials                                                    │
│                                                             │
│ [+ Create New Test]  [📁 Drafts (3)]  [🔍 Search...]       │
│                                                             │
│ [Public Library ▼] [My Content ▼] [All Types ▼]            │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Test cards list...                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Draft Card Design

```
┌───────────────────────────────────────────────────────────┐
│  📝 IELTS Reading Test - Amazon Rainforest               │
│     Academic | B2 | 60 min                                │
│     Created: Feb 7, 2026                                  │
│     Status: In Review (40 questions)                      │
│                                                           │
│                              [Resume]  [🗑️ Delete]       │
└───────────────────────────────────────────────────────────┘
```

---

## 7. Technical Considerations

### 7.1 Firebase Structure

**Drafts Collection (Firestore):**
```typescript
// Collection: drafts/{draftId}
interface DraftDocument {
  id: string;                  // Auto-generated
  userId: string;              // Owner's UID
  
  // Test type info
  testType: 'IELTS' | 'TOEIC' | 'SAT' | 'THCS-THPT' | 'Custom';
  skillType: 'reading' | 'listening' | 'writing' | 'speaking' | 'mixed';
  format: 'academic' | 'general';
  
  // Metadata (Step 3)
  title: string;
  duration: number;
  targetBand?: string;
  cefrLevel?: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  description?: string;
  tags?: string[];
  
  // Content (after parsing)
  passages: Passage[];
  questions: ParsedQuestion[];
  sectionInstructions: Record<string, string>;
  
  // Status
  status: 'metadata' | 'parsing' | 'review';
  questionCount: number;
  missingAnswerCount: number;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Tests Collection (Realtime Database) - Existing:**
```typescript
// Path: tests/{testId}
// Uses existing TestData interface from testStorage.ts
// Fields already exist:
{
  isPublic: boolean;    // true = Public Library, false = My Content
  ownerId: string;      // Teacher's UID who created/owns the test
}
```

### 7.2 Existing Components to Reuse (NOT Recreate)

| Component | Location | What to Change |
|-----------|----------|----------------|
| `TestUploadWizard.tsx` | `components/test-creation/` | Wrap in modal step, remove AppShell dependency |
| `ParsingProgressScreen.tsx` | `components/test-creation/` | Wrap in modal step |
| `ParseReviewPanel.tsx` | `components/test-creation/` | Move to separate Review page |
| `useTestCreation.ts` | `hooks/` | Add draft save/load, extend for modal |
| `draftCloudService.ts` | `services/` | Already exists, extend schema |
| `testStorage.ts` | `services/` | Already includes `isPublic` and `ownerId` |

### 7.3 New Components to Create

| Component | Purpose |
|-----------|--------|
| `TestCreationModal.tsx` | Single shell modal with step rendering |
| `MetadataStep.tsx` | Step 3 form for title, duration, level |
| `DraftsListView.tsx` | Drafts list for Materials tab |
| `DraftCard.tsx` | Individual draft card with resume/delete |

### 7.4 Architecture: Single Modal Shell + Pluggable Steps

```tsx
// TestCreationModal - wrapper for test creation
<TestCreationModal 
  opened={modalOpen}
  onClose={handleClose}
  onComplete={(draftId) => navigate(`/teacher/test/review/${draftId}`)}
>
  <Step id="type" component={TypeSelection} />
  <Step id="skill" component={SkillSelection} validate />
  <Step id="metadata" component={MetadataForm} validate />
  <Step id="upload" component={ContentInput} />
  <Step id="parsing" component={ParsingProgress} blockClose />
</TestCreationModal>
```

This pattern allows future extension for Quiz, Flashcard, and other content types.

### 7.5 Route Changes Required

| Current Route | New Behavior |
|---------------|-------------|
| `/teacher/test/create` | **Deprecate** - Redirect to Materials + auto-open modal |
| `/teacher/test/review/:draftId` | **NEW** - Loads draft from Firebase, shows ParseReviewPanel |
| Entry point "Create Reading Test (AI)" in TeacherLobbyPage | **Move** to Materials tab header as "Create New Test" |

### 7.6 What Stays, What Changes

| Item | Action |
|------|--------|
| `TestCreationPage.tsx` | **DEPRECATE** after modal migration |
| `TestTypeSelectionModal.tsx` | **EXTEND** to become Step 1-2 of new modal |
| `useTestCreation.ts` | **EXTEND** with draft persistence |
| "Create Reading Test (AI)" button in TeacherLobby | **REMOVE** (entry point moves to Materials) |

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Draft save reliability | 99.9% | Error rate in Firebase writes |
| Modal completion rate | >80% | Users who complete all 5 steps |
| Draft resume rate | Track | How often users resume vs abandon drafts |
| Time to create test | <5 min | Average time from modal open to review page |
| Zero data loss | 0 incidents | Support tickets about lost work |

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Should we implement draft sharing between teachers? | Deferred - Out of scope |
| Q2 | Maximum file size for uploads? | Use existing limits |
| Q3 | Should Super Admin be able to view all drafts across users? | TBD - Security consideration |
| Q4 | Notification when parsing completes (if user navigates away)? | Deferred |

---

## 10. Task Breakdown

### Phase 1: Modal Architecture (Priority: P0)
- [ ] **Task 1.1:** Extend `TestTypeSelectionModal` to support multi-step wizard pattern
- [ ] **Task 1.2:** Create Step 3: Metadata collection form
- [ ] **Task 1.3:** Integrate `TestUploadWizard` as Step 4
- [ ] **Task 1.4:** Integrate `ParsingProgressScreen` as Step 5
- [ ] **Task 1.5:** Implement step navigation and validation

### Phase 2: Draft Management (Priority: P0)
- [ ] **Task 2.1:** Create/Update `drafts` collection structure in Firestore
- [ ] **Task 2.2:** Extend `draftCloudService` for new draft schema
- [ ] **Task 2.3:** Create draft on parsing completion
- [ ] **Task 2.4:** Implement auto-save in review page (500ms debounce)
- [ ] **Task 2.5:** Implement `beforeunload` warning

### Phase 3: UI Integration (Priority: P0)
- [ ] **Task 3.1:** Update Materials tab header with "Create New Test" and "Drafts" buttons
- [ ] **Task 3.2:** Create Drafts list view component
- [ ] **Task 3.3:** Add "Resume" and "Delete" actions for drafts
- [ ] **Task 3.4:** Implement tab-style toggle behavior

### Phase 4: Route Changes (Priority: P1)
- [ ] **Task 4.1:** Create new route `/teacher/test/review/:draftId`
- [ ] **Task 4.2:** Create ReviewPage component that loads draft from Firebase
- [ ] **Task 4.3:** Redirect `/teacher/test/create` to Materials + auto-open modal

### Phase 5: Publish & Visibility (Priority: P1)
- [ ] **Task 5.1:** Update publish flow to move draft → test
- [ ] **Task 5.2:** Add `isPublic` toggle for Super Admins
- [ ] **Task 5.3:** Filter Materials lists by Public Library / My Content
- [ ] **Task 5.4:** Update test card to show visibility badge

### Phase 6: Testing & Polish (Priority: P2)
- [ ] **Task 6.1:** Unit tests for draft service
- [ ] **Task 6.2:** Integration tests for full modal flow
- [ ] **Task 6.3:** E2E test for create → parse → review → publish
- [ ] **Task 6.4:** Error handling and edge cases

---

## 11. Appendix

### A. Related PRDs
- **PRD-0016: RBAC Security Hardening** (security rules followed in Section 4.12)
- PRD-0020: Automated IELTS Reading Test Creation (parsing logic)
- PRD-0021: AI Quiz Creation Wizard (similar pattern)

### B. Related Files
- `src/components/TestTypeSelectionModal.tsx`
- `src/services/draftCloudService.ts`
- `src/services/testStorage.ts`
- `src/components/test-creation/TestUploadWizard.tsx`
- `src/components/test-creation/ParseReviewPanel.tsx`
- `src/pages/TestCreationPage.tsx` (to be deprecated)

### C. Glossary
| Term | Definition |
|------|------------|
| Draft | An in-progress test that has not been published |
| Published Test | A finalized test available for assignment to students |
| Public Library | Tests with `isPublic: true`, accessible by all teachers |
| My Content | Tests with `isPublic: false`, accessible only by owner |
| Parsing | AI extraction of questions and passages from source text |
