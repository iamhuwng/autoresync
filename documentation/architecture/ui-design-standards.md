# UI Design Standards

## Teacher Full-Page Result Standard

Teacher-facing result history and result detail pages opened from Teacher view must render as teacher pages, not detached standalone screens.

Required layout:

- `AppShell`
- `TeacherHeader`
- teacher page title/introduction block
- teacher page content container for analytics, filters, history, and detail content

Required behavior:

- access-lost states render inside the teacher shell
- loading and error states render inside the teacher shell
- detail pages opened from teacher history keep teacher navigation chrome

Forbidden patterns:

- full-screen gradient wrappers with no teacher shell
- standalone generic result screens opened from teacher workflows
- detached access-denied replacements that throw the user out of the teacher surface when mid-view access is revoked
