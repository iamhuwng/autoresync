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
  /** Usability hint only; trusted upload control never treats it as provider proof. */
  readonly physicalPageCount: number;
  readonly pdfType: 'application/pdf';
  readonly readability: 'readable';
}
