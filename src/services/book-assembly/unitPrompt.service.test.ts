import { describe, expect, it } from 'vitest';
import type { EditableActivity } from '../../types/bookActivity.types';
import type { BookAssemblyManifestCandidate, TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import { validateEditableActivity } from '../book-activity/activitySchema.service';
import { normalizeActivity } from '../book-activity/activityCanonical.service';
import { projectStudentActivity } from '../book-activity/activityProjection.service';
import { bookActivityRendererRegistry } from '../book-activity/runtime/activityRendererRegistry';
import {
  buildBulkUnitActivityImportPrompt,
  buildUnitActivityImportPrompt,
  BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
  UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
} from './unitPrompt.service';

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { sourceKey: 'full', bookId: 'book-1', sourceVersionId: 'source-secret-version', purpose: 'book-source', studentSafeStatus: 'ready', studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-08-11T00:02:00.000Z', sourceVersionId: 'source-secret-version', sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed' }, physicalPageCount: 48, verifiedUsable: true },
];

const manifest: BookAssemblyManifestCandidate = {
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-secret-version', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-choice',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-full-2-3-activity'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-full-2-3-activity',
      sourceKey: 'full',
      pages: [2, 3],
      defaultPhysicalPageNumber: 2,
      activityKeys: ['activity-choice'],
      mode: 'activity',
    }],
  }],
};

const sourceAssisted: EditableActivity = {
  schemaVersion: 1,
  title: 'Activity title',
  taskProfile: { taxonomyId: 'ielts-reading', typeId: 'reading-multiple-choice', taxonomyVersion: 1 },
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read the mapped pages.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single-select' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{ prompt: 'Choose one.', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' },
};

const promptContract = (prompt: string): unknown => {
  const jsonStart = prompt.indexOf('{');
  const jsonEnd = prompt.indexOf('\n\nRules:');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('Prompt contract JSON not found.');
  return JSON.parse(prompt.slice(jsonStart, jsonEnd));
};

describe('buildUnitActivityImportPrompt', () => {
  it('serializes exact Unit slot, source, evidence, profile, and presentation guidance', () => {
    const prompt = buildUnitActivityImportPrompt({
      bookTitle: 'Fixture Book',
      manifest,
      unitKey: 'unit-1',
      sourceVersions,
    });

    expect(prompt).toContain(UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION);
    expect(prompt).toContain('"unitKey": "unit-1"');
    expect(prompt).toContain('"activityKey": "activity-choice"');
    expect(prompt).toContain('"sourceStrategy": "full_pdf"');
    expect(prompt).toContain('"source:full:page:2"');
    expect(prompt).toContain('taskProfile may be null');
    expect(prompt).toContain('source-assisted mode');
    expect(prompt).toContain('one interaction family');
    const contract = promptContract(prompt) as {
      schemaVersion: string;
      promptVersion: string;
      unit: {
        sourceStrategy: string;
        activitySlots: unknown;
        allowedEvidenceRefs: unknown;
      };
      supportedActivityContract: {
        families: Array<{ family: string; variants: string[] }>;
        presentationExamples: unknown;
      };
    };
    expect({
      schemaVersion: contract.schemaVersion,
      promptVersion: contract.promptVersion,
      sourceStrategy: contract.unit.sourceStrategy,
      activitySlots: contract.unit.activitySlots,
      allowedEvidenceRefs: contract.unit.allowedEvidenceRefs,
      families: contract.supportedActivityContract.families.map(({ family, variants }) => ({ family, variants })),
      presentationExamples: contract.supportedActivityContract.presentationExamples,
    }).toMatchInlineSnapshot(`
      {
        "activitySlots": [
          {
            "activityKey": "activity-choice",
            "allowedAnswerEvidenceRefs": [
              "import:activity-choice",
              "pageGroup:pages-full-2-3-activity",
              "source:full:page:2",
              "source:full:page:3",
            ],
            "allowedEvidenceRefs": [
              "import:activity-choice",
              "pageGroup:pages-full-2-3-activity",
              "source:full:page:2",
              "source:full:page:3",
            ],
            "allowedSourceEvidenceRefs": [
              "import:activity-choice",
              "pageGroup:pages-full-2-3-activity",
              "source:full:page:2",
              "source:full:page:3",
            ],
            "contextRequirement": "required",
            "order": 1,
            "pageGroupKeys": [
              "pages-full-2-3-activity",
            ],
          },
        ],
        "allowedEvidenceRefs": [
          "pageGroup:pages-full-2-3-activity",
          "source:full:page:2",
          "source:full:page:3",
        ],
        "families": [
          {
            "family": "choice",
            "variants": [
              "single-select",
              "multi-select",
            ],
          },
          {
            "family": "text-entry",
            "variants": [
              "short-text",
              "sentence-completion",
            ],
          },
          {
            "family": "matching",
            "variants": [
              "matching-pairs",
            ],
          },
          {
            "family": "ordering",
            "variants": [
              "sequence",
            ],
          },
          {
            "family": "long-response",
            "variants": [
              "draft-response",
              "v1",
            ],
          },
        ],
        "presentationExamples": [
          {
            "contextRequirement": "mode "none" with acceptedKinds [], OR mode "optional" with acceptedKinds ["book-pages"]; omit interactions[].sourceAssisted",
            "presentationMode": "structured",
            "useWhen": "slot.contextRequirement is none or optional",
          },
          {
            "contextRequirement": "mode "required" with acceptedKinds ["book-pages"]; every interaction MUST include sourceAssisted: { questionLabel, accessiblePrompt, responseShape, sourceExerciseLabel } with unique questionLabel values",
            "presentationMode": "source-assisted",
            "useWhen": "slot.contextRequirement is required",
          },
        ],
        "promptVersion": "book-unit-json-v1",
        "schemaVersion": "prd0062.unit_activity_import.v1",
        "sourceStrategy": "full_pdf",
      }
    `);
  });

  it('serializes component-PDF source strategy without leaking Source Version IDs', () => {
    const prompt = buildUnitActivityImportPrompt({
      bookTitle: 'Fixture Book',
      manifest: {
        ...manifest,
        sourceSet: {
          sourceStrategy: 'component_pdfs',
          sources: [{ sourceKey: 'component-a', sourceVersionId: 'source-secret-version', sourceOrder: 1, ownerNodeKey: 'section-1' }],
        },
        units: [{
          ...manifest.units[0]!,
          pageGroups: [{
            ...manifest.units[0]!.pageGroups[0]!,
            sourceKey: 'component-a',
          }],
        }],
      },
      unitKey: 'unit-1',
      sourceVersions,
    });

    expect(prompt).toContain('"sourceStrategy": "component_pdfs"');
    expect(prompt).toContain('"sourceKey": "component-a"');
    expect(prompt).toContain(UNIT_ACTIVITY_IMPORT_PROMPT_VERSION);
    expect(prompt).toContain('"source:component-a:page:2"');
    expect(prompt).not.toContain('ownerNodeKey');
    expect(prompt).not.toContain('source-secret-version');
  });

  it('forbids editable authority and executable output while keeping examples JSON-only', () => {
    const prompt = buildUnitActivityImportPrompt({
      bookTitle: 'Fixture Book',
      manifest: {
        ...manifest,
        units: [{
          ...manifest.units[0]!,
          activitySlots: [{
            ...manifest.units[0]!.activitySlots[0]!,
            activityKey: 'activity-long-response',
          }],
        }],
      },
      unitKey: 'unit-1',
      sourceVersions,
    });

    expect(prompt).toContain('hidden IDs');
    expect(prompt).toContain('provider object keys');
    expect(prompt).toContain('custom components');
    expect(prompt).toContain('review-required for long-response');
    expect(prompt).not.toContain('providerObjectKey');
    expect(prompt).not.toContain('https://');
    expect(sourceAssisted.presentationMode).toBe('source-assisted');
  });
});

describe('buildBulkUnitActivityImportPrompt', () => {
  it('builds one compact multi-unit prompt covering requested units without leaking sourceVersionId', () => {
    const multiUnitManifest: BookAssemblyManifestCandidate = {
      ...manifest,
      nodes: [
        { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
        { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
        { nodeKey: 'unit-2', parentNodeKey: 'section-1', nodeType: 'unit', order: 2 },
      ],
      units: [
        manifest.units[0]!,
        {
          unitKey: 'unit-2',
          activitySlots: [{ activityKey: 'u2-act-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['u2-p5'] }],
          pageGroups: [{ pageGroupKey: 'u2-p5', sourceKey: 'full', pages: [5], defaultPhysicalPageNumber: 5, activityKeys: ['u2-act-1'], mode: 'activity' }],
        },
      ],
    };
    const prompt = buildBulkUnitActivityImportPrompt({
      bookTitle: 'Collins Listening',
      manifest: multiUnitManifest,
      unitKeys: ['unit-1', 'unit-2'],
      sourceVersions,
    });
    expect(prompt).toContain(BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION);
    expect(prompt).toContain(BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION);
    expect(prompt).toContain('"unitKey": "unit-1"');
    expect(prompt).toContain('"unitKey": "unit-2"');
    expect(prompt).toContain('"activityKey": "u2-act-1"');
    expect(prompt).not.toContain('source-secret-version');

    const contract = promptContract(prompt) as {
      units: Array<{ unitKey: string; activitySlots: Array<{ activityKey: string; allowedEvidenceRefs: string[] }> }>;
    };
    const u2Slot = contract.units.find((u) => u.unitKey === 'unit-2')?.activitySlots[0];
    expect(u2Slot?.allowedEvidenceRefs).toEqual(['import:u2-act-1', 'pageGroup:u2-p5', 'source:full:page:5']);

    const filteredPrompt = buildBulkUnitActivityImportPrompt({
      bookTitle: 'Collins Listening',
      manifest: multiUnitManifest,
      unitKeys: ['unit-2'],
      sourceVersions,
    });
    expect(filteredPrompt).not.toContain('"unitKey": "unit-1"');
    expect(filteredPrompt).toContain('"unitKey": "unit-2"');
  });

  it.each(['required', 'optional', 'none'] as const)(
    'generates schema-valid and renderer-supported examples in both single-unit and bulk prompts for contextRequirement=%s',
    (contextRequirement) => {
      const testManifest: BookAssemblyManifestCandidate = {
        ...manifest,
        units: [{
          unitKey: 'unit-1',
          activitySlots: [{
            activityKey: 'activity-slot-1',
            order: 1,
            contextRequirement,
            pageGroupKeys: contextRequirement === 'none' ? [] : ['pages-full-2-3-activity'],
          }],
          pageGroups: contextRequirement === 'none'
            ? []
            : [{
              pageGroupKey: 'pages-full-2-3-activity',
              sourceKey: 'full',
              pages: [2, 3],
              defaultPhysicalPageNumber: 2,
              activityKeys: ['activity-slot-1'],
              mode: 'activity',
            }],
        }],
      };
      const mappedBookPageRefs = contextRequirement === 'none'
        ? []
        : ['source:full:page:2', 'source:full:page:3'];
      const single = promptContract(buildUnitActivityImportPrompt({
        bookTitle: 'Fixture Book',
        manifest: testManifest,
        unitKey: 'unit-1',
        sourceVersions,
      })) as { outputBundleShape: { slots: Array<{ content: unknown }> } };
      const bulk = promptContract(buildBulkUnitActivityImportPrompt({
        bookTitle: 'Fixture Book',
        manifest: testManifest,
        sourceVersions,
      })) as { outputBundleShape: { units: Array<{ slots: Array<{ content: unknown }> }> } };

      for (const content of [
        single.outputBundleShape.slots[0]!.content,
        bulk.outputBundleShape.units[0]!.slots[0]!.content,
      ]) {
        const validation = validateEditableActivity(content, { mappedBookPageRefs });
        expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
        if (!validation.valid) continue;
        let seq = 0;
        const normalized = normalizeActivity(validation.value, { createId: () => `id-${++seq}` }, undefined, { mappedBookPageRefs });
        const resolution = bookActivityRendererRegistry.resolve(projectStudentActivity(normalized), {
          surface: 'student-runtime',
          mode: 'editable',
          sourceContext: { available: true, description: 'Mapped page 2.' },
        });
        expect(resolution.supported).toBe(true);
      }
    },
  );

  it('documents the 64-ref evidence cap and separates teacher_only refs from allowedSourceEvidenceRefs in single and bulk prompts', () => {
    const manifestWithTeacherOnly: BookAssemblyManifestCandidate = {
      ...manifest,
      units: [{
        ...manifest.units[0]!,
        pageGroups: [
          ...manifest.units[0]!.pageGroups,
          { pageGroupKey: 'u1-transcript', sourceKey: 'full', pages: [4], defaultPhysicalPageNumber: 4, activityKeys: [], mode: 'reference_only' },
          { pageGroupKey: 'u1-answer-key', sourceKey: 'full', pages: [5], defaultPhysicalPageNumber: 5, activityKeys: [], mode: 'teacher_only' },
        ],
      }],
    };
    const singlePrompt = buildUnitActivityImportPrompt({
      bookTitle: 'Fixture Book',
      manifest: manifestWithTeacherOnly,
      unitKey: 'unit-1',
      sourceVersions,
    });
    const bulkPrompt = buildBulkUnitActivityImportPrompt({
      bookTitle: 'Fixture Book',
      manifest: manifestWithTeacherOnly,
      sourceVersions,
    });

    for (const promptText of [singlePrompt, bulkPrompt]) {
      expect(promptText).toContain('at most 64 unique entries');
      expect(promptText).toContain('teacher_only');
      const parsed = promptContract(promptText) as {
        supportedActivityContract: { maxEvidenceRefsPerField: number };
        unit?: { activitySlots: Array<{ allowedSourceEvidenceRefs: string[]; allowedAnswerEvidenceRefs: string[] }> };
        units?: Array<{ activitySlots: Array<{ allowedSourceEvidenceRefs: string[]; allowedAnswerEvidenceRefs: string[] }> }>;
      };
      expect(parsed.supportedActivityContract.maxEvidenceRefsPerField).toBe(64);
      const slot = parsed.unit?.activitySlots[0] ?? parsed.units?.[0]?.activitySlots[0];
      expect(slot?.allowedSourceEvidenceRefs).toContain('pageGroup:u1-transcript');
      expect(slot?.allowedSourceEvidenceRefs).not.toContain('pageGroup:u1-answer-key');
      expect(slot?.allowedSourceEvidenceRefs).not.toContain('source:full:page:5');
      expect(slot?.allowedAnswerEvidenceRefs).toContain('pageGroup:u1-answer-key');
      expect(slot?.allowedAnswerEvidenceRefs).toContain('source:full:page:5');
    }
  });
});
