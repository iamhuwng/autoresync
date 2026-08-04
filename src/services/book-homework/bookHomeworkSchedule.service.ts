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

const toIso = (value: string, label: string): string =>
  new Date(parseTimestamp(value, label)).toISOString();

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
): BookHomeworkSchedule => {
  if (!draft.dueDate) throw new Error('Final due date is required.');
  const seen = new Set<string>();
  const scheduleRules = draft.scheduleRules.flatMap((rule): readonly BookHomeworkScheduleRule[] => {
    if (seen.has(rule.nodeKey)) throw new Error(`Duplicate Book schedule rule for ${rule.nodeKey}.`);
    seen.add(rule.nodeKey);
    if (!rule.availableFrom && !rule.dueAt) return [];
    return [{
      nodeKey: rule.nodeKey,
      ...(rule.availableFrom ? { availableFrom: toIso(rule.availableFrom, `Release for ${rule.nodeKey}`) } : {}),
      ...(rule.dueAt ? { dueAt: toIso(rule.dueAt, `Deadline for ${rule.nodeKey}`) } : {}),
    }];
  }).sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
  const schedule: BookHomeworkSchedule = {
    ...(draft.availableFrom ? { availableFrom: toIso(draft.availableFrom, 'Assignment release') } : {}),
    finalDueAt: toIso(draft.dueDate, 'Final due date'),
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
    ...(input.previousDueAt ? { previousDueAt: toIso(input.previousDueAt, 'Previous deadline') } : {}),
    ...(input.nextDueAt ? { nextDueAt: toIso(input.nextDueAt, 'Next deadline') } : {}),
    affectedStudentStates: states,
    affectedStudentStateKnown,
    requiresTrustedDenial: (!affectedStudentStateKnown || affectedStarted)
      && (kind === 'add' || kind === 'shorten'),
  };
};
