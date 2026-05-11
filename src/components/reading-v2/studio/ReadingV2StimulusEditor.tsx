import {
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2AnchorId,
  type ReadingV2Document,
  type ReadingV2StimulusNode,
} from '../../../types/readingV2.types';

export interface ReadingV2StimulusEditorProps {
  readonly document: ReadingV2Document;
  readonly selectedStimulusId?: string;
  readonly teacherFacing?: boolean;
  readonly onDocumentChange: (document: ReadingV2Document) => void;
}

const nextLocalId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}`;

const updateStimulus = (
  document: ReadingV2Document,
  stimulus: ReadingV2StimulusNode,
): ReadingV2Document => ({
  ...document,
  stimuli: {
    ...document.stimuli,
    [stimulus.stimulusId]: stimulus,
  },
});

export function ReadingV2StimulusEditor({
  document,
  selectedStimulusId,
  teacherFacing = false,
  onDocumentChange,
}: ReadingV2StimulusEditorProps) {
  const firstSection = document.sectionIds[0] ? document.sections[document.sectionIds[0]] : undefined;
  const stimulusId = selectedStimulusId ?? firstSection?.stimulusIds[0];
  const stimulus = stimulusId ? document.stimuli[stimulusId] : undefined;
  const linkedTaskGroups = Object.values(document.taskGroups).filter((taskGroup) =>
    taskGroup.stimulusRefs.some((ref) => ref.stimulusId === stimulusId),
  );

  if (!stimulus) {
    return (
      <section className="reading-v2-studio__empty-panel" aria-label={teacherFacing ? 'Passage editor' : 'Stimulus editor'}>
        <h2>{teacherFacing ? 'Selected Passage Editor' : 'Selected Stimulus Editor'}</h2>
        <p>{teacherFacing ? 'No passage is selected for this draft.' : 'No stimulus is selected for this draft.'}</p>
      </section>
    );
  }

  const commitStimulus = (nextStimulus: ReadingV2StimulusNode) => {
    onDocumentChange(updateStimulus(document, nextStimulus));
  };

  const addAnchor = (kind: ReadingV2Anchor['kind']): ReadingV2Anchor => {
    const anchorId = readingV2Ids.anchorId(nextLocalId(kind));
    return {
      anchorId,
      stimulusId: stimulus.stimulusId,
      kind,
      label: `New ${kind} anchor`,
    };
  };

  const commitAnchor = (anchor: ReadingV2Anchor, nextStimulus: ReadingV2StimulusNode) => {
    onDocumentChange({
      ...updateStimulus(document, nextStimulus),
      anchors: {
        ...document.anchors,
        [anchor.anchorId]: anchor,
      },
    });
  };
  const commitAnchorLabel = (anchorId: ReadingV2AnchorId, label: string) => {
    const anchor = document.anchors[anchorId];
    if (!anchor) {
      return;
    }

    onDocumentChange({
      ...document,
      anchors: {
        ...document.anchors,
        [anchorId]: {
          ...anchor,
          label,
        },
      },
    });
  };
  const removeAnchor = (anchorId: ReadingV2AnchorId) => {
    const affectedTaskGroups = Object.values(document.taskGroups).filter((taskGroup) =>
      taskGroup.stimulusRefs.some((ref) => ref.anchorIds?.includes(anchorId)),
    );
    const affectedInteractions = Object.values(document.interactions).filter((interaction) =>
      interaction.primaryAnchorId === anchorId || interaction.contextAnchorIds?.includes(anchorId),
    );
    const nextAnchors = { ...document.anchors };
    delete nextAnchors[anchorId];

    onDocumentChange({
      ...document,
      anchors: nextAnchors,
      stimuli: {
        ...document.stimuli,
        [stimulus.stimulusId]: {
          ...stimulus,
          anchorIds: stimulus.anchorIds.filter((currentAnchorId) => currentAnchorId !== anchorId),
        },
      },
      validationState: affectedTaskGroups.length > 0 || affectedInteractions.length > 0
        ? {
            issues: [
              ...document.validationState.issues,
              {
                code: 'deleted-stimulus-or-anchor-reference',
                severity: 'error',
                message: `Anchor ${anchorId} was removed while still referenced by linked task groups or interactions.`,
                objectId: anchorId,
              },
            ],
          }
        : document.validationState,
    });
  };
  const stimulusContent = stimulus.content;
  const editorLabel = teacherFacing ? 'Passage editor' : 'Stimulus editor';
  const kindLabel =
    stimulus.kind === 'table-shell'
      ? 'Table'
      : stimulus.kind === 'flowchart-shell'
        ? 'Flowchart'
        : stimulus.kind === 'diagram-shell'
          ? 'Image / diagram'
          : stimulus.kind === 'media'
            ? 'Media'
            : 'Text';
  const inlineBlankAnchors = stimulus.anchorIds
    .map((anchorId) => document.anchors[anchorId])
    .filter((anchor): anchor is ReadingV2Anchor => anchor?.kind === 'inline-blank');

  return (
    <section className="reading-v2-stimulus-editor" aria-label={editorLabel}>
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>{teacherFacing ? 'Passage' : 'Stimulus'}</p>
          <h2>{teacherFacing ? 'Passage Editor' : 'Selected Stimulus Editor'}</h2>
        </div>
        <span className="reading-v2-status">{teacherFacing ? kindLabel : stimulus.kind}</span>
      </div>

      <label>
        {teacherFacing ? 'Passage title' : 'Stimulus title'}
        <input
          aria-label={teacherFacing ? 'Passage title' : 'Stimulus title'}
          value={stimulus.title ?? ''}
          onChange={(event) => commitStimulus({ ...stimulus, title: event.currentTarget.value })}
        />
      </label>

      {stimulusContent.kind === 'passage-content' ? (
        <section className="reading-v2-editor-section" aria-label="Passage paragraph editor">
          <h3>Passage Paragraphs</h3>
          {stimulusContent.paragraphs.map((paragraph, index) => (
            <label key={paragraph.anchorId ?? index}>
              Paragraph {paragraph.label ?? index + 1}
              <textarea
                aria-label={`Paragraph ${index + 1} text`}
                value={paragraph.text}
                onChange={(event) =>
                  commitStimulus({
                    ...stimulus,
                    content: {
                      ...stimulusContent,
                      paragraphs: stimulusContent.paragraphs.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, text: event.currentTarget.value } : current,
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
          <button
            className="reading-v2-studio__button"
            type="button"
            onClick={() => {
              const anchor = addAnchor('paragraph');
              commitAnchor(anchor, {
                ...stimulus,
                anchorIds: [...stimulus.anchorIds, anchor.anchorId],
                content: {
                  ...stimulusContent,
                  paragraphs: [
                    ...stimulusContent.paragraphs,
                    {
                      anchorId: anchor.anchorId,
                      label: `Paragraph ${stimulusContent.paragraphs.length + 1}`,
                      text: '',
                    },
                  ],
                },
              });
            }}
          >
            {teacherFacing ? 'Add Paragraph' : 'Add Paragraph Anchor'}
          </button>
          <section className="reading-v2-editor-section" aria-label={teacherFacing ? 'Blank editor' : 'Inline blank anchor editor'}>
            <h3>{teacherFacing ? 'Blanks' : 'Inline Blank Anchors'}</h3>
            {inlineBlankAnchors.map((anchor, index) => (
              <label key={anchor.anchorId}>
                {teacherFacing ? `Blank ${index + 1}` : `Inline blank ${index + 1}`}
                <input
                  aria-label={`Inline blank ${index + 1} label`}
                  value={anchor.label ?? ''}
                  onChange={(event) => commitAnchorLabel(anchor.anchorId, event.currentTarget.value)}
                />
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--quiet"
                  type="button"
                  onClick={() => removeAnchor(anchor.anchorId)}
                >
                  {teacherFacing ? 'Remove Blank' : 'Remove Inline Blank'}
                </button>
              </label>
            ))}
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() => {
                const anchor = addAnchor('inline-blank');
                commitAnchor(anchor, {
                  ...stimulus,
                  anchorIds: [...stimulus.anchorIds, anchor.anchorId],
                });
              }}
            >
              {teacherFacing ? 'Add Blank' : 'Add Inline Blank Anchor'}
            </button>
          </section>
        </section>
      ) : null}

      {stimulusContent.kind === 'table-content' ? (
        <section className="reading-v2-editor-section" aria-label={teacherFacing ? 'Table editor' : 'Table shell editor'}>
          <h3>{teacherFacing ? 'Table' : 'Table Shell'}</h3>
          {stimulusContent.rows.map((row, rowIndex) => (
            <div className="reading-v2-form-grid reading-v2-form-grid--compact" key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <label key={`cell-${rowIndex}-${cellIndex}`}>
                  Cell {rowIndex + 1}.{cellIndex + 1}
                  <input
                    aria-label={`Table cell ${rowIndex + 1}.${cellIndex + 1}`}
                    value={cell.text}
                    onChange={(event) =>
                      commitStimulus({
                    ...stimulus,
                    content: {
                          ...stimulusContent,
                          rows: stimulusContent.rows.map((currentRow, currentRowIndex) =>
                            currentRowIndex === rowIndex
                              ? currentRow.map((currentCell, currentCellIndex) =>
                                  currentCellIndex === cellIndex
                                    ? { ...currentCell, text: event.currentTarget.value }
                                    : currentCell,
                                )
                              : currentRow,
                          ),
                        },
                      })
                    }
                  />
                  <select
                    aria-label={`Table cell ${rowIndex + 1}.${cellIndex + 1} role`}
                    value={cell.role ?? 'body'}
                    onChange={(event) =>
                      commitStimulus({
                        ...stimulus,
                        content: {
                          ...stimulusContent,
                          rows: stimulusContent.rows.map((currentRow, currentRowIndex) =>
                            currentRowIndex === rowIndex
                              ? currentRow.map((currentCell, currentCellIndex) =>
                                  currentCellIndex === cellIndex
                                    ? { ...currentCell, role: event.currentTarget.value as 'header' | 'body' }
                                    : currentCell,
                                )
                              : currentRow,
                          ),
                        },
                      })
                    }
                  >
                    <option value="header">Header</option>
                    <option value="body">Body</option>
                  </select>
                  <span>Blank</span>
                  <input
                    aria-label={`Table cell ${rowIndex + 1}.${cellIndex + 1} blank`}
                    type="checkbox"
                    checked={Boolean(cell.isBlank)}
                    onChange={(event) =>
                      commitStimulus({
                        ...stimulus,
                        content: {
                          ...stimulusContent,
                          rows: stimulusContent.rows.map((currentRow, currentRowIndex) =>
                            currentRowIndex === rowIndex
                              ? currentRow.map((currentCell, currentCellIndex) =>
                                  currentCellIndex === cellIndex
                                    ? { ...currentCell, isBlank: event.currentTarget.checked }
                                    : currentCell,
                                )
                              : currentRow,
                          ),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ))}
          <div className="reading-v2-studio__inline-actions">
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() =>
                commitStimulus({
                  ...stimulus,
                  content: {
                    ...stimulusContent,
                    rows: [
                      ...stimulusContent.rows,
                      Array.from({ length: stimulusContent.rows[0]?.length ?? 1 }, () => ({
                        text: '',
                        role: 'body' as const,
                      })),
                    ],
                  },
                })
              }
            >
              Add Table Row
            </button>
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() =>
                commitStimulus({
                  ...stimulus,
                  content: {
                    ...stimulusContent,
                    rows: stimulusContent.rows.map((row) => [
                      ...row,
                      { text: '', role: 'body' as const },
                    ]),
                  },
                })
              }
            >
              Add Table Column
            </button>
          </div>
        </section>
      ) : null}

      {stimulusContent.kind === 'flowchart-content' ? (
        <section className="reading-v2-editor-section" aria-label={teacherFacing ? 'Flowchart editor' : 'Flowchart shell editor'}>
          <h3>Flowchart Steps</h3>
          {stimulusContent.steps.map((step, index) => (
            <label key={step.stepId}>
              Step {index + 1}
              <input
                aria-label={`Flowchart step ${index + 1}`}
                value={step.text}
                onChange={(event) =>
                  commitStimulus({
                    ...stimulus,
                    content: {
                      ...stimulusContent,
                      steps: stimulusContent.steps.map((current) =>
                        current.stepId === step.stepId ? { ...current, text: event.currentTarget.value } : current,
                      ),
                    },
                  })
                }
              />
              <input
                aria-label={`Flowchart step ${index + 1} next links`}
                value={(step.nextStepIds ?? []).join(', ')}
                onChange={(event) =>
                  commitStimulus({
                    ...stimulus,
                    content: {
                      ...stimulusContent,
                      steps: stimulusContent.steps.map((current) =>
                        current.stepId === step.stepId
                          ? {
                              ...current,
                              nextStepIds: event.currentTarget.value
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                            }
                          : current,
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
          <button
            className="reading-v2-studio__button"
            type="button"
            onClick={() => {
              const anchor = addAnchor('flow-step');
              const stepId = `step-${stimulusContent.steps.length + 1}`;
              commitAnchor(anchor, {
                ...stimulus,
                anchorIds: [...stimulus.anchorIds, anchor.anchorId],
                content: {
                  ...stimulusContent,
                  steps: [
                    ...stimulusContent.steps,
                    { anchorId: anchor.anchorId, stepId, text: `Step ${stimulusContent.steps.length + 1}` },
                  ],
                },
              });
            }}
          >
            Add Flow Step
          </button>
        </section>
      ) : null}

      {stimulusContent.kind === 'diagram-content' ? (
        <section className="reading-v2-editor-section" aria-label={teacherFacing ? 'Image or diagram editor' : 'Diagram image editor'}>
          <h3>Diagram Image</h3>
          <label>
            Image URL
            <input
              aria-label="Diagram image URL"
              value={stimulusContent.imageUrl ?? ''}
              onChange={(event) =>
                commitStimulus({
                  ...stimulus,
                  content: { ...stimulusContent, imageUrl: event.currentTarget.value },
                })
              }
            />
          </label>
          <label>
            Upload image file
            <input
              aria-label="Diagram image file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) {
                  return;
                }

                const reader = new FileReader();
                reader.addEventListener('load', () => {
                  if (typeof reader.result === 'string') {
                    commitStimulus({
                      ...stimulus,
                      content: { ...stimulusContent, imageUrl: reader.result },
                    });
                  }
                });
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <p className="reading-v2-studio__muted">
            {stimulusContent.hotspots.length} answer fields are linked to this diagram.
          </p>
          <button
            className="reading-v2-studio__button"
            type="button"
            onClick={() => {
              const anchor = addAnchor('diagram-hotspot');
              commitAnchor(anchor, {
                ...stimulus,
                anchorIds: [...stimulus.anchorIds, anchor.anchorId],
                content: {
                  ...stimulusContent,
                  hotspots: [
                    ...stimulusContent.hotspots,
                    { anchorId: anchor.anchorId, label: `Question ${stimulusContent.hotspots.length + 1}`, xPercent: 50, yPercent: 50 },
                  ],
                },
              });
            }}
          >
            Add Diagram Answer Field
          </button>
        </section>
      ) : null}

      <section className="reading-v2-editor-section" aria-label={teacherFacing ? 'Linked question group summary' : 'Linked task-group summary'}>
        <h3>{teacherFacing ? 'Question Groups Using This Passage' : 'Linked Task Groups'}</h3>
        <p>{teacherFacing ? 'Question groups' : 'Linked task groups'}: <strong>{linkedTaskGroups.length}</strong></p>
        {linkedTaskGroups.length > 0 ? (
          <p role="alert">
            {teacherFacing
              ? 'Edits here can affect linked questions until they are checked.'
              : 'Anchor edits on this stimulus can invalidate linked task groups until references are repaired.'}
          </p>
        ) : null}
        <ul>
          {linkedTaskGroups.map((taskGroup) => (
            <li key={taskGroup.taskGroupId}>{taskGroup.groupTitle ?? taskGroup.officialTaskType}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
