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
  /** Authenticated-owner PDF.js attestation; trusted completion binds it to exact bytes. */
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
