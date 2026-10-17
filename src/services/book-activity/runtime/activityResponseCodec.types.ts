/** Maximum JSON-serialized browser response size accepted by the shared runtime. */
export const MAX_ACTIVITY_RESPONSE_SERIALIZED_BYTES = 81_920;

export interface ActivityResponseDiagnostic {
  code: 'malformed-response' | 'response-too-large' | 'unsupported-response';
  path: string;
  message: string;
}

export type ActivityResponseValidationResult<Response> =
  | { valid: true; value: Response; diagnostics: readonly ActivityResponseDiagnostic[] }
  | { valid: false; diagnostics: readonly ActivityResponseDiagnostic[] };

export interface ActivityResponseReviewProjection {
  text: string;
  items?: readonly string[];
}

/**
 * Family codecs own browser response representation only. They never score,
 * persist, submit, authorize, or inspect canonical answer keys.
 */
export interface ActivityResponseCodec<Response = unknown> {
  /** Bound for this codec's canonical JSON response, never above shared runtime limit. */
  readonly maxSerializedBytes: number;
  createEmpty(): Response;
  decode(input: unknown): ActivityResponseValidationResult<Response>;
  validate(response: Response): ActivityResponseValidationResult<Response>;
  serialize(response: Response): unknown;
  equals(left: Response, right: Response): boolean;
  toReviewProjection(response: Response): ActivityResponseReviewProjection;
}
