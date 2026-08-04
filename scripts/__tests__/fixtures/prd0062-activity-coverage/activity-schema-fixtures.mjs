const text = (prompt, acceptedAnswers = ['answer']) => ({ prompt, acceptedAnswers });
const choice = (prompt, acceptedOptionIndexes = [0]) => ({ prompt, options: ['A', 'B', 'C'], acceptedOptionIndexes });
const matching = (prompt) => ({ prompt, leftItems: ['Item'], rightItems: ['A'], acceptedPairs: [{ left: 'Item', right: 'A' }] });

const activity = ({ profile, family, variant, presentationMode, contextRequirement, assetKinds, interaction, multiple = false, reuse = false }) => ({
  schemaVersion: 1,
  title: `${profile.typeId} fixture`,
  taskProfile: profile,
  presentationMode,
  contextRequirement,
  instructions: [{ text: 'Answer every item.' }],
  stimulus: presentationMode === 'source-assisted' ? null : { kind: 'fixture-stimulus', text: 'Concrete fixture stimulus.' },
  assetRefs: assetKinds.map((kind) => ({ kind, assetId: `fixture-${kind}` })),
  interaction: { family, variant },
  answerRule: {
    defaultPoints: 1,
    normalization: 'trim-case-and-spacing',
    ...(multiple ? { requiredSelectionCount: 2 } : {}),
    ...(reuse ? { allowOptionReuse: true } : {}),
  },
  interactions: [{
    ...(family === 'choice' ? choice('Choose answer.', multiple ? [0, 1] : [0]) : family === 'matching' ? matching('Match item.') : text('Type answer.')),
    ...(presentationMode === 'source-assisted' ? { sourceAssisted: { questionLabel: '1', accessiblePrompt: 'Answer item 1 from source page.', responseShape: family === 'choice' ? (multiple ? 'multiple-choice' : 'single-choice') : 'short-text', sourceExerciseLabel: 'Fixture exercise' } } : {}),
  }],
  scoring: { mode: 'auto-where-possible' },
});

const fixture = ({ fixtureId, profile, family, variant, presentationMode, contextRequirement, stimulusNeeds, assetKinds, accessibilityRepresentations, multiple, reuse }) => ({
  [fixtureId]: {
    coverage: { stimulusNeeds, assetKinds, contextRequirement, accessibilityRepresentations },
    activity: activity({ profile, family, variant, presentationMode, contextRequirement, assetKinds, multiple, reuse }),
  },
});

const reading = (typeId) => ({ taxonomyId: 'ielts-reading', typeId, taxonomyVersion: 1 });
const listening = (typeId) => ({ taxonomyId: 'ielts-listening', typeId, taxonomyVersion: 1 });
const pages = { mode: 'required', acceptedKinds: ['book-pages'] };
const audio = { mode: 'required', acceptedKinds: ['audio'] };
const audioPages = { mode: 'required', acceptedKinds: ['audio', 'book-pages'] };
const structured = 'structured';
const source = 'source-assisted';

export const ACTIVITY_SCHEMA_FIXTURES = Object.freeze({
  ...fixture({ fixtureId: 'reading-sentence-completion', profile: reading('sentence-completion'), family: 'text-entry', variant: 'inline-blank', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text'], assetKinds: [], accessibilityRepresentations: ['numbered-text-input', 'programmatic-question-label'] }),
  ...fixture({ fixtureId: 'reading-summary-text', profile: reading('summary-completion-text'), family: 'text-entry', variant: 'summary-blank', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-summary'], assetKinds: [], accessibilityRepresentations: ['ordered-summary-inputs', 'programmatic-question-label'] }),
  ...fixture({ fixtureId: 'reading-summary-list', profile: reading('summary-completion-list'), family: 'choice', variant: 'shared-option-bank', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-summary', 'option-bank'], assetKinds: [], accessibilityRepresentations: ['radiogroup', 'programmatic-question-label'] }),
  ...fixture({ fixtureId: 'reading-note', profile: reading('note-completion'), family: 'text-entry', variant: 'note-blank', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-notes'], assetKinds: [], accessibilityRepresentations: ['ordered-note-inputs', 'programmatic-question-label'] }),
  ...fixture({ fixtureId: 'reading-table-source-assisted', profile: reading('table-completion'), family: 'text-entry', variant: 'table-cell-blank', presentationMode: source, contextRequirement: pages, stimulusNeeds: ['book-pages'], assetKinds: [], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata'] }),
  ...fixture({ fixtureId: 'reading-flowchart-source-assisted', profile: reading('flowchart-completion'), family: 'text-entry', variant: 'flow-node-blank', presentationMode: source, contextRequirement: pages, stimulusNeeds: ['book-pages'], assetKinds: [], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata'] }),
  ...fixture({ fixtureId: 'reading-diagram-choice-source-assisted', profile: reading('diagram-labeling'), family: 'choice', variant: 'diagram-label-choice', presentationMode: source, contextRequirement: pages, stimulusNeeds: ['book-pages', 'image-asset'], assetKinds: ['image'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'descriptive-image-alt'] }),
  ...fixture({ fixtureId: 'reading-diagram-typed-source-assisted', profile: reading('diagram-labeling'), family: 'text-entry', variant: 'diagram-label-text', presentationMode: source, contextRequirement: pages, stimulusNeeds: ['book-pages', 'image-asset'], assetKinds: ['image'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'descriptive-image-alt'] }),
  ...fixture({ fixtureId: 'reading-tfng', profile: reading('true-false-not-given'), family: 'choice', variant: 'judgement-tfng', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text'], assetKinds: [], accessibilityRepresentations: ['radiogroup', 'locked-vocabulary-label'] }),
  ...fixture({ fixtureId: 'reading-ynng', profile: reading('yes-no-not-given'), family: 'choice', variant: 'judgement-ynng', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text'], assetKinds: [], accessibilityRepresentations: ['radiogroup', 'locked-vocabulary-label'] }),
  ...fixture({ fixtureId: 'reading-matching-headings', profile: reading('matching-headings'), family: 'matching', variant: 'heading-to-section', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text', 'option-bank'], assetKinds: [], accessibilityRepresentations: ['labelled-selects', 'programmatic-pair-labels'], reuse: true }),
  ...fixture({ fixtureId: 'reading-matching-information', profile: reading('matching-information'), family: 'matching', variant: 'statement-to-section', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text', 'option-bank'], assetKinds: [], accessibilityRepresentations: ['labelled-selects', 'programmatic-pair-labels'], reuse: true }),
  ...fixture({ fixtureId: 'reading-matching-features', profile: reading('matching-features'), family: 'matching', variant: 'feature-assignment', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text', 'option-bank'], assetKinds: [], accessibilityRepresentations: ['labelled-selects', 'programmatic-pair-labels'], reuse: true }),
  ...fixture({ fixtureId: 'reading-matching-endings', profile: reading('matching-sentence-endings'), family: 'matching', variant: 'sentence-ending-pair', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text', 'option-bank'], assetKinds: [], accessibilityRepresentations: ['labelled-selects', 'programmatic-pair-labels'] }),
  ...fixture({ fixtureId: 'reading-mcq', profile: reading('multiple-choice'), family: 'choice', variant: 'single-choice', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text', 'option-bank'], assetKinds: [], accessibilityRepresentations: ['radiogroup', 'option-labels'] }),
  ...fixture({ fixtureId: 'reading-multi-select', profile: reading('multiple-select'), family: 'choice', variant: 'multiple-choice', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text', 'option-bank'], assetKinds: [], accessibilityRepresentations: ['checkbox-group', 'selection-count-text'], multiple: true }),
  ...fixture({ fixtureId: 'reading-short-answer', profile: reading('short-answer'), family: 'text-entry', variant: 'short-answer', presentationMode: structured, contextRequirement: pages, stimulusNeeds: ['embedded-text'], assetKinds: [], accessibilityRepresentations: ['numbered-text-input', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-mcq-single', profile: listening('listening-multiple-choice-single'), family: 'choice', variant: 'single-choice', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'option-bank'], assetKinds: ['audio'], accessibilityRepresentations: ['radiogroup', 'audio-transcript-independent-label'] }),
  ...fixture({ fixtureId: 'listening-mcq-multiple', profile: listening('listening-multiple-choice-multiple'), family: 'choice', variant: 'multiple-choice', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'option-bank'], assetKinds: ['audio'], accessibilityRepresentations: ['checkbox-group', 'selection-count-text'], multiple: true }),
  ...fixture({ fixtureId: 'listening-matching', profile: listening('listening-matching'), family: 'matching', variant: 'audio-option-assignment', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'option-bank'], assetKinds: ['audio'], accessibilityRepresentations: ['labelled-selects', 'reuse-rule-text'], reuse: true }),
  ...fixture({ fixtureId: 'listening-map-plan-letter-source-assisted', profile: listening('listening-map-plan-labelling'), family: 'choice', variant: 'map-plan-letter-choice', presentationMode: source, contextRequirement: audioPages, stimulusNeeds: ['audio-asset', 'book-pages', 'image-asset'], assetKinds: ['audio', 'image'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'descriptive-image-alt'] }),
  ...fixture({ fixtureId: 'listening-map-plan-typed-source-assisted', profile: listening('listening-map-plan-labelling'), family: 'text-entry', variant: 'map-plan-typed', presentationMode: source, contextRequirement: audioPages, stimulusNeeds: ['audio-asset', 'book-pages', 'image-asset'], assetKinds: ['audio', 'image'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'descriptive-image-alt', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-diagram-typed-source-assisted', profile: listening('listening-diagram-labelling'), family: 'text-entry', variant: 'diagram-label-text', presentationMode: source, contextRequirement: audioPages, stimulusNeeds: ['audio-asset', 'book-pages', 'image-asset'], assetKinds: ['audio', 'image'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'descriptive-image-alt', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-diagram-letter-source-assisted', profile: listening('listening-diagram-labelling'), family: 'choice', variant: 'diagram-label-letter-choice', presentationMode: source, contextRequirement: audioPages, stimulusNeeds: ['audio-asset', 'book-pages', 'image-asset'], assetKinds: ['audio', 'image'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'descriptive-image-alt'] }),
  ...fixture({ fixtureId: 'listening-form', profile: listening('listening-form-completion'), family: 'text-entry', variant: 'form-field', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'embedded-form'], assetKinds: ['audio'], accessibilityRepresentations: ['labelled-form-input', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-note', profile: listening('listening-note-completion'), family: 'text-entry', variant: 'note-blank', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'embedded-notes'], assetKinds: ['audio'], accessibilityRepresentations: ['ordered-note-inputs', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-table-source-assisted', profile: listening('listening-table-completion'), family: 'text-entry', variant: 'table-cell-blank', presentationMode: source, contextRequirement: audioPages, stimulusNeeds: ['audio-asset', 'book-pages'], assetKinds: ['audio'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-flowchart-source-assisted', profile: listening('listening-flowchart-completion'), family: 'text-entry', variant: 'flow-node-blank', presentationMode: source, contextRequirement: audioPages, stimulusNeeds: ['audio-asset', 'book-pages'], assetKinds: ['audio'], accessibilityRepresentations: ['labelled-answer-rows', 'source-correspondence-metadata', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-summary-typed', profile: listening('listening-summary-completion'), family: 'text-entry', variant: 'summary-blank', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'embedded-summary'], assetKinds: ['audio'], accessibilityRepresentations: ['ordered-summary-inputs', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-summary-dropdown-list', profile: listening('listening-summary-completion'), family: 'choice', variant: 'summary-dropdown-list', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'embedded-summary', 'option-bank'], assetKinds: ['audio'], accessibilityRepresentations: ['labelled-selects', 'option-labels'] }),
  ...fixture({ fixtureId: 'listening-sentence', profile: listening('listening-sentence-completion'), family: 'text-entry', variant: 'inline-blank', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'embedded-text'], assetKinds: ['audio'], accessibilityRepresentations: ['numbered-text-input', 'word-limit-text'] }),
  ...fixture({ fixtureId: 'listening-short-answer', profile: listening('listening-short-answer'), family: 'text-entry', variant: 'short-answer', presentationMode: structured, contextRequirement: audio, stimulusNeeds: ['audio-asset', 'embedded-text'], assetKinds: ['audio'], accessibilityRepresentations: ['numbered-text-input', 'word-limit-text'] }),
});
