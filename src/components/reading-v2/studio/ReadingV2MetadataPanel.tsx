import type { ReadingV2ValidationIssue } from '../../../types/readingV2.types';
import type {
  MaterialTestTypeConfig,
  MaterialTestTypeId,
} from '../../../types/materialCatalog.types';
import type {
  ReadingV2MaterialKind,
  ReadingV2MaterialVisibility,
} from '../../../services/reading-v2/readingV2MaterialMetadata.service';

export type ReadingV2Visibility = ReadingV2MaterialVisibility;

export interface ReadingV2StudioMetadata {
  readonly title: string;
  readonly productMarker: string;
  readonly materialKind: ReadingV2MaterialKind;
  readonly durationMinutes: number;
  readonly difficulty: string;
  readonly targetBand: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly visibility: ReadingV2Visibility;
  readonly ownerId: string;
  readonly provenanceSummary: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds?: readonly MaterialTestTypeId[];
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
}

export interface ReadingV2MetadataPanelProps {
  readonly metadata: ReadingV2StudioMetadata;
  readonly validationIssues: readonly ReadingV2ValidationIssue[];
  readonly onMetadataChange: (metadata: ReadingV2StudioMetadata) => void;
}

const parseTags = (value: string): readonly string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

export function ReadingV2MetadataPanel({
  metadata,
  validationIssues,
  onMetadataChange,
}: ReadingV2MetadataPanelProps) {
  const titleIssue = metadata.title.trim().length === 0;

  return (
    <section className="reading-v2-metadata-panel" aria-label="Reading V2 metadata panel">
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Material setup</p>
          <h2>Metadata</h2>
        </div>
        <span className={titleIssue ? 'reading-v2-status reading-v2-status--warning' : 'reading-v2-status'}>
          {titleIssue ? 'Needs title' : 'Ready'}
        </span>
      </div>
      <p className="reading-v2-studio__muted">
        Metadata updates test setup details and does not change question meaning or live published tests.
      </p>
      <div className="reading-v2-form-grid">
      <label>
        Title
        <input
          aria-label="Material title"
          value={metadata.title}
          onChange={(event) => onMetadataChange({ ...metadata, title: event.currentTarget.value })}
        />
      </label>
      <label>
        Product marker
        <input aria-label="Product marker" value={metadata.productMarker} readOnly />
      </label>
      <label>
        Material kind
        <select
          aria-label="Material kind"
          value={metadata.materialKind}
          onChange={(event) =>
            onMetadataChange({ ...metadata, materialKind: event.currentTarget.value as ReadingV2MaterialKind })
          }
        >
          <option value="full-test">Full test</option>
          <option value="task-group-material">Task-group material</option>
          <option value="extracted-task-group-material">Extracted task-group material</option>
        </select>
      </label>
      <label>
        Duration guidance
        <input
          aria-label="Duration guidance"
          type="number"
          min={1}
          value={metadata.durationMinutes}
          onChange={(event) =>
            onMetadataChange({ ...metadata, durationMinutes: Number(event.currentTarget.value) })
          }
        />
      </label>
      <label>
        Difficulty
        <input
          aria-label="Difficulty"
          value={metadata.difficulty}
          onChange={(event) => onMetadataChange({ ...metadata, difficulty: event.currentTarget.value })}
        />
      </label>
      <label>
        Target band or level
        <input
          aria-label="Target band"
          value={metadata.targetBand}
          onChange={(event) => onMetadataChange({ ...metadata, targetBand: event.currentTarget.value })}
        />
      </label>
      <label>
        Description
        <textarea
          aria-label="Description"
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
      <dl className="reading-v2-definition-list">
        <dt>Ownership</dt>
        <dd>{metadata.ownerId}</dd>
        <dt>Source summary</dt>
        <dd>{metadata.provenanceSummary}</dd>
      </dl>
      <p className="reading-v2-studio__readiness" aria-live="polite">
        Readiness: {titleIssue ? 'Title required before publish' : 'Metadata ready for draft save'}
      </p>
      <p className="reading-v2-studio__muted">Validation issues: {validationIssues.length}</p>
    </section>
  );
}
