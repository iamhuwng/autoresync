import type { ReadingV2Document, ReadingV2PassageAssetId, ReadingV2PassageAssetVersion } from '../../../types/readingV2.types';
import {
  searchReadingV2PassageAssets,
  selectReadingV2PassageAssetForDraft,
  type ReadingV2PassageAssetSearchResult,
  type ReadingV2RepositoryInstance,
} from '../../../services/reading-v2/readingV2PassageAssetWorkflow.service';

export interface ReadingV2PassageAssetPanelProps {
  readonly repository?: ReadingV2RepositoryInstance;
  readonly ownerId: string;
  readonly document: ReadingV2Document;
  readonly results?: readonly ReadingV2PassageAssetSearchResult[];
  readonly onDocumentChange: (document: ReadingV2Document) => void;
  readonly onInspectProvenance: () => void;
  readonly onExtract: () => void;
}

export function ReadingV2PassageAssetPanel({
  repository,
  ownerId,
  document,
  results,
  onDocumentChange,
  onInspectProvenance,
  onExtract,
}: ReadingV2PassageAssetPanelProps) {
  const assetResults = results ?? (repository
    ? searchReadingV2PassageAssets(repository, { ownerId })
    : []);

  const selectAsset = (
    passageAssetId: ReadingV2PassageAssetId,
    version: ReadingV2PassageAssetVersion,
  ) => {
    onDocumentChange(selectReadingV2PassageAssetForDraft(document, { passageAssetId, version }));
  };

  return (
    <section className="reading-v2-passage-asset-panel" aria-label="Passage asset panel">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Assets</p>
          <h2>Passage Assets In Scope</h2>
        </div>
        <span className="reading-v2-status">Studio-only</span>
      </div>
      <p className="reading-v2-studio__muted">
        Passage assets stay as versioned stimulus context and are not lobby-launchable materials by default.
      </p>
      <div className="reading-v2-studio__inline-actions">
        <button className="reading-v2-studio__button" type="button" onClick={onInspectProvenance}>
          Inspect provenance
        </button>
        <button className="reading-v2-studio__button" type="button" onClick={onExtract}>
          Extract task group
        </button>
      </div>

      {assetResults.length === 0 ? (
        <p className="reading-v2-studio__muted">No reusable passage assets are available for this owner yet.</p>
      ) : (
        <ol className="reading-v2-studio__outline" aria-label="Passage asset search results">
          {assetResults.map((result) => (
            <li key={result.asset.passageAssetId}>
              <strong>{result.currentVersion?.title ?? result.asset.passageAssetId}</strong>
              <dl className="reading-v2-definition-list">
                <dt>Version</dt>
                <dd>{result.asset.currentVersionId}</dd>
                <dt>Source</dt>
                <dd>{result.currentVersion?.source ?? 'Unknown'}</dd>
                <dt>Rights</dt>
                <dd>{result.currentVersion?.rights ?? 'Unspecified'}</dd>
                <dt>Topic</dt>
                <dd>{result.currentVersion?.topic ?? 'Unspecified'}</dd>
                <dt>Word count</dt>
                <dd>{result.currentVersion?.wordCount ?? 'Unspecified'}</dd>
                <dt>Reuse advisory</dt>
                <dd>{result.asset.reuseAdvisory ?? 'reusable'}</dd>
                <dt>Provenance</dt>
                <dd>{result.currentVersion?.provenance?.extractionMethod ?? 'Original or unspecified'}</dd>
                <dt>Where used</dt>
                <dd>{result.whereUsed.length}</dd>
              </dl>
              {result.whereUsed.length > 0 ? (
                <ul aria-label={`Where used for ${result.asset.passageAssetId}`}>
                  {result.whereUsed.map((entry) => (
                    <li key={`${entry.consumerKind}-${entry.consumerId}`}>
                      {entry.consumerKind}: {entry.consumerId}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.currentVersion ? (
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--secondary"
                  type="button"
                  onClick={() => selectAsset(result.asset.passageAssetId, result.currentVersion!)}
                >
                  Use This Version
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
