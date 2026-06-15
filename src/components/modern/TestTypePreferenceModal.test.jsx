import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TestTypePreferenceModal from './TestTypePreferenceModal';

const NOW = '2026-06-01T00:00:00.000Z';

const testTypes = [
  {
    testTypeId: 'ielts',
    canonicalKey: 'IELTS',
    label: 'IELTS',
    shortLabel: 'IELTS',
    active: true,
    teacherSelectable: true,
    displayOrder: 1,
    defaultPinnedRank: 1,
    logoAlt: 'IELTS logo',
    aliases: [],
    allowedMaterialKinds: ['full-test'],
  },
  {
    testTypeId: 'toeic',
    canonicalKey: 'TOEIC',
    label: 'TOEIC',
    shortLabel: 'TOEIC',
    active: true,
    teacherSelectable: true,
    displayOrder: 2,
    defaultPinnedRank: 2,
    logoAlt: 'TOEIC logo',
    aliases: [],
    allowedMaterialKinds: ['full-test'],
  },
  {
    testTypeId: 'toefl',
    canonicalKey: 'TOEFL',
    label: 'TOEFL',
    shortLabel: 'TOEFL',
    active: true,
    teacherSelectable: true,
    displayOrder: 3,
    defaultPinnedRank: 3,
    logoAlt: 'TOEFL logo',
    aliases: ['TOFEL'],
    allowedMaterialKinds: ['full-test'],
  },
  {
    testTypeId: 'thcs',
    canonicalKey: 'THCS',
    label: 'THCS',
    shortLabel: 'THCS',
    active: true,
    teacherSelectable: true,
    displayOrder: 4,
    defaultPinnedRank: 4,
    logoAlt: 'THCS logo',
    aliases: [],
    allowedMaterialKinds: ['full-test'],
  },
  {
    testTypeId: 'archived',
    canonicalKey: 'OLD',
    label: 'Archived Type',
    shortLabel: 'OLD',
    active: false,
    teacherSelectable: true,
    displayOrder: 5,
    defaultPinnedRank: 5,
    logoAlt: 'Archived logo',
    aliases: [],
    allowedMaterialKinds: ['full-test'],
  },
  {
    testTypeId: 'hidden',
    canonicalKey: 'HIDDEN',
    label: 'Hidden Type',
    shortLabel: 'HID',
    active: true,
    teacherSelectable: false,
    displayOrder: 6,
    defaultPinnedRank: 6,
    logoAlt: 'Hidden logo',
    aliases: [],
    allowedMaterialKinds: ['full-test'],
  },
];

const createPreferenceRepository = () => {
  const writes = [];

  return {
    writes,
    readPreference: vi.fn(async () => null),
    writePreference: vi.fn(async (preference) => {
      writes.push(preference);
    }),
  };
};

const baseProps = (overrides = {}) => ({
  opened: true,
  teacherId: 'teacher-1',
  context: {
    uid: 'teacher-1',
    role: 'teacher',
    now: () => NOW,
  },
  testTypes,
  pinnedTestTypeIds: ['ielts', 'toeic', 'toefl', 'thcs'],
  preferenceRepository: createPreferenceRepository(),
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onTrackAction: vi.fn(),
  ...overrides,
});

describe('TestTypePreferenceModal', () => {
  it('lists active teacher-selectable Test Types and shows pinned order', () => {
    render(<TestTypePreferenceModal {...baseProps()} />);

    expect(screen.getByRole('dialog', { name: /Test Type preferences/i })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByLabelText('Pinned Test Type 1')).toHaveValue('ielts');
    expect(screen.getByLabelText('Pinned Test Type 2')).toHaveValue('toeic');
    expect(screen.queryByRole('option', { name: /Hidden Type/i })).not.toBeInTheDocument();
  });

  it('reorders pinned choices with accessible controls', async () => {
    const user = userEvent.setup();
    render(<TestTypePreferenceModal {...baseProps()} />);

    await user.click(screen.getByRole('button', { name: /Move TOEIC up/i }));

    expect(screen.getByLabelText('Pinned Test Type 1')).toHaveValue('toeic');
    expect(screen.getByLabelText('Pinned Test Type 2')).toHaveValue('ielts');
  });

  it('allows replacing a pinned Test Type and saves through the preference service', async () => {
    const user = userEvent.setup();
    const preferenceRepository = createPreferenceRepository();
    const onSaved = vi.fn();
    render(
      <TestTypePreferenceModal
        {...baseProps({
          pinnedTestTypeIds: ['ielts', 'toeic', 'toefl', 'thcs'],
          preferenceRepository,
          onSaved,
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Pinned Test Type 4'), 'ielts');
    expect(screen.getByText(/Choose each Test Type once/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Pinned Test Type 4'), 'thcs');
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(preferenceRepository.writePreference).toHaveBeenCalledWith({
      teacherId: 'teacher-1',
      pinnedTestTypeIds: ['ielts', 'toeic', 'toefl', 'thcs'],
      updatedAt: NOW,
      updatedBy: 'teacher-1',
    });
    expect(onSaved).toHaveBeenCalledWith({
      teacherId: 'teacher-1',
      pinnedTestTypeIds: ['ielts', 'toeic', 'toefl', 'thcs'],
      updatedAt: NOW,
      updatedBy: 'teacher-1',
    });
  });

  it('requires unavailable pinned Test Types to be replaced when enough active alternatives exist', async () => {
    const user = userEvent.setup();
    render(
      <TestTypePreferenceModal
        {...baseProps({ pinnedTestTypeIds: ['ielts', 'archived', 'toefl', 'thcs'] })}
      />,
    );

    expect(screen.getByText(/Archived Type is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Pinned Test Type 2'), 'toeic');

    expect(screen.queryByText(/Archived Type is unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeEnabled();
  });

  it('saves all available Test Types with modal-only microcopy when fewer than four are active', async () => {
    const user = userEvent.setup();
    const preferenceRepository = createPreferenceRepository();
    render(
      <TestTypePreferenceModal
        {...baseProps({
          testTypes: testTypes.slice(0, 2),
          pinnedTestTypeIds: undefined,
          preferenceRepository,
        })}
      />,
    );

    expect(screen.getByText(/Only 2 active Test Types are available/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Pinned Test Type/i)).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(preferenceRepository.writePreference).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedTestTypeIds: ['ielts', 'toeic'] }),
    );
  });

  it('tracks cancel and closes without saving', async () => {
    const user = userEvent.setup();
    const preferenceRepository = createPreferenceRepository();
    const onClose = vi.fn();
    const onTrackAction = vi.fn();
    render(
      <TestTypePreferenceModal
        {...baseProps({ preferenceRepository, onClose, onTrackAction })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(preferenceRepository.writePreference).not.toHaveBeenCalled();
    expect(onTrackAction).toHaveBeenCalledWith('cancelTestTypePreferenceModal', undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
