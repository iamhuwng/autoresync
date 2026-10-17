const CASE_IDS = new Set(['AC-SR-001']);

export const createPrd0062StudentRuntimePersistenceFixture = (caseId) => {
  if (!CASE_IDS.has(caseId)) throw new Error('prd0062_51c1_case_id_invalid');
  const activityId = 'activity-ac-sr-001';
  const activityVersionId = `${activityId}_v1`;
  const placementId = 'placement-ac-sr-001';
  const entitlementId = 'entitlement-ac-sr-001';
  return Object.freeze({
    caseId,
    seed: `prd0062-51a:${caseId}:student-runtime-persistence:v1`,
    activityId,
    activityVersionId,
    placementId,
    entitlementId,
    launch: Object.freeze({
      url: `/student/practice/${activityId}?entitlement=${entitlementId}`,
      role: 'student',
    }),
    response: Object.freeze({ interactionId: 'interaction-1', value: 'deterministic-response' }),
    submission: Object.freeze({ attemptId: 'attempt-ac-sr-001-v1', revision: 1 }),
    schedule: Object.freeze({ placementId, startsAt: '2026-08-12T00:00:00.000Z' }),
  });
};
