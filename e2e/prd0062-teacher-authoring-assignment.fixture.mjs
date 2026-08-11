const CASE_IDS = new Set(['AC-TA-001', 'AC-TA-002']);

export const createPrd0062TeacherAuthoringAssignmentFixture = (caseId) => {
  if (!CASE_IDS.has(caseId)) throw new Error('prd0062_51b1_case_id_invalid');
  const suffix = caseId.toLowerCase();
  const placementId = `placement-${suffix}`;
  const activityId = `activity-${suffix}`;
  const activityVersionId = `${activityId}_v1`;
  const sourceVersionId = `source-${suffix}-v1`;
  return Object.freeze({
    caseId,
    seed: `prd0062-51a:${caseId}:authoring-assignment:v1`,
    placementId,
    activityId,
    activityVersionId,
    sourceVersionId,
    assignment: Object.freeze({
      target: Object.freeze({ kind: 'unit', unitId: `unit-${suffix}` }),
      bindings: Object.freeze([{
        placementId,
        activityId,
        activityVersionId,
        sourceVersionIds: Object.freeze([sourceVersionId]),
        required: true,
      }]),
    }),
  });
};
