import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ActivityRendererRegistry } from '../../../services/book-activity/runtime/activityRendererRegistry';
import type {
  ActivityRendererDiagnostic,
  ActivityRendererContext,
  ActivityResponseValidationState,
} from '../../../services/book-activity/runtime/activityRenderer.types';

export interface ActivityRendererHostProps {
  registry: ActivityRendererRegistry;
  projection: unknown;
  context: ActivityRendererContext;
  responses: Readonly<Record<string, unknown>>;
  validationByInteractionId: Readonly<Record<string, ActivityResponseValidationState>>;
  onResponseChange: (interactionId: string, response: unknown) => void;
}

interface UnsupportedActivityStateProps {
  diagnostic: ActivityRendererDiagnostic;
  focusRef: RefObject<HTMLElement | null>;
}

interface ScopedChangeDiagnostic {
  projection: unknown;
  interactionId: string;
  diagnostic: ActivityRendererDiagnostic;
}

const UnsupportedActivityState = ({ diagnostic, focusRef }: UnsupportedActivityStateProps) => (
  <section aria-describedby="activity-renderer-unsupported-detail" aria-labelledby="activity-renderer-unsupported-title" ref={focusRef} role="alert" tabIndex={-1}>
    <h2 id="activity-renderer-unsupported-title">Activity unavailable</h2>
    <p id="activity-renderer-unsupported-detail">{diagnostic.message}</p>
  </section>
);

const codecDiagnostic = (
  diagnostic: { code: 'malformed-response' | 'response-too-large' | 'unsupported-response'; path: string; message: string } | undefined,
  fallbackPath: string,
): ActivityRendererDiagnostic => diagnostic ?? {
  code: 'malformed-response',
  path: fallbackPath,
  message: 'Activity response is invalid.',
};

const normalizeText = (text: string, normalization: string): string => {
  if (normalization === 'trim') return text.trim();
  if (normalization === 'case-insensitive') return text.trim().toLowerCase();
  if (normalization === 'trim-case-and-spacing') {
    return text.trim().replace(/\s+/gu, ' ').toLowerCase();
  }
  return text;
};

const normalizeCandidate = (candidate: unknown, normalization: string): unknown => {
  if (
    candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    Object.hasOwn(candidate, 'interactionId') &&
    Object.hasOwn(candidate, 'text') &&
    typeof (candidate as { text?: unknown }).text === 'string'
  ) {
    return {
      ...(candidate as Record<string, unknown>),
      text: normalizeText((candidate as { text: string }).text, normalization),
    };
  }
  return candidate;
};

const responseMatchesInteraction = (
  response: unknown,
  interaction: {
    interactionId: string;
    family: string;
    options?: readonly { itemId: string }[];
  },
  requiredSelectionCount: number | undefined,
): boolean => {
  if (response === null) return true;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return true;
  const value = response as Record<string, unknown>;
  if (value.interactionId !== interaction.interactionId) return false;
  if (interaction.family !== 'choice' || !Array.isArray(interaction.options)) return true;
  const allowed = new Set(interaction.options.map((option) => option.itemId));
  if (Object.hasOwn(value, 'selectedOptionId')) {
    const selected = value.selectedOptionId;
    return (
      selected === null ||
      (
        typeof selected === 'string' &&
        allowed.has(selected) &&
        (requiredSelectionCount === undefined || requiredSelectionCount === 1)
      )
    );
  }
  if (!Object.hasOwn(value, 'selectedOptionIds') || !Array.isArray(value.selectedOptionIds)) return false;
  const selected = value.selectedOptionIds;
  return (
    selected.every((item) => typeof item === 'string' && allowed.has(item)) &&
    new Set(selected).size === selected.length &&
    (requiredSelectionCount === undefined || selected.length === requiredSelectionCount)
  );
};

export const ActivityRendererHost = ({
  registry,
  projection,
  context,
  responses,
  validationByInteractionId,
  onResponseChange,
}: ActivityRendererHostProps) => {
  const unsupportedRef = useRef<HTMLElement | null>(null);
  const [changeFailure, setChangeFailure] = useState<ScopedChangeDiagnostic | null>(null);
  const resolution = registry.resolve(projection, context);
  const rendererInputs = resolution.supported
    ? resolution.projection.interactions.map((interaction) => {
      const { codec } = resolution.registration;
      const rawResponse = Object.hasOwn(responses, interaction.interactionId)
        ? responses[interaction.interactionId]
        : codec.createEmpty();
      const decoded = codec.decode(
        normalizeCandidate(rawResponse, resolution.projection.answerRule.normalization),
      );
      if (!decoded.valid) {
        return { interaction, diagnostic: codecDiagnostic(decoded.diagnostics[0], `$.responses.${interaction.interactionId}`) };
      }
      const validated = codec.validate(decoded.value);
      if (!validated.valid) {
        return { interaction, diagnostic: codecDiagnostic(validated.diagnostics[0], `$.responses.${interaction.interactionId}`) };
      }
      if (!responseMatchesInteraction(
        validated.value,
        interaction,
        resolution.projection.answerRule.requiredSelectionCount,
      )) {
        return {
          interaction,
          diagnostic: {
            code: 'malformed-response' as const,
            path: `$.responses.${interaction.interactionId}`,
            message: 'Activity response does not match this interaction.',
          },
        };
      }
      return { interaction, response: validated.value };
    })
    : [];
  const inputDiagnostic = rendererInputs.find((input) => input.diagnostic !== undefined)?.diagnostic ?? null;

  const resolutionDiagnostic = resolution.supported ? null : resolution.diagnostic;
  const failure = resolutionDiagnostic ?? inputDiagnostic;
  let changeDiagnostic: ActivityRendererDiagnostic | null = null;
  const currentChangeFailure = changeFailure;
  if (
    currentChangeFailure !== null &&
    currentChangeFailure.projection === projection &&
    resolution.supported
  ) {
    const failedInteractionId = currentChangeFailure.interactionId;
    if (resolution.projection.interactions.some(
      (interaction) => interaction.interactionId === failedInteractionId,
    )) {
      changeDiagnostic = currentChangeFailure.diagnostic;
    }
  }
  useEffect(() => {
    if (failure) unsupportedRef.current?.focus();
  }, [failure]);

  if (failure) return <UnsupportedActivityState diagnostic={failure} focusRef={unsupportedRef} />;
  if (!resolution.supported) return null;

  const { codec } = resolution.registration;
  const Renderer = resolution.registration.renderer;
  return (
    <>
      <section aria-label="Activity instructions">
        {resolution.projection.instructions.map((instruction, index) => (
          <p key={`${index}-${instruction.text}`}>{instruction.text}</p>
        ))}
      </section>
      <section aria-label="Activity interactions">
        {changeDiagnostic ? <p role="alert">{changeDiagnostic.message}</p> : null}
        {rendererInputs.map(({ interaction, response }) => (
          <Renderer
            answerRule={resolution.projection.answerRule}
            interaction={interaction}
            key={interaction.interactionId}
            mode={context.mode}
            onChange={(candidate) => {
              if (context.mode !== 'editable') return;
              const normalizedCandidate = normalizeCandidate(
                candidate,
                resolution.projection.answerRule.normalization,
              );
              const decoded = codec.decode(normalizedCandidate);
              if (!decoded.valid) {
                setChangeFailure({
                  projection,
                  interactionId: interaction.interactionId,
                  diagnostic: codecDiagnostic(decoded.diagnostics[0], `$.responses.${interaction.interactionId}`),
                });
                return;
              }
              if (!responseMatchesInteraction(
                decoded.value,
                interaction,
                resolution.projection.answerRule.requiredSelectionCount,
              )) {
                setChangeFailure({
                  projection,
                  interactionId: interaction.interactionId,
                  diagnostic: {
                    code: 'malformed-response',
                    path: `$.responses.${interaction.interactionId}`,
                    message: 'Activity response does not match this interaction.',
                  },
                });
                return;
              }
              const validated = codec.validate(decoded.value);
              if (!validated.valid) {
                setChangeFailure({
                  projection,
                  interactionId: interaction.interactionId,
                  diagnostic: codecDiagnostic(validated.diagnostics[0], `$.responses.${interaction.interactionId}`),
                });
                return;
              }
              try {
                const serialized = codec.serialize(validated.value);
                const canonical = codec.decode(serialized);
                if (!canonical.valid) {
                  setChangeFailure({
                    projection,
                    interactionId: interaction.interactionId,
                    diagnostic: codecDiagnostic(canonical.diagnostics[0], `$.responses.${interaction.interactionId}`),
                  });
                  return;
                }
                const canonicalValidation = codec.validate(canonical.value);
                if (!canonicalValidation.valid) {
                  setChangeFailure({
                    projection,
                    interactionId: interaction.interactionId,
                    diagnostic: codecDiagnostic(canonicalValidation.diagnostics[0], `$.responses.${interaction.interactionId}`),
                  });
                  return;
                }
                setChangeFailure(null);
                onResponseChange(interaction.interactionId, serialized);
              } catch {
                setChangeFailure({
                  projection,
                  interactionId: interaction.interactionId,
                  diagnostic: {
                    code: 'malformed-response',
                    path: `$.responses.${interaction.interactionId}`,
                    message: 'Activity response could not be serialized.',
                  },
                });
              }
            }}
            response={response}
            sourceContext={context.sourceContext}
            stimulus={resolution.projection.stimulus}
            validation={validationByInteractionId[interaction.interactionId] ?? { status: 'valid' }}
          />
        ))}
      </section>
    </>
  );
};
