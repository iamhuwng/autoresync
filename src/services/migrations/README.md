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
Migrates the flat `notifications/` structure to `notifications/{userId}/{notificationId}`.
**Dry Run**: `npx ts-node src/services/migrations/migrateNotifications.ts --dry-run`
**Actual**: `npx ts-node src/services/migrations/migrateNotifications.ts`
