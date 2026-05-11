import { ReadingV2RuntimeShell } from '../runtime/ReadingV2RuntimeShell';
import type { ReadingV2DerivedProjection } from '../../../services/reading-v2/readingV2Projection.service';

export interface ReadingV2PreviewOverlayProps {
  readonly projection: ReadingV2DerivedProjection;
  readonly onClose: () => void;
}

export function ReadingV2PreviewOverlay({
  projection,
  onClose,
}: ReadingV2PreviewOverlayProps) {
  return (
    <section className="reading-v2-preview-overlay" role="dialog" aria-modal="true" aria-label="Reading V2 teacher preview">
      <div className="reading-v2-preview-overlay__header">
        <div>
          <p className="reading-v2-studio__eyebrow">Teacher-only preview</p>
        </div>
        <button className="reading-v2-studio__button" type="button" onClick={onClose}>
          Close Preview
        </button>
      </div>
      <ReadingV2RuntimeShell projection={projection} />
    </section>
  );
}
