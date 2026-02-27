/**
 * Session Statistics Calculator
 * 
 * Pure utility functions for calculating aggregate statistics
 * from student progress data in teacher monitor sessions.
 * 
 * @module utils/monitor/sessionStatistics
 */

import { StudentProgress } from './studentDataTransformer';

export interface SessionStatistics {
  totalStudents: number;
  submittedCount: number;
  workingCount: number;
  disconnectedCount: number;
  averageProgress: number;
}

/**
 * Calculates aggregate session statistics from an array of student progress objects.
 * 
 * Computes:
 * - Total number of students
 * - Count of submitted students
 * - Count of working students
 * - Count of disconnected students
 * - Average progress across all students
 * 
 * @param students - Array of StudentProgress objects
 * @returns SessionStatistics object with all computed metrics
 * 
 * @example
 * ```typescript
 * const stats = calculateSessionStatistics([
 *   { status: 'working', progress: 75, ... },
 *   { status: 'submitted', progress: 100, ... },
 *   { status: 'disconnected', progress: 20, ... }
 * ]);
 * // stats = { totalStudents: 3, submittedCount: 1, workingCount: 1, disconnectedCount: 1, averageProgress: 65 }
 * ```
 */
export function calculateSessionStatistics(
  students: StudentProgress[]
): SessionStatistics {
  const totalStudents = students.length;
  
  // Count students by status
  const submittedCount = students.filter(s => s.status === 'submitted').length;
  const workingCount = students.filter(s => s.status === 'working').length;
  const disconnectedCount = students.filter(s => s.status === 'disconnected').length;
  
  // Calculate average progress
  const averageProgress = totalStudents > 0
    ? Math.round(students.reduce((sum, s) => sum + s.progress, 0) / totalStudents)
    : 0;
  
  return {
    totalStudents,
    submittedCount,
    workingCount,
    disconnectedCount,
    averageProgress,
  };
}
