const encodePathPart = (value: string): string =>
  encodeURIComponent(value);

export const publicBookReferenceForkPaths = Object.freeze({
  referenceRevision: (referenceId: string, revision: number): string =>
    'material_catalog/public_references/' + encodePathPart(referenceId) + '/revisions/' + revision,
  currentReference: (referenceId: string): string =>
    'material_catalog/public_references/' + encodePathPart(referenceId) + '/current',
  referenceByTarget: (bookId: string, referenceId: string): string =>
    'material_catalog/public_reference_indexes/by_target/' + encodePathPart(bookId) + '/' + encodePathPart(referenceId),
  referenceBySource: (bookId: string, referenceId: string): string =>
    'material_catalog/public_reference_indexes/by_source/' + encodePathPart(bookId) + '/' + encodePathPart(referenceId),
  placement: (bookId: string, nodeId: string, placementId: string): string =>
    'material_catalog/public_reference_placements/' + encodePathPart(bookId) + '/' + encodePathPart(nodeId) + '/' + encodePathPart(placementId),
  operation: (operationId: string): string =>
    'material_catalog/public_reference_operations/' + encodePathPart(operationId),
  forkHistory: (activityId: string, forkId: string): string =>
    'book_activity/fork_history/' + encodePathPart(activityId) + '/' + encodePathPart(forkId),
  forkCandidate: (activityId: string, candidateId: string): string =>
    'book_activity/candidates/' + encodePathPart(activityId) + '/' + encodePathPart(candidateId),
  forkDraft: (activityId: string, draftId: string): string =>
    'book_activity/drafts/' + encodePathPart(activityId) + '/' + encodePathPart(draftId),
  activityMaterial: (activityId: string): string =>
    'book_activity/materials/' + encodePathPart(activityId),
});
