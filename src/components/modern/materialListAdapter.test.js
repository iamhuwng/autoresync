import { describe, expect, it, vi } from 'vitest';
import { buildTestMaterialListRow, toReadingPassageRowModel } from './materialListAdapter';

describe('materialListAdapter', () => {
  it('maps regular IELTS tests into compact list rows', () => {
    const onToggleSelection = vi.fn();
    const row = buildTestMaterialListRow({
      id: 'ielts-1',
      title: 'IELTS Reading Practice',
      testType: 'IELTS',
      skill: 'Reading',
      questionCount: 40,
      duration: 60,
      deliveryProjectionReady: true,
      updatedAt: '2026-05-12T10:15:00Z',
    }, {
      selectable: true,
      selected: true,
      handlers: { onEdit: vi.fn(), onDelete: vi.fn(), onStartTest: vi.fn(), onToggleSelection },
    });

    expect(row).toMatchObject({
      id: 'ielts-1',
      title: 'IELTS Reading Practice',
      iconKind: 'reading',
      accentKind: 'rose',
      itemLabel: '40 questions',
      durationLabel: '60 min',
      updatedLabel: 'May 12, 2026',
      statusKind: 'ready',
      selection: {
        checked: true,
        label: 'Select IELTS Reading Practice',
      },
    });
    expect(row.badges.map((badge) => badge.label)).toEqual([
      '40 questions',
      'IELTS - Reading',
      '60 min',
    ]);
    expect(row.actions.map((item) => item.label)).toEqual(['Edit', 'Delete', 'Start Test', 'Assign HW']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 2, 3, 4]);
    expect(row.actions.find((item) => item.key === 'assign-homework')?.assignability).toMatchObject({
      assignable: true,
      contentRef: {
        contentKind: 'ielts_reading',
        contentId: 'ielts-1',
      },
    });
    row.selection.onChange();
    expect(onToggleSelection).toHaveBeenCalledWith(row.source);
  });

  it('maps IELTS Listening and Writing tests into the shared assignment slot', () => {
    const listening = buildTestMaterialListRow({
      id: 'ielts-listening-1',
      title: 'IELTS Listening Section 1',
      testType: 'IELTS',
      skill: 'Listening',
      questionCount: 10,
      status: 'published',
      isComplete: true,
      deliveryProjectionReady: true,
    }, {
      handlers: { onAssignHw: vi.fn() },
    });
    const writing = buildTestMaterialListRow({
      id: 'ielts-writing-1',
      title: 'IELTS Writing Task 1',
      testType: 'IELTS',
      skill: 'Writing',
      metadata: { title: 'IELTS Writing Task 1' },
      status: 'published',
      isComplete: true,
    }, {
      handlers: { onAssignHw: vi.fn() },
    });

    expect(listening.actions.find((item) => item.key === 'assign-homework')).toMatchObject({
      slot: 4,
      assignability: {
        contentRef: { contentKind: 'ielts_listening', contentId: 'ielts-listening-1' },
      },
    });
    expect(writing.actions.find((item) => item.key === 'assign-homework')).toMatchObject({
      slot: 4,
      assignability: {
        contentRef: { contentKind: 'ielts_writing', contentId: 'ielts-writing-1' },
      },
    });
  });

  it('maps THCS tests with assignment action and grade badges', () => {
    const row = buildTestMaterialListRow({
      id: 'thcs-1',
      testType: 'THCS-THPT',
      questionCount: 40,
      metadata: {
        title: 'Grade 10 Midterm',
        gradeLevel: '10',
        examType: 'Giữa Kì',
        duration: 45,
      },
    }, {
      handlers: { onEdit: vi.fn(), onDelete: vi.fn(), onStartTest: vi.fn(), onAssignHw: vi.fn() },
    });

    expect(row.title).toBe('Grade 10 Midterm');
    expect(row.iconKind).toBe('school');
    expect(row.accentKind).toBe('sky');
    expect(row.itemLabel).toBe('40 questions');
    expect(row.badges.map((badge) => badge.label)).toContain('Grade 10');
    expect(row.badges.map((badge) => badge.label)).toContain('Giữa Kì');
    expect(row.actions.map((item) => item.label)).toEqual(['Edit', 'Delete', 'Start Test', 'Assign HW']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 2, 3, 4]);
  });

  it('maps Reading V2 rows without requiring canonical draft payload data', () => {
    const row = buildTestMaterialListRow({
      id: 'published-v2',
      materialId: 'published-v2',
      deliveryEngine: 'reading-v2',
      title: 'IELTS Reading V2',
      testType: 'IELTS',
      skill: 'Reading',
      publishedSnapshotVersionId: 'snapshot-1',
      hasStudentSafeProjection: true,
      questionCount: 3,
      metadata: { durationMinutes: 60 },
    });

    expect(row.iconKind).toBe('reading');
    expect(row.accentKind).toBe('rose');
    expect(row.badges.map((badge) => badge.label)).toContain('Reading V2');
    expect(row.durationLabel).toBe('60 min');
  });

  it('maps Reading V2 full-test materials as compact test rows without new columns', () => {
    const row = buildTestMaterialListRow({
      id: 'full-test-1',
      materialId: 'full-test-1',
      deliveryEngine: 'reading-v2',
      materialKind: 'full-test',
      title: 'IELTS Full Test',
      testType: 'IELTS',
      skill: 'Reading',
      publishedSnapshotVersionId: 'snapshot-1',
      hasStudentSafeProjection: true,
      passageRefCount: 3,
      questionCount: 40,
      durationMinutes: 60,
      hiddenProvenance: { importEvidence: 'secret' },
    });

    expect(row.title).toBe('IELTS Full Test');
    expect(row.badges.map((badge) => badge.label)).toContain('Reading V2');
    expect(row.itemLabel).toBe('40 questions');
    expect(row.durationLabel).toBe('60 min');
    expect(row.actions.map((item) => item.slot)).toEqual([1, 2, 3, 4]);
  });

  it('hides homework action for broken Reading V2 full-test compositions', () => {
    const row = buildTestMaterialListRow({
      id: 'broken-full-test-1',
      materialId: 'broken-full-test-1',
      deliveryEngine: 'reading-v2',
      materialKind: 'full-test',
      title: 'Broken IELTS Full Test',
      testType: 'IELTS',
      skill: 'Reading',
      publishedSnapshotVersionId: 'snapshot-1',
      hasStudentSafeProjection: true,
      passageRefCount: 3,
      hasBrokenRefs: true,
    }, {
      handlers: { onAssignHw: vi.fn() },
    });

    expect(row.actions.map((action) => action.key)).not.toContain('assign-homework');
  });

  it('maps incomplete items to recovery actions without Start Test', () => {
    const row = buildTestMaterialListRow({
      id: 'incomplete-1',
      title: 'Listening Section 1',
      testType: 'IELTS',
      skill: 'Listening',
      questionCount: 8,
      duration: 10,
      isComplete: false,
      missingAnswerCount: 2,
    });

    expect(row.statusKind).toBe('incomplete');
    expect(row.iconKind).toBe('incomplete');
    expect(row.accentKind).toBe('incomplete');
    expect(row.badges.map((badge) => badge.label)).toEqual([
      '8 questions',
      'IELTS - Listening',
      '10 min',
      'Incomplete',
      '2 missing answers',
    ]);
    expect(row.actions.map((item) => item.label)).toEqual(['Complete', 'Delete']);
    expect(row.assignability).toMatchObject({
      assignable: false,
      reasonCode: 'CONTENT_NOT_ASSIGNABLE',
    });
    expect(row.actions.map((item) => item.slot)).toEqual([1, 2]);
  });

  it('maps public library rows without owner-only actions', () => {
    const row = buildTestMaterialListRow({
      id: 'public-regular',
      title: 'Public Reading',
      testType: 'IELTS',
      skill: 'Reading',
      deliveryProjectionReady: true,
    }, {
      isPublicLibrary: true,
    });

    expect(row.actions.map((item) => item.label)).toEqual(['View', 'Start Test', 'Assign HW']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 3, 4]);
    expect(row.actions.map((item) => item.label)).not.toContain('Delete');
  });

  it('wires row action errors to the caller fallback', () => {
    const onActionError = vi.fn();
    const row = buildTestMaterialListRow({
      id: 'owned-regular',
      title: 'Owned Reading',
      testType: 'IELTS',
      skill: 'Reading',
    }, {
      handlers: { onActionError },
    });

    expect(row.actions.find((item) => item.key === 'delete')?.onError).toBe(onActionError);
    expect(row.actions.find((item) => item.key === 'edit')?.onError).toBe(onActionError);
  });

  it('hides homework action when safe projection readiness is missing', () => {
    const row = buildTestMaterialListRow({
      id: 'ielts-reading-unready',
      title: 'IELTS Reading Unready',
      testType: 'IELTS',
      skill: 'Reading',
      deliveryProjectionReady: false,
      status: 'published',
      isComplete: true,
    });

    expect(row.assignability).toMatchObject({
      assignable: false,
      reasonCode: 'CONTENT_NOT_ASSIGNABLE',
    });
    expect(row.actions.map((item) => item.key)).not.toContain('assign-homework');
  });

  it('shows Assign HW on owned My Content IELTS Reading/Listening rows enriched via metadata', () => {
    const ownedReading = buildTestMaterialListRow({
      id: 'ielts-reading-owned',
      title: 'Owned Reading',
      testType: 'IELTS',
      skill: 'Reading',
      ownerId: 'teacher-1',
      isPublic: false,
      status: 'published',
      isComplete: true,
      questionCount: 40,
      // Shape produced by getTeacherOwnedTests after student_safe_tests enrichment.
      hasStudentSafeProjection: true,
      metadata: { hasStudentSafeProjection: true },
    });
    const ownedListening = buildTestMaterialListRow({
      id: 'ielts-listening-owned',
      title: 'Owned Listening',
      testType: 'IELTS',
      skill: 'Listening',
      ownerId: 'teacher-1',
      isPublic: false,
      status: 'published',
      isComplete: true,
      questionCount: 10,
      deliveryProjectionReady: true,
      metadata: { deliveryProjectionReady: true },
    });

    expect(ownedReading.assignability).toMatchObject({
      assignable: true,
      contentRef: { contentKind: 'ielts_reading', contentId: 'ielts-reading-owned' },
    });
    expect(ownedReading.actions.map((item) => item.key)).toContain('assign-homework');
    expect(ownedReading.actions.find((item) => item.key === 'assign-homework')?.slot).toBe(4);

    expect(ownedListening.assignability).toMatchObject({
      assignable: true,
      contentRef: { contentKind: 'ielts_listening', contentId: 'ielts-listening-owned' },
    });
    expect(ownedListening.actions.map((item) => item.key)).toContain('assign-homework');
  });

  it('shows Assign HW on thin owned legacy Reading/Listening rows when safe projection is proven', () => {
    const thinReading = buildTestMaterialListRow({
      id: 'reading-thin-owned',
      title: 'Thin Reading',
      skill: 'Reading',
      ownerId: 'teacher-1',
      status: 'published',
      isComplete: true,
      hasStudentSafeProjection: true,
    });
    const thinListening = buildTestMaterialListRow({
      id: 'listening-thin-owned',
      title: 'Thin Listening',
      skill: 'Listening',
      ownerId: 'teacher-1',
      status: 'published',
      isComplete: true,
      deliveryProjectionReady: true,
    });

    expect(thinReading.assignability).toMatchObject({
      assignable: true,
      contentRef: { contentKind: 'ielts_reading', contentId: 'reading-thin-owned' },
    });
    expect(thinReading.actions.map((item) => item.key)).toContain('assign-homework');

    expect(thinListening.assignability).toMatchObject({
      assignable: true,
      contentRef: { contentKind: 'ielts_listening', contentId: 'listening-thin-owned' },
    });
    expect(thinListening.actions.map((item) => item.key)).toContain('assign-homework');
  });

  it('blocks Assign HW on owned My Content IELTS Reading/Listening rows lacking safe projection metadata', () => {
    const ownedReading = buildTestMaterialListRow({
      id: 'ielts-reading-owned-unsafe',
      title: 'Owned Reading Unsafe',
      testType: 'IELTS',
      skill: 'Reading',
      ownerId: 'teacher-1',
      status: 'published',
      isComplete: true,
      metadata: {},
    });
    const ownedListening = buildTestMaterialListRow({
      id: 'ielts-listening-owned-unsafe',
      title: 'Owned Listening Unsafe',
      testType: 'IELTS',
      skill: 'Listening',
      ownerId: 'teacher-1',
      status: 'published',
      isComplete: true,
      metadata: {},
    });

    expect(ownedReading.assignability).toMatchObject({
      assignable: false,
      reasonCode: 'CONTENT_NOT_ASSIGNABLE',
    });
    expect(ownedReading.actions.map((item) => item.key)).not.toContain('assign-homework');

    expect(ownedListening.assignability).toMatchObject({
      assignable: false,
      reasonCode: 'CONTENT_NOT_ASSIGNABLE',
    });
    expect(ownedListening.actions.map((item) => item.key)).not.toContain('assign-homework');
  });

  it('uses neutral fallbacks for missing metadata', () => {
    const row = buildTestMaterialListRow({ id: 'unknown-1' });

    expect(row.title).toBe('Untitled Test');
    expect(row.iconKind).toBe('test');
    expect(row.accentKind).toBe('indigo');
    expect(row.itemLabel).toBe('0 questions');
    expect(row.durationLabel).toBe('--');
    expect(row.updatedLabel).toBe('--');
  });

  it('uses Reading Passage title and Test Type fallbacks without crashing on inactive or missing metadata', () => {
    const inactive = toReadingPassageRowModel({
      materialId: 'inactive-type-passage',
      questionCount: 0,
      visibility: 'private',
      isOwner: true,
      testTypes: [{ testTypeId: 'archived-test-type', label: 'Archived Test Type', shortLabel: '', active: false }],
    });
    const missing = toReadingPassageRowModel({
      materialId: 'missing-type-passage',
      questionCount: 0,
      visibility: 'private',
      isOwner: true,
    });

    expect(inactive.title).toBe('Untitled Reading Passage');
    expect(inactive.badges.map((badge) => badge.label)).toContain('Archived Test Type');
    expect(missing.title).toBe('Untitled Reading Passage');
    expect(missing.badges.map((badge) => badge.key)).not.toContain('test-type');
  });

  it('uses semantic accents instead of row-position colors', () => {
    const material = {
      id: 'listening-1',
      title: 'IELTS Listening',
      testType: 'IELTS',
      skill: 'Listening',
    };

    const firstRow = buildTestMaterialListRow(material, { index: 0 });
    const laterRow = buildTestMaterialListRow(material, { index: 4 });

    expect(firstRow.iconKind).toBe('test');
    expect(firstRow.accentKind).toBe('indigo');
    expect(laterRow.accentKind).toBe(firstRow.accentKind);
  });

  it('maps Reading Passage records into list rows with source metadata and owner actions', () => {
    const handlers = {
      onOpenReadingPassage: vi.fn(),
      onEditReadingPassage: vi.fn(),
      onAssignReadingPassage: vi.fn(),
      onArchiveReadingPassage: vi.fn(),
      onToggleReadingPassageSelection: vi.fn(),
    };
    const row = toReadingPassageRowModel({
      id: 'passage-1',
      materialId: 'passage-1',
      title: 'The History of Silk',
      questionCount: 13,
      durationMinutes: 20,
      updatedAt: '2026-05-18T09:30:00Z',
      visibility: 'private',
      isOwner: true,
      selectable: true,
      publishedSnapshotVersionId: 'snapshot-1',
      hasStudentSafeProjection: true,
      testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
      sourceOrderDisplay: 'Passage 2',
      sourceQuestionRange: 'Questions 14-26',
      sourceFullTestTitle: 'Cambridge IELTS 18 Test 1',
      actions: [
        { key: 'edit', label: 'Edit' },
        { key: 'assign-homework', label: 'Assign homework' },
        { key: 'archive', label: 'Archive', ownerOnly: true },
      ],
    }, {
      selected: true,
      handlers,
    });

    expect(row).toMatchObject({
      id: 'passage-1',
      title: 'The History of Silk',
      iconKind: 'reading',
      accentKind: 'rose',
      itemLabel: '13 questions',
      durationLabel: '20 min',
      updatedLabel: 'May 18, 2026',
      statusKind: 'reading-passage',
      selection: {
        checked: true,
        label: 'Select The History of Silk',
      },
    });
    expect(row.badges.map((badge) => badge.label)).toEqual([
      'Passage 2',
      'Cambridge IELTS 18 Test 1',
      'IELTS',
      'Private',
      'Questions 14-26',
      '20 min',
    ]);
    expect(row.actions.map((item) => item.label)).toEqual(['Edit', 'Assign homework', 'Remove from library']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 4, 3]);
    expect(row.actions.find((item) => item.key === 'assign-homework')?.assignability).toMatchObject({
      assignable: true,
      contentRef: {
        contentKind: 'reading_passage',
        contentId: 'passage-1',
      },
    });

    row.selection.onChange();
    row.actions.forEach((item) => item.onSelect());

    expect(handlers.onToggleReadingPassageSelection).toHaveBeenCalledWith(row.source);
    expect(handlers.onEditReadingPassage).toHaveBeenCalledWith(row.source);
    expect(handlers.onAssignReadingPassage).toHaveBeenCalledWith(row.source);
    expect(handlers.onArchiveReadingPassage).toHaveBeenCalledWith(row.source);
  });

  it('normalizes legacy owned Reading Passage open and revise actions into one Edit action', () => {
    const handlers = {
      onEditReadingPassage: vi.fn(),
      onAssignReadingPassage: vi.fn(),
      onArchiveReadingPassage: vi.fn(),
    };
    const row = toReadingPassageRowModel({
      id: 'legacy-owned-passage',
      materialId: 'legacy-owned-passage',
      title: 'Legacy Owned Passage',
      questionCount: 13,
      visibility: 'private',
      isOwner: true,
      actions: [
        { key: 'open', label: 'Open' },
        { key: 'assign-homework', label: 'Assign homework' },
        { key: 'revise', label: 'Revise', ownerOnly: true },
        { key: 'archive', label: 'Archive', ownerOnly: true },
      ],
    }, {
      handlers,
    });

    expect(row.actions.map((item) => item.label)).toEqual(['Edit', 'Assign homework', 'Remove from library']);
    expect(row.actions.map((item) => item.key)).not.toContain('revise');
    expect(row.actions.map((item) => item.key)).not.toContain('open');

    row.actions.forEach((item) => item.onSelect());

    expect(handlers.onEditReadingPassage).toHaveBeenCalledWith(row.source);
    expect(handlers.onEditReadingPassage).toHaveBeenCalledTimes(1);
    expect(handlers.onAssignReadingPassage).toHaveBeenCalledWith(row.source);
    expect(handlers.onArchiveReadingPassage).toHaveBeenCalledWith(row.source);
  });

  it('maps archived Reading Passage rows to restore-only non-destructive actions', () => {
    const handlers = {
      onOpenReadingPassage: vi.fn(),
      onRestoreReadingPassage: vi.fn(),
    };
    const row = toReadingPassageRowModel({
      id: 'archived-passage',
      materialId: 'archived-passage',
      title: 'Archived Passage',
      questionCount: 11,
      visibility: 'private',
      scope: 'archived',
      archived: true,
      isOwner: true,
      selectable: false,
      currentVersionId: 'snapshot-archived',
      publishedSnapshotVersionId: 'snapshot-archived',
      actions: [
        { key: 'view', label: 'View read-only' },
        { key: 'restore', label: 'Restore', ownerOnly: true },
      ],
    }, {
      handlers,
    });

    expect(row.selection).toBeUndefined();
    expect(row.badges.map((badge) => badge.label)).toContain('Archive');
    expect(row.badges.map((badge) => badge.label)).toContain('Archived');
    expect(row.actions.map((item) => item.label)).toEqual(['View read-only', 'Restore']);

    row.actions.forEach((item) => item.onSelect());

    expect(handlers.onOpenReadingPassage).toHaveBeenCalledWith(row.source);
    expect(handlers.onRestoreReadingPassage).toHaveBeenCalledWith(row.source);
  });

  it('offers clone on non-owned public Reading Passage rows without owner-only actions', () => {
    const handlers = {
      onOpenReadingPassage: vi.fn(),
      onCloneReadingPassage: vi.fn(),
      onAssignReadingPassage: vi.fn(),
    };
    const row = toReadingPassageRowModel({
      id: 'public-passage',
      materialId: 'public-passage',
      title: 'Public Passage',
      questionCount: 8,
      visibility: 'public',
      isOwner: false,
      testTypes: [{ testTypeId: 'toeic', label: 'TOEIC', shortLabel: 'TOEIC', active: true }],
      sourceOrderDisplay: 'Part 4',
      actions: [
        { key: 'view', label: 'View' },
        { key: 'clone-reading-passage', label: 'Clone to my library' },
        { key: 'assign-homework', label: 'Assign homework' },
      ],
    }, {
      handlers,
    });

    expect(row.badges.map((badge) => badge.label)).toContain('Public');
    expect(row.actions.map((item) => item.label)).toEqual(['Clone to my library', 'Assign homework']);
    expect(row.actions.map((item) => item.slot)).toEqual([1, 4]);
    expect(row.actions.map((item) => item.label)).not.toContain('View');
    expect(row.actions.map((item) => item.label)).not.toContain('Edit');
    expect(row.actions.map((item) => item.label)).not.toContain('Revise');
    expect(row.actions.map((item) => item.label)).not.toContain('Archive');
    expect(row.actions.map((item) => item.label)).not.toContain('Delete');

    row.actions.forEach((item) => item.onSelect());

    expect(handlers.onOpenReadingPassage).not.toHaveBeenCalled();
    expect(handlers.onCloneReadingPassage).toHaveBeenCalledWith(row.source);
    expect(handlers.onAssignReadingPassage).toHaveBeenCalledWith(row.source);
  });

  it('disables Reading Passage assignment when a safe projection or published version is missing', () => {
    const row = toReadingPassageRowModel({
      id: 'unsafe-passage',
      materialId: 'unsafe-passage',
      title: 'Unsafe Passage',
      questionCount: 8,
      visibility: 'private',
      isOwner: true,
      publishedSnapshotVersionId: '',
      hasStudentSafeProjection: false,
      actions: [
        { key: 'assign-homework', label: 'Assign homework' },
        { key: 'edit', label: 'Edit', ownerOnly: true },
      ],
      selectable: true,
    }, {
      selected: true,
    });

    const assign = row.actions.find((item) => item.key === 'assign-homework');

    expect(row.selection).toMatchObject({
      checked: true,
      label: 'Select Unsafe Passage',
    });
    expect(assign).toMatchObject({
      disabled: true,
      disabledReason: 'Publish this passage with a student-safe projection before assignment.',
    });
  });

  it('omits hidden Reading Passage provenance and payload fields from row source', () => {
    const row = toReadingPassageRowModel({
      id: 'passage-safe',
      materialId: 'passage-safe',
      title: 'Safe Passage Row',
      questionCount: 4,
      testTypeIds: ['ielts'],
      publishedSnapshotVersionId: 'snapshot-safe',
      hasStudentSafeProjection: true,
      hiddenProvenance: { importedBy: 'secret' },
      importEvidence: 'raw document text',
      passageText: 'full passage body',
      answerKey: ['A'],
      questions: [{ id: 'q1', answer: 'A' }],
    });

    expect(row.source).toMatchObject({
      materialId: 'passage-safe',
      title: 'Safe Passage Row',
      publishedSnapshotVersionId: 'snapshot-safe',
      hasStudentSafeProjection: true,
    });
    expect(JSON.stringify(row.source)).not.toContain('secret');
    expect(JSON.stringify(row.source)).not.toContain('raw document text');
    expect(JSON.stringify(row.source)).not.toContain('full passage body');
    expect(JSON.stringify(row.source)).not.toContain('answer');
  });
});
