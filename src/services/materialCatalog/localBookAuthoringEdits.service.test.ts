import { describe, expect, it } from 'vitest';
import type { EditableActivity } from '../../types/bookActivity.types';
import type { BookAssemblyManifestCandidate, BookUnitCandidate } from '../../types/bookAssembly.types';
import { UNIT_ACTIVITY_IMPORT_PROMPT_VERSION, UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION } from '../book-assembly/unitPrompt.service';
import {
  connectLocalBookActivity,
  importLocalBookPlan,
  importLocalBookUnit,
  reviseLocalBookConnections,
} from './localBookAuthoringEdits.service';
import type { LocalBookAuthoringValidationInput } from './localBookAuthoringValidation.service';

const activity: EditableActivity = {
  schemaVersion: 1,
  title: 'Choose an answer',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Answer the question.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single-select' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{
    prompt: 'Choose one.',
    options: ['A', 'B'],
    acceptedOptionIndexes: [0],
    sourceAssisted: {
      questionLabel: 'Question 1',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise 1',
    },
  }],
  scoring: { mode: 'auto-where-possible' },
};

const manifest: BookAssemblyManifestCandidate = {
  bookId: 'book-1',
  sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }] },
  nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [
      { activityKey: 'activity-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-2'] },
      { activityKey: 'activity-b', order: 2, contextRequirement: 'required', pageGroupKeys: ['pages-3'] },
    ],
    pageGroups: [
      { pageGroupKey: 'pages-2', sourceKey: 'full', pages: [2], activityKeys: ['activity-a'], mode: 'activity' },
      { pageGroupKey: 'pages-3', sourceKey: 'full', pages: [3], activityKeys: ['activity-b'], mode: 'activity' },
    ],
  }],
};

const bundle = (slots = [
  { activityKey: 'activity-a', content: activity },
  { activityKey: 'activity-b', content: activity },
]) => JSON.stringify({
  promptVersion: UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  schemaVersion: UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
  slots,
});

const fullPdf = { id: 'pdf-full', sourceKey: 'full', name: 'book.pdf', size: 10, type: 'application/pdf', lastModified: 0, blobKey: 'full' };
const planInput = (overrides: Partial<LocalBookAuthoringValidationInput> = {}): LocalBookAuthoringValidationInput => ({
  strategy: 'full',
  pdfs: [fullPdf],
  structureJson: JSON.stringify({
    nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
    units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }], pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-a'], mode: 'activity' }] }],
  }),
  unitsJson: '{}',
  pageMappingJson: JSON.stringify({ units: [{ unitKey: 'unit-1', activitySlots: [], pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-a'], mode: 'activity' }] }] }),
  pdfPageCounts: { full: 2 },
  ...overrides,
});

const connectedUnit: BookUnitCandidate = {
  unitKey: 'unit-1',
  activitySlots: [
    { activityKey: 'activity-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['shared-pages'] },
    { activityKey: 'activity-b', order: 2, contextRequirement: 'required', pageGroupKeys: ['shared-pages'] },
  ],
  pageGroups: [{ pageGroupKey: 'shared-pages', sourceKey: 'full', pages: [1, 2], activityKeys: ['activity-a', 'activity-b'], mode: 'activity' }],
};

const componentInput = (): LocalBookAuthoringValidationInput => {
  const pdfs = [
    { id: 'a', sourceKey: 'source-a', name: 'a.pdf', size: 10, type: 'application/pdf', lastModified: 0, blobKey: 'a' },
    { id: 'b', sourceKey: 'source-b', name: 'b.pdf', size: 10, type: 'application/pdf', lastModified: 0, blobKey: 'b' },
  ];
  const unit = (unitKey: string, activityKey: string, sourceKey: string, groupKey: string) => ({
    unitKey,
    activitySlots: [{ activityKey, order: 1, contextRequirement: 'none', pageGroupKeys: [groupKey] }],
    pageGroups: [{ pageGroupKey: groupKey, sourceKey, pages: [1], activityKeys: [activityKey], mode: 'activity' }],
  });
  const units = [unit('unit-a', 'activity-a', 'source-a', 'group-a'), unit('unit-b', 'activity-b', 'source-b', 'group-b')];
  return {
    strategy: 'component', pdfs, unitsJson: '{}',
    structureJson: JSON.stringify({ nodes: units.map(({ unitKey }, index) => ({ nodeKey: unitKey, parentNodeKey: null, nodeType: 'unit', order: index + 1 })), units }),
    pageMappingJson: JSON.stringify({ units }), pdfPageCounts: { 'source-a': 1, 'source-b': 1 },
  };
};

describe('local Book authoring edits', () => {
  it.each([{ bookId: 'foreign-book' }, { unitKey: 'foreign-unit' }])('rejects a foreign supplied target in a local Unit bundle', (identity) => {
    const payload = JSON.stringify({ ...JSON.parse(bundle()), ...identity });
    expect(() => importLocalBookUnit('', payload, manifest, 'unit-1')).toThrow(/does not target/i);
  });
  it('imports a valid Unit bundle when stored Activity text is blank', () => {
    const saved = JSON.parse(importLocalBookUnit('  ', bundle(), manifest, 'unit-1'));
    expect(saved.units).toEqual([{ unitKey: 'unit-1', slots: [
      { activityKey: 'activity-a', content: activity, evidenceRefs: [], sourceEvidenceRefs: [], answerEvidenceRefs: [] },
      { activityKey: 'activity-b', content: activity, evidenceRefs: [], sourceEvidenceRefs: [], answerEvidenceRefs: [] },
    ] }]);
  });

  it.each(['{', JSON.stringify({ units: 'not-an-array' }), JSON.stringify({ units: [], extra: true })])(
    'rejects nonempty malformed or invalid saved Activity aggregate without changing it', (storedText) => {
      expect(() => importLocalBookUnit(storedText, bundle(), manifest, 'unit-1')).toThrow(/saved Activity draft/i);
      expect(storedText).not.toBe('');
    },
  );

  it('replaces only the selected Unit when importing its Activity bundle', () => {
    const otherUnit = { unitKey: 'unit-other', slots: [{ activityKey: 'other-activity', content: { title: 'Keep me' } }] };
    const selectedUnit = { unitKey: 'unit-1', slots: [{ activityKey: 'activity-a', content: { title: 'Replace me' } }] };
    const saved = JSON.parse(importLocalBookUnit(JSON.stringify({ units: [selectedUnit, otherUnit] }), bundle(), manifest, 'unit-1'));
    expect(saved.units).toHaveLength(2);
    expect(saved.units[0].unitKey).toBe('unit-1');
    expect(saved.units[0].slots[0].content).toEqual(activity);
    expect(saved.units[1]).toEqual(otherUnit);
  });

  it('rejects invalid plan source, page, and structure while allowing missing Activity content', () => {
    const plan = planInput();
    expect(importLocalBookPlan(plan, plan.structureJson)).toContain('"unit-1"');
    expect(() => importLocalBookPlan(planInput({ pdfs: [{ ...fullPdf, sourceKey: 'other' }] }), plan.structureJson)).toThrow();
    expect(() => importLocalBookPlan(planInput({ pdfPageCounts: { full: 0 } }), plan.structureJson)).toThrow();
    expect(() => importLocalBookPlan(plan, '{')).toThrow();
  });

  it('splits a shared Page Group and preserves the other Activity reciprocal link', () => {
    const result = connectLocalBookActivity(connectedUnit, 'activity-a', [connectedUnit.pageGroups[0]!], 'optional');
    const retained = result.pageGroups.find((group) => group.activityKeys.includes('activity-b'))!;
    const replacement = result.pageGroups.find((group) => group.activityKeys.includes('activity-a'))!;
    expect(retained).toMatchObject({ pageGroupKey: 'shared-pages', activityKeys: ['activity-b'] });
    expect(replacement.pageGroupKey).not.toBe('shared-pages');
    expect(result.activitySlots.find((slot) => slot.activityKey === 'activity-b')?.pageGroupKeys).toEqual(['shared-pages']);
    expect(result.activitySlots.find((slot) => slot.activityKey === 'activity-a')?.pageGroupKeys).toEqual([replacement.pageGroupKey]);
  });

  it('keeps an edited non-shared Page Group in place and preserves other group order and identities', () => {
    const unit: BookUnitCandidate = {
      unitKey: 'unit-1',
      activitySlots: [
        { activityKey: 'activity-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['selected-pages'] },
        { activityKey: 'activity-b', order: 2, contextRequirement: 'required', pageGroupKeys: ['before-pages'] },
      ],
      pageGroups: [
        { pageGroupKey: 'before-pages', sourceKey: 'full', pages: [1], activityKeys: ['activity-b'], mode: 'activity' },
        { pageGroupKey: 'selected-pages', sourceKey: 'full', pages: [2], activityKeys: ['activity-a'], mode: 'activity' },
        { pageGroupKey: 'after-pages', sourceKey: 'full', pages: [3], activityKeys: [], mode: 'reference_only' },
      ],
    };
    const updatedGroup = { ...unit.pageGroups[1]!, pages: [4] };
    const result = connectLocalBookActivity(unit, 'activity-a', [updatedGroup], 'optional');
    expect(result.pageGroups.map((group) => group.pageGroupKey)).toEqual(['before-pages', 'selected-pages', 'after-pages']);
    expect(result.pageGroups[0]).toEqual(unit.pageGroups[0]);
    expect(result.pageGroups[1]).toEqual({ ...updatedGroup, activityKeys: ['activity-a'], mode: 'activity' });
    expect(result.pageGroups[2]).toEqual(unit.pageGroups[2]);
  });

  it('allows incremental correction with unrelated existing errors but rejects new source and page violations', () => {
    const input = planInput({
      structureJson: JSON.stringify({ nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }, { nodeKey: 'unit-2', parentNodeKey: null, nodeType: 'unit', order: 2 }], units: [
        { unitKey: 'unit-1', activitySlots: [], pageGroups: [] },
        { unitKey: 'unit-2', activitySlots: [{ activityKey: 'activity-b', order: 1, contextRequirement: 'none', pageGroupKeys: ['missing-pages'] }], pageGroups: [] },
      ] }),
      pageMappingJson: JSON.stringify({ units: [{ unitKey: 'unit-1', activitySlots: [], pageGroups: [] }, { unitKey: 'unit-2', activitySlots: [], pageGroups: [] }] }),
    });
    const correction: BookUnitCandidate = {
      unitKey: 'unit-2', activitySlots: [{ activityKey: 'activity-b', order: 1, contextRequirement: 'none', pageGroupKeys: ['pages-2'] }],
      pageGroups: [{ pageGroupKey: 'pages-2', sourceKey: 'full', pages: [2], activityKeys: ['activity-b'], mode: 'activity' }],
    };
    const patch = reviseLocalBookConnections(input, correction);
    const updated = { ...input, ...patch };
    expect(JSON.parse(updated.structureJson).units.find((unit: { unitKey: string }) => unit.unitKey === 'unit-2')).toEqual(correction);
    expect(() => reviseLocalBookConnections(updated, { ...correction, pageGroups: [{ ...correction.pageGroups[0]!, pages: [3] }] })).toThrow();

    const components = componentInput();
    const b = JSON.parse(components.structureJson).units[1];
    expect(() => reviseLocalBookConnections(components, { ...b, pageGroups: [{ ...b.pageGroups[0], sourceKey: 'source-a' }] })).toThrow();
    expect(() => reviseLocalBookConnections(components, { ...b, pageGroups: [{ ...b.pageGroups[0], pages: [2] }] })).toThrow();
  });

  it('allows a shared-group split while a same-Unit bad group shifts position', () => {
    const initialUnit: BookUnitCandidate = {
      unitKey: 'unit-1',
      activitySlots: [
        { activityKey: 'activity-a', order: 1, contextRequirement: 'none', pageGroupKeys: ['shared-pages'] },
        { activityKey: 'activity-b', order: 2, contextRequirement: 'none', pageGroupKeys: ['shared-pages'] },
      ],
      pageGroups: [
        { pageGroupKey: 'shared-pages', sourceKey: 'full', pages: [1], activityKeys: ['activity-a', 'activity-b'], mode: 'activity' },
        { pageGroupKey: 'preexisting-bad-pages', sourceKey: 'full', pages: [3], activityKeys: [], mode: 'reference_only' },
      ],
    };
    const input = planInput({
      structureJson: JSON.stringify({ nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }], units: [initialUnit] }),
      pageMappingJson: JSON.stringify({ units: [initialUnit] }),
    });
    const correctedUnit: BookUnitCandidate = {
      unitKey: 'unit-1',
      activitySlots: [
        { activityKey: 'activity-a', order: 1, contextRequirement: 'none', pageGroupKeys: ['activity-a-pages'] },
        { activityKey: 'activity-b', order: 2, contextRequirement: 'none', pageGroupKeys: ['shared-pages'] },
      ],
      pageGroups: [
        initialUnit.pageGroups[1]!,
        { pageGroupKey: 'shared-pages', sourceKey: 'full', pages: [1], activityKeys: ['activity-b'], mode: 'activity' },
        { pageGroupKey: 'activity-a-pages', sourceKey: 'full', pages: [2], activityKeys: ['activity-a'], mode: 'activity' },
      ],
    };
    const patch = reviseLocalBookConnections(input, correctedUnit);
    expect(JSON.parse(patch.structureJson).units[0]).toEqual(correctedUnit);
    expect(patch.structureJson).toContain('preexisting-bad-pages');
  });
});
