/**
 * Exact Ticket 05/#46 inspection envelope accepted by trusted upload control.
 * It remains untrusted until provider metadata is independently verified.
 */
export interface SourceUploadInspectionClaim {
  readonly schemaVersion: 1;
  readonly trust: 'browser-supplied-untrusted';
  readonly state: 'complete';
  readonly displayFilename: string;
  readonly exactByteSize: number;
  readonly sha256Hex: string;
  /** Browser-only UX/preflight count; trusted completion independently recounts bytes. */
  readonly physicalPageCount: number;
  readonly pdfType: 'application/pdf';
  readonly readability: 'readable';
}

/**
 * The claim's integrity tuple is the reservation binding. It is intentionally
 * provider-free and is never accepted as proof of storage until completion.
 */
export type SourceUploadInspectionIntegrityBinding = Pick<
  SourceUploadInspectionClaim,
  'physicalPageCount' | 'exactByteSize' | 'sha256Hex'
>;

/** Deterministic identity only; authorization and UUID entropy remain required. */
export const sourceUploadIdentityDigest = (value: string): string => {
  let left = 0x811c9dc5;
  let right = 0x9e3779b1;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
};

export const sourceUploadReservationId = (actorId: string, bookId: string, operationId: string): string =>
  `reservation-${sourceUploadIdentityDigest(`${actorId}\u0000${bookId}\u0000${operationId.toLowerCase()}`)}`;
