import { useEffect, useState } from 'react';
import {
  createReadingV2ImportCandidateFromText,
  createReadingV2DefaultImportCandidate,
  type ReadingV2ImportCandidate,
} from '../../../services/reading-v2/readingV2ImportNormalization.service';
import type {
  ReadingV2TeacherImportDiagnosticTarget,
  ReadingV2TeacherImportDiagnostics,
} from '../../../services/reading-v2/readingV2StudioParsingDiagnostics.service';

export type { ReadingV2ImportCandidate };

export interface ReadingV2ImportReviewPanelProps {
  readonly candidate?: ReadingV2ImportCandidate;
  readonly teacherFacing?: boolean;
  readonly diagnostics?: ReadingV2TeacherImportDiagnostics;
  readonly showAcceptAction?: boolean;
  readonly onInspectEvidence: () => void;
  readonly onAnalyzeSource: (candidate: ReadingV2ImportCandidate) => void;
  readonly onAcceptImport: (candidate: ReadingV2ImportCandidate) => void;
  readonly onJumpToDiagnostic?: (target: ReadingV2TeacherImportDiagnosticTarget) => void;
}

export function ReadingV2ImportReviewPanel({
  candidate = createReadingV2DefaultImportCandidate(),
  teacherFacing = false,
  diagnostics,
  showAcceptAction = true,
  onInspectEvidence,
  onAnalyzeSource,
  onAcceptImport,
  onJumpToDiagnostic,
}: ReadingV2ImportReviewPanelProps) {
  const [sourceText, setSourceText] = useState(candidate.rawText ?? '');
  const [fileName, setFileName] = useState(candidate.fileName ?? '');
  const unsupportedUpload = candidate.sourceKind === 'uploaded-file' && !candidate.supportedFileType;

  useEffect(() => {
    setSourceText(candidate.rawText ?? '');
    setFileName(candidate.fileName ?? '');
  }, [candidate.fileName, candidate.rawText]);

  const handleAnalyzeSource = () => {
    onAnalyzeSource(createReadingV2ImportCandidateFromText({
      text: sourceText,
      answerKeyText: candidate.answerKeyText,
      fileName: fileName.trim() || undefined,
      sourceKind: candidate.sourceKind === 'auto-gemini' ? 'auto-gemini' : 'pasted-text',
    }));
  };
  const sourceLabel =
    candidate.sourceKind === 'uploaded-file'
      ? 'Uploaded file'
      : candidate.sourceKind === 'auto-gemini'
        ? 'Auto Gemini'
        : 'Pasted text';
  const teacherSafeItem = (item: string): string =>
    item
      .replace(/canonical draft/gi, 'draft')
      .replace(/canonical/gi, 'editable')
      .replace(/task group/gi, 'question group')
      .replace(/interactions/gi, 'questions')
      .replace(/interaction/gi, 'question')
      .replace(/anchor mapping/gi, 'question links')
      .replace(/anchors/gi, 'question links')
      .replace(/anchor/gi, 'question link')
      .replace(/publish-blocking placeholders/gi, 'missing details')
      .replace(/placeholder/gi, 'incomplete item');

  return (
    <section className="reading-v2-import-review" aria-label="Import review">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Import</p>
          <h2>{teacherFacing ? 'Import Text' : 'Review'}</h2>
        </div>
        <span className={unsupportedUpload ? 'reading-v2-status reading-v2-status--warning' : 'reading-v2-status'}>
          {teacherFacing ? sourceLabel : candidate.sourceKind}
        </span>
      </div>
      <p className="reading-v2-studio__muted">
        {teacherFacing
          ? candidate.sourceKind === 'auto-gemini'
            ? 'Review the Gemini-generated import, inspect unresolved items, then add it to your draft.'
            : 'Paste a reading test or passage, review what was found, then add it to your draft.'
          : 'Imported content normalizes into the same editable canonical draft model.'}
      </p>
      <div className="reading-v2-form-grid">
        <label>
          Import file name
          <input
            aria-label="Import file name"
            value={fileName}
            onChange={(event) => setFileName(event.currentTarget.value)}
          />
        </label>
        <label>
          {teacherFacing ? 'Text to import' : 'Source text'}
          <textarea
            aria-label="Reading V2 import source text"
            value={sourceText}
            onChange={(event) => setSourceText(event.currentTarget.value)}
          />
        </label>
      </div>
      <button
        className="reading-v2-studio__button"
        type="button"
        disabled={sourceText.trim().length === 0}
        onClick={handleAnalyzeSource}
      >
        Analyze pasted source
      </button>
      <p>Source: {teacherFacing ? sourceLabel : candidate.sourceKind}{candidate.fileName ? ` (${candidate.fileName})` : ''}</p>
      {unsupportedUpload ? <p className="reading-v2-alert" role="alert">Unsupported uploaded source file. Choose txt, docx, or pdf.</p> : null}
      {diagnostics ? (
        <section
          className="reading-v2-import-review__diagnostics"
          aria-label="Reading V2 import diagnostics"
        >
          <div
            className={`reading-v2-import-review__authority reading-v2-import-review__authority--${diagnostics.authority.status}`}
            role={diagnostics.authority.blocking ? 'alert' : 'status'}
          >
            <strong>{diagnostics.authority.label}</strong>
            <span>{diagnostics.authority.message}</span>
          </div>
          <div className="reading-v2-import-review__diagnostic-groups">
            {diagnostics.groups.map((group) => (
              <section
                className={`reading-v2-import-review__diagnostic-group reading-v2-import-review__diagnostic-group--${group.severity}`}
                aria-label={`${group.title} diagnostics`}
                key={group.id}
              >
                <div className="reading-v2-import-review__diagnostic-heading">
                  <h3>{group.title}</h3>
                  <span className={`reading-v2-status${group.severity === 'error' || group.severity === 'warning' ? ' reading-v2-status--warning' : ''}`}>
                    {group.summary}
                  </span>
                </div>
                {group.items.length > 0 ? (
                  <ul className="reading-v2-import-review__diagnostic-list">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{teacherFacing ? teacherSafeItem(item.message) : item.message}</strong>
                          {item.detail ? <span>{item.detail}</span> : null}
                        </div>
                        {onJumpToDiagnostic ? (
                          <button
                            className="reading-v2-studio__button reading-v2-studio__button--quiet"
                            type="button"
                            onClick={() => onJumpToDiagnostic(item.target)}
                          >
                            Review
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reading-v2-studio__muted">No issues found.</p>
                )}
              </section>
            ))}
          </div>
        </section>
      ) : null}
      <h3>{teacherFacing ? 'What We Found' : 'Evidence'}</h3>
      <ul>
        {candidate.evidence.map((item) => (
          <li key={item}>{teacherFacing ? teacherSafeItem(item) : item}</li>
        ))}
      </ul>
      <h3>{teacherFacing ? 'Needs Your Review' : 'Uncertainty'}</h3>
      <ul>
        {candidate.uncertaintyMarkers.map((item) => (
          <li key={item}>{teacherFacing ? teacherSafeItem(item) : item}</li>
        ))}
      </ul>
      <h3>{teacherFacing ? 'Missing Details' : 'Publish-Blocking Placeholders'}</h3>
      <ul>
        {candidate.publishBlockingPlaceholders.map((item) => (
          <li key={item}>{teacherFacing ? teacherSafeItem(item) : item}</li>
        ))}
      </ul>
      <div className="reading-v2-studio__inline-actions">
      {teacherFacing ? null : (
        <button className="reading-v2-studio__button" type="button" onClick={onInspectEvidence}>
          Inspect import evidence
        </button>
      )}
      {showAcceptAction ? (
        <button
          className="reading-v2-studio__button reading-v2-studio__button--secondary"
          type="button"
          disabled={unsupportedUpload}
          onClick={() => onAcceptImport(candidate)}
        >
          {teacherFacing ? 'Accept into Draft' : 'Accept into canonical draft'}
        </button>
      ) : null}
      </div>
    </section>
  );
}
