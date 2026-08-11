const CASE_IDS = new Set(['AC-TU-001', 'AC-TR-001']);

export const createPrd0062TeacherUpdatesReplacementResultsFixture = (caseId) => {
  if (!CASE_IDS.has(caseId)) throw new Error('prd0062_51b2_case_id_invalid');
  const suffix = caseId.toLowerCase();
  const placementId = `placement-${suffix}`;
  const activityId = `activity-${suffix}`;
  const sourceVersionId = `source-${suffix}-v1`;
  const replacementSourceVersionId = `source-${suffix}-v2`;
  return Object.freeze({
    caseId,
    seed: `prd0062-51a:${caseId}:updates-replacement-results:v1`,
    placementId,
    activityId,
    sourceVersionId,
    replacementSourceVersionId,
    update: Object.freeze({
      affectedStudents: Object.freeze([
        { studentId: 'student-1', requiresCheckpoint: true, requiresReplacementDeadline: true },
        { studentId: 'student-2', requiresCheckpoint: true, requiresReplacementDeadline: false },
        { studentId: 'student-3', requiresCheckpoint: false, requiresReplacementDeadline: false },
      ]),
    }),
    teacherResult: Object.freeze({
      surface: 'homework',
      teacherId: 'teacher-test',
      placementId,
      activityId,
    }),
  });
};
