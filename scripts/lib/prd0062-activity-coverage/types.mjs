export const SUPPORT_STATES = Object.freeze([
  'structurally-supported',
  'source-assisted-supported',
  'release-blocking-unsupported',
  'approved-deferral',
]);

export const RUNTIME_IMPLEMENTATION_STATES = Object.freeze(['planned', 'registered']);

export const CANONICAL_VARIANTS_BY_FAMILY = Object.freeze({
  choice: Object.freeze([
    'shared-option-bank',
    'diagram-label-choice',
    'judgement-tfng',
    'judgement-ynng',
    'single-choice',
    'multiple-choice',
    'map-plan-letter-choice',
    'diagram-label-letter-choice',
    'summary-dropdown-list',
  ]),
  'text-entry': Object.freeze([
    'inline-blank',
    'summary-blank',
    'note-blank',
    'table-cell-blank',
    'flow-node-blank',
    'diagram-label-text',
    'short-answer',
    'map-plan-typed',
    'form-field',
  ]),
  matching: Object.freeze([
    'heading-to-section',
    'statement-to-section',
    'feature-assignment',
    'sentence-ending-pair',
    'audio-option-assignment',
  ]),
});

export const CANONICAL_GENERIC_VARIANTS_BY_FAMILY = Object.freeze({
  ...CANONICAL_VARIANTS_BY_FAMILY,
  ordering: Object.freeze(['v1']),
  'long-response': Object.freeze(['v1']),
});

export const CANONICAL_COVERAGE_ROW_KEYS = Object.freeze([
  'ielts-reading|sentence-completion|1|text-entry|inline-blank',
  'ielts-reading|summary-completion-text|1|text-entry|summary-blank',
  'ielts-reading|summary-completion-list|1|choice|shared-option-bank',
  'ielts-reading|note-completion|1|text-entry|note-blank',
  'ielts-reading|table-completion|1|text-entry|table-cell-blank',
  'ielts-reading|flowchart-completion|1|text-entry|flow-node-blank',
  'ielts-reading|diagram-labeling|1|choice|diagram-label-choice',
  'ielts-reading|diagram-labeling|1|text-entry|diagram-label-text',
  'ielts-reading|true-false-not-given|1|choice|judgement-tfng',
  'ielts-reading|yes-no-not-given|1|choice|judgement-ynng',
  'ielts-reading|matching-headings|1|matching|heading-to-section',
  'ielts-reading|matching-information|1|matching|statement-to-section',
  'ielts-reading|matching-features|1|matching|feature-assignment',
  'ielts-reading|matching-sentence-endings|1|matching|sentence-ending-pair',
  'ielts-reading|multiple-choice|1|choice|single-choice',
  'ielts-reading|multiple-select|1|choice|multiple-choice',
  'ielts-reading|short-answer|1|text-entry|short-answer',
  'ielts-listening|listening-multiple-choice-single|1|choice|single-choice',
  'ielts-listening|listening-multiple-choice-multiple|1|choice|multiple-choice',
  'ielts-listening|listening-matching|1|matching|audio-option-assignment',
  'ielts-listening|listening-map-plan-labelling|1|choice|map-plan-letter-choice',
  'ielts-listening|listening-map-plan-labelling|1|text-entry|map-plan-typed',
  'ielts-listening|listening-diagram-labelling|1|text-entry|diagram-label-text',
  'ielts-listening|listening-diagram-labelling|1|choice|diagram-label-letter-choice',
  'ielts-listening|listening-form-completion|1|text-entry|form-field',
  'ielts-listening|listening-note-completion|1|text-entry|note-blank',
  'ielts-listening|listening-table-completion|1|text-entry|table-cell-blank',
  'ielts-listening|listening-flowchart-completion|1|text-entry|flow-node-blank',
  'ielts-listening|listening-summary-completion|1|text-entry|summary-blank',
  'ielts-listening|listening-summary-completion|1|choice|summary-dropdown-list',
  'ielts-listening|listening-sentence-completion|1|text-entry|inline-blank',
  'ielts-listening|listening-short-answer|1|text-entry|short-answer',
]);

// Activity schema has no codec field. This generic coverage contract is deliberately
// independent of any IELTS profile; each codec names its Activity family and version.
export const RESPONSE_CODECS = Object.freeze({
  'choice-single-v1': 'choice',
  'choice-multiple-v1': 'choice',
  'text-entry-v1': 'text-entry',
  'matching-pairs-v1': 'matching',
  'ordering-v1': 'ordering',
  'long-response-v1': 'long-response',
});

export const SUPPORTED_STATES = new Set([
  'structurally-supported',
  'source-assisted-supported',
]);
