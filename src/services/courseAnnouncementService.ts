/**
 * Course Announcement Service
 * Handles course announcements and notifications to students
 * Phase 7: Course Announcements & Notifications
 */

import { ref, push, set, get, query, orderByChild, equalTo } from 'firebase/database';
import { database } from './firebase';
import { notifyCommittedEvent } from './notificationProducerClient';
import type { NotificationDeliveryResult } from './notificationProducerClient';

const ANNOUNCEMENTS_REF = 'course_announcements';

export interface CourseAnnouncement {
    id: string;
    courseId: string;
    courseName: string;
    teacherId: string;
    teacherName: string;
    targetClassIds?: Record<string, true>; // Absent = all enrolled students
    title: string;
    content: string; // Rich text HTML content
    attachments?: {
        name: string;
        url: string;
        type: string;
        size: number;
    }[];
    createdAt: number;
    notificationPreview: string;
}

/**
 * Save a course announcement, then attempt its first notification pass.
 * @param announcement - Announcement data
 * @returns Saved announcement ID and delivery outcome
 */
export async function createCourseAnnouncement(
    announcement: Omit<CourseAnnouncement, 'id' | 'createdAt' | 'notificationPreview' | 'targetClassIds'> & { targetClassIds: string[] }
): Promise<{ success: boolean; announcementId?: string; deliveryPromise?: Promise<NotificationDeliveryResult>; error?: string }> {
    try {
        if (!announcement.courseId || !announcement.teacherId || !announcement.title || !announcement.content) {
            return { success: false, error: 'Missing required fields' };
        }
        const course = await get(ref(database, `courses/${announcement.courseId}`));
        if (!course.exists() || course.child('ownerId').val() !== announcement.teacherId) {
            return { success: false, error: 'Course is not owned by this teacher' };
        }
        const announcementRef = push(ref(database, ANNOUNCEMENTS_REF));
        const announcementId = announcementRef.key!;
        const { targetClassIds, ...fields } = announcement;
        const announcementData: CourseAnnouncement = {
            ...fields,
            ...(targetClassIds.length ? {
                targetClassIds: Object.fromEntries(targetClassIds.map(id => [id, true])),
            } : {}),
            id: announcementId,
            createdAt: Date.now(),
            notificationPreview: stripHtml(announcement.content).slice(0, 200),
        };
        await set(announcementRef, announcementData);
        const deliveryPromise = Promise.resolve().then(() => notifyCommittedEvent({ eventKind: 'course-announcement-posted', announcementId }));
        return { success: true, announcementId, deliveryPromise };
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
 * Helper function to strip HTML tags from content
 * @param html - HTML string
 * @returns Plain text
 */
function stripHtml(html: string): string {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}
