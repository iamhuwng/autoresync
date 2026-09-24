/**
 * Course Announcement Service
 * Handles course announcements and notifications to students
 * Phase 7: Course Announcements & Notifications
 */

import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { database } from './firebase';
import { createCourseAnnouncementAction } from './courseAnnouncementActionClient';

const ANNOUNCEMENTS_REF = 'course_announcements';

export interface CourseAnnouncement {
    id: string;
    courseId: string;
    courseName: string;
    teacherId: string;
    teacherName: string;
    targetClassIds: string[]; // Which classes to send to (empty = all enrolled students)
    title: string;
    content: string; // Rich text HTML content
    attachments?: {
        name: string;
        url: string;
        type: string;
        size: number;
    }[];
    createdAt: number;
    sentToStudentIds: string[]; // Immutable active-enrollment snapshot used for notification delivery
}

/**
 * Create and send a course announcement
 * @param announcement - Announcement data
 * @returns Created announcement ID and notification IDs
 */
export async function createCourseAnnouncement(
    announcement: Omit<CourseAnnouncement, 'id' | 'createdAt' | 'sentToStudentIds'>
): Promise<{ success: boolean; announcementId?: string; notificationIds?: string[]; error?: string }> {
    try {
        if (!announcement.courseId || !announcement.title || !announcement.content
            || !Array.isArray(announcement.targetClassIds)) {
            return { success: false, error: 'Missing required fields' };
        }
        const result = await createCourseAnnouncementAction({
            courseId: announcement.courseId,
            targetClassIds: announcement.targetClassIds,
            title: announcement.title,
            content: announcement.content,
            attachments: announcement.attachments,
        });

        return {
            success: true,
            announcementId: result.announcementId,
            notificationIds: result.notificationIds,
        };
    } catch (error) {
        console.error('Error creating course announcement:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create announcement',
        };
    }
}

/**
 * Get all announcements for a course
 * @param courseId - The course ID
 * @returns Array of announcements
 */
export async function getCourseAnnouncements(courseId: string): Promise<CourseAnnouncement[]> {
    try {
        const announcementsRef = ref(database, ANNOUNCEMENTS_REF);
        const courseQuery = query(announcementsRef, orderByChild('courseId'), equalTo(courseId));
        const snapshot = await get(courseQuery);

        if (!snapshot.exists()) {
            return [];
        }

        const announcementsData = snapshot.val();
        const announcements: CourseAnnouncement[] = [];

        for (const data of Object.values(announcementsData)) {
            announcements.push(data as CourseAnnouncement);
        }

        // Sort by creation date (newest first)
        announcements.sort((a, b) => b.createdAt - a.createdAt);

        return announcements;
    } catch (error) {
        console.error('Error getting course announcements:', error);
        return [];
    }
}

/**
 * Get a single announcement by ID
 * @param announcementId - The announcement ID
 * @returns Announcement data or null
 */
export async function getAnnouncementById(announcementId: string): Promise<CourseAnnouncement | null> {
    try {
        const announcementRef = ref(database, `${ANNOUNCEMENTS_REF}/${announcementId}`);
        const snapshot = await get(announcementRef);

        if (!snapshot.exists()) {
            return null;
        }

        return snapshot.val() as CourseAnnouncement;
    } catch (error) {
        console.error('Error getting announcement:', error);
        return null;
    }
}

/**
 * Get announcements for a student (across all their courses)
 * @param studentId - The student ID
 * @returns Array of announcements
 */
export async function getStudentAnnouncements(studentId: string): Promise<CourseAnnouncement[]> {
    try {
        const announcementsRef = ref(database, ANNOUNCEMENTS_REF);
        const snapshot = await get(announcementsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const announcementsData = snapshot.val();
        const announcements: CourseAnnouncement[] = [];

        for (const data of Object.values(announcementsData)) {
            const announcement = data as CourseAnnouncement;

            // Check if this student was a recipient
            if (announcement.sentToStudentIds.includes(studentId)) {
                announcements.push(announcement);
            }
        }

        // Sort by creation date (newest first)
        announcements.sort((a, b) => b.createdAt - a.createdAt);

        return announcements;
    } catch (error) {
        console.error('Error getting student announcements:', error);
        return [];
    }
}
