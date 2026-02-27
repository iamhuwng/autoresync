# PRD: Refactor Edit Test Dialog (Unified Resource Model)

## 1. Introduction
The `EditTestModal` currently suffers from "Frankenstein" architecture, where Reading Test logic (Passages) conflicts with Listening Test logic (Audio/Images). This has led to regression bugs, such as validation errors in Listening tests (Session 7). This PRD outlines a refactor to separate concerns using a "Frame + Layout" architecture and a "Unified Resource" data model.

## 2. Goals
1.  **Stable Architecture**: Decouple Reading and Listening logic to prevent feature overlap regressions.
2.  **Unified Data Handling**: implementation of a "Resource" model that standardizes how questions link to Context (Text, Audio, or Images).
3.  **Flexible Validation**: Context-aware validation rules (e.g., Image Mode questions do not require text).
4.  **Extensibility**: A foundation that easily supports future Speaking/Writing tests.

## 3. User Stories
*   As a **Developer**, I want `EditTestModal` to be a generic shell so I can easily maintain separate editors for distinct skills.
*   As a **Teacher**, I want to create a Listening Test with mixed tasks (some Text-based, some Image-based) without validation errors blocking me.
*   As a **Teacher**, I want a unified "Context" tab where I can manage my Passages, Audio Tracks, or Image Groups in one place.

## 4. Functional Requirements

### 4.1 Architecture: Frame + Layouts
*   **Frame (`EditTestModal`)**:
    *   Responsibilities: Title management, Save/Cancel actions, Global settings (Timer), Tab switching (Questions / Context / Keys).
    *   Dynamic Rendering: Renders `<ReadingEditorLayout />` or `<ListeningEditorLayout />` based on `test.skill`.
*   **Layouts**:
    *   **ReadingLayout**: Logic for Text Passages.
    *   **ListeningLayout**: Logic for Audio Sections and Image Groups.

### 4.2 Data Model: Unified Resource Strategy
*   Refactor the concept of `passageId` to a generic `resourceId`.
*   **Context Resources**:
    *   **Type A: Text Passage** (Reading).
    *   **Type B: Audio Track** (Listening - Text Input Method).
    *   **Type C: Image Group** (Listening - Image Mode).
    *   **Future Type D: Writing Task** (Writing - Text prompt + Optional Image).
    *   **Future Type E: Speaking Question Group** (Speaking - Part 1/3).
    *   **Future Type F: Speaking Cue Card** (Speaking - Part 2 Image/Text).
*   **Linking**: Every question links to a specific `resourceId`.

### 4.3 Unified "Context" Tab
*   Replaces the legacy "Passage" tab.
*   Polymorphic UI:
    *   Displays Text Editor if resource is Text.
    *   Displays Audio Player + Uploader if resource is Audio.
    *   Displays Image Gallery if resource is Image Group.

### 4.4 Data Flow Consistency
*   **Create New Test**: New tests must initialize with the correct structure (e.g., initial empty resource) compatible with the Editor.
*   **Edit Test Dialog**: Must allow two-way synchronization.
    *   *Load*: Map database `passages` / `audioSections` -> `ContextResources`.
    *   *Save*: Map `ContextResources` -> database fields (backward compatible).
*   **Student Test View**:
    *   Must handle `question.resourceId` to find content.
    *   If `question.resourceId` is missing, fallback to legacy `passageId` or `sectionNumber` logic.
*   **Teacher Test Monitor**:
    *   Must support displaying the new resource types (e.g., if a listening test has mixed text/image resources).

### 4.5 Validation Rules
*   **Global**: All questions must have a correct answer.
*   **Context-Aware**:
    *   **If Linked to Audio/Text Resource**: Question Text is **REQUIRED**.
    *   **If Linked to Image Resource**: Question Text is **OPTIONAL**.

## 5. Non-Goals
*   Migrating all existing database data immediately (we will support legacy structure via adaptors if needed, but new logic uses the new model).
*   Implementing full Speaking/Writing editors (just the shell support).

## 6. Technical Considerations
*   **State Management**: `TestEditor.tsx` should remain the central state container but pass focused subsets of data to Layouts.
*   **Migration**: Existing `audioSections` and `questionImages` in a test should be mapped to the new "Resource" objects in the UI state to ensure backward compatibility.

## 7. Success Metrics
*   **Zero Validation Errors** when saving a Listening Test with empty question text (in Image Mode).
*   **Zero Regressions** in existing Reading Test editing.
*   **Successful creation** of a "Mixed Method" Listening Test (Audio track + Image task).

## 8. Open Questions
*   None. (Clarified in pre-PRD discussion).
