import { useState, type CSSProperties } from 'react';
import { toast } from '../modern';

export interface CourseBookPrepareRequest {
  readonly operationId: string;
  readonly courseMaterialId: string;
  readonly legacyEnrollmentId: string;
}

interface CourseBookPrepareActionProps<Projection> {
  readonly courseMaterialId: string;
  readonly legacyEnrollmentId: string | null;
  readonly prepare: (request: CourseBookPrepareRequest) => Promise<Projection>;
  readonly onPrepared?: (projection: Projection) => void | Promise<void>;
  readonly trackAction: (action: string, metadata?: Record<string, unknown>) => void;
  readonly style?: CSSProperties;
}

export const CourseBookPrepareAction = <Projection,>({
  courseMaterialId,
  legacyEnrollmentId,
  prepare,
  onPrepared,
  trackAction,
  style,
}: CourseBookPrepareActionProps<Projection>) => {
  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);

  const start = async () => {
    if (!legacyEnrollmentId || preparing || ready) return;
    setPreparing(true);
    trackAction('prepareCourseBook', { courseMaterialId });
    try {
      const projection = await prepare({
        operationId: crypto.randomUUID(),
        courseMaterialId,
        legacyEnrollmentId,
      });
      setReady(true);
      await onPrepared?.(projection);
    } catch {
      toast.error('This Book is not available for your current Course access.');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <button
      type="button"
      style={style}
      disabled={!legacyEnrollmentId || preparing || ready}
      aria-busy={preparing}
      onClick={() => void start()}
    >
      {!legacyEnrollmentId ? 'Unavailable' : preparing ? 'Preparing…' : ready ? 'Ready' : 'Start →'}
    </button>
  );
};
