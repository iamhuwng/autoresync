import { describe, expect, it } from 'vitest';
import coverageMatrix from '../../../../../documentation/architecture/data/prd0062-activity-coverage.matrix.json';
import { activityRendererManifest } from '../activityRendererManifest';
import { bookActivityRendererRegistry } from '../activityRendererRegistry';
import { normalizeActivity } from '../../activityCanonical.service';
import { projectStudentActivity } from '../../activityProjection.service';
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
    expect(bookActivityRendererRegistry.registrations()).toHaveLength(50);
    expect(activityRendererRegistrations.filter((entry) =>
      entry.taskProfile === undefined
      && entry.family === 'choice'
      && ['single-select', 'multi-select'].includes(entry.variant),
    )).toHaveLength(4);
    expect(activityRendererManifest.registrations.find((entry) =>
      entry.family === 'choice' && entry.variant === 'v1' && entry.profile === null)).toMatchObject({
      responseCodec: 'choice-single-v1',
      rendererId: 'choice-v1',
      codecId: 'choice-single-v1',
    });
    expect(activityRendererRegistrations.filter((entry) => entry.family === 'long-response')).toHaveLength(4);
    expect(activityRendererRegistrations.find((entry) => entry.family === 'long-response')?.taskProfile).toBeUndefined();
    expect(activityRendererManifest.registrations.find((entry) =>
      entry.family === 'long-response' && entry.variant === 'v1')).toMatchObject({
      profile: null,
      responseCodec: 'long-response-v1',
      rendererId: 'long-response-v1',
      codecId: 'long-response-v1',
    });
    expect(activityRendererRegistrations.find((entry) => entry.family === 'long-response'
      && entry.variant === 'v1' && entry.presentationMode === 'source-assisted')).toMatchObject({
      variant: 'v1',
      responseCodec: 'long-response-v1',
      rendererId: 'long-response-v1',
      codecId: 'long-response-v1',
    });
  });

  it('supports the canonical generic source-assisted long response and still rejects unregistered variants', () => {
    const activity = normalizeActivity({
      schemaVersion: 1,
      title: 'Source-assisted response',
      taskProfile: null,
      presentationMode: 'source-assisted',
      contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
      instructions: [{ text: 'Use the page to answer.' }],
      interaction: { family: 'long-response', variant: 'v1' },
      answerRule: { defaultPoints: 1, normalization: 'exact' },
      stimulus: null,
      assetRefs: [],
      interactions: [{
        prompt: 'Explain your answer.',
        rubric: { criteria: ['Support your explanation.'] },
        sourceAssisted: {
          questionLabel: '1',
          accessiblePrompt: 'Question 1. Explain your answer.',
          responseShape: 'long-response',
          sourceExerciseLabel: 'Exercise 1',
        },
      }],
      scoring: { mode: 'review-required' },
    }, { createId: () => 'interaction-1' }, undefined, {
      mappedBookPageRefs: ['source-version-1:page:3'],
    });
    const projection = projectStudentActivity(activity);
    expect(bookActivityRendererRegistry.resolve(projection, {
      surface: 'student-runtime',
      mode: 'editable',
      sourceContext: { available: true, description: 'Page 3.' },
    })).toMatchObject({ supported: true, registration: {
      family: 'long-response', variant: 'v1', presentationMode: 'source-assisted',
    } });
    expect(bookActivityRendererRegistry.resolve({
      ...projection,
      interaction: { ...projection.interaction, variant: 'essay' },
    }, {
      surface: 'student-runtime',
      mode: 'editable',
      sourceContext: { available: true, description: 'Page 3.' },
    })).toMatchObject({ supported: false, diagnostic: { code: 'unknown-renderer' } });
  });
});
