import { describe, expect, it } from 'vitest';
import type { ListeningPublishedVersionRecord } from '../../functions/src/listening-authoring/repository.shared';
import type { MaterialSummary } from '../../src/services/materialCatalog/materialSummaryPort.service';
import { buildListeningPublishedMaterialUpdates } from '../src/upload-worker/listening-authoring/published-material';
import { resolveTeacherLobbyAssignability } from '../../src/services/teacherLobbyAssignability';
import { adaptMaterialSummaryToTeacherCard } from '../../src/services/materialCatalog/materialSummaryCardAdapter.service';

const root = 'material_catalog/material_summary_indexes/v1';
const version: ListeningPublishedVersionRecord = {
  schemaVersion: 1,
  recordType: 'published-version',
  versionId: 'version-2',
  versionNumber: 2,
  testId: 'listening-1',
  ownerId: 'teacher-1',
  sourceDraftPath: 'drafts',
  sourceDraftId: 'draft-1',
  document: {
    title: 'Full listening test',
    type: 'IELTS',
    skill: 'Listening',
    duration: 40,
    difficulty: 'Intermediate',
    questionCount: 40,
    isPublic: true,
    isComplete: true,
    displayMode: 'text',
    metadata: { description: 'Published test', instructions: 'Listen.', tags: [] },
    audioSections: [{ number: 1, name: 'Part 1', audioUrl: 'r2://audio', startQuestion: 1, endQuestion: 40 }],
    questions: [{ number: 1, type: 'short-answer', question: 'Name?', answer: 'Alice', sectionNumber: 1, points: 1 }],
    settings: {
      allowPause: false, showTimer: true, shuffleQuestions: false,
      showResults: 'after-submission', allowReview: true, passingScore: 60, allowReplay: false,
    },
  },
  assetIds: {},
  publishedAt: 1700000000000,
  publishedBy: 'teacher-1',
  publishOperationId: 'operation-1',
  documentHash: 'hash-1',
  archive: { state: 'active' },
  compatibility: { frozenLegacyVersion1: false },
};

describe('Listening published material projection', () => {
  it('publishes runtime content and metadata-only owner/public lobby indexes atomically', () => {
    const updates = buildListeningPublishedMaterialUpdates(version);
    const summary = updates[`${root}/by_id/listening-1`] as MaterialSummary;
    expect(updates['tests/listening-1']).toBeUndefined();
    for (const [key, value] of Object.entries({
      ...version.document, id: 'listening-1', ownerId: 'teacher-1',
      versionId: 'version-2', publishedSnapshotVersionId: 'version-2',
      createdAt: version.publishedAt, isPublished: true,
    })) expect(updates[`tests/listening-1/${key}`]).toEqual(value);
    expect(Object.keys(updates).some((path) => path.startsWith('tests/listening-1/statistics'))).toBe(false);
    expect(summary).toMatchObject({
      producerId: 'listening', surfaceFamily: 'assessment', questionCount: 40,
      visibility: 'public', lifecycleState: 'active', sourceSnapshotVersionId: 'version-2',
      deliveryProjectionReady: true, hasStudentSafeProjection: true,
    });
    expect(resolveTeacherLobbyAssignability(adaptMaterialSummaryToTeacherCard(summary)).assignable).toBe(true);
    expect(updates['tests/listening-1/deliveryProjectionReady']).toBe(true);
    expect(updates['student_safe_tests/listening-1']).toMatchObject({ versionId: 'version-2', questionCount: 40 });
    const safe = updates['student_safe_tests/listening-1'] as Record<string, any>;
    expect(safe.questions[0]).not.toHaveProperty('answer');
    expect(updates[`${root}/by_owner_family/teacher-1/assessment/listening-1`]).toEqual(summary);
    expect(updates[`${root}/by_visibility_family/public/assessment/listening-1`]).toEqual(summary);
    expect(updates[`${root}/by_visibility_family_type/public/assessment/${summary.primaryTestTypeId}/listening-1`]).toEqual(summary);
    for (const key of ['questions', 'audioSections', 'metadata', 'answer']) expect(summary).not.toHaveProperty(key);
  });

  it('republishes privately, removes public indexes, and preserves runtime history without stale version pointers', () => {
    const first = buildListeningPublishedMaterialUpdates(version);
    const previousSummary = first[`${root}/by_id/listening-1`] as MaterialSummary;
    const statistics = { attempts: 12, averageScore: 80, averageTime: 25, completionRate: 90 };
    const updates = buildListeningPublishedMaterialUpdates({
      ...version, document: { ...version.document, isPublic: false },
    }, previousSummary, {
      createdAt: 123, createdBy: 'original-teacher', statistics, customField: 'keep',
      visibility: 'public', authoringVersioning: { versionId: 'version-1', frozen: true },
      missingAnswerCount: 5, questionImages: [{ imageUrl: 'stale' }],
    });
    expect(updates['tests/listening-1']).toBeUndefined();
    for (const key of ['createdAt', 'createdBy', 'statistics', 'customField']) {
      expect(Object.keys(updates).some((path) => path === `tests/listening-1/${key}` || path.startsWith(`tests/listening-1/${key}/`))).toBe(false);
    }
    expect(updates['tests/listening-1/visibility']).toBe('private');
    expect(updates['tests/listening-1/versionId']).toBe('version-2');
    expect(updates['tests/listening-1/questions']).toEqual(version.document.questions);
    for (const key of ['authoringVersioning', 'questionImages', 'missingAnswerCount', 'testType', 'primaryTestTypeId', 'testTypeIds']) {
      expect(updates[`tests/listening-1/${key}`]).toBeNull();
    }
    expect(updates[`${root}/by_visibility/public/listening-1`]).toBeNull();
    expect(updates[`${root}/by_visibility_family/public/assessment/listening-1`]).toBeNull();
    expect(updates[`${root}/by_visibility_family_type/public/assessment/${previousSummary.primaryTestTypeId}/listening-1`]).toBeNull();
    expect(updates[`${root}/by_visibility_family/private/assessment/listening-1`]).toMatchObject({ visibility: 'private' });
  });

  it('rejects an existing runtime owned by another teacher', () => {
    expect(() => buildListeningPublishedMaterialUpdates(version, null, { ownerId: 'another-teacher' }))
      .toThrow('Listening runtime owner does not match published version owner.');
  });

  it('keeps answers and teacher review notes out of student delivery', () => {
    const withTeacherNotes = { ...version, document: {
      ...version.document,
      metadata: { ...version.document.metadata, transcript: 'Teacher transcript' },
      questions: [{ ...version.document.questions[0], acceptableAnswers: ['Alice'], explanation: 'Teacher explanation' }],
    } };
    const updates = buildListeningPublishedMaterialUpdates(withTeacherNotes);
    const safe = updates['student_safe_tests/listening-1'] as Record<string, any>;
    expect(safe.metadata).not.toHaveProperty('transcript');
    for (const key of ['answer', 'correctAnswer', 'correctAns', 'acceptableAnswers', 'explanation']) {
      expect(safe.questions[0]).not.toHaveProperty(key);
    }
    expect(updates['tests/listening-1/questions']).toEqual(withTeacherNotes.document.questions);
    expect(withTeacherNotes.document.questions[0].answer).toBe('Alice');
  });

  it('archives the runtime and removes all active discovery indexes', () => {
    const previous = buildListeningPublishedMaterialUpdates(version);
    const updates = buildListeningPublishedMaterialUpdates({
      ...version, archive: { state: 'archived', archivedAt: 1700000000100 },
    }, previous[`${root}/by_id/listening-1`] as MaterialSummary);
    expect(updates['tests/listening-1/isPublished']).toBe(false);
    expect(updates['tests/listening-1/deliveryProjectionReady']).toBe(false);
    expect(updates).not.toHaveProperty('student_safe_tests/listening-1');
    expect(updates['tests/listening-1/state']).toBe('archived');
    expect(updates['tests/listening-1/updatedAt']).toBe(1700000000100);
    expect(updates[`${root}/by_id/listening-1`]).toMatchObject({ lifecycleState: 'archived', sourceSnapshotVersionId: 'version-2' });
    for (const path of Object.keys(previous).filter((path) => path.startsWith(root) && !path.includes('/by_id/'))) {
      expect(updates[path]).toBeNull();
    }
  });
});
