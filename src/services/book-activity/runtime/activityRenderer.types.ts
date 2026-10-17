import { createElement, type ComponentType } from 'react';
import type {
  ActivityInteractionFamily,
  ActivityTaskProfile,
  StudentActivityInteraction,
  StudentActivityProjection,
} from '../../../types/bookActivity.types';
import {
  MAX_ACTIVITY_RESPONSE_SERIALIZED_BYTES,
  type ActivityResponseReviewProjection,
  type ActivityResponseCodec,
  type ActivityResponseValidationResult,
} from './activityResponseCodec.types';

export type ActivityRendererSurface =
  | 'student-runtime'
  | 'assembly-preview'
  | 'result-review';

export type ActivityRendererMode = 'editable' | 'read-only' | 'review';

export interface ActivityRendererSourceContext {
  available: boolean;
  description?: string;
}

export interface ActivityRendererContext {
  surface: ActivityRendererSurface;
  mode: ActivityRendererMode;
  sourceContext?: ActivityRendererSourceContext;
}

export interface ActivityResponseValidationState {
  status: 'valid' | 'invalid';
  message?: string;
}

/** Only student-safe interaction data reaches family renderer components. */
export interface ActivityRendererProps<Response = unknown> {
  interaction: StudentActivityInteraction;
  answerRule: StudentActivityProjection['answerRule'];
  stimulus: StudentActivityProjection['stimulus'];
  response: Response;
  validation: ActivityResponseValidationState;
  mode: ActivityRendererMode;
  sourceContext?: ActivityRendererSourceContext;
  onChange: (response: Response) => void;
}

export type ActivityRenderer<Response = unknown> = ComponentType<
  ActivityRendererProps<Response>
>;

export interface ActivityRendererTaskProfileSelector {
  taxonomyId: ActivityTaskProfile['taxonomyId'];
  typeId: ActivityTaskProfile['typeId'];
  taxonomyVersion: ActivityTaskProfile['taxonomyVersion'];
}

/** Registry is heterogeneous; each binding preserves its renderer/codec pair. */
export interface ActivityRendererRegistration<Response = unknown> {
  family: ActivityInteractionFamily;
  variant: string;
  taskProfile?: ActivityRendererTaskProfileSelector;
  presentationMode: 'structured' | 'source-assisted';
  responseCodec: string;
  rendererId: string;
  codecId: string;
  renderer: ActivityRenderer<Response>;
  codec: ActivityResponseCodec<Response>;
}

/**
 * Runtime registry intentionally erases family response types only through this
 * adapter. It decodes unknown state before a typed family renderer can receive it.
 */
export interface RegisteredActivityRenderer {
  family: ActivityInteractionFamily;
  variant: string;
  taskProfile?: ActivityRendererTaskProfileSelector;
  presentationMode: 'structured' | 'source-assisted';
  responseCodec: string;
  rendererId: string;
  codecId: string;
  renderer: ActivityRenderer<unknown>;
  codec: ActivityResponseCodec<unknown>;
}

export const registerActivityRenderer = <Response,>(
  registration: ActivityRendererRegistration<Response>,
): RegisteredActivityRenderer => {
  if (
    !Number.isSafeInteger(registration.codec.maxSerializedBytes) ||
    registration.codec.maxSerializedBytes < 1 ||
    registration.codec.maxSerializedBytes > MAX_ACTIVITY_RESPONSE_SERIALIZED_BYTES
  ) {
    throw new TypeError('Activity response codec has an invalid serialization limit.');
  }
  const serializedDiagnostic = (
    value: unknown,
  ): ActivityResponseValidationResult<never> | null => {
    let json: string | undefined;
    try {
      json = JSON.stringify(value);
    } catch {
      return {
        valid: false,
        diagnostics: [{
          code: 'malformed-response',
          path: '$',
          message: 'Activity response must be JSON-serializable.',
        }],
      };
    }
    if (json === undefined) {
      return {
        valid: false,
        diagnostics: [{
          code: 'malformed-response',
          path: '$',
          message: 'Activity response must have a JSON representation.',
        }],
      };
    }
    if (new TextEncoder().encode(json).byteLength > registration.codec.maxSerializedBytes) {
      return {
        valid: false,
        diagnostics: [{
          code: 'response-too-large',
          path: '$',
          message: 'Activity response exceeds codec serialization limit.',
        }],
      };
    }
    return null;
  };
  const decode = (input: unknown): ActivityResponseValidationResult<Response> => {
    const sizeFailure = serializedDiagnostic(input);
    if (sizeFailure) return sizeFailure;
    return registration.codec.decode(input);
  };
  const validate = (input: unknown): ActivityResponseValidationResult<Response> => {
    const decoded = decode(input);
    if (!decoded.valid) return decoded;
    const validated = registration.codec.validate(decoded.value);
    if (!validated.valid) return validated;
    return serializedDiagnostic(validated.value) ?? validated;
  };
  const serialize = (input: unknown): unknown => {
    const validated = validate(input);
    if (!validated.valid) {
      const tooLarge = validated.diagnostics.some(
        (entry) => entry.code === 'response-too-large',
      );
      throw new TypeError(
        tooLarge
          ? 'Activity response exceeds codec serialization limit.'
          : 'Cannot serialize malformed or invalid Activity response.',
      );
    }
    const serialized = registration.codec.serialize(validated.value);
    const sizeFailure = serializedDiagnostic(serialized);
    if (sizeFailure) {
      const tooLarge = sizeFailure.diagnostics.some(
        (entry) => entry.code === 'response-too-large',
      );
      throw new TypeError(
        tooLarge
          ? 'Activity response exceeds codec serialization limit.'
          : 'Cannot serialize malformed Activity response.',
      );
    }
    return serialized;
  };
  const codec: ActivityResponseCodec<unknown> = {
    maxSerializedBytes: registration.codec.maxSerializedBytes,
    createEmpty: () => {
      const empty = registration.codec.createEmpty();
      const validated = validate(empty);
      if (!validated.valid) {
        throw new TypeError('Activity response codec produced an invalid empty state.');
      }
      return validated.value;
    },
    decode,
    validate,
    serialize,
    equals: (left, right) => {
      const decodedLeft = validate(left);
      const decodedRight = validate(right);
      return decodedLeft.valid && decodedRight.valid &&
        registration.codec.equals(decodedLeft.value, decodedRight.value);
    },
    toReviewProjection: (input) => {
      const validated = validate(input);
      if (!validated.valid) return { text: '' };
      const review = registration.codec.toReviewProjection(validated.value);
      if (
        serializedDiagnostic(review) ||
        typeof review !== 'object' ||
        review === null ||
        typeof (review as { text?: unknown }).text !== 'string' ||
        (
          (review as { items?: unknown }).items !== undefined &&
          (
            !Array.isArray((review as { items?: unknown }).items) ||
            !Array.from((review as { items: readonly unknown[] }).items).every(
              (item) => typeof item === 'string',
            )
          )
        )
      ) {
        return { text: '' };
      }
      const safeReview: ActivityResponseReviewProjection = {
        text: (review as { text: string }).text,
        ...((review as { items?: readonly string[] }).items === undefined
          ? {}
          : { items: Array.from((review as { items: readonly string[] }).items) }),
      };
      return safeReview;
    },
  };
  const renderer: ActivityRenderer<unknown> = ({ response, onChange, ...props }) => {
    if (serializedDiagnostic(response)) return null;
    const validated = validate(response);
    if (!validated.valid || serializedDiagnostic(validated.value)) return null;
    return createElement(registration.renderer, {
      ...props,
      response: validated.value,
      onChange: (next: Response) => onChange(next),
    });
  };
  return { ...registration, renderer, codec };
};

export type ActivityRendererDiagnosticCode =
  | 'malformed-projection'
  | 'mixed-interaction-family'
  | 'conflicting-answer-rule'
  | 'missing-required-source-context'
  | 'unknown-renderer'
  | 'malformed-response'
  | 'response-too-large'
  | 'unsupported-response';

export interface ActivityRendererDiagnostic {
  code: ActivityRendererDiagnosticCode;
  path: string;
  message: string;
}

export type ActivityRendererResolution =
  | {
      supported: true;
      registration: RegisteredActivityRenderer;
      projection: StudentActivityProjection;
    }
  | {
      supported: false;
      diagnostic: ActivityRendererDiagnostic;
    };
