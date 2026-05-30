const ACCENT_SEQUENCE = ['lavender', 'sky', 'mint', 'rose', 'peach'];

const EMPTY_LABEL = '--';

const ACTION_SLOT_BY_KEY = {
  edit: 1,
  view: 1,
  'use-as-is': 1,
  delete: 2,
  start: 3,
  clone: 3,
  'assign-homework': 4,
};

function isWritingMaterial(item) {
  return item?.testType === 'IELTS' && String(item?.skill || '').toLowerCase() === 'writing';
}

function isReadingV2Material(item) {
  return item?.deliveryEngine === 'reading-v2';
}

function getAccentKind(item, index = 0) {
  if (item?.isComplete === false) {
    return 'incomplete';
  }
  if (item?.testType === 'THCS-THPT') {
    return 'sky';
  }
  if (isReadingV2Material(item)) {
    return 'rose';
  }
  if (isWritingMaterial(item)) {
    return 'lavender';
  }
  return ACCENT_SEQUENCE[index % ACCENT_SEQUENCE.length];
}

function getIconKind(item) {
  if (item?.isComplete === false) {
    return 'incomplete';
  }
  if (item?.testType === 'THCS-THPT') {
    return 'school';
  }
  if (isReadingV2Material(item)) {
    return 'reading';
  }
  if (isWritingMaterial(item)) {
    return 'writing';
  }
  return 'test';
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

export const materialListAdapterInternals = {
  EMPTY_LABEL,
  getDurationLabel,
  getItemLabel,
  getUpdatedLabel,
  ACTION_SLOT_BY_KEY,
};
