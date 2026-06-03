import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const firestoreRules = readFileSync('firestore.rules', 'utf8');

describe('Homework Firestore rule contract', () => {
  it('keeps homework assignments teacher-owned while allowing Reading Passage typed fields', () => {
    expect(firestoreRules).toContain('match /homework_assignments/{assignmentId}');
    expect(firestoreRules).toContain('request.resource.data.createdBy == request.auth.uid');
    expect(firestoreRules).toContain('resource.data.createdBy == request.auth.uid');
    expect(firestoreRules).toContain('request.resource.data.createdBy == resource.data.createdBy');
    expect(firestoreRules).toContain('isValidReadingPassageHomeworkPayload(request.resource.data)');
  });

  it('allows only narrow student progress-stat updates on homework assignments', () => {
    expect(firestoreRules).toContain('function isStudentStatsOnlyHomeworkUpdate()');
    expect(firestoreRules).toContain("affectedKeys().hasOnly(['stats', 'updatedAt'])");
    expect(firestoreRules).toContain('request.resource.data.stats.totalAssigned == resource.data.stats.totalAssigned');
    expect(firestoreRules).toContain('request.resource.data.stats.started <= resource.data.stats.started + 1');
    expect(firestoreRules).toContain('request.resource.data.stats.submitted <= resource.data.stats.submitted + 1');
    expect(firestoreRules).toContain('request.resource.data.stats.lateSubmissions <= resource.data.stats.lateSubmissions + 1');
  });

  it('recognizes single Reading Passage and Reading Passage set homework shapes', () => {
    expect(firestoreRules).toContain("data.materialType == 'reading-passage'");
    expect(firestoreRules).toContain("data.materialType == 'reading-passage-set'");
    expect(firestoreRules).toContain("data.keys().hasAll(['readingPassageSnapshot'])");
    expect(firestoreRules).toContain("data.keys().hasAll(['readingPassageSet'])");
    expect(firestoreRules).toContain('data.readingPassageSet.items is list');
  });
});
