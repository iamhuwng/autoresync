# PRD0062 live Full PDF upload milestone

Date: 2026-08-25

This is a preview-only evidence anchor for the real-material Full PDF workflow.
It does not contain application credentials or Worker secret values.

## Fixture

- Input: `cuts/full-pdf-units-1-3.pdf`
- Pages: 14
- Bytes: 1,091,424
- SHA-256: `a46160046d73f2c2946abb9f537de46a01c8230228a88b67afa5de195117267c`
- Content type: `application/pdf`

## Evidence

- The authenticated teacher Book editor completed the Full PDF upload and showed
  `Your PDF is ready` / `ready privately`.
- Backblaze B2 `b2_list_file_versions` returned HTTP 200 and an upload entry for
  the preview object with the expected 1,091,424-byte size and PDF content type.
- The stale reservation was reconciled through the supported reconciliation
  route and reached `released`; no RTDB state was manually mutated.
- Component PDFs remain a separate workflow and are not represented by this
  milestone.

Remote preview configuration and temporary credentials are intentionally not
committed here; they must be verified from the deployed Worker and Backblaze
state when this milestone is revisited.
