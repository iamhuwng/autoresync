import { useState } from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';

export interface ClassBookPlacementPanelProps {
  readonly enabled?: boolean;
  readonly classId: string;
  readonly copyId: string;
  readonly courseMaterialId: string;
  readonly bookTitle: string;
  readonly selectedActivityCount: number;
  readonly sourceExposure: 'subtree' | 'full-pdf' | 'broad-component';
  readonly onPlace?: (input: {
    readonly classId: string;
    readonly copyId: string;
    readonly courseMaterialId: string;
    readonly confirmedSourceExposure: boolean;
  }) => void;
  readonly onSync?: () => void;
}

/**
 * Unwired-by-default teacher composition seam for #103. It is native HTML/CSS
 * so it can be embedded beneath TeacherHeader without changing the shell.
 */
export function ClassBookPlacementPanel({
  enabled = false,
  classId,
  copyId,
  courseMaterialId,
  bookTitle,
  selectedActivityCount,
  sourceExposure,
  onPlace,
  onSync,
}: ClassBookPlacementPanelProps) {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.classes, { trackPageView: false });
  const [confirmed, setConfirmed] = useState(false);
  const needsConfirmation = sourceExposure === 'full-pdf' || sourceExposure === 'broad-component';

  if (!enabled) return null;

  const exposureMessage = sourceExposure === 'full-pdf'
    ? 'This placement exposes the complete published PDF to enrolled students.'
    : sourceExposure === 'broad-component'
      ? 'This placement exposes a broad Book component. Confirm that every Activity is intended.'
      : null;

  const canPlace = selectedActivityCount > 0 && (!needsConfirmation || confirmed) && Boolean(onPlace);

  return (
    <section
      aria-labelledby="class-book-placement-title"
      style={{
        border: '1px solid #d8dee8',
        borderRadius: 12,
        padding: 20,
        background: '#fff',
        color: '#172033',
        maxWidth: 720,
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5d687c' }}>
          Class Book placement
        </p>
        <h2 id="class-book-placement-title" style={{ margin: 0, fontSize: 20 }}>{bookTitle}</h2>
        <p style={{ margin: 0, color: '#4b5568' }}>
          {selectedActivityCount} Activity placement{selectedActivityCount === 1 ? '' : 's'} will use a pinned Book version.
        </p>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', margin: '8px 0 0' }}>
          <dt>Class</dt><dd style={{ margin: 0 }}>{classId}</dd>
          <dt>Copy</dt><dd style={{ margin: 0 }}>{copyId}</dd>
          <dt>Course material</dt><dd style={{ margin: 0 }}>{courseMaterialId}</dd>
        </dl>
        {exposureMessage && (
          <div role="alert" style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#fff4db', color: '#624600' }}>
            {exposureMessage}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              <span>I reviewed the exact Activity selection and source exposure.</span>
            </label>
          </div>
        )}
        {selectedActivityCount === 0 && (
          <p role="alert" style={{ margin: '8px 0 0', color: '#9b2c2c' }}>
            Select at least one Activity placement; PDF pages alone cannot be scheduled.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            disabled={!canPlace}
            onClick={() => {
              trackAction('placeClassBook', { classId, copyId, courseMaterialId });
              onPlace?.({ classId, copyId, courseMaterialId, confirmedSourceExposure: confirmed });
            }}
            style={{ minHeight: 44, padding: '10px 16px', borderRadius: 8, border: 0, background: '#2446a8', color: '#fff', cursor: canPlace ? 'pointer' : 'not-allowed' }}
          >
            Place Book Activities
          </button>
          <button
            type="button"
            disabled={!onSync}
            onClick={() => {
              trackAction('syncClassBook', { classId, copyId, courseMaterialId });
              onSync?.();
            }}
            style={{ minHeight: 44, padding: '10px 16px', borderRadius: 8, border: '1px solid #aab4c6', background: '#fff', color: '#172033', cursor: onSync ? 'pointer' : 'not-allowed' }}
          >
            Sync from source Course
          </button>
        </div>
      </div>
    </section>
  );
}
