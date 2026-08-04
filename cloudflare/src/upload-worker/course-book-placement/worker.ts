import { createBookDeliveryWorkerHandlers } from '../book-delivery/worker.ts';

const live = async (env: any, uid: string, materialId: string, studentId: string) => {
  if (typeof env.readDatabaseValue !== 'function') throw new Error('course_book_authority_reader_missing');
  const material = await env.readDatabaseValue(`course_materials/${materialId}`);
  const placement = material?.bookDeliveryPlacement;
  if (!placement || placement.status !== 'active') throw new Error('course_book_placement_denied');
  const [course, enrollment, release, flags] = await Promise.all([
    env.readDatabaseValue(`courses/${placement.courseId}`),
    env.readDatabaseValue(`course_book_authority/enrollments/${placement.courseId}/${studentId}`),
    env.readDatabaseValue(`course_book_authority/releases/${placement.courseId}/${placement.moduleId}/${studentId}`),
    env.readDatabaseValue('system_flags'),
  ]);
  return { placement, owner: uid === placement.ownerId && course?.ownerId === placement.ownerId,
    blocked: Boolean(course?.archivedAt) || flags?.restore_in_progress === true || flags?.course_book_rollback === true,
    enrolled: enrollment?.status === 'active', released: release?.released === true };
};

export const createCourseBookPlacementWorkerHandlers = () => {
  const delivery = createBookDeliveryWorkerHandlers({
    loadContext: async (env: any, uid: string, intent: any) => {
      const state = await live(env, uid, intent.contextId, intent.recipientId);
      if (intent.contextKind !== 'course' || !state.owner || state.blocked) throw new Error('course_book_issuance_denied');
      return { schedulePolicy: { policyId: `course:${intent.contextId}`, policyRevision: 1, basis: 'immutable-reference' as const } };
    },
  });
  return {
    place: (input: any) => delivery.create(input),
    revoke: (input: any) => delivery.revoke(input),
    async resolve(input: any) {
      const state = await live(input.env, input.uid, input.courseMaterialId, input.uid);
      if (state.blocked || !state.enrolled || !state.released) throw new Error('course_book_resolution_denied');
      return delivery.resolve({ ...input, recipientId: input.uid, contextId: input.courseMaterialId });
    },
  };
};
