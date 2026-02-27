import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from './firebase';
import type { StudentGroup } from '../types/solo.types';

const GROUPS_COLLECTION = 'student_groups';

/**
 * Create a new student group
 */
export async function createGroup(
    teacherId: string,
    name: string,
    studentIds: string[]
): Promise<string> {
    try {
        const groupRef = doc(collection(db, GROUPS_COLLECTION));

        const group: StudentGroup = {
            id: groupRef.id,
            teacherId,
            name,
            studentIds,
            createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
        };

        await setDoc(groupRef, group);
        return groupRef.id;
    } catch (error) {
        console.error('Error creating student group:', error);
        throw new Error('Failed to create student group');
    }
}

/**
 * Update an existing student group
 */
export async function updateGroup(
    id: string,
    data: { name?: string; studentIds?: string[] }
): Promise<void> {
    try {
        const groupRef = doc(db, GROUPS_COLLECTION, id);

        await updateDoc(groupRef, {
            ...data,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error('Error updating student group:', error);
        throw new Error('Failed to update student group');
    }
}

/**
 * Delete a student group
 */
export async function deleteGroup(id: string): Promise<void> {
    try {
        const groupRef = doc(db, GROUPS_COLLECTION, id);
        await deleteDoc(groupRef);
    } catch (error) {
        console.error('Error deleting student group:', error);
        throw new Error('Failed to delete student group');
    }
}

/**
 * Get all groups created by a teacher
 */
export async function getGroupsByTeacher(teacherId: string): Promise<StudentGroup[]> {
    try {
        const q = query(
            collection(db, GROUPS_COLLECTION),
            where('teacherId', '==', teacherId)
        );

        const snapshot = await getDocs(q);
        const groups = snapshot.docs.map(doc => doc.data() as StudentGroup);

        // Sort by name ascending in application code to avoid composite index requirement
        return groups.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Error fetching student groups:', error);
        throw new Error('Failed to fetch student groups');
    }
}

/**
 * Get a single group by ID
 */
export async function getGroupById(id: string): Promise<StudentGroup | null> {
    try {
        const groupRef = doc(db, GROUPS_COLLECTION, id);
        const snapshot = await getDoc(groupRef);

        if (!snapshot.exists()) {
            return null;
        }

        return snapshot.data() as StudentGroup;
    } catch (error) {
        console.error('Error fetching student group:', error);
        throw new Error('Failed to fetch student group');
    }
}

/**
 * Add students to a group
 */
export async function addStudentsToGroup(
    groupId: string,
    studentIds: string[]
): Promise<void> {
    try {
        const group = await getGroupById(groupId);
        if (!group) {
            throw new Error('Group not found');
        }

        const updatedStudentIds = Array.from(
            new Set([...group.studentIds, ...studentIds])
        );

        await updateGroup(groupId, { studentIds: updatedStudentIds });
    } catch (error) {
        console.error('Error adding students to group:', error);
        throw new Error('Failed to add students to group');
    }
}

/**
 * Remove students from a group
 */
export async function removeStudentsFromGroup(
    groupId: string,
    studentIds: string[]
): Promise<void> {
    try {
        const group = await getGroupById(groupId);
        if (!group) {
            throw new Error('Group not found');
        }

        const updatedStudentIds = group.studentIds.filter(
            (id: string) => !studentIds.includes(id)
        );

        await updateGroup(groupId, { studentIds: updatedStudentIds });
    } catch (error) {
        console.error('Error removing students from group:', error);
        throw new Error('Failed to remove students from group');
    }
}
