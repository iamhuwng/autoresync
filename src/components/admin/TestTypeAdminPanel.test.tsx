import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { materialCatalogIds, type MaterialTestTypeConfig } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';
import { TestTypeAdminPanel } from './TestTypeAdminPanel';

const diagMocks = vi.hoisted(() => ({
  log: vi.fn(),
}));

vi.mock('../../utils/teacherMaterialsDiagnostics', () => ({
  getTeacherMaterialsDiagnosticTime: () => 0,
  getTeacherMaterialsElapsedMs: () => 7,
  logTeacherMaterialsDiagnostic: (...args: unknown[]) => diagMocks.log(...args),
}));

const cloneType = (config: MaterialTestTypeConfig): MaterialTestTypeConfig => ({
  ...config,
  aliases: [...config.aliases],
  allowedMaterialKinds: [...config.allowedMaterialKinds],
});

const getDefaultType = (testTypeId: string): MaterialTestTypeConfig => {
  const config = DEFAULT_MATERIAL_TEST_TYPES.find((entry) => entry.testTypeId === testTypeId);
  if (!config) {
    throw new Error(`Missing default Test Type ${testTypeId}`);
  }
  return cloneType(config);
};

const context = {
  uid: 'super-admin-1',
  role: 'super_admin',
  now: () => '2026-06-01T00:00:00.000Z',
};

const createRepository = (initial = DEFAULT_MATERIAL_TEST_TYPES.map(cloneType)) => {
  const records = new Map(initial.map((config) => [config.testTypeId, cloneType(config)]));
  const writes: MaterialTestTypeConfig[] = [];
  const deleted: string[] = [];

  return {
    writes,
    deleted,
    async listTestTypes() {
      return Array.from(records.values()).map(cloneType);
    },
    async writeTestType(config: MaterialTestTypeConfig) {
      records.set(config.testTypeId, cloneType(config));
      writes.push(cloneType(config));
    },
    async deleteTestType(testTypeId: string) {
      deleted.push(testTypeId);
      records.delete(testTypeId);
    },
  };
};

describe('TestTypeAdminPanel', () => {
  it('logs non-sensitive Test Type config load success and failure diagnostics', async () => {
    const successRepository = createRepository([getDefaultType('ielts')]);
    const failingRepository = {
      listTestTypes: vi.fn(async () => {
        throw new Error('permission_denied');
      }),
      writeTestType: vi.fn(),
    };

    const { rerender } = render(
      <TestTypeAdminPanel
        testTypes={[]}
        context={context}
        repository={successRepository}
      />,
    );

    await waitFor(() => {
      expect(diagMocks.log).toHaveBeenCalledWith('test_type_config_load_succeeded', {
        count: 1,
        durationMs: 7,
      });
    });

    rerender(
      <TestTypeAdminPanel
        testTypes={[]}
        context={context}
        repository={failingRepository}
      />,
    );

    await waitFor(() => {
      expect(diagMocks.log).toHaveBeenCalledWith('test_type_config_load_failed', {
        message: 'permission_denied',
        durationMs: 7,
      });
    });
  });

  it('renders loading, empty, permission, and retryable error states', () => {
    const { rerender } = render(<TestTypeAdminPanel loading />);
    expect(screen.getByText('Loading Test Types...')).toBeInTheDocument();

    rerender(<TestTypeAdminPanel testTypes={[]} />);
    expect(screen.getByText('No Test Types configured yet.')).toBeInTheDocument();

    rerender(<TestTypeAdminPanel permissionDenied />);
    expect(screen.getByText('Permission denied')).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(<TestTypeAdminPanel error="Failed to load Test Types." onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('exposes create, edit, deactivate, reorder, and allowed material kind controls', () => {
    const onCreateTestType = vi.fn();
    const onEditTestType = vi.fn();
    const onDeactivateTestType = vi.fn();
    const onMoveTestType = vi.fn();
    const onAllowedMaterialKindToggle = vi.fn();
    const onTrackAction = vi.fn();

    render(
      <TestTypeAdminPanel
        testTypes={[getDefaultType('ielts'), getDefaultType('toefl')]}
        onCreateTestType={onCreateTestType}
        onEditTestType={onEditTestType}
        onDeactivateTestType={onDeactivateTestType}
        onMoveTestType={onMoveTestType}
        onAllowedMaterialKindToggle={onAllowedMaterialKindToggle}
        onTrackAction={onTrackAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Create Test Type/i }));
    expect(onCreateTestType).toHaveBeenCalledTimes(1);

    const toeflRow = screen.getByTestId('test-type-row-toefl');
    fireEvent.click(within(toeflRow).getByRole('button', { name: /Edit TOEFL/i }));
    fireEvent.click(within(toeflRow).getByRole('button', { name: /Deactivate TOEFL/i }));
    fireEvent.click(within(toeflRow).getByRole('button', { name: /Move TOEFL up/i }));
    fireEvent.click(within(toeflRow).getByRole('checkbox', { name: /TOEFL reading-passage/i }));

    expect(onEditTestType).toHaveBeenCalledWith(materialCatalogIds.testTypeId('toefl'));
    expect(onDeactivateTestType).toHaveBeenCalledWith(materialCatalogIds.testTypeId('toefl'));
    expect(onMoveTestType).toHaveBeenCalledWith(materialCatalogIds.testTypeId('toefl'), 'up');
    expect(onAllowedMaterialKindToggle).toHaveBeenCalledWith(
      materialCatalogIds.testTypeId('toefl'),
      'reading-passage',
      false,
    );
    expect(onTrackAction).toHaveBeenCalledWith('toggleAllowedMaterialKind', {
      testTypeId: 'toefl',
      materialKind: 'reading-passage',
      enabled: false,
    });
  });

  it('renders the complete Test Type record fields administrators need to audit', () => {
    render(<TestTypeAdminPanel testTypes={[cloneType(DEFAULT_MATERIAL_TEST_TYPES[0])]} />);

    const row = screen.getByTestId('test-type-row-ielts');

    expect(within(row).getAllByText('IELTS').length).toBeGreaterThan(0);
    expect(within(row).getByText(/Short: IELTS/i)).toBeInTheDocument();
    expect(within(row).getByText(/Source labels: Passage \/ Passages/i)).toBeInTheDocument();
    expect(within(row).getByText(/Logo URL: \/assets\/material-test-types\/ielts.svg/i)).toBeInTheDocument();
    expect(within(row).getByText(/Logo alt: IELTS logo/i)).toBeInTheDocument();
    expect(within(row).getByText(/teacher-selectable/i)).toBeInTheDocument();
    expect(within(row).getByText(/Default pin: 1/i)).toBeInTheDocument();
    expect(within(row).getByText(/Color: blue/i)).toBeInTheDocument();
    expect(within(row).getByText(/Icon: globe/i)).toBeInTheDocument();
    expect(within(row).getByText(/Allowed: full-test, reading-passage, book/i)).toBeInTheDocument();
  });

  it('creates, edits, and deactivates Test Types through repository writes without deleting records', async () => {
    const repository = createRepository([getDefaultType('ielts')]);
    const fillField = (label: string, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    const clickAndFlush = async (element: HTMLElement) => {
      await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
      });
    };

    render(
      <TestTypeAdminPanel
        testTypes={[getDefaultType('ielts')]}
        context={context}
        repository={repository}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Create Test Type/i }));
    fillField('Test Type ID', 'cambridge');
    fillField('Canonical key', 'CAMBRIDGE');
    fillField('Label', 'Cambridge English');
    fillField('Short label', 'CAM');
    fillField('Aliases', 'CAE,CPE');
    fillField('Display order', '7');
    fillField('Default pinned rank', '4');
    fillField('Singular source-order label', 'Part');
    fillField('Plural source-order label', 'Parts');
    fillField('Logo URL', '/assets/material-test-types/cambridge.svg');
    fillField('Logo alt', 'Cambridge logo');
    fillField('Color token', 'sky');
    fillField('Icon token', 'book-open');

    await clickAndFlush(screen.getByRole('button', { name: 'Save Test Type' }));

    expect(repository.writes.at(-1)).toMatchObject({
      testTypeId: 'cambridge',
      canonicalKey: 'CAMBRIDGE',
      label: 'Cambridge English',
      shortLabel: 'CAM',
      aliases: ['CAE', 'CPE'],
      displayOrder: 7,
      defaultPinnedRank: 4,
      readingSourceOrderLabel: 'Part',
      readingSourceOrderLabelPlural: 'Parts',
      logoUrl: '/assets/material-test-types/cambridge.svg',
      logoAlt: 'Cambridge logo',
      colorToken: 'sky',
      iconToken: 'book-open',
      updatedBy: 'super-admin-1',
    });

    const cambridgeRow = screen.getByTestId('test-type-row-cambridge');
    fireEvent.click(within(cambridgeRow).getByRole('button', { name: /Edit Cambridge English/i }));
    fillField('Label', 'Cambridge Exams');
    fireEvent.click(screen.getByLabelText('Allowed material kind book'));
    await clickAndFlush(screen.getByRole('button', { name: 'Save Test Type' }));

    expect(repository.writes.at(-1)).toMatchObject({
      testTypeId: 'cambridge',
      label: 'Cambridge Exams',
      allowedMaterialKinds: ['full-test', 'reading-passage'],
    });
    expect(within(screen.getByTestId('test-type-row-cambridge')).getByText(/Allowed: full-test, reading-passage/i)).toBeInTheDocument();

    await clickAndFlush(within(screen.getByTestId('test-type-row-cambridge')).getByRole('button', { name: /Deactivate Cambridge Exams/i }));

    expect(repository.writes.at(-1)).toMatchObject({ testTypeId: 'cambridge', active: false });
    expect(repository.deleted).toEqual([]);
  });
});
