import { describe, expect, it } from 'vitest';
import coverageMatrix from '../../../../../documentation/architecture/data/prd0062-activity-coverage.matrix.json';
import { activityRendererManifest } from '../activityRendererManifest';
import { bookActivityAdapterRegistrations } from './bookActivityAdapterRegistrations';

const key = (entry: {
  profile: { taxonomyId: string; typeId: string; taxonomyVersion: number } | null;
  family?: string;
  variant?: string;
  interaction?: { family: string; variant: string };
  presentationMode: string;
  responseCodec: string;
}) => [
  entry.profile?.taxonomyId ?? '',
  entry.profile?.typeId ?? '',
  entry.profile?.taxonomyVersion ?? '',
  entry.family ?? entry.interaction?.family ?? '',
  entry.variant ?? entry.interaction?.variant ?? '',
  entry.presentationMode,
  entry.responseCodec,
].join('\u0000');

describe('Ticket #41 adapter registrations', () => {
  it('names every supported matrix row exactly once', () => {
    const supportedRows = coverageMatrix.rows.filter(
      (row) =>
        row.support.state === 'structurally-supported' ||
        row.support.state === 'source-assisted-supported',
    );
    expect(bookActivityAdapterRegistrations.map(key).sort())
      .toEqual(supportedRows.map(key).sort());
    expect(new Set(bookActivityAdapterRegistrations.map(key)).size)
      .toBe(bookActivityAdapterRegistrations.length);
  });

  it('uses only explicit public native-domain export boundaries', () => {
    expect(new Set(bookActivityAdapterRegistrations.map((entry) => entry.publicExport)))
      .toEqual(new Set([
        'services/reading-v2/public',
        'features/assessment/listening/public',
      ]));
    expect(bookActivityAdapterRegistrations.map(key).sort())
      .toEqual(activityRendererManifest.registrations.map(key).sort());
  });
});
