# LuyenTap Product Context

LuyenTap is an academic workspace where teachers author and assign learning materials and students complete and review assessed work.

## Language

**Retired Feature**:
A former product capability that cannot create, assign, launch, or review new work. Historical records may remain for retention purposes.
_Avoid_: Removed feature, deprecated feature

**Retirement Notice**:
A static page explaining that a requested feature is retired and directing the user to a supported destination.
_Avoid_: Error page, tombstone

**Obsolete Source**:
A stored media source that is no longer authorized for upload, playback, validation, or new use.
_Avoid_: Deprecated source, legacy source

**Application Purge**:
Permanent deletion of a material and its references from LuyenTap-owned storage. Externally owned source files are outside this boundary.
_Avoid_: Asset purge, provider cleanup

**Reading V1**:
The retired IELTS Reading implementation that predates the explicit Reading V2 delivery engine.
_Avoid_: Reading, legacy Reading

**Reading V2**:
The supported IELTS Reading implementation identified by an explicit Reading V2 source or delivery-engine marker.
_Avoid_: New Reading, current Reading

**Historical Record**:
Retained data from a retired feature that is not available through active product runtime or result-review flows.
_Avoid_: Orphaned data, dead data

**Academic Result**:
A completed student submission retained as an academic record independently of the continued availability of its source material.
_Avoid_: Material result, session artifact

**Session Closure**:
The transition of an active live session to its normal ended state without deleting its record or completed results.
_Avoid_: Session purge, session deletion

**Answer Review**:
A review reconstructed from a saved academic result, including recorded answers, correctness, scores, and feedback.
_Avoid_: Full review, source review

**Source Review**:
A review that also requires original material context such as passages, question wording, options, images, or audio.
_Avoid_: Answer review, result review
