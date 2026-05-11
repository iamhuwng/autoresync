// Reading V2 guard boundary: callers must pass explicit V2 canonical or projection shapes.
// Legacy Reading payloads are rejected here and must be converted only by named edge adapters.
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  type ReadingV2AnchorId,
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2ProjectionPayload,
  type ReadingV2StimulusNode,
  type ReadingV2TaskGroup,
  type ReadingV2ValidationIssue,
} from '../../types/readingV2.types';
import { getReadingV2TaskFamily } from '../../types/readingV2Taxonomy';

export const READING_V2_BLOCKING_ISSUE_CODES = [
  'orphan-interaction',
  'orphan-anchor-reference',
  'unresolved-draft-placeholder',
  'missing-scoring-response-shape',
  'duplicate-numbering',
  'unsupported-import-structure',
  'unresolved-import-uncertainty',
  'missing-primary-stimulus-reference',
  'deleted-stimulus-or-anchor-reference',
  'invalid-packaged-material-assembly',
] as const;

export const assertSupportedReadingV2SchemaVersion = (
  schemaVersion: number,
): void => {
  if (schemaVersion !== READING_V2_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Reading V2 schema version ${schemaVersion}; expected ${READING_V2_SCHEMA_VERSION}.`,
    );
  }
};

export const isReadingV2PublishBlocked = (
  issues: readonly ReadingV2ValidationIssue[],
): boolean => issues.some((issue) => issue.severity === 'error');

const hasOwn = <T extends object>(record: T, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const stimulusAnchorScope = (stimulus: ReadingV2StimulusNode): Set<string> =>
  new Set(stimulus.anchorIds);

const assertAnchorBelongsToStimulusContent = (
  stimulus: ReadingV2StimulusNode,
  anchorId: ReadingV2AnchorId | undefined,
): void => {
  if (anchorId && !stimulusAnchorScope(stimulus).has(anchorId)) {
    throw new Error(`Stimulus ${stimulus.stimulusId} content references anchor ${anchorId} outside its anchor scope.`);
  }
};

const assertStimulusContent = (stimulus: ReadingV2StimulusNode): void => {
  if (stimulus.kind === 'passage' || stimulus.kind === 'summary-shell' || stimulus.kind === 'note-shell') {
    if (stimulus.content.kind !== 'passage-content' || stimulus.content.paragraphs.length === 0) {
      throw new Error(`Stimulus ${stimulus.stimulusId} requires passage display content.`);
    }

    stimulus.content.paragraphs.forEach((paragraph) =>
      assertAnchorBelongsToStimulusContent(stimulus, paragraph.anchorId),
    );
    return;
  }

  if (stimulus.kind === 'table-shell') {
    if (stimulus.content.kind !== 'table-content' || stimulus.content.rows.length === 0) {
      throw new Error(`Stimulus ${stimulus.stimulusId} requires table display content.`);
    }

    stimulus.content.rows
      .flat()
      .forEach((cell) => {
        assertAnchorBelongsToStimulusContent(stimulus, cell.anchorId);
        cell.anchorIds?.forEach((anchorId) => assertAnchorBelongsToStimulusContent(stimulus, anchorId));
      });
    return;
  }

  if (stimulus.kind === 'flowchart-shell') {
    if (stimulus.content.kind !== 'flowchart-content' || stimulus.content.steps.length === 0) {
      throw new Error(`Stimulus ${stimulus.stimulusId} requires flowchart display content.`);
    }

    stimulus.content.steps.forEach((step) =>
      assertAnchorBelongsToStimulusContent(stimulus, step.anchorId),
    );
    return;
  }

  if (stimulus.kind === 'diagram-shell') {
    if (stimulus.content.kind !== 'diagram-content' || stimulus.content.hotspots.length === 0) {
      throw new Error(`Stimulus ${stimulus.stimulusId} requires diagram display content.`);
    }

    stimulus.content.hotspots.forEach((hotspot) =>
      assertAnchorBelongsToStimulusContent(stimulus, hotspot.anchorId),
    );
    return;
  }

  if (stimulus.kind === 'media' && stimulus.content.kind !== 'media-content') {
    throw new Error(`Stimulus ${stimulus.stimulusId} requires media display content.`);
  }
};

const assertTaskGroupOwnership = (
  taskGroup: ReadingV2TaskGroup,
  interactions: Readonly<Record<string, ReadingV2Interaction>>,
  referencedInteractionIds: Set<string>,
): void => {
  taskGroup.interactionIds.forEach((interactionId) => {
    if (referencedInteractionIds.has(interactionId)) {
      throw new Error(`Interaction ${interactionId} is referenced by more than one task group position.`);
    }

    referencedInteractionIds.add(interactionId);

    const interaction = interactions[interactionId];

    if (!interaction) {
      throw new Error(`Task group ${taskGroup.taskGroupId} references missing interaction ${interactionId}.`);
    }

    if (interaction.taskGroupId !== taskGroup.taskGroupId) {
      throw new Error(
        `Interaction ${interactionId} belongs to ${interaction.taskGroupId}, not ${taskGroup.taskGroupId}.`,
      );
    }
  });
};

export const assertValidReadingV2CanonicalDocument = (
  document: ReadingV2Document,
): void => {
  if (document.deliveryEngine !== READING_V2_ENGINE || document.plane !== 'canonical') {
    throw new Error('Reading V2 canonical guards only accept canonical Reading V2 documents.');
  }

  assertSupportedReadingV2SchemaVersion(document.schemaVersion);

  const referencedSectionIds = new Set<string>();
  const referencedStimulusIds = new Set<string>();
  const referencedTaskGroupIds = new Set<string>();
  const referencedInteractionIds = new Set<string>();
  const referencedOptionSetIds = new Set<string>();

  document.sectionIds.forEach((sectionId) => {
    if (!hasOwn(document.sections, sectionId)) {
      throw new Error(`Reading V2 document references missing section ${sectionId}.`);
    }

    if (referencedSectionIds.has(sectionId)) {
      throw new Error(`Reading V2 document references duplicate section ${sectionId}.`);
    }

    referencedSectionIds.add(sectionId);
  });

  Object.entries(document.sections).forEach(([sectionId, section]) => {
    if (section.sectionId !== sectionId) {
      throw new Error(`Section ${sectionId} has mismatched identity ${section.sectionId}.`);
    }

    if (!referencedSectionIds.has(section.sectionId)) {
      throw new Error(`Section ${section.sectionId} is not owned by the document section order.`);
    }

    section.stimulusIds.forEach((stimulusId) => {
      if (!hasOwn(document.stimuli, stimulusId)) {
        throw new Error(`Section ${sectionId} references missing stimulus ${stimulusId}.`);
      }

      if (referencedStimulusIds.has(stimulusId)) {
        throw new Error(`Stimulus ${stimulusId} is referenced by more than one section position.`);
      }

      referencedStimulusIds.add(stimulusId);
    });

    section.taskGroupIds.forEach((taskGroupId) => {
      const taskGroup = document.taskGroups[taskGroupId];

      if (!taskGroup) {
        throw new Error(`Section ${sectionId} references missing task group ${taskGroupId}.`);
      }

      if (taskGroup.sectionId !== section.sectionId) {
        throw new Error(`Task group ${taskGroupId} belongs to ${taskGroup.sectionId}, not ${section.sectionId}.`);
      }

      if (referencedTaskGroupIds.has(taskGroupId)) {
        throw new Error(`Task group ${taskGroupId} is referenced by more than one section position.`);
      }

      referencedTaskGroupIds.add(taskGroupId);
    });
  });

  Object.values(document.stimuli).forEach((stimulus) => {
    if (!referencedStimulusIds.has(stimulus.stimulusId)) {
      throw new Error(`Stimulus ${stimulus.stimulusId} is not owned by any section.`);
    }

    assertStimulusContent(stimulus);

    stimulus.anchorIds.forEach((anchorId) => {
      const anchor = document.anchors[anchorId];

      if (!anchor || anchor.stimulusId !== stimulus.stimulusId) {
        throw new Error(`Stimulus ${stimulus.stimulusId} references invalid anchor ${anchorId}.`);
      }
    });

    if (new Set(stimulus.anchorIds).size !== stimulus.anchorIds.length) {
      throw new Error(`Stimulus ${stimulus.stimulusId} references duplicate anchors.`);
    }
  });

  Object.values(document.anchors).forEach((anchor) => {
    const stimulus = document.stimuli[anchor.stimulusId];

    if (!stimulus) {
      throw new Error(`Anchor ${anchor.anchorId} references missing stimulus ${anchor.stimulusId}.`);
    }

    if (!stimulus.anchorIds.includes(anchor.anchorId)) {
      throw new Error(`Stimulus ${stimulus.stimulusId} does not own anchor ${anchor.anchorId}.`);
    }
  });

  Object.values(document.taskGroups).forEach((taskGroup) => {
    if (!referencedTaskGroupIds.has(taskGroup.taskGroupId)) {
      throw new Error(`Task group ${taskGroup.taskGroupId} is not owned by any section.`);
    }

    const expectedFamily = getReadingV2TaskFamily(taskGroup.officialTaskType);

    if (taskGroup.engineeringFamily !== expectedFamily) {
      throw new Error(
        `Task group ${taskGroup.taskGroupId} uses ${taskGroup.engineeringFamily}; ${taskGroup.officialTaskType} requires ${expectedFamily}.`,
      );
    }

    taskGroup.stimulusRefs.forEach((stimulusRef) => {
      if (!hasOwn(document.stimuli, stimulusRef.stimulusId)) {
        throw new Error(`Task group ${taskGroup.taskGroupId} references missing stimulus ${stimulusRef.stimulusId}.`);
      }

      stimulusRef.anchorIds?.forEach((anchorId) => {
        const anchor = document.anchors[anchorId];

        if (!anchor || anchor.stimulusId !== stimulusRef.stimulusId) {
          throw new Error(`Task group ${taskGroup.taskGroupId} references invalid anchor ${anchorId}.`);
        }
      });
    });

    const taskGroupAnchorScope = new Set(
      taskGroup.stimulusRefs.flatMap((stimulusRef) => {
        const stimulus = document.stimuli[stimulusRef.stimulusId];
        return stimulusRef.anchorIds ?? stimulus?.anchorIds ?? [];
      }),
    );

    taskGroup.optionSetRefs.forEach((optionSetId) => {
      const optionSet = document.optionSets[optionSetId];

      if (!optionSet || optionSet.taskGroupId !== taskGroup.taskGroupId) {
        throw new Error(`Task group ${taskGroup.taskGroupId} references invalid option set ${optionSetId}.`);
      }

      referencedOptionSetIds.add(optionSetId);
    });

    assertTaskGroupOwnership(taskGroup, document.interactions, referencedInteractionIds);

    taskGroup.interactionIds.forEach((interactionId) => {
      const interaction = document.interactions[interactionId];
      if (!interaction) {
        throw new Error(`Task group ${taskGroup.taskGroupId} references missing interaction ${interactionId}.`);
      }

      const anchorIds = [
        interaction.primaryAnchorId,
        ...(interaction.contextAnchorIds ?? []),
      ].filter((anchorId): anchorId is ReadingV2AnchorId => Boolean(anchorId));

      anchorIds.forEach((anchorId) => {
        if (!hasOwn(document.anchors, anchorId)) {
          throw new Error(`Interaction ${interactionId} references missing anchor ${anchorId}.`);
        }

        if (!taskGroupAnchorScope.has(anchorId)) {
          throw new Error(`Interaction ${interactionId} references anchor ${anchorId} outside task group stimulus scope.`);
        }
      });
    });
  });

  Object.values(document.interactions).forEach((interaction) => {
    if (!referencedInteractionIds.has(interaction.interactionId)) {
      throw new Error(`Interaction ${interaction.interactionId} is not owned by any task group.`);
    }
  });

  Object.values(document.optionSets).forEach((optionSet) => {
    if (!referencedOptionSetIds.has(optionSet.optionSetId)) {
      throw new Error(`Option set ${optionSet.optionSetId} is not owned by any task group.`);
    }
  });
};

export const assertReadingV2ProjectionInput = (
  payload: ReadingV2ProjectionPayload,
): void => {
  if (payload.deliveryEngine !== READING_V2_ENGINE || payload.plane !== 'projection') {
    throw new Error('Reading V2 runtime/review APIs require derived projection payloads.');
  }

  assertSupportedReadingV2SchemaVersion(payload.schemaVersion);
};
