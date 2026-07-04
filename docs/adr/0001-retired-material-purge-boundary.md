# Purge retired materials while retaining completed academic results

When retiring Google Drive-backed Listening materials, Reading V1, and Quiz, LuyenTap permanently deletes their material records, drafts, active assignments, catalog/index rows, and launch payloads. Existing live sessions are ended through normal Session Closure before removal; no mixed-session migration or session-record hard deletion is introduced. Completed student submissions and academic results remain retained, with unavailable source material represented explicitly. Files stored in users' Google Drive accounts remain outside the purge because LuyenTap has no durable authorization to delete externally owned files; no reconnect or manual-provider cleanup workflow is part of this removal.

The purge runs only through an idempotent one-off CLI. Its default mode produces an exact dry-run manifest; destructive execution requires an explicit `--apply` flag and separate approval. It does not run from browser code, application startup, deployment hooks, or scheduled jobs.

The purge removes Firebase-owned material and delivery records but never deletes R2 objects directly. R2 lifecycle authority may delete an object later only after its existing reference checks prove that no surviving material or retained result still references it.

The purge saves no retired-material ID registry or database tombstones. Dedicated Quiz URLs can still render a Quiz retirement notice because the route identifies the feature. Shared material, homework, and session URLs whose records were purged render a generic material-unavailable state because the remaining ID no longer identifies the deleted material type.

Retained academic results continue to support Answer Review from their saved question-result snapshots. Source Review is unavailable after purge when the result does not embed original passages, question wording, options, images, or audio; those surfaces state that the original material was removed instead of attempting to reload it.
