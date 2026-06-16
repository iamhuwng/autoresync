import type {
  ReadingV2Document,
  ReadingV2StimulusId,
} from '../../../types/readingV2.types';
import {
  READING_V2_CANONICAL_TASK_TYPES,
  READING_V2_TASK_TAXONOMY,
  type ReadingV2CanonicalTaskType,
} from '../../../types/readingV2Taxonomy';
import { ReadingV2ImportReviewPanel, type ReadingV2ImportCandidate } from './ReadingV2ImportReviewPanel';
import { ReadingV2StimulusEditor } from './ReadingV2StimulusEditor';
import type { ReadingV2StudioMetadata, ReadingV2Visibility } from './ReadingV2MetadataPanel';

export const READING_V2_TEACHER_STEPS = [
  'Test Info',
  'Passages',
  'Questions',
  'Review',
  'Publish',
] as const;

export type ReadingV2TeacherStudioStep = (typeof READING_V2_TEACHER_STEPS)[number];

export interface ReadingV2TeacherReadinessItem {
  readonly key: string;
  readonly label: string;
  readonly status: 'ready' | 'needs-work';
}

const parseTags = (value: string): readonly string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

export interface ReadingV2TeacherTestInfoPanelProps {
  readonly metadata: ReadingV2StudioMetadata;
  readonly titleIssue: boolean;
  readonly onMetadataChange: (metadata: ReadingV2StudioMetadata) => void;
}

export function ReadingV2TeacherTestInfoPanel({
  metadata,
  titleIssue,
  onMetadataChange,
}: ReadingV2TeacherTestInfoPanelProps) {
  return (
    <section className="reading-v2-teacher-panel" aria-label="Test information">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Setup</p>
          <h2>Test Info</h2>
        </div>
        <span className={titleIssue ? 'reading-v2-status reading-v2-status--warning' : 'reading-v2-status'}>
          {titleIssue ? 'Needs title' : 'Ready'}
        </span>
      </div>
      <div className="reading-v2-form-grid">
        <label>
          Test title
          <input
            aria-label="Test title"
            value={metadata.title}
            onChange={(event) => onMetadataChange({ ...metadata, title: event.currentTarget.value })}
          />
        </label>
        <label>
          Time limit
          <input
            aria-label="Time limit"
            type="number"
            min={1}
            value={metadata.durationMinutes}
            onChange={(event) =>
              onMetadataChange({ ...metadata, durationMinutes: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label>
          Level
          <input
            aria-label="Level"
            value={metadata.difficulty}
            onChange={(event) => onMetadataChange({ ...metadata, difficulty: event.currentTarget.value })}
          />
        </label>
        <label>
          Target band
          <input
            aria-label="Target band"
            value={metadata.targetBand}
            onChange={(event) => onMetadataChange({ ...metadata, targetBand: event.currentTarget.value })}
          />
        </label>
        <label>
          Description
          <textarea
            aria-label="Test description"
            value={metadata.description}
            onChange={(event) => onMetadataChange({ ...metadata, description: event.currentTarget.value })}
          />
        </label>
        <label>
          Tags or topics
          <input
            aria-label="Tags or topics"
            value={metadata.tags.join(', ')}
            onChange={(event) => onMetadataChange({ ...metadata, tags: parseTags(event.currentTarget.value) })}
          />
        </label>
        <label>
          Visibility
          <select
            aria-label="Visibility"
            value={metadata.visibility}
            onChange={(event) =>
              onMetadataChange({ ...metadata, visibility: event.currentTarget.value as ReadingV2Visibility })
            }
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
            <option value="assigned-only">Assigned only</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export interface ReadingV2TeacherQuestionTypePickerProps {
  readonly selectedTaskType: ReadingV2CanonicalTaskType;
  readonly onTaskTypeChange: (taskType: ReadingV2CanonicalTaskType) => void;
  readonly onAddQuestionGroup: () => void;
}

export function ReadingV2TeacherQuestionTypePicker({
  selectedTaskType,
  onTaskTypeChange,
  onAddQuestionGroup,
}: ReadingV2TeacherQuestionTypePickerProps) {
  return (
    <section className="reading-v2-teacher-add-group" aria-label="Add question group">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>IELTS task types</p>
          <h2>Add Question Group</h2>
        </div>
      </div>
      <div className="reading-v2-studio__inline-actions reading-v2-teacher-add-group__controls">
        <label>
          Question type
          <select
            aria-label="Question type"
            value={selectedTaskType}
            onChange={(event) => onTaskTypeChange(event.currentTarget.value as ReadingV2CanonicalTaskType)}
          >
            {READING_V2_CANONICAL_TASK_TYPES.map((taskType) => (
              <option key={taskType} value={taskType}>
                {READING_V2_TASK_TAXONOMY[taskType].label}
              </option>
            ))}
          </select>
        </label>
        <button className="reading-v2-studio__button reading-v2-studio__button--secondary" type="button" onClick={onAddQuestionGroup}>
          Add Question Group
        </button>
      </div>
    </section>
  );
}

export type ReadingV2TeacherPassageBlockKind = 'passage' | 'table' | 'flowchart' | 'diagram';

export interface ReadingV2TeacherPassagesPanelProps {
  readonly document: ReadingV2Document;
  readonly selectedPassageId?: ReadingV2StimulusId | null;
  readonly importCandidate?: ReadingV2ImportCandidate;
  readonly onSelectPassage: (stimulusId: ReadingV2StimulusId) => void;
  readonly onAddPassage: (passageNumber: number) => void;
  readonly onConvertPassageBlock: (stimulusId: ReadingV2StimulusId, kind: ReadingV2TeacherPassageBlockKind) => void;
  readonly onDocumentChange: (document: ReadingV2Document) => void;
  readonly onInspectImport: () => void;
  readonly onAnalyzeSource: (candidate: ReadingV2ImportCandidate) => void;
  readonly onAcceptImport: (candidate: ReadingV2ImportCandidate) => void;
}

export function ReadingV2TeacherPassagesPanel({
  document,
  selectedPassageId,
  importCandidate,
  onSelectPassage,
  onAddPassage,
  onConvertPassageBlock,
  onDocumentChange,
  onInspectImport,
  onAnalyzeSource,
  onAcceptImport,
}: ReadingV2TeacherPassagesPanelProps) {
  const passages = Array.from({ length: 3 }, (_, index) => {
    const sectionId = document.sectionIds[index];
    const section = sectionId ? document.sections[sectionId] : undefined;
    const stimulusId = section?.stimulusIds[0];
    const passage = stimulusId ? document.stimuli[stimulusId] : undefined;

    return {
      passageNumber: index + 1,
      stimulusId,
      title: passage?.title ?? section?.title,
    };
  });
  const firstAvailablePassage = passages.find((passage) => passage.stimulusId);
  const activePassageId = selectedPassageId ?? firstAvailablePassage?.stimulusId ?? null;

  return (
    <section className="reading-v2-teacher-panel" aria-label="Passages">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Reading content</p>
          <h2>Passages</h2>
        </div>
      </div>
      <div className="reading-v2-teacher-passages__cards" aria-label="Passage list">
        {passages.map((passage) => (
          <button
            key={passage.passageNumber}
            className="reading-v2-teacher-passages__card"
            type="button"
            aria-pressed={passage.stimulusId === activePassageId}
            onClick={() => {
              if (passage.stimulusId) {
                onSelectPassage(passage.stimulusId);
              } else {
                onAddPassage(passage.passageNumber);
              }
            }}
          >
            <strong>Passage {passage.passageNumber}</strong>
            <span>{passage.title?.trim() || 'Add title and text'}</span>
          </button>
        ))}
      </div>
      {activePassageId ? (
        <>
          <section className="reading-v2-teacher-passages__blocks" aria-label="Optional passage blocks">
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() => onConvertPassageBlock(activePassageId, 'passage')}
            >
              Text Passage
            </button>
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() => onConvertPassageBlock(activePassageId, 'table')}
            >
              Add Table Block
            </button>
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() => onConvertPassageBlock(activePassageId, 'diagram')}
            >
              Add Image or Diagram Block
            </button>
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() => onConvertPassageBlock(activePassageId, 'flowchart')}
            >
              Add Flowchart Block
            </button>
          </section>
          <ReadingV2StimulusEditor
            document={document}
            selectedStimulusId={activePassageId}
            teacherFacing
            onDocumentChange={onDocumentChange}
          />
        </>
      ) : (
        <section className="reading-v2-studio__empty-panel" aria-label="No passage selected">
          <h2>Start With Passage 1</h2>
          <p>Add a passage title and text before building questions.</p>
        </section>
      )}
      <ReadingV2ImportReviewPanel
        candidate={importCandidate}
        teacherFacing
        onInspectEvidence={onInspectImport}
        onAnalyzeSource={onAnalyzeSource}
        onAcceptImport={onAcceptImport}
      />
    </section>
  );
}

export interface ReadingV2TeacherReviewPanelProps {
  readonly metadata: ReadingV2StudioMetadata;
  readonly readinessItems: readonly ReadingV2TeacherReadinessItem[];
  readonly questionGroupCount: number;
  readonly questionCount: number;
  readonly publishBlocked: boolean;
  readonly onPreview: () => void;
}

export function ReadingV2TeacherReviewPanel({
  metadata,
  readinessItems,
  questionGroupCount,
  questionCount,
  publishBlocked,
  onPreview,
}: ReadingV2TeacherReviewPanelProps) {
  return (
    <section className="reading-v2-teacher-panel" aria-label="Review">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Check before students see it</p>
          <h2>Review</h2>
        </div>
        <span className={publishBlocked ? 'reading-v2-status reading-v2-status--warning' : 'reading-v2-status'}>
          {publishBlocked ? 'Needs fixes' : 'Ready'}
        </span>
      </div>
      <section className="reading-v2-editor-section" aria-label="Student preview">
        <h3>Student Preview</h3>
        <p className="reading-v2-studio__muted">
          {metadata.title || 'Untitled test'} has {questionGroupCount} question groups and {questionCount} questions.
        </p>
        <button className="reading-v2-studio__button reading-v2-studio__button--secondary" type="button" onClick={onPreview}>
          Preview Student View
        </button>
      </section>
      <section className="reading-v2-editor-section" aria-label="Readiness checklist">
        <h3>Readiness Checklist</h3>
        <ul className="reading-v2-teacher-checklist">
          {readinessItems.map((item) => (
            <li key={item.key} data-status={item.status}>
              {item.label}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

export interface ReadingV2TeacherPublishPanelProps {
  readonly publishBlocked: boolean;
  readonly validationMessages: readonly { readonly key: string; readonly message: string }[];
  readonly workflowMessage?: string | null;
  readonly publishState: string;
  readonly onSaveDraft: () => void;
  readonly onPublish: () => void;
}

export function ReadingV2TeacherPublishPanel({
  publishBlocked,
  validationMessages,
  workflowMessage,
  publishState,
  onSaveDraft,
  onPublish,
}: ReadingV2TeacherPublishPanelProps) {
  return (
    <section className="reading-v2-teacher-panel" aria-label="Publish">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Finish</p>
          <h2>Publish</h2>
        </div>
        <span className={publishBlocked ? 'reading-v2-status reading-v2-status--warning' : 'reading-v2-status'}>
          {publishBlocked ? 'Blocked' : 'Ready'}
        </span>
      </div>
      <div className="reading-v2-studio__inline-actions">
        <button className="reading-v2-studio__button reading-v2-studio__button--secondary" type="button" onClick={onSaveDraft}>
          Save Draft
        </button>
        <button
          className="reading-v2-studio__button reading-v2-studio__button--primary"
          type="button"
          disabled={publishBlocked}
          aria-disabled={publishBlocked}
          onClick={onPublish}
        >
          Publish
        </button>
      </div>
      <section className="reading-v2-editor-section" aria-label="Publish checklist">
        <h3>Publish Checklist</h3>
        {validationMessages.length > 0 ? (
          <ul className="reading-v2-teacher-checklist">
            {validationMessages.map((item) => (
              <li key={item.key} data-status="needs-work">
                {item.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>Everything is ready to publish.</p>
        )}
      </section>
      <section className="reading-v2-editor-section" aria-label="Publish status">
        <h3>Status</h3>
        <p>Publish state: <strong>{publishState}</strong></p>
        {workflowMessage ? <p aria-live="polite">{workflowMessage}</p> : null}
      </section>
    </section>
  );
}
