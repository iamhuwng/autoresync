const CASE_IDS = new Set(['AC-AD-001']);

export const createPrd0062StudentAccessibilityDeviceFixture = (caseId = 'AC-AD-001') => {
  if (!CASE_IDS.has(caseId)) throw new Error('prd0062_51c2_case_id_invalid');
  const activityId = 'activity-ac-ad-001';
  return Object.freeze({
    caseId,
    seed: `prd0062-51a:${caseId}:student-accessibility-device:v1`,
    source: Object.freeze({ id: 'vocabulary-65', title: 'IELTS Vocabulary for Bands 6.5 and Above' }),
    launch: Object.freeze({ url: `/student/practice/${activityId}?fixture=${caseId}` }),
    expected: Object.freeze({
      minimumTouchTargetPx: 44,
      textScalePercent: 200,
      keyboardReachable: true,
      overflowSafe: true,
    }),
  });
};
