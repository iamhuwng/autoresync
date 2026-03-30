# IELTS Writing Contracts And Governance

## Canonical Data Contract

Primary source:
- Firestore `writing_submissions/{submissionId}`
- `publishedGrading` is the canonical published artifact

Compatibility / fallback:
- RTDB `test_results` is still required for discovery, release gating, and compatibility
- Firestore `grading` and `annotations` are legacy fallback only
- degraded readers may synthesize a read-only fallback from the RTDB Writing snapshot when canonical detail is unavailable

## Result-Shell Relationship

Writing does not replace the shared result-shell governance layer.

Instead:
- the shared shells still own routing, container chrome, and release/access gates
- Writing-specific readers own the actual Writing content model
- Writing must not be forced back into `SharedSavedResultCore` assumptions

## Visibility And Ownership Rules

- normalized `result.visibility` remains the authority for ownership and teacher inclusion
- raw `teacherId`, `assigningTeacherId`, and `selectedTeacherId` are never authority signals
- solo practice is student-owned and teacher-read-only where visible
- unresolved rows remain excluded from teacher-owned views and analytics
- deleted-source display is allowed only when ownership was proven at submission time

## Storage And Compatibility Rules

- Writing metadata in RTDB supports discovery and compatibility but does not replace the authoritative linked source
- persistence fixes must preserve both canonical Firestore state and RTDB discoverability/indexing
- a graded Firestore submission with a broken RTDB compatibility projection is still an incident state, not an acceptable steady state

## Release-State And Access Rules

- pure Writing submit is acknowledgement-only until feedback is published
- student published access follows the same release-state contract as other saved-result shells
- teacher detail access still depends on the outer assignment gate plus normalized ownership resolution

## Interaction Rules Worth Preserving

- the grading tool is the authoring surface; student results are read-only reflections of published feedback
- student comment-rail behavior should stay aligned with the grading-tool reading model without exposing editing controls
- teacher result readers may support reopen / re-entry into grading when permissions allow

## Detailed References

Use these for implementation detail, not this summary doc:
- grading editor finalization:  
  `../../../.knowns/docs/specs/ielts-writing-grading-editor-finalization-2026-03-30.md`
- result surfaces spec:  
  `../../../.knowns/docs/specs/ielts-writing-result-surfaces-2026-03-30.md`
- current-state scheme:  
  `../../../.knowns/docs/architecture/scheme/ielts-writing-current-state-scheme.md`
- compatibility audit:  
  `../../../.knowns/docs/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29.md`
- shared visibility governance:  
  `../result-visibility-ownership-governance.md`
- shared result-view policy pack:  
  `../result-view/README.md`

## 2026-03-30 Amendment - Shared Comment-Rail Interaction Contract

The wide student Writing result surface and the teacher grading editor now intentionally share the same cross-column comment-navigation model.

Shared interaction rules:
- clicking highlighted essay text forces the `Comments` tab open
- the whole comments rail moves as one block
- the selected comment remains in normal list order
- the right-side visual anchor is the selected comment header row
- the left-side visual anchor is the clicked annotation top line
- the alignment target is `selected comment header top == clicked annotation top`

This preserves interaction continuity between the authoring tool and the published reader.