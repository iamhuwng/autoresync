import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRestBookAssemblyPublicationRepository } from '../book-assembly/publication-repository.ts';
import { createTrustedBookDeliveryPublication } from '../book-delivery/worker.ts';
import { FirebaseCourseBookPlacementRepository } from '../course-book-placement/repository.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type { ClassBookSourcePlacement } from '../../../../src/services/book-delivery/classBookPlacement.types.ts';
import { createClassBookPlacementCommand } from './command.ts';
import { FirebaseClassBookPlacementRepository } from './repository.ts';

export const createProductionClassBookCommand = (env: RepositoryEnv & Record<string, unknown>) => {
  const key = String(env.BOOK_DELIVERY_GOOGLE_SA_KEY ?? '');
  const scopedEnv = { ...env, GOOGLE_SA_KEY: key };
  const reader = new FirebaseRtdbRestClient({ env: scopedEnv, fetchImpl: globalThis.fetch });
  const repository = new FirebaseClassBookPlacementRepository({ env: scopedEnv });
  const courses = new FirebaseCourseBookPlacementRepository({ env: scopedEnv });
  const token = createFirebaseClaimTokenProvider({
    serviceAccountJson: key, serviceIdentity: String(env.BOOK_DELIVERY_SERVICE_IDENTITY ?? ''),
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? '', firebaseWebApiKey: env.FIREBASE_WEB_API_KEY ?? '',
  });
  return createClassBookPlacementCommand({
    readValue: (path) => reader.readValue(path),
    readCopy: (classId, copyId) => repository.readCopy(classId, copyId),
    readCurrent: (contextId) => repository.readCurrent(contextId),
    readLock: (classId, placementId) => repository.readLock(classId, placementId),
    readReceipt: (operationId) => repository.readCommandReceipt(operationId),
    async loadSource(courseId, materialId, actorUid): Promise<ClassBookSourcePlacement> {
      const [course, placement] = await Promise.all([reader.readValue(`courses/${courseId}`), courses.read(materialId)]);
      const courseRow = course as Record<string, unknown> | null;
      if (!courseRow || courseRow.ownerId !== actorUid || courseRow.archivedAt || courseRow.isClassInstance === true
        || !placement || placement.courseId !== courseId || placement.ownerId !== actorUid || placement.status !== 'active') {
        throw new Error('class_book_source_owner_denied');
      }
      const scope = await new FirebaseRestBookAssemblyPublicationRepository({ env }).readScope(placement.pins.bookId);
      const trusted = createTrustedBookDeliveryPublication({
        bookId: placement.pins.bookId, publicationId: placement.pins.publicationId,
        publicationRevision: placement.pins.publicationRevision, recipientId: actorUid,
        contextKind: 'course', contextId: materialId, scope: placement.selection,
      }, scope, { policyId: `course:${materialId}`, policyRevision: 1, basis: 'immutable-reference' });
      if (scope.current?.manifestVersionId !== placement.pins.manifestVersionId
        || trusted.placements.length !== placement.pins.selectedActivities.length) throw new Error('class_book_source_pin_mismatch');
      const activities = placement.pins.selectedActivities.map((pin, order) => {
        const selected = trusted.placements.find((item) => item.placementId === pin.placementId);
        const raw = scope.placements?.[pin.placementId];
        const page = raw?.sourcePages[0];
        const unit = scope.unitProjections?.[pin.unitVersionId];
        if (!selected || !raw || !page || !unit || unit.unitKey !== pin.unitStableKey || raw.unitKey !== pin.unitStableKey
          || selected.nodeKey !== pin.nodeKey || unit.ownerId !== actorUid
          || unit.manifestVersionId !== placement.pins.manifestVersionId
          || unit.publicationId !== placement.pins.publicationId
          || unit.publicationRevision !== placement.pins.publicationRevision
          || selected.activityId !== pin.activityId || selected.activityVersionId !== pin.activityVersionId
          || JSON.stringify([...new Set(raw.sourcePages.map((item) => item.sourceVersionId))].sort())
            !== JSON.stringify([...pin.sourceVersionIds].sort()) || !raw.pageGroupKeys[0]) {
          throw new Error('class_book_source_pin_mismatch');
        }
        return {
          placementId: pin.placementId, activityId: pin.activityId, activityVersionId: pin.activityVersionId,
          unitStableKey: pin.unitStableKey, unitVersionId: pin.unitVersionId,
          sourceVersionId: page.sourceVersionId, physicalPageNumber: page.physicalPageNumber,
          pageGroupId: raw.pageGroupKeys[0], order,
          title: trusted.outline.find((node) => node.nodeKey === pin.nodeKey)?.titleSnapshot ?? placement.displayTitle,
        };
      });
      const first = activities[0];
      if (!first) throw new Error('class_book_source_pin_missing');
      return {
        courseId, moduleId: placement.moduleId, courseMaterialId: materialId, ownerId: actorUid,
        placementRevision: placement.placementRevision, status: 'active',
        pins: { bookId: placement.pins.bookId, publicationId: placement.pins.publicationId,
          publicationRevision: placement.pins.publicationRevision, manifestVersionId: placement.pins.manifestVersionId,
          unitStableKey: first.unitStableKey, unitVersionId: first.unitVersionId, sourceVersionId: first.sourceVersionId,
          bindingRevision: String(placement.pins.bindingRevision) },
        selection: { kind: 'placements', nodeKeys: [], placementIds: activities.map((item) => item.placementId) }, activities,
      };
    },
    commit: (receipt, claims) => new FirebaseClassBookPlacementRepository({
      env: scopedEnv, getFirebaseAuthToken: () => token(claims),
    }).commitCommand(receipt),
  });
};
