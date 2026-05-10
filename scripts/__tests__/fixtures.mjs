export function createCanonicalTableGroup(overrides = {}) {
  return {
    schemaVersion: 1,
    groupId: 'table-group-1',
    taskType: 'table-completion',
    passageId: 'passage-1',
    questionRange: { start: 18, end: 18 },
    sharedContent: {
      instructionText: 'Complete the table below.',
      answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
      constraints: { maxWords: 2 },
      caption: 'Medicinal plants',
    },
    columns: [
      { columnId: 'column-1', order: 0 },
      { columnId: 'column-2', order: 1 },
    ],
    rows: [
      { rowId: 'row-header-1', order: 0, cellIds: ['cell-header-1', 'cell-header-2'] },
      { rowId: 'row-1', order: 1, cellIds: ['cell-row-header', 'cell-1'] },
    ],
    cells: [
      {
        cellId: 'cell-header-1',
        rowId: 'row-header-1',
        columnId: 'column-1',
        rowSpan: 1,
        colSpan: 1,
        role: 'column-header',
        segments: [{ kind: 'text', text: 'Plant Species' }],
      },
      {
        cellId: 'cell-header-2',
        rowId: 'row-header-1',
        columnId: 'column-2',
        rowSpan: 1,
        colSpan: 1,
        role: 'column-header',
        segments: [{ kind: 'text', text: 'Native Region' }],
      },
      {
        cellId: 'cell-row-header',
        rowId: 'row-1',
        columnId: 'column-1',
        rowSpan: 1,
        colSpan: 1,
        role: 'row-header',
        segments: [{ kind: 'text', text: 'Ginkgo Biloba' }],
      },
      {
        cellId: 'cell-1',
        rowId: 'row-1',
        columnId: 'column-2',
        rowSpan: 1,
        colSpan: 1,
        role: 'body',
        segments: [
          { kind: 'text', text: 'Native region ' },
          { kind: 'blank-anchor', anchorId: 'anchor-18' },
        ],
      },
    ],
    blanks: [
      {
        blankId: 'blank-18',
        questionNumber: 18,
        anchorId: 'anchor-18',
        cellId: 'cell-1',
        canonicalOrder: 0,
        acceptedAnswers: ['China'],
        constraints: { maxWords: 2 },
        breadcrumb: {
          rowHeaders: ['Ginkgo Biloba'],
          columnHeaders: ['Native Region'],
        },
      },
    ],
    provenance: {
      sourceWorkflow: 'script-material',
      sourceShape: 'html-table',
      rawExcerpt: '<table>teacher only</table>',
      normalizationVersion: 1,
      confidence: 0.91,
      warnings: ['inferred-headers'],
      canonicalRevisionHash: 'rev-1',
    },
    canonicalReadingOrder: ['blank-18'],
    ...overrides,
  };
}

export function createTableCompletionDiagnostic(overrides = {}) {
  return {
    groupId: 'table-group-1',
    questionRange: { start: 18, end: 18 },
    parseMode: 'deterministic',
    sourceWorkflow: 'script-material',
    sourceShape: 'html-table',
    validationSeverity: 'acknowledgement-required',
    issueCodes: ['inferred-headers'],
    issues: [
      {
        code: 'inferred-headers',
        severity: 'acknowledgement-required',
        message: 'Headers were inferred.',
      },
    ],
    unsupportedRepairState: 'acknowledgement-required',
    missingSemanticBreadcrumbs: false,
    canonicalRevisionHash: 'rev-1',
    hasCanonicalGroup: true,
    ...overrides,
  };
}

export function createMaterial(overrides = {}) {
  const questionGroup = createCanonicalTableGroup();

  return {
    sourceFile: 'Practice Cam 17 Reading Test 04.md',
    title: 'Cam 17 Reading Test 04 - Passage 1',
    metadata: {
      title: 'Cam 17 Reading Test 04 - Passage 1',
      type: 'IELTS',
      skill: 'Reading',
      duration: 20,
      difficulty: 'Advanced',
      description: 'Bat study',
      tags: ['IELTS', 'Reading'],
    },
    passages: [
      {
        id: 'passage-1',
        title: 'Bat study',
        content: 'Passage content',
        type: 'text',
        wordCount: 2,
        questionStart: 18,
        questionEnd: 18,
      },
    ],
    questions: [
      {
        number: 18,
        questionNumber: 18,
        questionText: 'stale question text',
        question: 'stale question text',
        type: 'table-completion',
        answer: 'China',
        passageId: 'passage-1',
        points: 1,
      },
    ],
    questionGroups: [questionGroup],
    tableCompletionDiagnostics: [createTableCompletionDiagnostic()],
    ...overrides,
  };
}
