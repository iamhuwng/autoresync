import { describe, expect, it } from 'vitest';
import coverageMatrix from '../../../../../documentation/architecture/data/prd0062-activity-coverage.matrix.json';
import { activityRendererManifest } from '../activityRendererManifest';
import { bookActivityRendererRegistry } from '../activityRendererRegistry';
import {
  matchingOrderingRendererRegistrations,
} from './matchingOrderingRendererRegistrations';

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

describe('Ticket #39 renderer registrations', () => {
  it('registers every and only supported matching row', () => {
    const matchingRows = coverageMatrix.rows.filter(
      (row) => row.interaction.family === 'matching' &&
        row.support.state === 'structurally-supported',
    );
    expect(matchingOrderingRendererRegistrations.map(key).sort())
      .toEqual(matchingRows.map((row) => key({
        family: row.interaction.family,
        variant: row.interaction.variant,
        profile: row.profile,
      })).sort());
    expect(matchingOrderingRendererRegistrations).toHaveLength(5);
    expect(matchingOrderingRendererRegistrations.every(
      (entry) => entry.family === 'matching' &&
        entry.responseCodec === 'matching-pairs-v1',
    )).toBe(true);
  });

  it('keeps unclassified ordering variants unregistered and fail closed', () => {
    expect(coverageMatrix.rows.some((row) => row.interaction.family === 'ordering')).toBe(false);
    expect(activityRendererManifest.registrations.some((entry) => entry.family === 'ordering')).toBe(false);
    expect(bookActivityRendererRegistry.resolve({
      schemaVersion: 1,
      title: 'Order steps',
      taskProfile: null,
      presentationMode: 'structured',
      contextRequirement: { mode: 'none', acceptedKinds: [] },
      instructions: [{ text: 'Order the steps.' }],
      interaction: { family: 'ordering', variant: 'unsupported-order' },
      answerRule: { defaultPoints: 1, normalization: 'exact' },
      stimulus: null,
      assetRefs: [],
      interactions: [{
        interactionId: 'ordering-1',
        family: 'ordering',
        prompt: 'Order the steps.',
        items: [{ itemId: 'item-a', label: 'Step A' }],
      }],
      scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
    }, {
      surface: 'student-runtime',
      mode: 'editable',
    })).toMatchObject({
      supported: false,
      diagnostic: { code: 'unknown-renderer' },
    });
  });
});
