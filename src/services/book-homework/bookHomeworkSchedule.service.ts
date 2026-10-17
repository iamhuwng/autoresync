import type {
  BookHomeworkScheduleRule,
  BookHomeworkStructuralOutlineNode,
  HomeworkStudentOverride,
} from '../../types/homework.types';

export interface BookHomeworkScheduleRuleDraft {
  readonly nodeKey: string;
  readonly availableFrom: string;
  readonly dueAt: string;
}

export interface BookHomeworkScheduleDraft {
  readonly availableFrom: string;
  readonly dueDate: string;
  readonly scheduleRules: readonly BookHomeworkScheduleRuleDraft[];
}

export interface BookHomeworkSchedule {
  readonly availableFrom?: string;
  readonly finalDueAt: string;
  readonly scheduleRules: readonly BookHomeworkScheduleRule[];
}

export interface BookHomeworkScheduleWinner {
  readonly source: 'open-access' | 'assignment' | 'ancestor' | 'student-extension';
  readonly nodeKey?: string;
  readonly value?: string;
  readonly explanation: string;
}

export interface EffectiveBookHomeworkWindow {
  readonly release: BookHomeworkScheduleWinner;
  readonly deadline: BookHomeworkScheduleWinner;
  readonly isReleased: boolean;
  readonly isOverdue: boolean;
  readonly isAccessible: boolean;
}

export type BookHomeworkDeadlineMutationKind = 'add' | 'extend' | 'shorten' | 'remove' | 'unchanged';

export interface BookHomeworkDeadlineMutationIntent {
  readonly kind: BookHomeworkDeadlineMutationKind;
  readonly nodeKey: string;
  readonly previousDueAt?: string;
  readonly nextDueAt?: string;
  readonly affectedStudentStates: readonly ('not-started' | 'in-progress' | 'submitted')[];
  readonly affectedStudentStateKnown: boolean;
  readonly requiresTrustedDenial: boolean;
}

const parseTimestamp = (value: string, label: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid date and time.`);
  return timestamp;
};

const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u;
const EXPLICIT_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:\d{2})$/u;

export interface BookHomeworkLocalTimeResolution {
  readonly timeZone: string;
  readonly offsets: readonly string[];
  readonly instants: readonly string[];
}

const offsetLabel = (minutes: number): string => {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

export const resolveBookHomeworkLocalTime = (
  value: string,
  timeZone: string,
): BookHomeworkLocalTimeResolution => {
  const match = LOCAL_TIMESTAMP.exec(value);
  if (!match) throw new Error('Local date and time must use YYYY-MM-DDTHH:mm.');
  const fields = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? 0);
  const wallUtc = Date.UTC(fields[0]!, fields[1]! - 1, fields[2]!, fields[3]!, fields[4]!, second);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    throw new Error(`Unknown schedule timezone ${timeZone}.`);
  }
  const partsAt = (instant: number) => Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const offsets = new Set<number>();
  for (let hour = -24; hour <= 24; hour += 1) {
    const instant = wallUtc + hour * 60 * 60 * 1000;
    const parts = partsAt(instant);
    offsets.add((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant) / 60_000);
  }
  const candidates = [...offsets].flatMap((offset) => {
    const instant = wallUtc - offset * 60_000;
    const parts = partsAt(instant);
    return parts.year === fields[0] && parts.month === fields[1] && parts.day === fields[2]
      && parts.hour === fields[3] && parts.minute === fields[4] && parts.second === second
      ? [{ offset, instant }]
      : [];
  }).sort((left, right) => left.instant - right.instant);
  return {
    timeZone,
    offsets: candidates.map((candidate) => offsetLabel(candidate.offset)),
    instants: candidates.map((candidate) => new Date(candidate.instant).toISOString()),
  };
};

export const toBookHomeworkScheduleIso = (value: string, label: string, timeZone: string): string => {
  const explicit = EXPLICIT_TIMESTAMP.exec(value);
  const wallValue = explicit?.[1] ?? value;
  const resolution = resolveBookHomeworkLocalTime(wallValue, timeZone);
  if (resolution.instants.length === 0) throw new Error(`${label} does not exist in ${timeZone}.`);
  if (explicit) {
    const offset = explicit[2] === 'Z' ? '+00:00' : explicit[2];
    const index = resolution.offsets.indexOf(offset);
    if (index < 0) throw new Error(`${label} UTC offset ${offset} does not apply in ${timeZone}.`);
    const parsed = new Date(parseTimestamp(value, label)).toISOString();
    if (parsed !== resolution.instants[index]) throw new Error(`${label} does not match ${timeZone} at UTC${offset}.`);
    return parsed;
  }
  if (resolution.instants.length > 1) throw new Error(`${label} is ambiguous in ${timeZone}; choose an explicit UTC offset.`);
  return resolution.instants[0]!;
};

const outlineMap = (
  outline: readonly BookHomeworkStructuralOutlineNode[],
): ReadonlyMap<string, BookHomeworkStructuralOutlineNode> => {
  const result = new Map<string, BookHomeworkStructuralOutlineNode>();
  outline.forEach((node) => {
    if (result.has(node.nodeKey)) throw new Error(`Duplicate Book schedule node ${node.nodeKey}.`);
    result.set(node.nodeKey, node);
  });
  outline.forEach((node) => {
    if (node.parentNodeKey !== null && !result.has(node.parentNodeKey)) {
      throw new Error(`Book schedule node ${node.nodeKey} has a missing parent.`);
    }
    const seen = new Set<string>();
    let current: BookHomeworkStructuralOutlineNode | undefined = node;
    while (current) {
      if (seen.has(current.nodeKey)) throw new Error(`Book schedule node ${node.nodeKey} has a parent cycle.`);
      seen.add(current.nodeKey);
      current = current.parentNodeKey === null ? undefined : result.get(current.parentNodeKey);
    }
  });
  return result;
};

const ancestors = (
  nodeKey: string,
  byNode: ReadonlyMap<string, BookHomeworkStructuralOutlineNode>,
): readonly BookHomeworkStructuralOutlineNode[] => {
  const result: BookHomeworkStructuralOutlineNode[] = [];
  let current = byNode.get(nodeKey);
  if (!current) throw new Error(`Unknown Book schedule node ${nodeKey}.`);
  while (current) {
    result.push(current);
    current = current.parentNodeKey === null ? undefined : byNode.get(current.parentNodeKey);
  }
  return result;
};

export const validateBookHomeworkSchedule = (
  schedule: BookHomeworkSchedule,
  outline: readonly BookHomeworkStructuralOutlineNode[],
): void => {
  const byNode = outlineMap(outline);
  const finalDue = parseTimestamp(schedule.finalDueAt, 'Final due date');
  if (schedule.availableFrom !== undefined) parseTimestamp(schedule.availableFrom, 'Assignment release');

  const byRule = new Map<string, BookHomeworkScheduleRule>();
  schedule.scheduleRules.forEach((rule) => {
    if (!byNode.has(rule.nodeKey)) throw new Error(`Unknown Book schedule node ${rule.nodeKey}.`);
    if (byRule.has(rule.nodeKey)) throw new Error(`Duplicate Book schedule rule for ${rule.nodeKey}.`);
    if (rule.availableFrom === undefined && rule.dueAt === undefined) {
      throw new Error(`Book schedule rule ${rule.nodeKey} is empty.`);
    }
    if (rule.availableFrom !== undefined) parseTimestamp(rule.availableFrom, `Release for ${rule.nodeKey}`);
    if (rule.dueAt !== undefined) parseTimestamp(rule.dueAt, `Deadline for ${rule.nodeKey}`);
    byRule.set(rule.nodeKey, rule);
  });

  schedule.scheduleRules.forEach((rule) => {
    if (rule.dueAt === undefined) return;
    const chain = ancestors(rule.nodeKey, byNode).slice(1);
    const parentRule = chain.map((node) => byRule.get(node.nodeKey)).find((candidate) => candidate?.dueAt);
    const parentDue = parentRule?.dueAt === undefined
      ? finalDue
      : parseTimestamp(parentRule.dueAt, `Parent deadline for ${rule.nodeKey}`);
    if (parseTimestamp(rule.dueAt, `Deadline for ${rule.nodeKey}`) > parentDue) {
      throw new Error(`Deadline for ${rule.nodeKey} cannot be later than its parent or final due date.`);
    }
  });
};

export const compileBookHomeworkScheduleDraft = (
  draft: BookHomeworkScheduleDraft,
  outline: readonly BookHomeworkStructuralOutlineNode[],
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): BookHomeworkSchedule => {
  if (!draft.dueDate) throw new Error('Final due date is required.');
  const seen = new Set<string>();
  const scheduleRules = draft.scheduleRules.flatMap((rule): readonly BookHomeworkScheduleRule[] => {
    if (seen.has(rule.nodeKey)) throw new Error(`Duplicate Book schedule rule for ${rule.nodeKey}.`);
    seen.add(rule.nodeKey);
    if (!rule.availableFrom && !rule.dueAt) return [];
    return [{
      nodeKey: rule.nodeKey,
      ...(rule.availableFrom ? { availableFrom: toBookHomeworkScheduleIso(rule.availableFrom, `Release for ${rule.nodeKey}`, timeZone) } : {}),
      ...(rule.dueAt ? { dueAt: toBookHomeworkScheduleIso(rule.dueAt, `Deadline for ${rule.nodeKey}`, timeZone) } : {}),
    }];
  }).sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
  const schedule: BookHomeworkSchedule = {
    ...(draft.availableFrom ? { availableFrom: toBookHomeworkScheduleIso(draft.availableFrom, 'Assignment release', timeZone) } : {}),
    finalDueAt: toBookHomeworkScheduleIso(draft.dueDate, 'Final due date', timeZone),
    scheduleRules,
  };
  validateBookHomeworkSchedule(schedule, outline);
  return schedule;
};

export const resolveEffectiveBookHomeworkWindow = (input: {
  readonly schedule: BookHomeworkSchedule;
  readonly outline: readonly BookHomeworkStructuralOutlineNode[];
  readonly nodeKey: string;
  readonly studentOverride?: Pick<HomeworkStudentOverride, 'dueDate'>;
  readonly now?: string | number | Date;
}): EffectiveBookHomeworkWindow => {
  validateBookHomeworkSchedule(input.schedule, input.outline);
  const byNode = outlineMap(input.outline);
  const byRule = new Map(input.schedule.scheduleRules.map((rule) => [rule.nodeKey, rule]));
  const chain = ancestors(input.nodeKey, byNode);
  const deadlineRule = chain.map((node) => byRule.get(node.nodeKey)).find((rule) => rule?.dueAt);
  const releaseRule = chain.map((node) => byRule.get(node.nodeKey)).find((rule) => rule?.availableFrom);

  const inheritedDeadline: BookHomeworkScheduleWinner = deadlineRule?.dueAt === undefined
    ? {
        source: 'assignment',
        value: input.schedule.finalDueAt,
        explanation: `Uses assignment final due date ${input.schedule.finalDueAt}.`,
      }
    : {
        source: 'ancestor',
        nodeKey: deadlineRule.nodeKey,
        value: deadlineRule.dueAt,
        explanation: `Uses nearest deadline on ${deadlineRule.nodeKey}: ${deadlineRule.dueAt}.`,
      };
  const studentDueAt = input.studentOverride?.dueDate;
  if (studentDueAt !== undefined && !Number.isFinite(studentDueAt)) {
    throw new Error('Student deadline extension must be a valid timestamp.');
  }
  const deadline = studentDueAt !== undefined
    && studentDueAt > parseTimestamp(inheritedDeadline.value!, 'Inherited deadline')
    ? {
        source: 'student-extension' as const,
        value: new Date(studentDueAt).toISOString(),
        explanation: `Student extension ${new Date(studentDueAt).toISOString()} overrides ${inheritedDeadline.value}.`,
      }
    : inheritedDeadline;
  const release: BookHomeworkScheduleWinner = releaseRule?.availableFrom !== undefined
    ? {
        source: 'ancestor',
        nodeKey: releaseRule.nodeKey,
        value: releaseRule.availableFrom,
        explanation: `Uses nearest release on ${releaseRule.nodeKey}: ${releaseRule.availableFrom}.`,
      }
    : input.schedule.availableFrom !== undefined
      ? {
          source: 'assignment',
          value: input.schedule.availableFrom,
          explanation: `Uses assignment release ${input.schedule.availableFrom}.`,
        }
      : {
          source: 'open-access',
          explanation: 'Open access: no release date applies.',
        };
  const now = input.now instanceof Date
    ? input.now.getTime()
    : typeof input.now === 'string'
      ? parseTimestamp(input.now, 'Current time')
      : input.now ?? Date.now();
  const isReleased = release.value === undefined || now >= parseTimestamp(release.value, 'Effective release');
  const isOverdue = now > parseTimestamp(deadline.value!, 'Effective deadline');

  return {
    release,
    deadline,
    isReleased,
    isOverdue,
    isAccessible: isReleased,
  };
};

export const classifyBookHomeworkDeadlineMutation = (input: {
  readonly nodeKey: string;
  readonly previousDueAt?: string;
  readonly nextDueAt?: string;
  readonly affectedStudentStates?: readonly ('not-started' | 'in-progress' | 'submitted')[];
}): BookHomeworkDeadlineMutationIntent => {
  const states = input.affectedStudentStates ?? [];
  const affectedStudentStateKnown = input.affectedStudentStates !== undefined;
  const previous = input.previousDueAt ? parseTimestamp(input.previousDueAt, 'Previous deadline') : undefined;
  const next = input.nextDueAt ? parseTimestamp(input.nextDueAt, 'Next deadline') : undefined;
  const kind: BookHomeworkDeadlineMutationKind = previous === undefined && next !== undefined
    ? 'add'
    : previous !== undefined && next === undefined
      ? 'remove'
      : previous === next
        ? 'unchanged'
        : previous !== undefined && next !== undefined && next > previous
          ? 'extend'
          : 'shorten';
  const affectedStarted = states.some((state) => state !== 'not-started');
  return {
    kind,
    nodeKey: input.nodeKey,
    ...(input.previousDueAt ? { previousDueAt: new Date(parseTimestamp(input.previousDueAt, 'Previous deadline')).toISOString() } : {}),
    ...(input.nextDueAt ? { nextDueAt: new Date(parseTimestamp(input.nextDueAt, 'Next deadline')).toISOString() } : {}),
    affectedStudentStates: states,
    affectedStudentStateKnown,
    requiresTrustedDenial: (!affectedStudentStateKnown || affectedStarted)
      && (kind === 'add' || kind === 'shorten'),
  };
};
