/**
 * Migration Script: Add profileCompletedAt field to existing users
 * 
 * This script adds the profileCompletedAt field (set to null) to all existing users
 * who don't already have it. This is part of PRD-0015: Academic Record & Enhanced Profile System.
 * 
 * Usage:
 *   node src/services/migrations/addProfileCompletedAt.js
 * 
 * Or from npm:
 *   npm run migrate:profile-completed
 */

import { ref, get, update } from 'firebase/database';
import { database } from '../firebase.js';

/**
 * Main migration function
 */
async function migrateProfileCompletedAt() {
    console.log('🔄 Starting migration: Add profileCompletedAt to existing users...\n');

    try {
        // Get all users
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);

        if (!snapshot.exists()) {
            console.log('ℹ️  No users found in database.');
            return;
        }

        const users = snapshot.val();
        const userIds = Object.keys(users);

        console.log(`📊 Found ${userIds.length} users to process.\n`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process each user
        for (const uid of userIds) {
            const user = users[uid];

            try {
                // Check if user already has profileCompletedAt field
                if ('profileCompletedAt' in user) {
                    console.log(`⏭️  Skipped ${uid} (${user.email || 'no email'}) - already has profileCompletedAt`);
                    skippedCount++;
                    continue;
                }

                // Add profileCompletedAt: null to the user
                const userRef = ref(database, `users/${uid}`);
                await update(userRef, {
                    profileCompletedAt: null,
                });

                console.log(`✅ Updated ${uid} (${user.email || 'no email'}) - added profileCompletedAt: null`);
                updatedCount++;

            } catch (error) {
                console.error(`❌ Error updating ${uid}:`, error.message);
                errorCount++;
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📈 Migration Summary:');
        console.log('='.repeat(60));
        console.log(`✅ Updated: ${updatedCount} users`);
        console.log(`⏭️  Skipped: ${skippedCount} users (already had field)`);
        console.log(`❌ Errors:  ${errorCount} users`);
        console.log(`📊 Total:   ${userIds.length} users`);
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

/**
 * Dry run function - shows what would be updated without making changes
 */
async function dryRun() {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');

    try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);

        if (!snapshot.exists()) {
            console.log('ℹ️  No users found in database.');
            return;
        }

        const users = snapshot.val();
        const userIds = Object.keys(users);

        console.log(`📊 Found ${userIds.length} users.\n`);

        let wouldUpdate = 0;
        let wouldSkip = 0;

        for (const uid of userIds) {
            const user = users[uid];

            if ('profileCompletedAt' in user) {
                console.log(`⏭️  Would skip ${uid} (${user.email || 'no email'}) - already has profileCompletedAt`);
                wouldSkip++;
            } else {
                console.log(`✅ Would update ${uid} (${user.email || 'no email'}) - would add profileCompletedAt: null`);
                wouldUpdate++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📈 Dry Run Summary:');
        console.log('='.repeat(60));
        console.log(`✅ Would update: ${wouldUpdate} users`);
        console.log(`⏭️  Would skip:   ${wouldSkip} users`);
        console.log(`📊 Total:        ${userIds.length} users`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Dry run failed:', error);
        throw error;
    }
}

// Run migration or dry run based on command line argument
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');

if (isDryRun) {
    dryRun()
        .then(() => {
            console.log('\n💡 To run the actual migration, remove the --dry-run flag.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Dry run failed:', error);
            process.exit(1);
        });
} else {
    migrateProfileCompletedAt()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}
