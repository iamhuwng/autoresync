import {
  ACTIVITY_CONTEXT_REQUIREMENTS,
  BOOK_CONTENT_NODE_TYPES,
  PAGE_GROUP_MODES,
  type ActivityContextRequirement,
  type BookActivitySlotCandidate,
  type BookAssemblyManifestCandidate,
  type BookAssemblyValidationError,
  type BookContentNodeType,
  type BookContentTreeNodeCandidate,
  type BookPageGroupCandidate,
  type BookSourceVersionAuthority,
  type BookUnitCandidate,
  type PageGroupMode,
  type SourceSetCandidate,
} from '../../types/bookAssembly.types';
import { validateBookAssemblyManifestCandidate } from './manifestCandidate.service';

export interface BookStructurePromptInput {
  readonly bookTitle: string;
  readonly sourceKey: string;
  readonly physicalPageCount: number;
}

export interface BookStructureImportStats {
  readonly nodeCount: number;
  readonly unitCount: number;
  readonly activityCount: number;
  readonly mergedPageGroupCount: number;
  readonly strippedExtraFieldCount: number;
}

export type BookStructureImportResult =
  | {
      readonly ok: true;
      readonly nodes: readonly BookContentTreeNodeCandidate[];
      readonly units: readonly BookUnitCandidate[];
      readonly stats: BookStructureImportStats;
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly errors: readonly BookAssemblyValidationError[];
    };

const HARMLESS_EXTRA_FIELDS = new Set(['title', 'label', 'name', 'description', 'summary', 'notes', 'note']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const stripCodeFences = (raw: string): string => {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/iu.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
};

const pickAllowed = (
  record: Record<string, unknown>,
  allowed: readonly string[],
): { readonly cleaned: Record<string, unknown>; readonly stripped: number } => {
  const allowedSet = new Set(allowed);
  const cleaned: Record<string, unknown> = {};
  let stripped = 0;
  for (const [key, value] of Object.entries(record)) {
    if (allowedSet.has(key)) {
      cleaned[key] = value;
    } else if (HARMLESS_EXTRA_FIELDS.has(key)) {
      stripped += 1;
    } else {
      // Keep unknown non-harmless keys so strict validation surfaces them clearly.
      cleaned[key] = value;
    }
  }
  return { cleaned, stripped };
};

const normalizeNodeOrders = (
  values: readonly BookContentTreeNodeCandidate[],
): readonly BookContentTreeNodeCandidate[] => {
  const groups = new Map<string, BookContentTreeNodeCandidate[]>();
  values.forEach((node) => {
    const key = node.parentNodeKey ?? '__root__';
    groups.set(key, [...(groups.get(key) ?? []), node]);
  });
  const orderByKey = new Map<string, number>();
  groups.forEach((group) => {
    group
      .slice()
      .sort((left, right) => left.order - right.order || left.nodeKey.localeCompare(right.nodeKey))
      .forEach((node, index) => orderByKey.set(node.nodeKey, index + 1));
  });
  return values.map((node) => ({ ...node, order: orderByKey.get(node.nodeKey) ?? node.order }));
};

/**
 * Builds the canonical external-AI prompt for generating Book Structure JSON.
 * Aligns directly with textbook page geometry and student-safety rules.
 */
export const buildBookStructurePrompt = ({
  bookTitle,
  sourceKey,
  physicalPageCount,
}: BookStructurePromptInput): string => {
  const example = {
    nodes: [
      { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
    ],
    units: [
      {
        unitKey: 'unit-1',
        activitySlots: [
          {
            activityKey: 'activity-unit-1-1',
            order: 1,
            contextRequirement: 'required',
            pageGroupKeys: ['pages-unit-1-p1'],
          },
          {
            activityKey: 'activity-unit-1-2',
            order: 2,
            contextRequirement: 'required',
            pageGroupKeys: ['pages-unit-1-p1'],
          },
        ],
        pageGroups: [
          {
            pageGroupKey: 'pages-unit-1-p1',
            sourceKey,
            pages: [1],
            activityKeys: ['activity-unit-1-1', 'activity-unit-1-2'],
            mode: 'activity',
            defaultPhysicalPageNumber: 1,
          },
        ],
      },
    ],
  };

  return [
    'Analyze the attached PDF and create its LuyenTap Book structure.',
    JSON.stringify(
      { promptVersion: 'book-structure-json-v1', title: bookTitle, sourceKey, physicalPageCount },
      null,
      2,
    ),
    `Return JSON only, with exactly the "nodes" and "units" shape shown here:\n${JSON.stringify(example, null, 2)}`,
    `Allowed nodeType values: ${BOOK_CONTENT_NODE_TYPES.join(', ')}.`,
    `Allowed contextRequirement values: ${ACTIVITY_CONTEXT_REQUIREMENTS.join(', ')}. Allowed Page Group modes: ${PAGE_GROUP_MODES.join(', ')}.`,
    'Use unique readable logical keys, valid parent links, and positive sibling order. Every Unit node needs one matching units entry.',
    'When multiple activities appear on the same physical page(s), combine them into one shared Page Group (listing all of their activityKeys in that Page Group and referencing that same pageGroupKey from each slot).',
    'Map every Activity slot reciprocally to at least one activity Page Group. Use the exact sourceKey above and strictly ascending one-based physical pages no greater than physicalPageCount.',
    'IMPORTANT STUDENT SAFETY: Never put Answer Key or teacher-only pages in "activity" or "reference_only" Page Groups. Use "reference_only" (with activityKeys: []) ONLY for student-safe reference pages such as transcripts, glossaries, or grammar notes. Use "teacher_only" (with activityKeys: []) for Answer Key or teacher-guide pages so they stay strictly hidden from student delivery while remaining available for teacher authoring and answerEvidenceRefs.',
    'Do not include extra keys (such as title or description), Activity content, answers, bookId, sourceSet, sourceVersionId, ownership, storage data, system IDs, Markdown, or commentary.',
  ].join('\n\n');
};

/**
 * Parses, normalizes, and strictly validates Book Structure JSON pasted or
 * uploaded by a teacher. Auto-merges duplicate same-page activity Page Groups,
 * normalizes ascending page lists, strips harmless extra metadata fields, and
 * validates against the canonical Book Assembly manifest contract.
 */
export const parseAndNormalizeBookStructureJson = (
  rawText: string,
  context: {
    readonly bookId: string;
    readonly sourceSet: SourceSetCandidate;
    readonly sourceVersionAuthority: BookSourceVersionAuthority;
  },
): BookStructureImportResult => {
  const cleanedText = stripCodeFences(rawText);
  if (!cleanedText) {
    return {
      ok: false,
      message: 'Paste or choose a Book structure JSON file first.',
      errors: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    return {
      ok: false,
      message: 'That text is not valid JSON. Copy only the JSON object returned by your AI tool and try again.',
      errors: [],
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      message: 'Book structure JSON must be an object with "nodes" and "units" arrays.',
      errors: [],
    };
  }

  if (parsed.promptVersion === 'book-unit-json-v1' || (Array.isArray(parsed.slots) && !Array.isArray(parsed.nodes))) {
    return {
      ok: false,
      message: 'This looks like Unit Activity JSON, not Book Structure JSON. Import it in the Activity JSON section instead.',
      errors: [],
    };
  }

  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.units)) {
    return {
      ok: false,
      message: 'Book structure JSON must contain both "nodes" and "units" arrays.',
      errors: [],
    };
  }

  if (parsed.nodes.length === 0 || parsed.units.length === 0) {
    return {
      ok: false,
      message: 'Book structure JSON must include at least one content node and one Unit.',
      errors: [],
    };
  }

  let strippedExtraFieldCount = 0;
  let mergedPageGroupCount = 0;

  const cleanedNodes: BookContentTreeNodeCandidate[] = [];
  for (let i = 0; i < parsed.nodes.length; i += 1) {
    const raw = parsed.nodes[i];
    if (!isRecord(raw)) {
      return {
        ok: false,
        message: `Node #${i + 1} must be a JSON object.`,
        errors: [],
      };
    }
    const { cleaned, stripped } = pickAllowed(raw, ['nodeKey', 'parentNodeKey', 'nodeType', 'order']);
    strippedExtraFieldCount += stripped;
    cleanedNodes.push(cleaned as unknown as BookContentTreeNodeCandidate);
  }

  const normalizedNodes = cleanedNodes.every((n) =>
    typeof n.nodeKey === 'string'
    && (n.parentNodeKey === null || typeof n.parentNodeKey === 'string')
    && typeof n.nodeType === 'string'
    && (BOOK_CONTENT_NODE_TYPES as readonly string[]).includes(n.nodeType)
    && Number.isSafeInteger(n.order))
    ? normalizeNodeOrders(cleanedNodes)
    : cleanedNodes;

  const claimedPageGroupKeys = new Set<string>();
  const cleanedUnits: BookUnitCandidate[] = [];
  for (let u = 0; u < parsed.units.length; u += 1) {
    const rawUnit = parsed.units[u];
    if (!isRecord(rawUnit)) {
      return {
        ok: false,
        message: `Unit #${u + 1} must be a JSON object.`,
        errors: [],
      };
    }
    const { cleaned: unitRecord, stripped: unitStripped } = pickAllowed(rawUnit, [
      'unitKey',
      'activitySlots',
      'pageGroups',
    ]);
    strippedExtraFieldCount += unitStripped;

    const rawSlots = Array.isArray(unitRecord.activitySlots) ? unitRecord.activitySlots : [];
    const rawGroups = Array.isArray(unitRecord.pageGroups) ? unitRecord.pageGroups : [];
    if (rawSlots.length === 0) {
      const unitLabel = typeof unitRecord.unitKey === 'string' && unitRecord.unitKey.trim()
        ? unitRecord.unitKey.trim()
        : `Unit #${u + 1}`;
      return {
        ok: false,
        message: `Unit "${unitLabel}" has no activity slots. Add at least one activity to every unit before importing.`,
        errors: [],
      };
    }

    const cleanedSlots: BookActivitySlotCandidate[] = rawSlots.map((rawSlot) => {
      if (!isRecord(rawSlot)) return rawSlot as unknown as BookActivitySlotCandidate;
      const { cleaned, stripped } = pickAllowed(rawSlot, [
        'activityKey',
        'order',
        'contextRequirement',
        'pageGroupKeys',
      ]);
      strippedExtraFieldCount += stripped;
      return {
        ...cleaned,
        contextRequirement: (typeof cleaned.contextRequirement === 'string'
          ? cleaned.contextRequirement
          : 'required') as ActivityContextRequirement,
        pageGroupKeys: Array.isArray(cleaned.pageGroupKeys)
          ? [...new Set(cleaned.pageGroupKeys.filter((k): k is string => typeof k === 'string'))]
          : cleaned.pageGroupKeys,
      } as unknown as BookActivitySlotCandidate;
    });

    const cleanedGroups: BookPageGroupCandidate[] = rawGroups.map((rawGroup) => {
      if (!isRecord(rawGroup)) return rawGroup as unknown as BookPageGroupCandidate;
      const { cleaned, stripped } = pickAllowed(rawGroup, [
        'pageGroupKey',
        'sourceKey',
        'pages',
        'activityKeys',
        'mode',
        'defaultPhysicalPageNumber',
      ]);
      strippedExtraFieldCount += stripped;

      const rawPages = Array.isArray(cleaned.pages) ? cleaned.pages : null;
      const sortedPages = rawPages && rawPages.every((p) => Number.isSafeInteger(p) && (p as number) >= 1)
        ? [...new Set(rawPages as number[])].sort((a, b) => a - b)
        : rawPages;

      const mode = (typeof cleaned.mode === 'string' ? cleaned.mode : 'activity') as PageGroupMode;
      const activityKeys = Array.isArray(cleaned.activityKeys)
        ? [...new Set(cleaned.activityKeys.filter((k): k is string => typeof k === 'string'))]
        : (cleaned.activityKeys === undefined && (mode === 'reference_only' || mode === 'teacher_only')
          ? []
          : cleaned.activityKeys);

      const nextGroup: Record<string, unknown> = {
        ...cleaned,
        mode,
        pages: sortedPages ?? cleaned.pages,
        activityKeys,
      };
      if (Array.isArray(sortedPages) && sortedPages.length > 0) {
        const def = nextGroup.defaultPhysicalPageNumber;
        if (def === undefined || !Number.isSafeInteger(def) || !sortedPages.includes(def as number)) {
          nextGroup.defaultPhysicalPageNumber = sortedPages[0];
        }
      }
      return nextGroup as unknown as BookPageGroupCandidate;
    });

    // Deterministically merge duplicate same-page activity Page Groups within
    // the same Unit (e.g. two exercises on page 9 emitted as separate groups).
    const keyRemap = new Map<string, string>();
    const mergedBySignature = new Map<string, BookPageGroupCandidate>();
    const dedupedGroups: BookPageGroupCandidate[] = [];

    for (const group of cleanedGroups) {
      if (
        isRecord(group)
        && group.mode === 'activity'
        && typeof group.pageGroupKey === 'string'
        && typeof group.sourceKey === 'string'
        && Array.isArray(group.pages)
        && group.pages.length > 0
        && Array.isArray(group.activityKeys)
      ) {
        const sig = `${group.sourceKey}:${group.pages.join(',')}`;
        const existing = mergedBySignature.get(sig);
        if (existing) {
          keyRemap.set(group.pageGroupKey, existing.pageGroupKey);
          mergedPageGroupCount += 1;
          const combinedActivities = [...new Set([...existing.activityKeys, ...group.activityKeys])];
          const updated: BookPageGroupCandidate = {
            ...existing,
            activityKeys: combinedActivities,
          };
          mergedBySignature.set(sig, updated);
          const idx = dedupedGroups.findIndex((g) => g.pageGroupKey === existing.pageGroupKey);
          if (idx >= 0) dedupedGroups[idx] = updated;
          continue;
        }
        mergedBySignature.set(sig, group);
      }
      dedupedGroups.push(group);
    }

    // Ensure pageGroupKeys are globally unique across units so whole-book student
    // runtime delivery never merges pages from two different units sharing a key.
    const unitPrefix = typeof unitRecord.unitKey === 'string' && unitRecord.unitKey.trim()
      ? unitRecord.unitKey.trim()
      : `unit-${u + 1}`;
    const globallyUniqueGroups: BookPageGroupCandidate[] = dedupedGroups.map((group) => {
      if (!isRecord(group) || typeof group.pageGroupKey !== 'string') return group;
      const originalKey = group.pageGroupKey;
      let uniqueKey = originalKey;
      if (claimedPageGroupKeys.has(uniqueKey)) {
        uniqueKey = `${unitPrefix}-${originalKey}`;
        let suffix = 2;
        while (claimedPageGroupKeys.has(uniqueKey)) {
          uniqueKey = `${unitPrefix}-${originalKey}-${suffix}`;
          suffix += 1;
        }
        keyRemap.set(originalKey, uniqueKey);
        for (const [mappedFrom, mappedTo] of keyRemap.entries()) {
          if (mappedTo === originalKey) keyRemap.set(mappedFrom, uniqueKey);
        }
      }
      claimedPageGroupKeys.add(uniqueKey);
      return uniqueKey === originalKey ? group : { ...group, pageGroupKey: uniqueKey };
    });

    // Rewrite slot pageGroupKeys through the merge/uniqueness map and synchronize reciprocal links.
    const syncedSlots = cleanedSlots.map((slot) => {
      if (!isRecord(slot) || typeof slot.activityKey !== 'string' || !Array.isArray(slot.pageGroupKeys)) {
        return slot;
      }
      const mappedKeys = slot.pageGroupKeys.map((key) => keyRemap.get(key) ?? key);
      const fromGroups = globallyUniqueGroups
        .filter((g) => g.mode === 'activity' && Array.isArray(g.activityKeys) && g.activityKeys.includes(slot.activityKey))
        .map((g) => g.pageGroupKey);
      const combined = [...new Set([...mappedKeys, ...fromGroups])];
      return { ...slot, pageGroupKeys: combined };
    });

    const syncedGroups = globallyUniqueGroups.map((group) => {
      if (!isRecord(group) || group.mode !== 'activity' || !Array.isArray(group.activityKeys)) {
        return group;
      }
      const fromSlots = syncedSlots
        .filter((s) => typeof s?.activityKey === 'string' && Array.isArray(s.pageGroupKeys) && s.pageGroupKeys.includes(group.pageGroupKey))
        .map((s) => s.activityKey);
      return {
        ...group,
        activityKeys: [...new Set([...group.activityKeys, ...fromSlots])],
      };
    });

    cleanedUnits.push({
      ...unitRecord,
      activitySlots: syncedSlots,
      pageGroups: syncedGroups,
    } as unknown as BookUnitCandidate);
  }

  const candidateManifest: BookAssemblyManifestCandidate = {
    bookId: context.bookId,
    sourceSet: context.sourceSet,
    nodes: normalizedNodes,
    units: cleanedUnits,
  };

  const validation = validateBookAssemblyManifestCandidate(candidateManifest, context.sourceVersionAuthority);
  if (!validation.valid) {
    const previewErrors = validation.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join(' ');
    const more = validation.errors.length > 3 ? ` (+${validation.errors.length - 3} more)` : '';
    return {
      ok: false,
      message: `Book structure JSON has validation issues: ${previewErrors}${more}`,
      errors: validation.errors,
    };
  }

  const activityCount = cleanedUnits.reduce((total, unit) => total + unit.activitySlots.length, 0);
  return {
    ok: true,
    nodes: normalizedNodes,
    units: cleanedUnits,
    stats: {
      nodeCount: normalizedNodes.length,
      unitCount: cleanedUnits.length,
      activityCount,
      mergedPageGroupCount,
      strippedExtraFieldCount,
    },
  };
};
