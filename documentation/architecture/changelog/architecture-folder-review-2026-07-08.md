# Architecture Folder Review

Changelog ID: `CL-20260708-ARCHITECTURE-FOLDER-REVIEW`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Scope

Reviewed remaining `documentation/architecture/**/*.md` files outside `documentation/architecture/changelog/`.

Classification meanings:

- `KEEP_ARCHITECTURE`: current architecture/current-state/contract/policy/map.
- `MOVE_CHANGELOG`: primarily history, repair, closure, audit, implementation, verification, or traceability record.
- `MOVE_OTHER`: useful rule/process doc, but not architecture or changelog.
- `SPLIT`: mixed; keep a concise current architecture doc, move dated amendment/evidence/proof/history sections to changelog.

## Clear Moves Completed

| File | Classification | New path | Reason |
| --- | --- | --- | --- |
| `documentation/architecture/result-view-map.md` | `MOVE_CHANGELOG` | `documentation/architecture/changelog/result-view-map.md` | Older PRD-0040 surface map with phase notes, stale producer inventory, migration history; concise current map already exists under `result-view/surface-map.md`. |
| `documentation/architecture/result-view-permission-matrix.md` | `MOVE_CHANGELOG` | `documentation/architecture/changelog/result-view-permission-matrix.md` | Older governance matrix and reconciliation notes; concise current policy already exists under `result-view/visibility-policy.md`. |
| `documentation/architecture/result-view/verification-matrix.md` | `MOVE_CHANGELOG` | `documentation/architecture/changelog/result-view-verification-matrix.md` | File states it is traceability, not policy. |
| `documentation/architecture/repo-branch-source-of-truth.md` | `MOVE_OTHER` | `documentation/rules/repo-branch-source-of-truth.md` | Git/worktree operational policy, not product architecture. |
| `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md` | `MOVE_OTHER` | `documentation/rules/mobile-ielts-listening-runtime-diagnostics.md` | Runtime diagnostic logging rule, not product architecture. |

## History Moved, Current Contract Kept

| File | Classification | History path | Reason |
| --- | --- | --- | --- |
| `documentation/architecture/reading-v2-audit-trail.md` | `KEEP_ARCHITECTURE` | `documentation/architecture/changelog/reading-v2-audit-trail.md` | Active audit path/rule/service contract; long implementation history moved. |
| `documentation/architecture/reading-v2-auto-v4-provider-review-contract.md` | `KEEP_ARCHITECTURE` | `documentation/architecture/changelog/reading-v2-auto-v4-provider-review-contract.md` | Active Auto V4 handoff boundary; long historical notes moved. |
| `documentation/architecture/reading-v2-material-publish-and-passage-library.md` | `KEEP_ARCHITECTURE` | `documentation/architecture/changelog/reading-v2-material-publish-and-passage-library.md` | Active publish/listing/homework contract; long amendments moved. |
| `documentation/architecture/reading-v2-material-removal-lifecycle.md` | `KEEP_ARCHITECTURE` | `documentation/architecture/changelog/reading-v2-material-removal-lifecycle.md` | Active removal lifecycle contract; detailed evidence moved. |
| `documentation/architecture/reading-v2-runtime-integrations.md` | `KEEP_ARCHITECTURE` | `documentation/architecture/changelog/reading-v2-runtime-integrations.md` | Active runtime integration contract referenced by safety rules; detailed history moved. |
| `documentation/architecture/reading-v2-studio-review-issues-contract.md` | `KEEP_ARCHITECTURE` | `documentation/architecture/changelog/reading-v2-studio-review-issues-contract.md` | Active Studio review issue contract; detailed history moved. |
| `documentation/architecture/homework-result-visibility-repair.md` | `MOVE_CHANGELOG` | `documentation/architecture/changelog/homework-result-visibility-repair.md` | Repair note, not architecture. Current visibility rules live in `result-visibility-ownership-governance.md` and `result-view/visibility-policy.md`. |
| `documentation/architecture/reading-v2-auto-source-ledger-and-repair.md` | `MOVE_CHANGELOG` | `documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md` | Ledger/repair companion, not bare architecture. Active Auto V4 boundary lives in `reading-v2-auto-v4-provider-review-contract.md`. |
| `documentation/architecture/thcs-runtime-bridge-repair.md` | `MOVE_CHANGELOG` | `documentation/architecture/changelog/thcs-runtime-bridge-repair.md` | Repair/live evidence record, not architecture. Active THCS listing contract lives in `teacher-materials-listing-and-diagnostics.md` and `universal-material-summary-integration.md`. |

## Keep

| File | Classification | Reason |
| --- | --- | --- |
| `academic-record/README.md` | `KEEP_ARCHITECTURE` | Architecture pack index and update rules. |
| `academic-record/analytics-readiness.md` | `KEEP_ARCHITECTURE` | Defines analytics readiness layers and guardrails. |
| `academic-record/page-architecture.md` | `KEEP_ARCHITECTURE` | Defines route, shell ownership, hierarchy, data ownership. |
| `academic-record/progression-model.md` | `KEEP_ARCHITECTURE` | Defines progression semantics and future consumers. |
| `book-editor-authoring-modal-architecture.md` | `KEEP_ARCHITECTURE` | Current modal architecture; small verification tail only. |
| `browser-document-title-architecture.md` | `KEEP_ARCHITECTURE` | Current document-title ownership model. |
| `class-code-join-approval-gating.md` | `KEEP_ARCHITECTURE` | Current enrollment mode and approval contract. |
| `course-class-management.md` | `KEEP_ARCHITECTURE` | Current class/course/result ownership boundary aggregator. |
| `firebase-hosting-worker-endpoint-policy.md` | `KEEP_ARCHITECTURE` | Current infrastructure endpoint authority. |
| `master_changelog.md` | `KEEP_ARCHITECTURE` | User-required master changelog location exception. |
| `mobile-ielts-listening-audio-navigation.md` | `KEEP_ARCHITECTURE` | Current mobile Listening audio/navigation contract. |
| `mobile-ielts-reading-test-taking-architecture.md` | `KEEP_ARCHITECTURE` | Current mobile Reading delivery architecture. |
| `reading-passage-highlighting-architecture.md` | `KEEP_ARCHITECTURE` | Current source-of-truth and selection mapping contract. |
| `result-view/README.md` | `KEEP_ARCHITECTURE` | Current result-view architecture pack index. |
| `result-view/surface-map.md` | `KEEP_ARCHITECTURE` | Current concise surface map. |
| `result-view/visibility-policy.md` | `KEEP_ARCHITECTURE` | Current concise visibility policy. |
| `result-visibility-ownership-governance.md` | `KEEP_ARCHITECTURE` | Current result visibility ownership governance. |
| `retired-features-current-state.md` | `KEEP_ARCHITECTURE` | Current authority for retired feature boundaries. |
| `student-dashboard-architecture.md` | `KEEP_ARCHITECTURE` | Current dashboard layout/data contract. |
| `student-experience-architecture.md` | `KEEP_ARCHITECTURE` | Current student workspace architecture. |
| `student-mobile-responsiveness-architecture.md` | `KEEP_ARCHITECTURE` | Current mobile shell/layout contract. |
| `student-shell-data-loading.md` | `KEEP_ARCHITECTURE` | Current data ownership/loading contract. |
| `student-shell-right-rail-architecture.md` | `KEEP_ARCHITECTURE` | Current right-rail layout/data contract. |
| `student-startup-bundle-segmentation.md` | `KEEP_ARCHITECTURE` | Current startup/bootstrap segmentation contract. |
| `student-test-delivery-projections.md` | `KEEP_ARCHITECTURE` | Current student-safe projection contract. |
| `teacher-lobby-authoring-and-navigation.md` | `KEEP_ARCHITECTURE` | Current teacher lobby create/navigation contract. |
| `teacher-material-visual-taxonomy.md` | `KEEP_ARCHITECTURE` | Current visual taxonomy and rendering contract. |
| `teacher-materials-bulk-selection-actions.md` | `KEEP_ARCHITECTURE` | Current selection/action contract. |
| `teacher-materials-list-view-contract.md` | `KEEP_ARCHITECTURE` | Current list-view geometry/action/typography contract. |
| `ui-design-standards.md` | `KEEP_ARCHITECTURE` | Current UI standard. |

## Split Later

| File | Classification | Reason |
| --- | --- | --- |
| `homework-solo-practice-architecture.md` | `SPLIT` | Starts with current ownership rules, then contains many dated amendments and feature-history records. |
| `ielts-reading-v2-listening-unification.md` | `SPLIT` | Contains current unification boundary plus extensive PRD-0055 task status/proof/history. |
| `ielts-writing/ai-suggestions-and-injection.md` | `SPLIT` | Current contract, but should shed runtime/history details if it grows. |
| `ielts-writing/contracts-and-governance.md` | `SPLIT` | Current governance plus many dated amendments. |
| `ielts-writing/essay-editor-tool-contract-and-mark-composition.md` | `SPLIT` | Current tool contract plus many follow-up history sections. |
| `ielts-writing/grading-editor-state-and-compatibility.md` | `SPLIT` | Current grading contract plus many follow-up history sections. |
| `ielts-writing/lifecycle-and-surfaces.md` | `SPLIT` | Current lifecycle/surface map plus dated amendments. |
| `reading-staged-parse-job.md` | `SPLIT` | Current staged pipeline model plus dated parser/provider amendments. |
| `results-academic-record.md` | `SPLIT` | Current alignment note plus dated Writing comment-rail amendments. |
| `session-lifecycle-authority.md` | `SPLIT` | Current authority plus migration, obsolete designs, verification commands. |
| `teacher-class-management-lifecycle.md` | `SPLIT` | Current lifecycle contract plus incident evidence. |
| `teacher-materials-listing-and-diagnostics.md` | `SPLIT` | Current listing contract plus extensive repair/proof/evidence sections. |
| `teacher-route-runtime-resilience.md` | `SPLIT` | Current resilience contract plus runtime hardening note. |
| `teacher-test-creation-parsing-and-review.md` | `SPLIT` | Current parser/review contract plus multiple dated amendments. |
| `universal-material-summary-integration.md` | `SPLIT` | Core summary architecture plus conversation authority, repairs, migration order, closure evidence, rollout gates. |
| `upload-storage-authority.md` | `SPLIT` | Current storage authority plus long PRD/task proof, deployment evidence, and historical snapshots. |

## Keep With Watch

| File | Classification | Reason |
| --- | --- | --- |
| `ielts-writing/README.md` | `KEEP_ARCHITECTURE` | Pack index; references detailed specs and update rules. |
| `ielts-writing/authoring-edit-shell-and-publish-contract.md` | `KEEP_ARCHITECTURE` | Current authoring/edit shell contract. |
| `ielts-writing/copy-paste-toggle-and-attempt-persistence.md` | `KEEP_ARCHITECTURE` | Current live/homework copy-paste toggle contract. |

## Next Work

Do not move `SPLIT` files wholesale. Rewrite each one into:

1. a concise current architecture file that keeps only live contracts, owners, data paths, and update rules; and
2. one or more `CL-*` detail files for dated amendments, proof, incident, and migration history.
