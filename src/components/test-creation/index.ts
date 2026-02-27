/**
 * Test Creation Components - Index
 * 
 * Exports all components for the IELTS Reading Test creation flow.
 * 
 * @module test-creation/index
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 6
 */

// Main Components
export { default as TestCreationModal } from './TestCreationModal';
export { default as MetadataStep } from './MetadataStep';
export { TestUploadWizard } from './TestUploadWizard';
export { ParsingProgressScreen } from './ParsingProgressScreen';
export { ParseReviewPanel } from './ParseReviewPanel';
export { UncertainItemsSidebar } from './UncertainItemsSidebar';
export { ComparisonModal } from './ComparisonModal';
export { CompletionChecklist } from './CompletionChecklist';
export { AnswerKeyModal } from './AnswerKeyModal';

// Export types
export type { MetadataStepProps } from './MetadataStep';
export type {
    TestUploadWizardProps,
    UploadMode,
} from './TestUploadWizard';

export type {
    ParsingProgressScreenProps,
    ParsingStage,
} from './ParsingProgressScreen';

export type {
    ParseReviewPanelProps,
    ParsedPassage,
    ParsedQuestion,
    SectionInstruction,
} from './ParseReviewPanel';

export type {
    UncertainItemsSidebarProps,
} from './UncertainItemsSidebar';

export type {
    ComparisonModalProps,
    ComparisonData,
} from './ComparisonModal';

export type {
    CompletionChecklistProps,
    CompletenessCheck,
} from './CompletionChecklist';

export type {
    AnswerKeyModalProps,
} from './AnswerKeyModal';
