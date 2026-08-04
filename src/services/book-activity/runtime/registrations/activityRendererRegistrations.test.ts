import { describe, expect, it } from 'vitest';
import coverageMatrix from '../../../../../documentation/architecture/data/prd0062-activity-coverage.matrix.json';
import { activityRendererManifest } from '../activityRendererManifest';
import { bookActivityRendererRegistry } from '../activityRendererRegistry';
import {
  activityRendererRegistrations,
  ticket23ActivityRendererRegistrations,
} from './activityRendererRegistrations';

const key = (entry: {
  family: string;
  variant: string;
  profile?: { taxonomyId: string; typeId: string; taxonomyVersion: number } | null;
  taskProfile?: { taxonomyId: string; typeId: string; taxonomyVersion: number };
}) => [
  entry.family,
  entry.variant,
  (entry.profile ?? entry.taskProfile)?.taxonomyId ?? '',
  (entry.profile ?? entry.taskProfile)?.typeId ?? '',
  (entry.profile ?? entry.taskProfile)?.taxonomyVersion ?? '',
].join('\u0000');

describe('Ticket #38 renderer registrations', () => {
  it('registers exactly supported choice/text-entry matrix rows', () => {
    const supportedRows = coverageMatrix.rows.filter(
      (row) => row.interaction.family === 'choice' || row.interaction.family === 'text-entry',
    );
    expect(ticket23ActivityRendererRegistrations).toHaveLength(supportedRows.length);
    expect(new Set(ticket23ActivityRendererRegistrations.map(key)).size)
      .toBe(ticket23ActivityRendererRegistrations.length);
    expect(new Set(ticket23ActivityRendererRegistrations.map((entry) => entry.family))).toEqual(
      new Set(['choice', 'text-entry']),
    );
    expect(ticket23ActivityRendererRegistrations.every((entry) =>
      entry.family !== 'matching' && entry.family !== 'ordering' && entry.family !== 'long-response'))
      .toBe(true);
  });

  it('keeps runtime registrations and manifest identities in exact parity', () => {
    expect(activityRendererManifest.registrations.map(key).sort()).toEqual(
      activityRendererRegistrations.map(key).sort(),
    );
    expect(bookActivityRendererRegistry.registrations()).toHaveLength(33);
    expect(activityRendererRegistrations.filter((entry) => entry.family === 'long-response')).toHaveLength(1);
    expect(activityRendererRegistrations.find((entry) => entry.family === 'long-response')?.taskProfile).toBeUndefined();
    expect(activityRendererManifest.registrations.find((entry) =>
      entry.family === 'long-response' && entry.variant === 'v1')).toMatchObject({
      profile: null,
      responseCodec: 'long-response-v1',
      rendererId: 'long-response-v1',
      codecId: 'long-response-v1',
    });
  });
});
