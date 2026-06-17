export const HOMEWORK_ASSIGNMENT_REASON_CODES = {
  CONTENT_NOT_FOUND: 'CONTENT_NOT_FOUND',
  CONTENT_NOT_ASSIGNABLE: 'CONTENT_NOT_ASSIGNABLE',
  CONTENT_DRAFT: 'CONTENT_DRAFT',
  TEACHER_NOT_ALLOWED: 'TEACHER_NOT_ALLOWED',
  UNSUPPORTED_CONTENT_KIND: 'UNSUPPORTED_CONTENT_KIND',
  WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED: 'WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED',
  CONTENT_UNPUBLISHED: 'CONTENT_UNPUBLISHED',
  TARGET_NOT_ALLOWED: 'TARGET_NOT_ALLOWED',
  INVALID_ASSIGNMENT_REQUEST: 'INVALID_ASSIGNMENT_REQUEST',
};

export const TEACHER_LOBBY_ASSIGNMENT_FAMILIES = {
  TEST: 'test',
  READING_PASSAGE: 'reading_passage',
  BOOK: 'book',
  DRAFT: 'draft',
};

const REGISTERED_FAMILIES = new Set(Object.values(TEACHER_LOBBY_ASSIGNMENT_FAMILIES));

const asText = (value) => String(value ?? '').trim();
const lower = (value) => asText(value).toLowerCase();

const blocked = (reasonCode) => ({
  assignable: false,
  reasonCode,
});

const supported = (contentRef, flow = 'standard') => ({
  assignable: true,
  contentRef,
  flow,
});

function hasReadyStudentSafeProjection(item) {
  return item?.deliveryProjectionReady === true
    || item?.hasStudentSafeProjection === true
    || item?.studentSafeProjectionReady === true
    || item?.metadata?.deliveryProjectionReady === true
    || item?.metadata?.hasStudentSafeProjection === true
    || item?.metadata?.studentSafeProjectionReady === true;
}

function isReadingV2FullTest(item) {
  const materialKind = lower(item?.materialKind || item?.metadata?.materialKind);
  return materialKind === 'full-test' || materialKind === 'reading-v2-full-test-composition';
}

function hasBrokenReadingV2Refs(item) {
  const brokenRefCount = Number(item?.brokenRefCount ?? item?.metadata?.brokenRefCount ?? 0);
  const brokenRefReasons = item?.brokenRefReasons ?? item?.metadata?.brokenRefReasons;
  return item?.hasBrokenRefs === true
    || item?.metadata?.hasBrokenRefs === true
    || brokenRefCount > 0
    || (Array.isArray(brokenRefReasons) && brokenRefReasons.length > 0);
}

function hasReadingV2PassageRefs(item) {
  const passageRefCount = Number(item?.passageRefCount ?? item?.metadata?.passageRefCount ?? 0);
  return passageRefCount > 0 || (Array.isArray(item?.passageRefs) && item.passageRefs.length > 0);
}

export function assertTeacherLobbyFamilyRegistered(family) {
  if (!REGISTERED_FAMILIES.has(family)) {
    throw new Error('Teacher Lobby assignment family is not registered: ' + family);
  }
}

function getMaterialId(item) {
  return asText(item?.materialId || item?.id);
}

function getTitle(item) {
  if (item?.testType === 'THCS-THPT') {
    return asText(item?.metadata?.title || item?.title);
  }
  return asText(item?.title || item?.metadata?.title);
}

function commonBlocker(item) {
  if (!item) {
    return HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_FOUND;
  }

  const status = lower(item.status || item.state || item.lifecycleState);
  if (status === 'draft' || status === 'saved-draft' || item.draft === true || item.isDraft === true) {
    return HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_DRAFT;
  }

  if (
    item.deleted === true ||
    item.archived === true ||
    item.removed === true ||
    lower(item.scope) === 'archived' ||
    status === 'deleted' ||
    status === 'removed' ||
    status === 'archived'
  ) {
    return HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE;
  }

  if (item.isComplete === false || item.complete === false) {
    return HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE;
  }

  if (
    item.published === false ||
    item.unpublished === true ||
    status === 'unpublished' ||
    status === 'private-draft'
  ) {
    return HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_UNPUBLISHED;
  }

  return null;
}

function resolveTestAssignability(item) {
  const blocker = commonBlocker(item);
  if (blocker) {
    return blocked(blocker);
  }

  const contentId = getMaterialId(item);
  if (!contentId) {
    return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_FOUND);
  }

  const title = getTitle(item);
  const baseRef = title ? { contentId, title } : { contentId };

  if (item?.testType === 'THCS-THPT') {
    return supported({
      contentKind: 'thcs_test',
      ...baseRef,
      version: asText(item?.versionKey || item?.publishedVersionId || item?.metadata?.versionKey) || undefined,
      source: 'thcs',
    }, 'thcs');
  }

  if (item?.deliveryEngine === 'reading-v2') {
    if (!isReadingV2FullTest(item)) {
      return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.UNSUPPORTED_CONTENT_KIND);
    }
    const version = asText(
      item?.publishedSnapshotVersionId ||
      item?.snapshotVersionId ||
      item?.currentVersionId ||
      item?.metadata?.publishedSnapshotVersionId
    );
    if (!version) {
      return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_UNPUBLISHED);
    }
    if (!hasReadyStudentSafeProjection(item)) {
      return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE);
    }
    if (hasBrokenReadingV2Refs(item) || !hasReadingV2PassageRefs(item)) {
      return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE);
    }
    return supported({
      contentKind: 'ielts_reading',
      ...baseRef,
      version,
      source: 'reading-v2',
    });
  }

  const testType = lower(item?.testType);
  const skill = lower(item?.skill || item?.metadata?.skill);
  if (testType === 'ielts') {
    if (skill === 'reading') {
      if (!hasReadyStudentSafeProjection(item)) {
        return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE);
      }
      return supported({ contentKind: 'ielts_reading', ...baseRef, source: 'ielts' });
    }
    if (skill === 'listening') {
      if (!hasReadyStudentSafeProjection(item)) {
        return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE);
      }
      return supported({ contentKind: 'ielts_listening', ...baseRef, source: 'ielts' });
    }
    if (skill === 'writing') {
      return supported({ contentKind: 'ielts_writing', ...baseRef, source: 'ielts' });
    }
  }

  return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.UNSUPPORTED_CONTENT_KIND);
}

function resolveReadingPassageAssignability(item) {
  const blocker = commonBlocker(item);
  if (blocker) {
    return blocked(blocker);
  }

  const contentId = getMaterialId(item);
  if (!contentId) {
    return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_FOUND);
  }

  const version = asText(item?.publishedSnapshotVersionId || item?.metadata?.publishedSnapshotVersionId);
  if (!version) {
    return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_UNPUBLISHED);
  }

  if (item?.hasStudentSafeProjection === false || item?.accessible === false) {
    return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE);
  }

  return supported({
    contentKind: 'reading_passage',
    contentId,
    version,
    title: getTitle(item) || undefined,
    source: 'reading-v2',
  });
}

export function resolveTeacherLobbyAssignability(item, options = {}) {
  const family = options.family || TEACHER_LOBBY_ASSIGNMENT_FAMILIES.TEST;
  const strict = options.strict ?? false;

  if (!REGISTERED_FAMILIES.has(family)) {
    if (strict) {
      assertTeacherLobbyFamilyRegistered(family);
    }
    return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.UNSUPPORTED_CONTENT_KIND);
  }

  if (family === TEACHER_LOBBY_ASSIGNMENT_FAMILIES.BOOK) {
    return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED);
  }

  if (family === TEACHER_LOBBY_ASSIGNMENT_FAMILIES.DRAFT) {
    return blocked(HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_DRAFT);
  }

  if (family === TEACHER_LOBBY_ASSIGNMENT_FAMILIES.READING_PASSAGE) {
    return resolveReadingPassageAssignability(item);
  }

  return resolveTestAssignability(item);
}

export function homeworkAssignmentReasonMessage(reasonCode) {
  switch (reasonCode) {
    case HOMEWORK_ASSIGNMENT_REASON_CODES.WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED:
      return 'Whole-Book assignment is not available.';
    case HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_DRAFT:
      return 'Draft materials cannot be assigned.';
    case HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_UNPUBLISHED:
      return 'Publish this material before assignment.';
    case HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_FOUND:
      return 'This material could not be found.';
    case HOMEWORK_ASSIGNMENT_REASON_CODES.TEACHER_NOT_ALLOWED:
      return 'You do not have permission to assign this material.';
    case HOMEWORK_ASSIGNMENT_REASON_CODES.TARGET_NOT_ALLOWED:
      return 'This assignment target is not available.';
    case HOMEWORK_ASSIGNMENT_REASON_CODES.UNSUPPORTED_CONTENT_KIND:
      return 'This material type is not supported for homework assignment.';
    case HOMEWORK_ASSIGNMENT_REASON_CODES.CONTENT_NOT_ASSIGNABLE:
    default:
      return 'This material is not available for homework assignment.';
  }
}
