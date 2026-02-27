/**
 * Multi-Test Assignment Panel
 * 
 * DEMONSTRATES:
 * 1. ✅ Use of UI terminology system (terminology.ts)
 * 2. ✅ Integration with hybrid sessionManager
 * 3. ✅ Multi-test assignment workflow
 * 4. ✅ Real-time student tracking
 */

import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';
// @ts-ignore
import { assignTestToStudents, getSession } from '../../services/sessionManager';
import { UI_TERMS, formatMessage } from '../../utils/terminology';
import { Card, CardBody } from '../modern';
import { Button } from '../modern';

interface Student {
  studentId: string;
  studentName: string;
  assignedTestId?: string;
  joinedAt: number;
}

interface Test {
  id: string;
  title: string;
  questionCount?: number;
  duration?: number;
}

interface MultiTestAssignmentPanelProps {
  sessionCode: string;
  availableTests: Test[];
}

/**
 * Multi-Test Assignment Panel
 * Allows teachers to assign different tests to different students
 */
export const MultiTestAssignmentPanel: React.FC<MultiTestAssignmentPanelProps> = ({
  sessionCode,
  availableTests,
}) => {
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedTest, setSelectedTest] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Real-time student tracking
  useEffect(() => {
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      const session = snapshot.val();
      if (session && session.students) {
        setStudents(session.students);
      }
    });

    return () => unsubscribe();
  }, [sessionCode]);

  /**
   * Handle test assignment
   */
  const handleAssign = async () => {
    if (!selectedTest || selectedStudents.length === 0) {
      setMessage({
        type: 'error',
        text: formatMessage(UI_TERMS.ERROR_SELECT_ITEMS, { 
          items: `test and ${UI_TERMS.STUDENTS.toLowerCase()}` 
        })
      });
      return;
    }

    setAssigning(true);
    setMessage(null);

    try {
      const testData = availableTests.find(t => t.id === selectedTest);
      const duration = testData?.duration || 60;

      // Use new multi-test assignment function
      const assignmentId = await assignTestToStudents(
        sessionCode,
        selectedTest,
        selectedStudents,
        { duration }
      );

      setMessage({
        type: 'success',
        text: formatMessage(UI_TERMS.TEST_ASSIGNED_SUCCESS, { 
          count: selectedStudents.length,
          testName: testData?.title || 'Test'
        })
      });

      // Clear selections
      setSelectedStudents([]);
      setSelectedTest('');

      console.log(`✅ Assignment created: ${assignmentId}`);
    } catch (error) {
      console.error('Assignment error:', error);
      setMessage({
        type: 'error',
        text: UI_TERMS.ERROR_GENERIC
      });
    } finally {
      setAssigning(false);
    }
  };

  /**
   * Toggle student selection
   */
  const toggleStudent = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  /**
   * Select all unassigned students
   */
  const selectAllUnassigned = () => {
    const unassigned = Object.entries(students)
      .filter(([_, student]) => !student.assignedTestId)
      .map(([id]) => id);
    setSelectedStudents(unassigned);
  };

  const studentList = Object.entries(students);
  const unassignedCount = studentList.filter(([_, s]) => !s.assignedTestId).length;
  const assignedCount = studentList.length - unassignedCount;

  return (
    <div className="multi-test-assignment-panel">
      {/* Header with terminology */}
      <Card variant="lavender" hover={false} style={{ marginBottom: '1.5rem' }}>
        <CardBody>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 700, 
            color: '#1e293b',
            marginBottom: '0.5rem' 
          }}>
            {/* UI TERM: Using centralized terminology */}
            {UI_TERMS.MULTI_TEST_ASSIGNMENT}
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
            {/* UI TERM: Descriptive text */}
            {formatMessage(UI_TERMS.ASSIGN_DIFFERENT_TESTS_DESC, {
              className: UI_TERMS.CLASS
            })}
          </p>
        </CardBody>
      </Card>

      {/* Statistics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '1rem',
        marginBottom: '1.5rem' 
      }}>
        <Card variant="glass" hover={false}>
          <CardBody>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#8b5cf6' }}>
                {studentList.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {/* UI TERM: Total students */}
                {UI_TERMS.TOTAL_STUDENTS}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card variant="glass" hover={false}>
          <CardBody>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>
                {assignedCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {/* UI TERM: Assigned */}
                {UI_TERMS.ASSIGNED}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card variant="glass" hover={false}>
          <CardBody>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>
                {unassignedCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                {/* UI TERM: Unassigned */}
                {UI_TERMS.UNASSIGNED}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Left: Test Selection */}
        <Card variant="default" hover={false}>
          <CardBody>
            <h3 style={{ 
              fontSize: '1.125rem', 
              fontWeight: 600, 
              marginBottom: '1rem',
              color: '#1e293b' 
            }}>
              {/* UI TERM: Select test */}
              {UI_TERMS.SELECT_TEST}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {availableTests.map(test => (
                <label
                  key={test.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '1rem',
                    border: '2px solid',
                    borderColor: selectedTest === test.id ? '#8b5cf6' : '#e2e8f0',
                    borderRadius: '0.75rem',
                    cursor: 'pointer',
                    background: selectedTest === test.id 
                      ? 'rgba(139, 92, 246, 0.05)' 
                      : 'white',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="radio"
                    name="test"
                    value={test.id}
                    checked={selectedTest === test.id}
                    onChange={(e) => setSelectedTest(e.target.value)}
                    style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      {test.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {test.questionCount} questions · {test.duration || 60} minutes
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Right: Student Selection */}
        <Card variant="default" hover={false}>
          <CardBody>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '1rem' 
            }}>
              <h3 style={{ 
                fontSize: '1.125rem', 
                fontWeight: 600,
                margin: 0,
                color: '#1e293b' 
              }}>
                {/* UI TERM: Select students */}
                {formatMessage(UI_TERMS.SELECT_STUDENTS, { 
                  count: selectedStudents.length 
                })}
              </h3>
              <Button
                variant="glass"
                size="sm"
                onClick={selectAllUnassigned}
                disabled={unassignedCount === 0}
              >
                {/* UI TERM: Select all unassigned */}
                {UI_TERMS.SELECT_ALL_UNASSIGNED}
              </Button>
            </div>

            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              {studentList.length === 0 ? (
                <div style={{ 
                  padding: '2rem', 
                  textAlign: 'center', 
                  color: '#94a3b8' 
                }}>
                  {/* UI TERM: No students yet */}
                  {formatMessage(UI_TERMS.NO_STUDENTS_JOINED, { 
                    className: UI_TERMS.CLASS.toLowerCase() 
                  })}
                </div>
              ) : (
                studentList.map(([id, student]) => (
                  <label
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      cursor: student.assignedTestId ? 'not-allowed' : 'pointer',
                      background: student.assignedTestId 
                        ? '#f1f5f9' 
                        : selectedStudents.includes(id)
                          ? 'rgba(139, 92, 246, 0.05)'
                          : 'white',
                      opacity: student.assignedTestId ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(id)}
                      onChange={() => toggleStudent(id)}
                      disabled={!!student.assignedTestId}
                      style={{ 
                        width: '1.125rem', 
                        height: '1.125rem',
                        cursor: student.assignedTestId ? 'not-allowed' : 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>
                        {student.studentName}
                      </div>
                      {student.assignedTestId && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: '#10b981',
                          marginTop: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <span>✅</span>
                          {/* UI TERM: Already assigned */}
                          <span>{UI_TERMS.ALREADY_ASSIGNED}: {student.assignedTestId}</span>
                        </div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Message */}
      {message && (
        <Card 
          variant={message.type === 'success' ? 'mint' : 'default'}
          hover={false}
          style={{ 
            marginTop: '1rem',
            borderColor: message.type === 'success' ? '#10b981' : '#ef4444',
            background: message.type === 'success' 
              ? 'rgba(16, 185, 129, 0.05)' 
              : 'rgba(239, 68, 68, 0.05)'
          }}
        >
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>
                {message.type === 'success' ? '✅' : '❌'}
              </span>
              <span style={{ 
                color: message.type === 'success' ? '#059669' : '#dc2626',
                fontWeight: 500
              }}>
                {message.text}
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Assign Button */}
      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
        <Button
          variant="success"
          size="lg"
          onClick={handleAssign}
          disabled={!selectedTest || selectedStudents.length === 0 || assigning}
          loading={assigning}
          style={{
            minWidth: '200px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none'
          }}
        >
          {/* UI TERM: Assign button */}
          {assigning 
            ? UI_TERMS.ASSIGNING 
            : formatMessage(UI_TERMS.ASSIGN_TEST_TO_COUNT, { 
                count: selectedStudents.length 
              })
          }
        </Button>
      </div>
    </div>
  );
};
