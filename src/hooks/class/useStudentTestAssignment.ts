/**
 * useStudentTestAssignment Hook
 * Determines which test a student should take in a multi-test class
 */

import { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';
// @ts-ignore
import { sessionService } from '../../services/sessionService';
import type { TestAssignment } from '../../types/session.types';

export interface StudentTestAssignmentResult {
  /** Test ID the student is assigned to (null if not assigned) */
  testId: string | null;
  
  /** Full test assignment details */
  assignment: TestAssignment | null;
  
  /** Is assignment loading */
  loading: boolean;
  
  /** Error message if any */
  error: string | null;
  
  /** Whether student has been assigned a test */
  isAssigned: boolean;
}

/**
 * Hook to get student's assigned test in a class
 * This is the core routing mechanism for multi-test classes
 */
export function useStudentTestAssignment(
  classId: string | undefined
): StudentTestAssignmentResult {
  const [testId, setTestId] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<TestAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!classId) {
      setError('No class ID provided');
      setLoading(false);
      return;
    }
    
    const studentId = sessionService.getPlayerId();
    if (!studentId) {
      setError('No student ID found - student not logged in');
      setLoading(false);
      return;
    }
    
    console.log(`📚 [StudentAssignment] Checking assignment for student ${studentId} in class ${classId}`);
    
    // Fetch class data to determine assignment
    const classRef = ref(database, `game_sessions/${classId}`);
    get(classRef).then((snapshot) => {
      if (!snapshot.exists()) {
        setError('Class not found');
        setLoading(false);
        return;
      }
      
      const classData = snapshot.val();
      
      // Check if student exists in class
      if (!classData.students || !classData.students[studentId]) {
        setError('Student not in this class');
        setLoading(false);
        return;
      }
      
      const student = classData.students[studentId];
      const assignedTestId = student.assignedTestId;
      
      if (!assignedTestId) {
        console.log(`📚 [StudentAssignment] No test assigned yet`);
        setTestId(null);
        setAssignment(null);
        setLoading(false);
        return;
      }
      
      // Find the test assignment
      const activeTests = classData.activeTests || {};
      const testAssignment = Object.values(activeTests).find(
        (a: any) => a.testId === assignedTestId && a.assignedStudents.includes(studentId)
      );
      
      if (!testAssignment) {
        setError('Test assignment not found');
        setLoading(false);
        return;
      }
      
      console.log(`✅ [StudentAssignment] Student assigned to test: ${assignedTestId}`);
      setTestId(assignedTestId);
      setAssignment(testAssignment as TestAssignment);
      setError(null);
      setLoading(false);
    }).catch((err) => {
      console.error('❌ [StudentAssignment] Error fetching assignment:', err);
      setError(err.message);
      setLoading(false);
    });
  }, [classId]);
  
  return {
    testId,
    assignment,
    loading,
    error,
    isAssigned: testId !== null,
  };
}
