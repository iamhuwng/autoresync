import { describe, expect, it } from 'vitest';
import type { EditableActivity } from '../../types/bookActivity.types';
import type { BookAssemblyManifestCandidate, TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import { buildUnitActivityImportPrompt, UNIT_ACTIVITY_IMPORT_PROMPT_VERSION, UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION } from './unitPrompt.service';

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { bookId: 'book-1', sourceVersionId: 'source-secret-version', physicalPageCount: 48, verifiedUsable: true },
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
              "short-answer",
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
            ],
          },
        ],
        "presentationExamples": [
          {
            "presentationMode": "structured",
            "useWhen": "standalone prompt can be answered without viewing mapped book pages",
          },
          {
            "presentationMode": "source-assisted",
            "useWhen": "student must use mapped pageGroup/source page evidence",
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
