/**
 * Migration Script: Add Ownership Fields
 * 
 * This script migrates existing tests and quizzes to include:
 * - ownerId: The UID of the user who created the content
 * - isPublic: Whether the content is publicly accessible
 * 
 * For legacy content without an owner, we assign to a default "legacy" owner
 * and mark them as public so they remain accessible.
 */

import { ref, get, update } from 'firebase/database';
import { database } from '../firebase';
import type { TestData } from '../testStorage';

interface MigrationResult {
  success: boolean;
  testsUpdated: number;
  quizzesUpdated: number;
  classesUpdated: number;
  errors: string[];
}

/**
 * Migrate all tests to include ownership fields
 */
async function migrateTests(defaultOwnerId: string = 'legacy-admin'): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const testsRef = ref(database, 'tests');
    const snapshot = await get(testsRef);

    if (!snapshot.exists()) {
      console.log('No tests found to migrate');
      return { updated: 0, errors: [] };
    }

    const tests = snapshot.val();
    const testIds = Object.keys(tests);

    console.log(`Found ${testIds.length} tests to check for migration`);

    for (const testId of testIds) {
      const test = tests[testId] as TestData;

      // Check if test already has ownership fields
      if (test.ownerId !== undefined && test.isPublic !== undefined) {
        console.log(`Test ${testId} already has ownership fields, skipping`);
        continue;
      }

      try {
        const updates: Partial<TestData> = {};

        // Add ownerId if missing
        if (test.ownerId === undefined) {
          // Try to use createdBy if it exists and looks like a UID
          // Ignore 'teacher-default', 'admin-teacher', and short strings
          if (test.createdBy &&
            test.createdBy !== 'teacher-default' &&
            test.createdBy !== 'admin-teacher' &&
            test.createdBy.length > 10) {
            updates.ownerId = test.createdBy;
          } else {
            updates.ownerId = defaultOwnerId;
          }
        }

        // Add isPublic if missing (default to true for legacy content)
        if (test.isPublic === undefined) {
          updates.isPublic = true;
        }

        // Update the test
        const testRef = ref(database, `tests/${testId}`);
        await update(testRef, updates);

        console.log(`✅ Migrated test ${testId}:`, updates);
        updated++;
      } catch (error) {
        const errorMsg = `Failed to migrate test ${testId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return { updated, errors };
  } catch (error) {
    const errorMsg = `Failed to fetch tests: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    return { updated, errors: [errorMsg, ...errors] };
  }
}

/**
 * Migrate all quizzes to include ownership fields
 */
async function migrateQuizzes(defaultOwnerId: string = 'legacy-admin'): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const quizzesRef = ref(database, 'quizzes');
    const snapshot = await get(quizzesRef);

    if (!snapshot.exists()) {
      console.log('No quizzes found to migrate');
      return { updated: 0, errors: [] };
    }

    const quizzes = snapshot.val();
    const quizIds = Object.keys(quizzes);

    console.log(`Found ${quizIds.length} quizzes to check for migration`);

    for (const quizId of quizIds) {
      const quiz = quizzes[quizId];

      // Check if quiz already has ownership fields
      if (quiz.ownerId !== undefined && quiz.isPublic !== undefined) {
        console.log(`Quiz ${quizId} already has ownership fields, skipping`);
        continue;
      }

      try {
        const updates: any = {};

        // Add ownerId if missing
        if (quiz.ownerId === undefined) {
          // Try to use createdBy if it exists and looks like a UID
          if (quiz.createdBy && quiz.createdBy !== 'teacher-default' && quiz.createdBy.length > 10) {
            updates.ownerId = quiz.createdBy;
          } else {
            updates.ownerId = defaultOwnerId;
          }
        }

        // Add isPublic if missing (default to true for legacy content)
        if (quiz.isPublic === undefined) {
          updates.isPublic = true;
        }

        // Update the quiz
        const quizRef = ref(database, `quizzes/${quizId}`);
        await update(quizRef, updates);

        console.log(`✅ Migrated quiz ${quizId}:`, updates);
        updated++;
      } catch (error) {
        const errorMsg = `Failed to migrate quiz ${quizId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return { updated, errors };
  } catch (error) {
    const errorMsg = `Failed to fetch quizzes: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    return { updated, errors: [errorMsg, ...errors] };
  }
}

/**
 * Migrate all classes to use authenticated user IDs
 */
async function migrateClasses(): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const classesRef = ref(database, 'classes');
    const snapshot = await get(classesRef);

    if (!snapshot.exists()) {
      console.log('No classes found to migrate');
      return { updated: 0, errors: [] };
    }

    const classes = snapshot.val();
    const classIds = Object.keys(classes);

    console.log(`Found ${classIds.length} classes to check for migration`);

    for (const classId of classIds) {
      const classData = classes[classId];

      // Check if class has a valid createdBy field
      if (classData.createdBy && classData.createdBy !== 'admin-teacher' && classData.createdBy !== 'unknown') {
        console.log(`Class ${classId} already has valid createdBy, skipping`);
        continue;
      }

      try {
        // For now, we can't automatically determine the owner of legacy classes
        // They will need to be manually claimed or remain as 'legacy-admin'
        const updates = {
          createdBy: 'legacy-admin'
        };

        const classRef = ref(database, `classes/${classId}`);
        await update(classRef, updates);

        console.log(`✅ Migrated class ${classId}`);
        updated++;
      } catch (error) {
        const errorMsg = `Failed to migrate class ${classId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return { updated, errors };
  } catch (error) {
    const errorMsg = `Failed to fetch classes: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    return { updated, errors: [errorMsg, ...errors] };
  }
}

/**
 * Run the complete migration
 */
export async function runOwnershipMigration(defaultOwnerId: string = 'legacy-admin'): Promise<MigrationResult> {
  console.log('🚀 Starting ownership migration...');
  console.log(`Default owner ID: ${defaultOwnerId}`);

  const testResults = await migrateTests(defaultOwnerId);
  const quizResults = await migrateQuizzes(defaultOwnerId);
  const classResults = await migrateClasses();

  const result: MigrationResult = {
    success: testResults.errors.length === 0 && quizResults.errors.length === 0 && classResults.errors.length === 0,
    testsUpdated: testResults.updated,
    quizzesUpdated: quizResults.updated,
    classesUpdated: classResults.updated,
    errors: [...testResults.errors, ...quizResults.errors, ...classResults.errors]
  };

  console.log('\n📊 Migration Summary:');
  console.log(`Tests updated: ${result.testsUpdated}`);
  console.log(`Quizzes updated: ${result.quizzesUpdated}`);
  console.log(`Classes updated: ${result.classesUpdated}`);
  console.log(`Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    result.errors.forEach(error => console.log(`  - ${error}`));
  }

  if (result.success) {
    console.log('\n✅ Migration completed successfully!');
  } else {
    console.log('\n⚠️ Migration completed with errors');
  }

  return result;
}

/**
 * Dry run - check what would be migrated without making changes
 */
export async function dryRunOwnershipMigration(): Promise<{ testsToMigrate: number; quizzesToMigrate: number; classesToMigrate: number }> {
  console.log('🔍 Running dry-run migration check...');

  let testsToMigrate = 0;
  let quizzesToMigrate = 0;
  let classesToMigrate = 0;

  try {
    // Check tests
    const testsRef = ref(database, 'tests');
    const testsSnapshot = await get(testsRef);

    if (testsSnapshot.exists()) {
      const tests = testsSnapshot.val();
      testsToMigrate = Object.values(tests).filter((test: any) =>
        test.ownerId === undefined || test.isPublic === undefined
      ).length;
    }

    // Check quizzes
    const quizzesRef = ref(database, 'quizzes');
    const quizzesSnapshot = await get(quizzesRef);

    if (quizzesSnapshot.exists()) {
      const quizzes = quizzesSnapshot.val();
      quizzesToMigrate = Object.values(quizzes).filter((quiz: any) =>
        quiz.ownerId === undefined || quiz.isPublic === undefined
      ).length;
    }

    // Check classes
    const classesRef = ref(database, 'classes');
    const classesSnapshot = await get(classesRef);

    if (classesSnapshot.exists()) {
      const classes = classesSnapshot.val();
      classesToMigrate = Object.values(classes).filter((classData: any) =>
        !classData.createdBy || classData.createdBy === 'admin-teacher' || classData.createdBy === 'unknown'
      ).length;
    }

    console.log(`\n📊 Dry Run Results:`);
    console.log(`Tests needing migration: ${testsToMigrate}`);
    console.log(`Quizzes needing migration: ${quizzesToMigrate}`);
    console.log(`Classes needing migration: ${classesToMigrate}`);

    return { testsToMigrate, quizzesToMigrate, classesToMigrate };
  } catch (error) {
    console.error('❌ Dry run failed:', error);
    return { testsToMigrate: 0, quizzesToMigrate: 0, classesToMigrate: 0 };
  }
}
