/**
 * Course Announcement Service
 * Handles course announcements and notifications to students
 * Phase 7: Course Announcements & Notifications
 */

import { ref, push, set, get, query, orderByChild, equalTo } from 'firebase/database';
import { database } from './firebase';
import { createTrustedBulkNotifications } from './notificationProducerClient';
import { getEnrollmentsByCourse } from './enrollmentManager';

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
    sentToStudentIds: string[]; // Track who received the notification
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
        // Validate required fields
        if (!announcement.courseId || !announcement.teacherId || !announcement.title || !announcement.content) {
            return { success: false, error: 'Missing required fields' };
        }

        // Get all enrollments for the course
        const enrollments = await getEnrollmentsByCourse(announcement.courseId);

        // Filter students based on target classes (if specified)
        let targetStudentIds: string[] = [];

        if (announcement.targetClassIds.length > 0) {
            // Only students in specified classes
            targetStudentIds = enrollments
                .filter(e =>
                    e.status === 'active' &&
                    e.sourceClassId &&
                    announcement.targetClassIds.includes(e.sourceClassId)
                )
                .map(e => e.studentId);
        } else {
            // All enrolled students
            targetStudentIds = enrollments
                .filter(e => e.status === 'active')
                .map(e => e.studentId);
        }

        if (targetStudentIds.length === 0) {
            return { success: false, error: 'No students found to send announcement to' };
        }

        // Create announcement record
        const announcementRef = push(ref(database, ANNOUNCEMENTS_REF));
        const announcementId = announcementRef.key!;

        const announcementData: CourseAnnouncement = {
            ...announcement,
            id: announcementId,
            createdAt: Date.now(),
            sentToStudentIds: targetStudentIds,
        };

        await set(announcementRef, announcementData);

        // Create notifications for all target students
        const notificationResult = await createTrustedBulkNotifications(
            targetStudentIds,
            {
                producerFamily: 'course-announcement',
                authorityRecordId: announcementId,
                operationKey: `course-announcement:${announcementId}`,
                type: 'info',
                title: `📢 ${announcement.courseName}: ${announcement.title}`,
                message: stripHtml(announcement.content).substring(0, 200) + '...', // Preview
                link: `/courses/${announcement.courseId}/announcements/${announcementId}`,
            }
        );

        if (!notificationResult.success) {
            console.warn('Announcement created but notifications failed:', notificationResult.error);
        }

        console.log(`✅ [Announcement] Created for course ${announcement.courseId}, sent to ${targetStudentIds.length} students`);

        return {
            success: true,
            announcementId,
            notificationIds: notificationResult.notificationIds,
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

/**
 * Helper function to strip HTML tags from content
 * @param html - HTML string
 * @returns Plain text
 */
function stripHtml(html: string): string {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}
