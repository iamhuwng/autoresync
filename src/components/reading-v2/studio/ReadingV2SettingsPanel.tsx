import type { ReadingV2ValidationIssue } from '../../../types/readingV2.types';
import type { ReadingV2TeacherAnswerKeyAuthority } from '../../../services/reading-v2/readingV2StudioParsingDiagnostics.service';
import { AssessmentAuthoringSection } from '../../../features/assessment/shared/components/AssessmentAuthoringSection';
import { AssessmentValidationSummary } from '../../../features/assessment/shared/components/AssessmentValidationSummary';
import type { ReadingV2StudioMetadata, ReadingV2Visibility } from './ReadingV2MetadataPanel';

export interface ReadingV2SettingsPanelProps {
  readonly metadata: ReadingV2StudioMetadata;
  readonly validationIssues: readonly ReadingV2ValidationIssue[];
  readonly publishBlocked: boolean;
  readonly answerKeyAuthority?: ReadingV2TeacherAnswerKeyAuthority;
  readonly onMetadataChange: (metadata: ReadingV2StudioMetadata) => void;
}

export function ReadingV2SettingsPanel({
  metadata,
  validationIssues,
  publishBlocked,
  answerKeyAuthority,
  onMetadataChange,
}: ReadingV2SettingsPanelProps) {
  return (
    <section className="reading-v2-settings-panel" aria-label="Reading V2 material settings">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Publishing</p>
          <h2>Settings</h2>
        </div>
        <span className={publishBlocked ? 'reading-v2-status reading-v2-status--warning' : 'reading-v2-status'}>
          {publishBlocked ? 'Blocked' : 'Ready'}
        </span>
      </div>
      <p className="reading-v2-studio__muted">Settings owns material-level configuration only.</p>
      <div className="reading-v2-form-grid">
      <label>
        Metadata shortcut title
        <input
          aria-label="Settings title"
          value={metadata.title}
          onChange={(event) => onMetadataChange({ ...metadata, title: event.currentTarget.value })}
        />
      </label>
      <label>
        Visibility
        <select
          aria-label="Settings visibility"
          value={metadata.visibility}
          onChange={(event) => onMetadataChange({ ...metadata, visibility: event.currentTarget.value as ReadingV2Visibility })}
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
          <option value="assigned-only">Assigned only</option>
        </select>
      </label>
      <label>
        Default duration
        <input
          aria-label="Settings default duration"
          type="number"
          min={1}
          value={metadata.durationMinutes}
          onChange={(event) =>
            onMetadataChange({ ...metadata, durationMinutes: Number(event.currentTarget.value) })
          }
        />
      </label>
      </div>
      <section className="reading-v2-editor-section" aria-label="Reuse and packaging state">
        <h3>Reuse And Packaging</h3>
        <p>{metadata.materialKind}</p>
        <p>{metadata.provenanceSummary}</p>
      </section>
      <AssessmentAuthoringSection
        className="reading-v2-editor-section"
        title="Accessibility And Runtime Advisories"
        ariaLabel="Accessibility and runtime advisories"
        headingLevel={3}
      >
        <p>Dense table, flowchart, and diagram tasks require runtime-specific advisories before publish.</p>
      </AssessmentAuthoringSection>
      <AssessmentValidationSummary
        title="Publish Readiness"
        status={publishBlocked ? 'blocked' : 'ready'}
        summary={publishBlocked
          ? 'Publish blocked until validation issues are resolved.'
          : 'Ready for Task 5 publish handoff.'}
        messages={answerKeyAuthority
          ? [
              answerKeyAuthority.blocking
                ? 'Publish is blocked by teacher answer-key binding.'
                : 'Teacher answer key is authoritative for marking.',
            ]
          : []}
        issueCount={validationIssues.length}
      />
      <p className="reading-v2-studio__muted">
        Assignment targets, session state, course placement, and final result release stay with their owning platform
        features.
      </p>
    </section>
  );
}
