// Reading V2 runtime entry boundary: V1 Reading runtime is visual reference only.
// This entry accepts derived Reading V2 projections, never canonical drafts, packaged materials, or legacy payloads.
import type { ReadingV2ProjectionPayload } from '../../types/readingV2.types';
import { assertReadingV2ProjectionInput } from './readingV2ContractGuards.service';

export const assertReadingV2RuntimeProjection = (
  payload: ReadingV2ProjectionPayload,
): void => {
  assertReadingV2ProjectionInput(payload);

  if (!['preview', 'student-safe', 'session-safe'].includes(payload.projectionKind)) {
    throw new Error(
      `Reading V2 runtime requires preview, student-safe, or session-safe projections; received ${payload.projectionKind}.`,
    );
  }
};
