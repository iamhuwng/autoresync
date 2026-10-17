/**
 * Retired browser migration entry point.
 *
 * Notification data migration is an operator-only deployment action. Keeping
 * a Firebase browser-SDK writer under src/ would make it too easy to bundle or
 * invoke with a user token, so this compatibility entry point fails closed.
 * Use `node scripts/migrate-notifications.mjs --dry-run` or `--execute` from a
 * deployment environment with the dedicated migration identity.
 */
export const notificationMigrationEntryPoint = 'operator-script-only';

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('migrateNotifications.ts')) {
    console.error(JSON.stringify({ code: 'notification_migration_operator_only' }));
    process.exitCode = 1;
}
