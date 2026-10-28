# Listening homework UI follow-up — 2026-10-29

Scope: fix eligible retakes opening the previous result, private homework
question counts remaining Loading, and the desktop recording notice clipping
above the viewport. Preserve the existing editor, form, player controls, saved
results, and attempt authority. PDF/Book work is excluded.

The list continues to consume the shared shell homework owner. The detail
page's existing material effect owns its detail-only metadata. Listening reads
only `student_safe_tests/{materialId}/questionCount` and `updatedAt`, from the
existing published projection, for the next attempt's current published test.
Started attempts continue to use their canonical version pins. There are no
list-row reads, secondary shared owners, new data paths, or write-on-read.
Same-material refresh preserves loaded metadata; route changes cancel stale
responses. Missing metadata terminates with Question count unavailable.

Authority: student-data-loading rule, student-shell-right-rail architecture,
and Knowns patterns student-shell-single-data-owner,
summary-first-detail-on-demand, and bulk-enrichment-from-shared-student-history.
Existing action names and route registry entries remain valid.

Local evidence: the new retake/count checks failed before the correction;
homework pages and audio player now pass 33 tests, and the mobile header passes
13 tests. An existing Reading projection fixture lacked its required
displayNumber; only that fixture was corrected. No Reading product logic
changed. The actual header/player layout reproduced a notice top of -9.6875px
on desktop; min-height plus non-shrinking header sizing contains it at
1440/1024/375/320px without horizontal overflow.

Release plan: apply the same reviewed UI delta to the observed deployed Hosting
source in the existing isolated checkout. Use the standard guarded Hosting-only
hotfix route after CI and compatibility review. Backend/storage deployments
are unnecessary. Live retake, count, notice and saved-result checks remain
pending; this record does not yet claim deployment or live completion.
