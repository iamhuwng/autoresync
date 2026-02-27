/**
 * Migration Script: Migrate notifications to a per-user path
 * 
 * This script migrates the flat `notifications/` structure to `notifications/{userId}/{notificationId}`
 * and removes the `userId` field from the notification body.
 * Part of PRD-0002: Student Dashboard — Activity Stream Migration.
 * 
 * Usage:
 *   npx ts-node src/services/migrations/migrateNotifications.ts
 * 
 * Dry Run:
 *   npx ts-node src/services/migrations/migrateNotifications.ts --dry-run
 */

import { ref, get, set, remove } from 'firebase/database';
import { database } from '../firebase.js'; // Adjusted path

async function migrateNotifications() {
    console.log('🔄 Starting migration: Migrating notifications to per-user paths...\n');

    try {
        const notificationsRef = ref(database, 'notifications');
        const snapshot = await get(notificationsRef);

        if (!snapshot.exists()) {
            console.log('ℹ️  No notifications found in database.');
            return;
        }

        const notifications = snapshot.val();

        // Let's make sure it's the old structure (flat list).
        // If the keys are userIds, it might be already migrated. Let's assume keys are notifIds.
        // If a child has no 'createdAt' but has children with 'createdAt', it might be a userId node.

        let migratedCount = 0;
        let skippedCount = 0;
        let warningCount = 0;
        let errorCount = 0;
        const usersProcessed = new Set();

        const entries = Object.entries(notifications);
        console.log(`📊 Found ${entries.length} nodes in notifications to process.\n`);

        for (const [id, notif] of entries) {
            try {
                // If it's already a per-user node, it won't have the typical notification fields here.
                // A notification usually has 'type', 'title', 'createdAt', etc.
                if (typeof notif !== 'object' || notif === null) continue;

                if (!('type' in notif) && !('title' in notif)) {
                    // This might be a userId holding notifications, safe to skip.
                    console.log(`⏭️  [Migration] Skipping ${id}: looks like an already new per-user node.`);
                    skippedCount++;
                    continue;
                }

                const userId = (notif as any).userId;
                if (!userId) {
                    console.warn(`⚠️ [Migration] Skipping notification ${id}: no userId found`);
                    warningCount++;
                    continue;
                }

                // Check if already migrated
                const newPathRef = ref(database, `notifications/${userId}/${id}`);
                const newPathSnap = await get(newPathRef);
                if (newPathSnap.exists()) {
                    console.log(`⏭️  [Migration] Skipping ${id}: already migrated.`);
                    skippedCount++;
                    continue;
                }

                // Write to new path
                const newNotif = { ...(notif as any) };
                delete newNotif.userId; // remove userId from body

                await set(newPathRef, newNotif);

                // Delete old flat node
                const oldPathRef = ref(database, `notifications/${id}`);
                await remove(oldPathRef);

                console.log(`📦 [Migration] Processing notification ${id} for user ${userId}...`);
                migratedCount++;
                usersProcessed.add(userId);

            } catch (error) {
                console.error(`❌ Error updating ${id}:`, error);
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📈 Migration Summary:');
        console.log('='.repeat(60));
        console.log(`✅ [Migration] Migrated ${migratedCount} notifications for ${usersProcessed.size} users.`);
        console.log(`⏭️  Skipped:   ${skippedCount} nodes`);
        console.log(`⚠️  Warnings:  ${warningCount} (no userId)`);
        console.log(`❌ Errors:    ${errorCount} items`);
        console.log('='.repeat(60));

        if (errorCount === 0) {
            console.log('\n✨ Migration completed successfully!');
        } else {
            console.log('\n⚠️  Migration completed with errors. Please review the logs above.');
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    }
}

async function dryRun() {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');

    try {
        const notificationsRef = ref(database, 'notifications');
        const snapshot = await get(notificationsRef);

        if (!snapshot.exists()) {
            console.log('ℹ️  No notifications found in database.');
            return;
        }

        const notifications = snapshot.val();

        let wouldMigrate = 0;
        let wouldSkip = 0;
        let wouldWarn = 0;
        const usersProcessed = new Set();

        const entries = Object.entries(notifications);
        console.log(`📊 Found ${entries.length} nodes.\n`);

        for (const [id, notif] of entries) {
            if (typeof notif !== 'object' || notif === null) continue;

            if (!('type' in notif) && !('title' in notif)) {
                console.log(`⏭️  Would skip ${id}: looks like a per-user node.`);
                wouldSkip++;
                continue;
            }

            const userId = (notif as any).userId;
            if (!userId) {
                console.warn(`⚠️  Would skip ${id}: no userId found`);
                wouldWarn++;
                continue;
            }

            console.log(`✅ Would migrate ${id} -> notifications/${userId}/${id}`);
            wouldMigrate++;
            usersProcessed.add(userId);
        }

        console.log('\n' + '='.repeat(60));
        console.log('📈 Dry Run Summary:');
        console.log('='.repeat(60));
        console.log(`✅ Would migrate: ${wouldMigrate} notifications (${usersProcessed.size} users)`);
        console.log(`⏭️  Would skip:    ${wouldSkip} nodes`);
        console.log(`⚠️  Would warn:    ${wouldWarn} nodes`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Dry run failed:', error);
        throw error;
    }
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');

if (isDryRun) {
    dryRun()
        .then(() => {
            console.log('\n💡 To run actual migration, remove --dry-run flag.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Dry run failed:', error);
            process.exit(1);
        });
} else {
    migrateNotifications()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}
