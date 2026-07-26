import { describe, expect, it } from 'vitest';
import coverageMatrix from '../../../../../documentation/architecture/data/prd0062-activity-coverage.matrix.json';
import { activityRendererManifest } from '../activityRendererManifest';
import { bookActivityRendererRegistry } from '../activityRendererRegistry';
import { activityRendererRegistrations } from './activityRendererRegistrations';

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
    expect(activityRendererRegistrations).toHaveLength(supportedRows.length);
    expect(new Set(activityRendererRegistrations.map(key)).size).toBe(activityRendererRegistrations.length);
    expect(new Set(activityRendererRegistrations.map((entry) => entry.family))).toEqual(
      new Set(['choice', 'text-entry']),
    );
    expect(activityRendererRegistrations.every((entry) =>
      entry.family !== 'matching' && entry.family !== 'ordering' && entry.family !== 'long-response'))
      .toBe(true);
  });

  it('keeps runtime registrations and manifest identities in exact parity', () => {
    expect(activityRendererManifest.registrations.map(key).sort()).toEqual(
      activityRendererRegistrations.map(key).sort(),
    );
    expect(bookActivityRendererRegistry.registrations()).toHaveLength(27);
    expect(activityRendererManifest.registrations.every((entry) =>
      entry.family === 'choice' || entry.family === 'text-entry')).toBe(true);
  });
});
