import { getMaterialVisuals } from './materialVisualTaxonomy';

const EMPTY_LABEL = '--';

const ACTION_SLOT_BY_KEY = {
  open: 1,
  edit: 1,
  view: 1,
  'use-as-is': 1,
  delete: 2,
  'assign-homework': 4,
  start: 3,
  clone: 3,
};

function isWritingMaterial(item) {
  return item?.testType === 'IELTS' && String(item?.skill || '').toLowerCase() === 'writing';
}

function isReadingV2Material(item) {
  return item?.deliveryEngine === 'reading-v2';
}

function getAccentKind(item, index = 0) {
  return getMaterialVisuals(item || { id: `material-${index}` }).accentKind;
}

function getIconKind(item) {
  return getMaterialVisuals(item).iconKind;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getItemCount(item) {
  if (isWritingMaterial(item)) {
    if (Array.isArray(item?.tasks)) {
      return item.tasks.length;
    }
    return item?.metadata?.format === 'full-test' ? 2 : 1;
  }

  return Number(item?.questionCount ?? item?.metadata?.questionCount ?? item?.questions?.length ?? 0);
}

function getItemLabel(item) {
  const count = getItemCount(item);
  return isWritingMaterial(item) ? pluralize(count, 'task') : pluralize(count, 'question');
}

function getDurationMinutes(item) {
  const value = item?.duration
    ?? item?.durationMinutes
    ?? item?.metadata?.duration
    ?? item?.metadata?.durationMinutes
    ?? item?.estimatedDurationMinutes;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getDurationLabel(item) {
  const minutes = getDurationMinutes(item);
  return minutes === null ? EMPTY_LABEL : `${minutes} min`;
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'number') {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function getUpdatedDate(item) {
  return normalizeTimestamp(
    item?.updatedAt
      ?? item?.metadata?.updatedAt
      ?? item?.createdAt
      ?? item?.metadata?.createdAt
  );
}

function getUpdatedLabel(item) {
  const date = getUpdatedDate(item);
  if (!date) {
    return EMPTY_LABEL;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getTitle(item) {
  if (isWritingMaterial(item)) {
    return item?.metadata?.title || item?.title || 'Untitled Writing Test';
  }
  if (item?.testType === 'THCS-THPT') {
    return item?.metadata?.title || item?.title || 'Untitled THCS Test';
  }
  return item?.title || item?.metadata?.title || 'Untitled Test';
}

function compactValue(value) {
  return String(value || '').trim();
}

function buildBadges(item) {
  const badges = [
    { key: 'count', label: getItemLabel(item), tone: 'neutral' },
  ];

  if (item?.testType === 'THCS-THPT') {
    badges.push({ key: 'type', label: 'THCS-THPT', tone: 'purple' });
    const grade = compactValue(item?.metadata?.gradeLevel);
    if (grade) {
      badges.push({ key: 'grade', label: `Grade ${grade}`, tone: 'purple' });
    }
    const exam = compactValue(item?.metadata?.examType);
    if (exam) {
      badges.push({ key: 'exam', label: exam, tone: 'purple' });
    }
  } else {
    const type = compactValue(item?.testType || item?.type || 'Test');
    const skill = compactValue(item?.skill);
    badges.push({
      key: 'type',
      label: skill ? `${type} - ${skill}` : type,
      tone: isReadingV2Material(item) ? 'rose' : 'purple',
    });
    if (isReadingV2Material(item)) {
      badges.push({ key: 'engine', label: 'Reading V2', tone: 'rose' });
    }
  }

  const duration = getDurationLabel(item);
  if (duration !== EMPTY_LABEL) {
    badges.push({ key: 'duration', label: duration, tone: 'green' });
  }

  if (item?.isComplete === false) {
    badges.push({ key: 'incomplete', label: 'Incomplete', tone: 'warning' });
    const missingCount = Number(item?.missingAnswerCount || 0);
    if (missingCount > 0) {
      badges.push({
        key: 'missing',
        label: `${missingCount} missing answer${missingCount === 1 ? '' : 's'}`,
        tone: 'warning',
      });
    }
  }

  return badges;
}

function getStatusKind(item) {
  if (item?.isComplete === false) {
    return 'incomplete';
  }
  if (isReadingV2Material(item)) {
    return 'reading-v2';
  }
  if (item?.testType === 'THCS-THPT') {
    return 'thcs';
  }
  if (isWritingMaterial(item)) {
    return 'writing';
  }
  return 'ready';
}

function action({
  key,
  label,
  variant = 'secondary',
  iconKind,
  onSelect,
  disabled = false,
  disabledReason,
  priority = 'primary',
  slot,
}) {
  return {
    key,
    label,
    variant,
    iconKind,
    onSelect,
    disabled,
    disabledReason,
    priority,
    slot: slot ?? ACTION_SLOT_BY_KEY[key],
  };
}

function buildPublicActions(item, handlers) {
  if (item?.testType === 'THCS-THPT') {
    return [
      action({
        key: 'use-as-is',
        label: 'Use as-is',
        variant: 'secondary',
        iconKind: 'use-as-is',
        onSelect: () => handlers?.onUseAsIs?.(item),
      }),
      action({
        key: 'clone',
        label: 'Clone',
        variant: 'primary',
        iconKind: 'clone',
        onSelect: () => handlers?.onClone?.(item),
      }),
    ];
  }

  return [
    action({
      key: 'view',
      label: 'View',
      variant: 'secondary',
      iconKind: 'view',
      onSelect: () => handlers?.onEdit?.(item),
    }),
    ...(item?.isComplete === false ? [] : [
      action({
        key: 'start',
        label: 'Start Test',
        variant: 'primary',
        iconKind: 'play',
        onSelect: () => handlers?.onStartTest?.(item.id),
      }),
    ]),
  ];
}

function buildOwnedActions(item, { canEdit = true, handlers = {} } = {}) {
  const incomplete = item?.isComplete === false;
  const editLabel = canEdit ? (incomplete ? 'Complete' : 'Edit') : 'View';
  const actions = [
    action({
      key: canEdit ? 'edit' : 'view',
      label: editLabel,
      variant: 'secondary',
      iconKind: canEdit ? 'edit' : 'view',
      onSelect: () => handlers?.onEdit?.(item),
    }),
  ];

  if (canEdit) {
    actions.push(action({
      key: 'delete',
      label: 'Delete',
      variant: 'danger',
      iconKind: 'delete',
      onSelect: () => handlers?.onDelete?.(item),
    }));
  }

  if (!incomplete) {
    actions.push(action({
      key: 'start',
      label: 'Start Test',
      variant: 'primary',
      iconKind: 'play',
      onSelect: () => handlers?.onStartTest?.(item.id),
    }));
  }

  if (item?.testType === 'THCS-THPT' && !incomplete) {
    actions.push(action({
      key: 'assign-homework',
      label: 'Assign HW',
      variant: 'outline',
      iconKind: 'clone',
      onSelect: () => handlers?.onAssignHw?.(item),
      priority: 'secondary',
    }));
  }

  return actions;
}

export function buildTestMaterialListRow(item, options = {}) {
  const {
    index = 0,
    canEdit = true,
    isOwner = true,
    isPublicLibrary = false,
    handlers = {},
  } = options;

  return {
    id: String(item?.id || item?.materialId || `material-${index}`),
    source: item,
    title: getTitle(item),
    titleTooltip: getTitle(item),
    iconKind: getIconKind(item),
    accentKind: getAccentKind(item, index),
    badges: buildBadges(item),
    itemLabel: getItemLabel(item),
    durationLabel: getDurationLabel(item),
    updatedLabel: getUpdatedLabel(item),
    statusKind: getStatusKind(item),
    isOwner,
    disabledReason: item?.isComplete === false ? 'Complete the material before starting a session' : undefined,
    actions: isPublicLibrary
      ? buildPublicActions(item, handlers)
      : buildOwnedActions(item, { canEdit, handlers }),
  };
}

function titleCaseScope(value) {
  const scope = String(value || '').trim().toLowerCase();
  if (scope === 'public') {
    return 'Public';
  }
  if (scope === 'private') {
    return 'Private';
  }
  return scope ? scope.charAt(0).toUpperCase() + scope.slice(1) : 'Private';
}

function firstReadableTestTypeLabel(record, testTypeConfig) {
  if (Array.isArray(record?.testTypes) && record.testTypes.length > 0) {
    return record.testTypes
      .map((testType) => testType?.shortLabel || testType?.label || testType?.testTypeId)
      .filter(Boolean)
      .join(', ');
  }

  if (testTypeConfig) {
    return testTypeConfig.shortLabel || testTypeConfig.label || testTypeConfig.testTypeId;
  }

  const firstId = Array.isArray(record?.testTypeIds) ? record.testTypeIds[0] : record?.primaryTestTypeId;
  return firstId ? String(firstId).toUpperCase() : null;
}

function buildReadingPassageBadges(record, testTypeConfig) {
  const badges = [];

  if (compactValue(record?.sourceOrderDisplay)) {
    badges.push({ key: 'source-order', label: compactValue(record.sourceOrderDisplay), tone: 'rose' });
  }

  if (compactValue(record?.sourceFullTestTitle)) {
    badges.push({ key: 'source-full-test', label: compactValue(record.sourceFullTestTitle), tone: 'neutral' });
  }

  const testTypeLabel = firstReadableTestTypeLabel(record, testTypeConfig);
  if (testTypeLabel) {
    badges.push({ key: 'test-type', label: testTypeLabel, tone: 'purple' });
  }

  badges.push({
    key: 'visibility',
    label: record?.scope === 'archived' ? 'Archive' : titleCaseScope(record?.visibility || record?.scope),
    tone: record?.visibility === 'public' || record?.scope === 'public' ? 'green' : 'neutral',
  });

  if (record?.archived === true || record?.scope === 'archived') {
    badges.push({ key: 'archived', label: 'Archived', tone: 'warning' });
  }

  if (compactValue(record?.sourceQuestionRange)) {
    badges.push({ key: 'source-question-range', label: compactValue(record.sourceQuestionRange), tone: 'neutral' });
  }

  const duration = getDurationLabel(record);
  if (duration !== EMPTY_LABEL) {
    badges.push({ key: 'duration', label: duration, tone: 'green' });
  }

  return badges;
}

function readingPassageActionIconKind(key) {
  if (key === 'assign-homework') {
    return 'assign-homework';
  }
  if (key === 'revise') {
    return 'edit';
  }
  if (key === 'archive') {
    return 'archive';
  }
  if (key === 'restore') {
    return 'restore';
  }
  if (key === 'open' || key === 'view') {
    return 'view';
  }
  return key;
}

function defaultReadingPassageActions(record) {
  return record?.isOwner
    ? [
        { key: 'open', label: 'Open' },
        { key: 'assign-homework', label: 'Assign homework' },
        { key: 'revise', label: 'Revise', ownerOnly: true },
        { key: 'archive', label: 'Remove from library', ownerOnly: true },
      ]
    : [
        { key: 'view', label: 'View' },
        { key: 'assign-homework', label: 'Assign homework' },
    ];
}

const READING_PASSAGE_ROW_SOURCE_KEYS = [
  'id',
  'materialId',
  'ownerId',
  'title',
  'questionCount',
  'durationMinutes',
  'updatedAt',
  'visibility',
  'scope',
  'isOwner',
  'selectable',
  'primaryTestTypeId',
  'primaryTestTypeState',
  'testTypeIds',
  'testTypes',
  'sourceOrderDisplay',
  'sourceQuestionRange',
  'sourceFullTestId',
  'sourceFullTestTitle',
  'publishedSnapshotVersionId',
  'currentVersionId',
  'hasStudentSafeProjection',
  'accessible',
  'archived',
  'archivedAt',
  'masterRefCount',
  'bookRefCount',
  'activeHomeworkCount',
];

function sanitizeReadingPassageSource(record) {
  const source = {};

  READING_PASSAGE_ROW_SOURCE_KEYS.forEach((key) => {
    if (record?.[key] !== undefined) {
      source[key] = record[key];
    }
  });

  return source;
}

function readingPassageActionHandler(key, source, handlers = {}) {
  if (key === 'open' || key === 'view') {
    return () => handlers.onOpenReadingPassage?.(source);
  }
  if (key === 'assign-homework') {
    return () => handlers.onAssignReadingPassage?.(source);
  }
  if (key === 'revise') {
    return () => handlers.onReviseReadingPassage?.(source);
  }
  if (key === 'archive') {
    return () => handlers.onArchiveReadingPassage?.(source);
  }
  if (key === 'restore') {
    return () => handlers.onRestoreReadingPassage?.(source);
  }
  return () => {};
}

function getReadingPassageAssignmentBlocker(record) {
  if (record?.archived === true) {
    return 'Archived Reading Passages cannot be assigned.';
  }

  if (!record?.publishedSnapshotVersionId || record?.hasStudentSafeProjection === false) {
    return 'Publish this passage with a student-safe projection before assignment.';
  }

  if (record?.accessible === false) {
    return 'This Reading Passage is not available for assignment.';
  }

  return undefined;
}

const READING_PASSAGE_ACTION_SLOT_BY_KEY = {
  open: 1,
  view: 1,
  'assign-homework': 2,
  revise: 3,
  archive: 4,
  restore: 4,
};

export function toReadingPassageRowModel(record, options = {}) {
  const {
    testTypeConfig,
    selected = false,
    handlers = {},
  } = options;
  const title = record?.title || record?.metadata?.title || 'Untitled Reading Passage';
  const rowSource = sanitizeReadingPassageSource(record);
  const assignmentBlocker = getReadingPassageAssignmentBlocker(record);
  const actions = (record?.actions?.length ? record.actions : defaultReadingPassageActions(record))
    .filter((entry) => !entry.ownerOnly || record?.isOwner)
    .filter((entry) => entry.key !== 'delete')
    .map((entry) => action({
      key: entry.key,
      label: entry.key === 'archive' ? 'Remove from library' : entry.label,
      variant: entry.key === 'archive' ? 'danger' : entry.key === 'restore' ? 'primary' : entry.key === 'assign-homework' ? 'primary' : 'secondary',
      iconKind: readingPassageActionIconKind(entry.key),
      onSelect: readingPassageActionHandler(entry.key, rowSource, handlers),
      disabled: entry.key === 'assign-homework' && Boolean(assignmentBlocker),
      disabledReason: entry.key === 'assign-homework' ? assignmentBlocker : undefined,
      slot: READING_PASSAGE_ACTION_SLOT_BY_KEY[entry.key],
    }));

  return {
    id: String(record?.materialId || record?.id || 'reading-passage'),
    source: rowSource,
    title,
    titleTooltip: title,
    iconKind: 'reading',
    accentKind: 'rose',
    badges: buildReadingPassageBadges(record, testTypeConfig),
    itemLabel: getItemLabel(record),
    durationLabel: getDurationLabel(record),
    updatedLabel: getUpdatedLabel(record),
    statusKind: 'reading-passage',
    isOwner: Boolean(record?.isOwner),
    selection: record?.archived === true || record?.scope === 'archived' || record?.selectable === false ? undefined : {
      checked: selected,
      label: `Select ${title}`,
      disabled: Boolean(assignmentBlocker),
      onChange: () => handlers.onToggleReadingPassageSelection?.(rowSource),
    },
    actions,
  };
}

export const materialListAdapterInternals = {
  EMPTY_LABEL,
  getDurationLabel,
  getItemLabel,
  getUpdatedLabel,
  ACTION_SLOT_BY_KEY,
};
