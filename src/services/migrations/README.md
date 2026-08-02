# Database Migrations

This folder contains database migration scripts for the Homework App.

## Running Migrations

### Profile Completed At Migration

Adds the `profileCompletedAt` field to all existing users.

**Dry run (recommended first):**
```bash
node src/services/migrations/addProfileCompletedAt.js --dry-run
```

**Actual migration:**
```bash
node src/services/migrations/addProfileCompletedAt.js
```

## Migration Guidelines

1. **Always run dry-run first** to see what will be changed
2. **Backup your database** before running migrations in production
3. **Test migrations** in a development environment first
4. **Review the output** carefully for any errors
5. **Document** any manual steps required after migration

## Migration Log

| Date | Script | Description | Status |
|------|--------|-------------|--------|
| 2026-01-31 | `addProfileCompletedAt.js` | Add profileCompletedAt field to users | Created |
| 2026-02-22 | `migrateNotifications.ts` | Refactor notifications to per-user path | Created |

### Notifications Migration

The old browser-SDK entry point is retired and fails closed. Notification data
must be migrated only by the bounded operator runner, which authenticates with
the dedicated deployment identity, persists a signed checkpoint, and supports
dry-run/resume/reconcile/rollback:

```bash
node scripts/migrate-notifications.mjs --dry-run --batch-size 100
node scripts/migrate-notifications.mjs --execute --batch-size 100
node scripts/migrate-notifications.mjs --reconcile --batch-size 100
node scripts/migrate-notifications.mjs --rollback
```

Do not pass credentials or user tokens on the command line. The runner requires
the deployment-only environment variables documented in the PRD0062 evidence
runbook, defaults to gcloud service-account impersonation for a short-lived
operator token, performs a checkpoint-path REST preflight, and rejects
`FIREBASE_TOKEN`/browser-user token credentials.
