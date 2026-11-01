# Preserve Reading V2 passage structure through editing and publication

Changelog ID: `CL-20261101-READING-V2-PASSAGE-STRUCTURE`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem and evidence

Studio displayed paragraphs correctly while saving an edited passage as a single
canonical paragraph containing blank lines. It retained the old anchor table,
so question references could point to anchors with no content block. Editor-block
validation found those orphans, but Studio accepted the damaged input when
normalization failed. Canonical publish validation checked the anchor table
rather than actual paragraph content and allowed publication.

A read-only live audit on 1 November covered 80 Reading V2 metadata rows, 167
canonical documents and 1,024 passage copies across snapshots, reusable versions
and projections. These represented 43 distinct normalized texts, including
fixtures. Talbot Park was the only substantive passage with the confirmed
pattern: one 5,465-character block, 16 newlines, ten retained paragraph anchors
and nine absent content targets. Its editor validator found 37 orphan
references while its publish validator allowed publication.

## Change and rationale

The existing canonical passage schema remains authoritative. The rich editor
receives and emits structured passage entries instead of round-tripping whole
passages through a Markdown string. TipTap attributes retain anchors and labels.
Splitting and pasting allocate unique IDs; edits that remove a referenced block
are rejected with the shared error announcement. Existing metadata-edit action
reporting is retained, including rejected edits.

The shared canonical guard requires passage paragraph anchors to identify actual
content, covering repository, projection and publish callers. The shared runtime
renders headings, paragraphs and contiguous lists semantically and preserves
inline hard breaks and formatted highlights. Inline mark parsing is shared with
runtime instead of maintaining a narrower editor dialect.

Auto V4 retains authoritative source text. A non-blocking review issue identifies
the narrow case where provider text matches that source exactly apart from
whitespace but proposes multiple paragraphs while source boundaries are absent.
It does not guess boundaries, alter source content or introduce another AI stage.

A whitespace-only CSS patch was rejected because it would leave incorrect
content-to-question associations intact. No new persisted format, dependency,
backend, broad newline heuristic or historical-version bypass is introduced.

## Verification and release scope

Focused guard and affected-caller suites passed 112 tests. Editor/workspace/shell
suites passed 65 tests, with further pasted-ID and real TipTap split coverage.
Runtime/mobile CSS suites passed 69 tests. Auto import passed 48 tests. These
runs overlap and must not be summed as a unique test total.

Final frozen-source qualification passed all 807 tests in 88 files across the
Reading V2 services/components and affected page, review and book adapters.
The release-recorder suite passed 14 tests. Changed-file ESLint, diff whitespace
and UTF-8 checks passed. Full TypeScript checking retains exactly the same four
Listening diagnostics as the observed deployed-source checkout, with no new
diagnostics. Combined-mark and literal-less-than regressions were included.
The retained summary is
[`2026-11-01-reading-passage-structure-qualification.json`](../../release-audits/2026-11-01-reading-passage-structure-qualification.json).

A static browser fixture used the actual candidate TipTap editor, Studio update
helper, projection and runtime. Typing and splitting preserved original A/B
labels, anchor identities and question references. Heading/list toolbar
operations rendered semantic elements. Desktop 1440px and phone 375px had no
horizontal overflow. This is component browser evidence, not an authenticated
application flow. The live role-port flow was blocked by an occupied unrelated
frontend and an execution-policy rejection of a temporary replacement command.

The isolated candidate starts from observed Hosting source
`943277ad6f8c1c89fed35fcced7afc2f720f46d2`; unrelated dirty development changes
are excluded. Full candidate checks and release outcomes are recorded below
when completed. Focused test results alone do not establish publication.

The deployed-source release recorder predated the current journal's optional
`changeIds` field. Its strict schema now validates and retains that existing
field when recording subsequent operations. A regression covers preservation
through another intent/settlement and rejection of malformed IDs. This necessary
tooling alignment does not relax clean-source, compatibility or deployment gates.

## Existing-content correction

The Talbot Park correction uses a new version generated through the normal
publisher and Firebase update-plan adapter. Stored article wording is preserved;
the introduction and A–G labels are reconstructed, a trailing Markdown separator
is removed, and question links use their verified paragraph contexts. This is
an explicit semantic correction, not a claim that historical block identities
were recoverable. Existing creation/provenance fields are retained using the
revision contract.

Historical snapshots, submitted results and frozen homework are not silently
rewritten. Two active homework assignments reference the old version and have
started submissions. The existing refresh path rejects that state and does not
support these single-passage assignments. Republishing current material cannot
switch those pins safely; this release preserves their content and progress.
Their runtime can render the already-stored inline breaks after the frontend
update, but their historical canonical structure remains unchanged.

## Publication

Pending: final candidate qualification, committed source, current-material
correction, Hosting publication and post-publication readback. Update this
section with the actual release ID and target-specific evidence after execution.
