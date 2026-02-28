---
title: 'Pattern: Dynamic Step Order Wizard'
createdAt: '2026-02-28T04:46:39.574Z'
updatedAt: '2026-02-28T04:47:17.643Z'
description: >-
  How to extend a multi-step modal wizard with dynamic step sequences based on
  selection, without breaking the existing base flow. Demonstrated by adding
  in-modal Writing test creation to TestCreationModal.
tags:
  - pattern
  - modal
  - wizard
  - dynamic-steps
  - test-creation
---
# Pattern: Dynamic Step Order Wizard

## Problem

You have a multi-step modal wizard (e.g., `TestCreationModal`) with a fixed step sequence (`type → skill → metadata → upload → parsing`). A new feature requires a **different step sequence** for a specific selection (e.g., Writing skill needs `type → skill → writing-metadata → writing-format → writing-content` instead of `upload → parsing`).

**Anti-pattern:** Redirecting to a separate page for the alternate flow, which breaks the modal context and user experience.

## Solution

Use **dynamic step orders** — maintain multiple step sequences and switch between them at runtime based on user selections.

### 1. Define Alternate Step Sequences in Types

```typescript
// draft.types.ts
export type ModalStep = 'type' | 'skill' | 'metadata' | 'upload' | 'parsing'
    | 'writing-metadata' | 'writing-format' | 'writing-content';

// Base flow (Reading/Listening)
export const MODAL_STEP_ORDER: ModalStep[] = ['type', 'skill', 'metadata', 'upload', 'parsing'];

// Alternate flow (Writing)
export const WRITING_STEP_ORDER: ModalStep[] = ['type', 'skill', 'writing-metadata', 'writing-format', 'writing-content'];
```

### 2. Define Config Arrays for Each Flow

```typescript
const STEP_CONFIGS: StepConfig[] = [
    { id: 'type', label: 'Test Type', icon: '📋' },
    { id: 'skill', label: 'Skill', icon: '🎯' },
    { id: 'metadata', label: 'Details', icon: '📝' },
    { id: 'upload', label: 'Content', icon: '📤' },
    { id: 'parsing', label: 'Processing', icon: '⚙️' },
];

const WRITING_STEP_CONFIGS: StepConfig[] = [
    { id: 'type', label: 'Test Type', icon: '📋' },
    { id: 'skill', label: 'Skill', icon: '🎯' },
    { id: 'writing-metadata', label: 'Details', icon: '📝' },
    { id: 'writing-format', label: 'Format', icon: '📐' },
    { id: 'writing-content', label: 'Content', icon: '✍️' },
];
```

### 3. Compute Active Flow Dynamically

```typescript
const isWritingFlow = stepData.skillType === 'writing';
const activeStepOrder = isWritingFlow ? WRITING_STEP_ORDER : MODAL_STEP_ORDER;
const activeStepConfigs = isWritingFlow ? WRITING_STEP_CONFIGS : STEP_CONFIGS;
const currentStepIndex = activeStepOrder.indexOf(currentStep);
const totalSteps = activeStepOrder.length;
const currentStepConfig = activeStepConfigs.find(s => s.id === currentStep);
```

### 4. Use Active Flow in Navigation

```typescript
const handleBack = useCallback(() => {
    const prevStep = activeStepOrder[currentStepIndex - 1]; // ← dynamic
    // ...
}, [currentStepIndex, activeStepOrder]);

const handleNext = useCallback(() => {
    const nextStep = activeStepOrder[currentStepIndex + 1]; // ← dynamic
    // ...
}, [canProceed, currentStepIndex, totalSteps, activeStepOrder]);
```

### 5. Branch at Selection Point

```typescript
const handleSkillSelect = useCallback((skillType: SkillType) => {
    updateStepData({ skillType });

    if (skillType === 'writing') {
        // Stay in modal — advance to writing-metadata step
        setCurrentStep('writing-metadata');
        return;
    }

    // Default flow continues normally
    setCurrentStep('metadata');
}, []);
```

### 6. Extend canProceed and renderStepContent

```typescript
const canProceed = useCallback((): boolean => {
    switch (currentStep) {
        // Base steps...
        case 'writing-metadata':
            return writingMeta.title.trim().length > 0;
        case 'writing-format':
            return writingFormat !== undefined;
        case 'writing-content':
            return hasPromptText(); // validation for the alternate flow
        default:
            return false;
    }
}, [currentStep, ...deps]);
```

### 7. Separate Footer for Final Step

The final step of an alternate flow may need a different footer (e.g., Save Draft + Publish instead of Continue):

```typescript
if (currentStep === 'writing-content') {
    return (
        <footer>
            <Button onClick={handleBack}>Back</Button>
            <Button onClick={handleSaveDraft}>💾 Save Draft</Button>
            <Button onClick={handlePublish}>🚀 Publish Test</Button>
        </footer>
    );
}
```

## Key Principles

| Principle | Why |
|-----------|-----|
| **Shared early steps** | `type` and `skill` are the same for all flows — share them |
| **Dynamic `activeStepOrder`** | All navigation/indicators use this — never hardcode `MODAL_STEP_ORDER` |
| **Prefix convention** | Alternate steps use `writing-*` prefix to avoid ID collisions |
| **Reset on open** | Clear all flow-specific state when modal opens |
| **Step indicator uses active configs** | `{activeStepConfigs.map(...)` instead of `{STEP_CONFIGS.map(...)` |

## Files

| File | Role |
|------|------|
| `src/types/draft.types.ts` | Step type union, step order arrays, step data interface |
| `src/components/test-creation/TestCreationModal.tsx` | Modal shell, navigation, step rendering, footer |
| `src/components/test-creation/WritingStepsContent.tsx` | Step-specific UI components (glass card forms) |

## Extending Further

To add another skill-specific flow (e.g., `speaking`):

1. Add step IDs: `'speaking-metadata' | 'speaking-record' | 'speaking-review'`
2. Define `SPEAKING_STEP_ORDER` and `SPEAKING_STEP_CONFIGS`
3. Extend the `isWritingFlow` / `activeStepOrder` logic:
   ```typescript
   const activeStepOrder = 
       stepData.skillType === 'writing' ? WRITING_STEP_ORDER :
       stepData.skillType === 'speaking' ? SPEAKING_STEP_ORDER :
       MODAL_STEP_ORDER;
   ```
4. Add cases to `canProceed`, `renderStepContent`, and `renderFooter`

## Source

Implemented in this session for IELTS Writing in-modal test creation. Previously, Writing skill selection redirected to `/teacher/writing-test/create` — now it stays in the modal with 3 writing-specific steps.
