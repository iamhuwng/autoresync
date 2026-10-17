import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookAssemblyCandidateRecord, BookAssemblyMutationResult } from '../../../services/book-assembly/unitAssembly.types';
import type { BookAssemblyMigrationClient } from '../../../services/book-assembly/assemblyClient.browser';
import BookAssemblyStrategyMigrationPanel from './BookAssemblyStrategyMigrationPanel';
import type { TrustedBookSourceVersionProjection } from '../../../types/bookAssembly.types';

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  ['full', 'full-v1'], ['component-1', 'component-v1'], ['component-2', 'component-v2'],
].map(([sourceKey, sourceVersionId]) => ({
  sourceKey, sourceVersionId, bookId: 'book-1', physicalPageCount: 10, verifiedUsable: true,
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) }, purpose: 'book-source',
  studentSafeStatus: 'ready', studentSafeDecision: {
    decidedBy: 'teacher-1', decidedAt: '2026-07-27T00:00:00.000Z',
    sourceVersionId, sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
  },
}));

const currentCandidate: BookAssemblyCandidateRecord = {
  candidateId: 'candidate-old',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 1,
  sourceSetRevision: 1,
  unitKey: 'unit-1',
  revision: 2,
  lifecycle: 'validated',
  manifest: {
    bookId: 'book-1',
    sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] },
    nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
    units: [{
      unitKey: 'unit-1',
      activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'optional', pageGroupKeys: ['group-1', 'group-2'] }],
      pageGroups: [
        { pageGroupKey: 'group-1', sourceKey: 'full', pages: [1, 2], activityKeys: ['activity-1'], mode: 'activity' },
        { pageGroupKey: 'group-2', sourceKey: 'full', pages: [3, 4], activityKeys: ['activity-1'], mode: 'activity' },
      ],
    }],
  },
  validation: { valid: true, errors: [] },
  updatedAt: '2026-07-27T00:00:00.000Z',
};

const receipt = (status: BookAssemblyMutationResult['status']) => ({
  operationId: '00000000-0000-4000-8000-000000000001',
  fingerprint: 'fingerprint',
  status,
  createdAt: '2026-07-27T00:00:00.000Z',
});

const migrationCandidate: BookAssemblyCandidateRecord = {
  ...currentCandidate,
  candidateId: 'migration-1',
  sourceSetRevision: 2,
  revision: 1,
  manifest: {
    ...currentCandidate.manifest!,
    sourceSet: { sourceStrategy: 'component_pdfs', sources: [
      { sourceKey: 'component-1', sourceVersionId: 'component-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'component-2', sourceVersionId: 'component-v2', sourceOrder: 2, ownerNodeKey: 'unit-1' },
    ] },
    units: [{
      ...currentCandidate.manifest!.units[0],
      pageGroups: currentCandidate.manifest!.units[0].pageGroups.map((group, index) => ({ ...group, sourceKey: index === 0 ? 'component-1' : 'component-2' })),
    }],
  },
};

const result = (status: BookAssemblyMutationResult['status']): BookAssemblyMutationResult => ({
  status,
  candidate: migrationCandidate,
  receipt: receipt(status),
});

describe('BookAssemblyStrategyMigrationPanel', () => {
  it('requires explicit source-qualified local remaps, stages without switching current, then confirms', async () => {
    const user = userEvent.setup();
    const client: BookAssemblyMigrationClient = {
      migrate: vi.fn(async () => result('created')),
      confirm: vi.fn(async () => result('replaced')),
      discardMigration: vi.fn(async () => result('discarded')),
    };
    const onConfirmed = vi.fn();
    render(
      <BookAssemblyStrategyMigrationPanel
        bookId="book-1"
        bookRevision={1}
        sourceSetRevision={1}
        sourceVersions={sourceVersions}
        currentCandidate={currentCandidate}
        targetStrategy="component_pdfs"
        migrationClient={client}
        onCandidateConfirmed={onConfirmed}
        onClosed={vi.fn()}
      />,
    );

    expect(screen.getByText(/Current candidate stays active/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target Source Version 1' }), 'component-v1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target owner node 1' }), 'unit-1');
    await user.click(screen.getByRole('button', { name: 'Add component Source' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target Source Version 2' }), 'component-v2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target owner node 2' }), 'unit-1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target mapping source for group-1' }), 'component-1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target mapping source for group-2' }), 'component-2');
    const pages = screen.getAllByRole('textbox').filter((input) => input.getAttribute('aria-label')?.startsWith('Target local page'));
    for (const [index, page] of pages.entries()) await user.type(page, String(index + 1));
    await user.click(screen.getByRole('button', { name: 'Prepare migration' }));

    await waitFor(() => expect(client.migrate).toHaveBeenCalledOnce());
    expect(screen.getByTestId('book-assembly-migration-state')).toHaveTextContent('Prepared; confirmation required');
    expect(screen.getByText(/Current candidate remains candidate-old/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm migration' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Confirm migration' }));
    await waitFor(() => expect(client.confirm).toHaveBeenCalledOnce());
    expect(onConfirmed).toHaveBeenCalledWith(migrationCandidate);
  });

  it('cancels without confirming and discards only the staged candidate', async () => {
    const user = userEvent.setup();
    const client: BookAssemblyMigrationClient = {
      migrate: vi.fn(async () => result('created')),
      confirm: vi.fn(async () => result('replaced')),
      discardMigration: vi.fn(async () => result('discarded')),
    };
    const onClosed = vi.fn();
    render(
      <BookAssemblyStrategyMigrationPanel
        bookId="book-1"
        bookRevision={1}
        sourceSetRevision={1}
        sourceVersions={sourceVersions}
        currentCandidate={currentCandidate}
        targetStrategy="component_pdfs"
        migrationClient={client}
        onCandidateConfirmed={vi.fn()}
        onClosed={onClosed}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel migration' }));
    expect(client.migrate).not.toHaveBeenCalled();
    expect(client.discardMigration).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledOnce();
  });
});
