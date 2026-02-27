/**
 * Migration: Flag Existing Class Instance Courses
 *
 * When `linkCourseToClass` creates a deep copy of a course for a class, the copy
 * used to NOT carry an `isClassInstance: true` flag. This migration scans all
 * `class_course_links` records, finds the corresponding course copies in `courses/`,
 * and retroactively stamps them with the correct metadata so they are filtered out
 * of teacher and student management views.
 *
 * Safe to re-run: skips any course that already has `isClassInstance: true`.
 */

import { ref, get, update } from 'firebase/database';
import { database } from '../firebase';
import type { ClassCourseLink, Course } from '../../types/course.types';

const LINK_REF = 'class_course_links';
const COURSES_REF = 'courses';

interface MigrationResult {
    success: boolean;
    scanned: number;
    updated: number;
    skipped: number;
    errors: string[];
}

/**
 * Run the migration to retroactively flag class instance course copies.
 */
export async function flagClassInstanceCourses(): Promise<MigrationResult> {
    console.log('🚀 [flagClassInstanceCourses] Starting migration...');
    const errors: string[] = [];
    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    try {
        // 1. Fetch all class-course links
        const linksSnapshot = await get(ref(database, LINK_REF));
        if (!linksSnapshot.exists()) {
            console.log('ℹ️  No class_course_links found. Nothing to migrate.');
            return { success: true, scanned: 0, updated: 0, skipped: 0, errors: [] };
        }

        const links = Object.values(linksSnapshot.val()) as ClassCourseLink[];
        console.log(`Found ${links.length} class_course_links to process.`);

        for (const link of links) {
            const courseId = link.courseId;
            scanned++;

            try {
                const courseSnapshot = await get(ref(database, `${COURSES_REF}/${courseId}`));
                if (!courseSnapshot.exists()) {
                    console.warn(`⚠️  Course ${courseId} (from link ${link.id}) not found in 'courses/'. Skipping.`);
                    skipped++;
                    continue;
                }

                const course = courseSnapshot.val() as Course;

                // Already flagged in a previous run — skip.
                if (course.isClassInstance === true) {
                    console.log(`⏩ Course ${courseId} already flagged as class instance. Skipping.`);
                    skipped++;
                    continue;
                }

                // Derive the originalName: if the course name ends with ' (SomeName)', strip it.
                // The original course name is stored in ClassCourseLink.originalCourseId → fetch it,
                // but as a simpler heuristic we can also look it up via originalCourseId on the link.
                let originalName = course.name;
                if (link.originalCourseId) {
                    const origSnapshot = await get(ref(database, `${COURSES_REF}/${link.originalCourseId}`));
                    if (origSnapshot.exists()) {
                        originalName = (origSnapshot.val() as Course).name;
                    }
                }

                const patch: Partial<Course> = {
                    isClassInstance: true,
                    originalName,
                    visibility: 'private' as const,
                };

                await update(ref(database, `${COURSES_REF}/${courseId}`), patch);
                console.log(`✅ Flagged course ${courseId} ("${course.name}") as class instance.`);
                updated++;

            } catch (err) {
                const msg = `Failed to process course ${courseId}: ${err instanceof Error ? err.message : String(err)}`;
                console.error(`❌ ${msg}`);
                errors.push(msg);
            }
        }

    } catch (err) {
        const msg = `Failed to fetch class_course_links: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`❌ ${msg}`);
        errors.push(msg);
    }

    const result: MigrationResult = {
        success: errors.length === 0,
        scanned,
        updated,
        skipped,
        errors,
    };

    console.log('\n📊 Migration Summary:');
    console.log(`  Links scanned : ${scanned}`);
    console.log(`  Courses updated: ${updated}`);
    console.log(`  Courses skipped: ${skipped}`);
    console.log(`  Errors  : ${errors.length}`);
    if (result.success) {
        console.log('\n✅ Migration completed successfully!');
    } else {
        console.log('\n⚠️  Migration completed with errors. See above for details.');
    }

    return result;
}
