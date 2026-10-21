import { validateLocalBookAuthoring } from '../../services/materialCatalog/localBookAuthoringValidation.service';
import type { LocalBookAuthoringDraft } from '../../services/materialCatalog/localBookAuthoring.service';
import { BOOK_ACTIVITY_MODEL_GUIDANCE } from '../../services/book-assembly/unitPrompt.service';

type LocalNode = { nodeKey: string; parentNodeKey: string | null; nodeType: string; title?: string; order: number };
type LocalSlot = { activityKey: string; order: number; contextRequirement: 'required' | 'optional' | 'none'; pageGroupKeys: string[] };
type LocalPageGroup = { pageGroupKey: string; sourceKey: string; pages: number[]; activityKeys: string[]; mode: 'activity' | 'reference_only'; defaultPhysicalPageNumber?: number };
export type LocalUnit = { unitKey: string; activitySlots: LocalSlot[]; pageGroups: LocalPageGroup[] };
type LocalStructure = { nodes: LocalNode[]; units: LocalUnit[] };
type LocalMapping = { units: LocalUnit[] };

const readableUnit = (value: unknown): value is LocalUnit => {
  const unit = recordValue(value);
  return Boolean(unit && typeof unit.unitKey === 'string' && Array.isArray(unit.activitySlots) && Array.isArray(unit.pageGroups)
    && unit.activitySlots.every((entry) => { const slot = recordValue(entry); return slot && typeof slot.activityKey === 'string' && Array.isArray(slot.pageGroupKeys); })
    && unit.pageGroups.every((entry) => { const group = recordValue(entry); return group && typeof group.pageGroupKey === 'string' && typeof group.sourceKey === 'string' && Array.isArray(group.pages) && Array.isArray(group.activityKeys); }));
};

export const parseObject = <T,>(text: string, fallback: T): T | null => {
  try {
    const value = JSON.parse(text) as T;
    return value && typeof value === 'object' ? value : fallback;
  } catch { return null; }
};
export const readStructure = (text: string): LocalStructure | null => {
  const value = parseObject<Partial<LocalStructure>>(text, { nodes: [], units: [] });
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.units)) return null;
  if (!value.units.every(readableUnit) || !value.nodes.every((entry) => typeof recordValue(entry)?.nodeKey === 'string')) return null;
  return { nodes: value.nodes as LocalNode[], units: value.units as LocalUnit[] };
};
export const readMapping = (text: string): LocalMapping | null => {
  const value = parseObject<Partial<LocalMapping>>(text, { units: [] });
  if (!value || !Array.isArray(value.units)) return null;
  if (!value.units.every(readableUnit)) return null;
  return { units: value.units as LocalUnit[] };
};
export const writeJson = (value: unknown) => JSON.stringify(value, null, 2);
export const validationSummary = (errors: ReturnType<typeof validateLocalBookAuthoring>['errors']): string => {
  const first = errors[0];
  return first
    ? `${errors.length} authoring issue${errors.length === 1 ? '' : 's'}. ${first.field}: ${first.path} — ${first.message} See validation details below.`
    : 'Fix the authoring errors before continuing.';
};
const recordValue = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export interface LocalBookStructurePromptInput {
  readonly metadata: Pick<LocalBookAuthoringDraft['metadata'], 'title'>;
  readonly strategy: LocalBookAuthoringDraft['strategy'];
  readonly pdfs: readonly Pick<LocalBookAuthoringDraft['pdfs'][number], 'sourceKey' | 'name'>[];
}

export interface LocalBookStructurePromptContext {
  readonly unitKeys: readonly string[];
  readonly sourceOwnership: readonly { readonly sourceKey: string; readonly unitKeys: readonly string[] }[];
}

export const buildLocalBookStructurePrompt = (
  current: LocalBookStructurePromptInput,
  pdfPageCounts: Readonly<Record<string, number>>,
  existing?: LocalBookStructurePromptContext,
) => {
  return [
    'Create JSON for this local LuyenTap Book structure.',
    JSON.stringify({
      promptVersion: 'book-structure-json-v1',
      title: current.metadata.title,
      strategy: current.strategy ?? 'full',
      sources: current.pdfs.length > 0
        ? current.pdfs.map((pdf) => ({ sourceKey: pdf.sourceKey, name: pdf.name, physicalPageCount: pdfPageCounts[pdf.sourceKey] ?? null }))
        : [{ sourceKey: current.strategy === 'component' ? 'component-1' : 'full', name: 'select PDF first', physicalPageCount: null }],
    }, null, 2),
    `Return JSON only, with exactly the "nodes" and "units" shape shown here:
${JSON.stringify({
      nodes: [
        { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', title: 'Section title from the PDF', order: 1 },
        { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', title: 'Unit title from the PDF', order: 1 },
      ],
      units: [{
        unitKey: 'unit-1',
        activitySlots: [{ activityKey: 'activity-unit-1-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-unit-1-1'] }],
        pageGroups: [{ pageGroupKey: 'pages-unit-1-1', sourceKey: current.pdfs[0]?.sourceKey ?? (current.strategy === 'component' ? 'component-1' : 'full'), pages: [1], activityKeys: ['activity-unit-1-1'], mode: 'activity', defaultPhysicalPageNumber: 1 }],
      }],
    }, null, 2)}`,
    'Allowed nodeType values: intro-placeholder, toc-placeholder, note-placeholder, section, chapter, unit, test. Allowed contextRequirement values: required, optional, none. Allowed Page Group modes: activity, reference_only.',
    'Map every Activity slot reciprocally to at least one Page Group. Use one of the listed sourceKey values and one-based physical pages within that source PDF. Do not include Activity content, answers, bookId, sourceVersionId, ownership, storage, or provider data.',
    ...(existing && (existing.unitKeys.length > 0 || existing.sourceOwnership.length > 0) ? [
      `This is an edit. Use the current structure context to preserve existing Unit keys and PDF-to-Unit assignments unless the teacher explicitly changes them. Do not return this context or add ownership fields to the JSON:\n${JSON.stringify(existing, null, 2)}`,
    ] : []),
    BOOK_ACTIVITY_MODEL_GUIDANCE,
    'Create a separate Activity slot when the task family or shared answer rule changes, even within one printed heading. Preserve the source question grouping and map every page needed to answer each Activity.',
    'Use readable section and Unit titles from the PDF. Map each Activity to all pages it needs, including a passage or another exercise it refers to on an earlier or later page; do not map only the page where its instruction appears.',
    'For component strategy, assign all Page Groups for a given source PDF to one Unit only, and ensure every source PDF appears in at least one Page Group. For full strategy, the full source may serve multiple Units; map each Unit to the pages it needs.',
  ].join('\n\n');

};
