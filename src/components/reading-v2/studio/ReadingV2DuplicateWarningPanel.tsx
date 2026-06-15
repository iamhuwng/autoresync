import type { ReadingV2AutoSplitDuplicateWarning } from '../../../services/reading-v2/readingV2PublishPipeline.service';
import type { ReadingV2DuplicateMatch } from '../../../services/reading-v2/readingV2PassageDuplicateGuard.service';
import './ReadingV2DuplicateWarningPanel.css';

interface ReadingV2DuplicateWarningPanelProps {
  readonly warnings: readonly ReadingV2AutoSplitDuplicateWarning[];
  readonly onUseExisting?: (
    match: ReadingV2DuplicateMatch,
    warning: ReadingV2AutoSplitDuplicateWarning,
  ) => void;
  readonly onRestoreAndUse?: (
    match: ReadingV2DuplicateMatch,
    warning: ReadingV2AutoSplitDuplicateWarning,
  ) => void;
  readonly onCreateNewAnyway?: (
    match: ReadingV2DuplicateMatch,
    warning: ReadingV2AutoSplitDuplicateWarning,
  ) => void;
}

const actionAllowed = (match: ReadingV2DuplicateMatch, action: string): boolean =>
  match.actions.includes(action as ReadingV2DuplicateMatch['actions'][number]);

export const ReadingV2DuplicateWarningPanel = ({
  warnings,
  onUseExisting,
  onRestoreAndUse,
  onCreateNewAnyway,
}: ReadingV2DuplicateWarningPanelProps) => {
  const visibleWarnings = warnings.filter((warning) => warning.result.shouldWarn && warning.result.matches.length > 0);

  if (visibleWarnings.length === 0) {
    return null;
  }

  return (
    <section className="reading-v2-duplicate-warning" role="status" aria-label="Duplicate Reading Passage warning">
      <div className="reading-v2-duplicate-warning__header">
        <h2>Duplicate Reading Passage warning</h2>
        <p>non-blocking. You can use an existing passage, restore an archived match, or create this new passage anyway.</p>
      </div>
      {visibleWarnings.map((warning) => (
        <div key={warning.passageMaterialId} className="reading-v2-duplicate-warning__group">
          <span className="reading-v2-duplicate-warning__source">New passage {warning.passageMaterialId}</span>
          <ul>
            {warning.result.matches.map((match) => (
              <li key={match.materialId} data-testid={`duplicate-match-${match.materialId}`}>
                <div>
                  <strong>{match.title}</strong>
                  <span>{match.combinedSimilarityPercent}% similar</span>
                  <span>{match.state === 'archived' ? 'Archived' : 'Active'}</span>
                </div>
                <div className="reading-v2-duplicate-warning__actions">
                  {actionAllowed(match, 'use-existing') && (
                    <button type="button" onClick={() => onUseExisting?.(match, warning)}>
                      Use existing
                    </button>
                  )}
                  {actionAllowed(match, 'restore-and-use') && (
                    <button type="button" onClick={() => onRestoreAndUse?.(match, warning)}>
                      Restore and use
                    </button>
                  )}
                  {actionAllowed(match, 'create-new-anyway') && (
                    <button type="button" onClick={() => onCreateNewAnyway?.(match, warning)}>
                      Create new anyway
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
};

export default ReadingV2DuplicateWarningPanel;
