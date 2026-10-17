import { describe, expect, it, vi } from 'vitest';
import type { NormalizedActivity } from '../../src/types/bookActivity.types';
import type { BookAssemblyBookAuthority, BookAssemblyCandidateRecord } from '../../src/services/book-assembly/unitAssembly.types';
import {
  createBookAssemblyPreviewRouteHandlers,
} from '../src/upload-worker/book-route-handlers';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1, title: 'Preview', taskProfile: null, presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Read.' }],
  interaction: { family: 'choice', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null, assetRefs: [], scoring: { mode: 'auto-where-possible' },
  interactions: [{ family: 'choice', interactionId: 'choice-1', prompt: 'Choose', options: ['A', 'B'],
    sourceAssisted: { questionLabel: '1', accessiblePrompt: 'Choose.', responseShape: 'single-choice' },
    itemIdentities: { family: 'choice', optionIds: ['a', 'b'] }, answerKey: { family: 'choice', acceptedOptionItemIds: ['a'] } }],
});

const candidate = (): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 3, sourceSetRevision: 4,
  unitKey: 'unit-1', revision: 5, lifecycle: 'validated', validation: { valid: true, errors: [] }, updatedAt: '2026-07-27T00:00:00.000Z',
  manifest: { bookId: 'book-1', sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }] },
    nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }], units: [{ unitKey: 'unit-1',
      activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
      pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [2], activityKeys: ['activity-1'], mode: 'activity' }] }] },
});

const authority = (): BookAssemblyBookAuthority => ({
  bookId: 'book-1', ownerId: 'teacher-1', bookMode: 'pdf', bookRevision: 3, sourceSetRevision: 4,
  sourceSet: candidate().manifest!.sourceSet,
  sourceVersionAuthority: { getSourceVersion: (id) => id === 'source-1'
    ? { sourceVersionId: id, bookId: 'book-1', physicalPageCount: 4, verifiedUsable: true } : undefined },
});

const request = () => new Request('https://example.test/book-assembly/books/book-1/units/unit-1/candidates/candidate-1/approve', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedCandidateRevision: 5 }),
});

const ports = () => ({
  readUser: async () => ({ role: 'teacher', status: 'active' }),
  readBookAuthority: async () => authority(),
  readCandidate: async () => candidate(),
  readActivities: async () => [{ activityKey: 'activity-1', ownerId: 'teacher-1', lifecycle: 'validated' as const, content: activity() }],
  sourceIsPreviewReady: async () => true,
});

describe('Book Assembly #63 preview route composition', () => {
  it('retains a 503 default when trusted readers or durable approval persistence are absent', async () => {
    const handlers = createBookAssemblyPreviewRouteHandlers();
    await expect(handlers.preview()).resolves.toEqual({
      body: { code: 'book_assembly_preview_dependencies_unavailable' }, init: { status: 503 },
    });
  });

  it('injects the server registry and records approval through the durable repository', async () => {
    const create = vi.fn(async () => 'created' as const);
    const handlers = createBookAssemblyPreviewRouteHandlers({
      registryVersion: 'registry-server',
      portFactory: () => ports(),
      approvalRepositoryFactory: () => ({
        create,
        revoke: async () => 'revoked' as const,
        read: async () => ({ approval: null, revocation: null }),
      }),
    });
    const result = await handlers.approve({
      request: request(), env: {}, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-1',
    });
    expect(result.init.status).toBe(200);
    expect(result.body).toMatchObject({ approval: { registryVersion: 'registry-server' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', registryVersion: 'registry-server',
    }));
    expect(JSON.stringify(create.mock.calls[0]?.[0])).not.toContain('registry-client');
  });
});
