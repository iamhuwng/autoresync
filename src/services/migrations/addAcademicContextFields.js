/**
 * Migration Script: Add Academic Context Fields to Existing Test Results
 * 
 * This script adds null values for the new academic context fields
 * (courseId, courseName, classId, className, moduleId, moduleName)
 * to all existing test results in the database.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 3
 * 
 * Usage:
 *   node src/services/migrations/addAcademicContextFields.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Preview changes without writing to database
 */

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, update } = require('firebase/database');

// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Check for dry-run mode
const isDryRun = process.argv.includes('--dry-run');

/**
 * Main migration function
 */
async function migrateTestResults() {
    console.log('🚀 Starting migration: Add Academic Context Fields to Test Results');
    console.log(`📋 Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be written)'}`);
    console.log('');

    try {
        // Fetch all test results
        const resultsRef = ref(database, 'test_results');
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            console.log('ℹ️  No test results found in database');
            return;
        }

        const results = snapshot.val();
        const resultIds = Object.keys(results);

        console.log(`📊 Found ${resultIds.length} test results to process`);
        console.log('');

        let processedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process each result
        for (const resultId of resultIds) {
            const result = results[resultId];

            try {
                // Check if result already has context fields
                const hasContextFields =
                    result.hasOwnProperty('courseId') ||
                    result.hasOwnProperty('courseName') ||
                    result.hasOwnProperty('classId') ||
                    result.hasOwnProperty('className') ||
                    result.hasOwnProperty('moduleId') ||
                    result.hasOwnProperty('moduleName');

                if (hasContextFields) {
                    console.log(`⏭️  Skipping ${resultId} - already has context fields`);
                    skippedCount++;
                    continue;
                }

                // Prepare update data
                const updateData = {
                    courseId: null,
                    courseName: null,
                    classId: null,
                    className: null,
                    moduleId: null,
                    moduleName: null
                };

                if (isDryRun) {
                    console.log(`🔍 [DRY RUN] Would update ${resultId}:`, updateData);
                    processedCount++;
                } else {
                    // Update the result
                    const resultRef = ref(database, `test_results/${resultId}`);
                    await update(resultRef, updateData);

                    console.log(`✅ Updated ${resultId}`);
                    processedCount++;
                }
            } catch (error) {
                console.error(`❌ Error processing ${resultId}:`, error.message);
                errorCount++;
            }
        }

        // Print summary
        console.log('');
        console.log('📈 Migration Summary:');
        console.log(`   Total results: ${resultIds.length}`);
        console.log(`   Processed: ${processedCount}`);
        console.log(`   Skipped: ${skippedCount}`);
        console.log(`   Errors: ${errorCount}`);
        console.log('');

        if (isDryRun) {
            console.log('ℹ️  This was a dry run. No changes were made to the database.');
            console.log('ℹ️  Run without --dry-run flag to apply changes.');
        } else {
            console.log('✅ Migration completed successfully!');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
    console.log('');
    console.log('🔍 Verifying migration...');

    try {
        const resultsRef = ref(database, 'test_results');
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            console.log('ℹ️  No test results found');
            return;
        }

        const results = snapshot.val();
        const resultIds = Object.keys(results);

        let withContextFields = 0;
        let withoutContextFields = 0;

        for (const resultId of resultIds) {
            const result = results[resultId];

            const hasAllFields =
                result.hasOwnProperty('courseId') &&
                result.hasOwnProperty('courseName') &&
                result.hasOwnProperty('classId') &&
                result.hasOwnProperty('className') &&
                result.hasOwnProperty('moduleId') &&
                result.hasOwnProperty('moduleName');

            if (hasAllFields) {
                withContextFields++;
            } else {
                withoutContextFields++;
                console.log(`⚠️  Result ${resultId} missing context fields`);
            }
        }

        console.log('');
        console.log('📊 Verification Results:');
        console.log(`   Total results: ${resultIds.length}`);
        console.log(`   With context fields: ${withContextFields}`);
        console.log(`   Without context fields: ${withoutContextFields}`);
        console.log('');

        if (withoutContextFields === 0) {
            console.log('✅ All results have context fields!');
        } else {
            console.log('⚠️  Some results are missing context fields');
        }

    } catch (error) {
        console.error('❌ Verification failed:', error);
    }
}

// Run migration
(async () => {
    try {
        await migrateTestResults();

        // Run verification if not dry-run
        if (!isDryRun) {
            await verifyMigration();
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
})();
