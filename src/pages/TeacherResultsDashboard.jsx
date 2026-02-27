import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
import { AppShell } from '@mantine/core';
import {
  getTeacherResults,
  exportResultsToCSV,
  downloadCSV,
  filterResultsByDateRange,
  filterResultsByClass,
  filterResultsByTest,
} from '../services/resultsService';

const TeacherResultsDashboard = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [results, setResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);

  // Filters
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [testFilter, setTestFilter] = useState('all');
  const [guestFilter, setGuestFilter] = useState('all'); // 'all', 'registered', 'guest'

  // Load results
  useEffect(() => {
    if (!user?.uid) return;

    const loadResults = async () => {
      setIsLoading(true);
      try {
        // Super admins see ALL results, teachers see only their own
        const filterTeacherId = profile?.role === 'super_admin' ? undefined : user.uid;
        const teacherResults = await getTeacherResults(filterTeacherId);
        setResults(teacherResults);
        setFilteredResults(teacherResults);
      } catch (error) {
        console.error('Error loading results:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadResults();
  }, [user, profile]);

  // Apply filters
  useEffect(() => {
    let filtered = [...results];

    // Flatten all student results
    const allStudentResults = filtered.flatMap(session =>
      session.results.map(r => ({ ...r, sessionData: session }))
    );

    let filteredStudentResults = allStudentResults;

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate = new Date();

      if (dateFilter === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (dateFilter === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (dateFilter === 'month') {
        startDate.setMonth(now.getMonth() - 1);
      } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        const endDate = new Date(customEndDate);
        filteredStudentResults = filterResultsByDateRange(filteredStudentResults, startDate, endDate);
      }

      if (dateFilter !== 'custom') {
        filteredStudentResults = filterResultsByDateRange(filteredStudentResults, startDate, now);
      }
    }

    // Class filter
    if (classFilter !== 'all') {
      filteredStudentResults = filterResultsByClass(filteredStudentResults, classFilter);
    }

    // Test filter
    if (testFilter !== 'all') {
      filteredStudentResults = filterResultsByTest(filteredStudentResults, testFilter);
    }

    // Guest/Registered User Filter
    if (guestFilter !== 'all') {
      filteredStudentResults = filteredStudentResults.filter(r => {
        if (guestFilter === 'guest') return r.isGuest;
        if (guestFilter === 'registered') return !r.isGuest;
        return true;
      });
    }

    // Group back into sessions
    const sessionMap = new Map();
    filteredStudentResults.forEach(result => {
      const sessionCode = result.sessionCode || result.sessionData.sessionCode;
      if (!sessionMap.has(sessionCode)) {
        // Create a new session entries based on sessionData, but we need to recalculate aggregate stats
        // However, for now we will just use the original sessionData properties but allow result list to be filtered.
        // Wait, if we filter out students, we should update the "totalStudents", "average", "lowest", "highest" for the display?
        // The original code uses sessionData for the main card, and just pushes results to it.
        // If we filter results, the MAIN card stats (totalStudents etc) will be misleading if they come from sessionData.

        // Let's rely on re-calculating stats for the filtered View.
        sessionMap.set(sessionCode, {
          ...result.sessionData,
          results: [] // We will push filtered results here
        });
      }
      sessionMap.get(sessionCode).results.push(result);
    });

    // Recalculate session stats based on filtered results
    const finalFilteredSessions = Array.from(sessionMap.values()).map(session => {
      const SessionResults = session.results;
      if (SessionResults.length === 0) return null; // Should not happen given the loop above

      const total = SessionResults.length;
      const sumScore = SessionResults.reduce((acc, curr) => acc + curr.percentage, 0);
      const scores = SessionResults.map(r => r.percentage);

      return {
        ...session,
        totalStudents: total,
        averagePercentage: sumScore / total,
        highestScore: Math.max(...scores),
        lowestScore: Math.min(...scores),
        // Keep original created date etc
      };
    }).filter(Boolean);

    setFilteredResults(finalFilteredSessions);
  }, [results, dateFilter, customStartDate, customEndDate, classFilter, testFilter, guestFilter]);

  // Calculate overall statistics
  const totalSessions = filteredResults.length;
  const totalStudents = filteredResults.reduce((sum, s) => sum + s.totalStudents, 0);
  const overallAverage = filteredResults.length > 0
    ? filteredResults.reduce((sum, s) => sum + s.averagePercentage, 0) / filteredResults.length
    : 0;

  // Handle CSV export
  const handleExportCSV = () => {
    const allResults = filteredResults.flatMap(s => s.results);
    const csv = exportResultsToCSV(allResults);
    const filename = `results_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
          <CardBody>
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p style={{ color: '#64748b' }}>Loading results...</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <AppShell
      header={{ height: 70 }}
      padding="md"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh'
      }}
    >
      <AppShell.Header style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
      }}>
        <div style={{
          height: '100%',
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#1e293b',
            margin: 0
          }}>
            📊 Results Dashboard
          </h2>

          <Button
            variant="success"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredResults.length === 0}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            }
          >
            Export CSV
          </Button>
        </div>
      </AppShell.Header>

      <AppShell.Main>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
          {/* Statistics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
              <CardBody>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#8b5cf6', marginBottom: '0.5rem' }}>
                    {totalSessions}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>
                    Total Sessions
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
              <CardBody>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#10b981', marginBottom: '0.5rem' }}>
                    {totalStudents}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>
                    Total Students
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
              <CardBody>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#3b82f6', marginBottom: '0.5rem' }}>
                    {overallAverage.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>
                    Average Score
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Filters */}
          <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)', marginBottom: '2rem' }}>
            <CardBody>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem' }}>
                🔍 Filters
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {/* Date Filter */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.5rem' }}>
                    Date Range
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                {/* Guest Filter */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.5rem' }}>
                    Student Type
                  </label>
                  <select
                    value={guestFilter}
                    onChange={(e) => setGuestFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="all">All Students</option>
                    <option value="registered">Registered Only</option>
                    <option value="guest">Guest Only</option>
                  </select>
                </div>

                {dateFilter === 'custom' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.5rem' }}>
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #e2e8f0',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#64748b', marginBottom: '0.5rem' }}>
                        End Date
                      </label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #e2e8f0',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Results List */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1rem',
              color: 'white',
              textShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              Session Results ({filteredResults.length})
            </h3>
          </div>

          {filteredResults.length === 0 ? (
            <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
              <CardBody>
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
                  <h4 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.5rem' }}>
                    No Results Found
                  </h4>
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                    No sessions match your current filters. Try adjusting your filters or create a new session.
                  </p>
                </div>
              </CardBody>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredResults.map((session, index) => (
                <Card
                  key={session.sessionCode}
                  variant="glass"
                  style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`
                  }}
                >
                  <CardBody>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>
                          {session.testTitle || 'Untitled Session'}
                        </h4>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
                          <span>📝 {session.sessionCode}</span>
                          <span>•</span>
                          <span>🎯 {session.sessionMode === 'quiz' ? 'Quiz' : 'Test'}</span>
                          <span>•</span>
                          <span>📅 {new Date(session.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <Button
                        variant="glass"
                        size="sm"
                        onClick={() => setSelectedSession(selectedSession === session.sessionCode ? null : session.sessionCode)}
                      >
                        {selectedSession === session.sessionCode ? 'Hide Details' : 'View Details'}
                      </Button>
                    </div>

                    {/* Session Stats */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '1rem',
                      padding: '1rem',
                      background: 'rgba(139, 92, 246, 0.05)',
                      borderRadius: '0.5rem'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Students</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>{session.totalStudents}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Average</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>{session.averagePercentage.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Highest</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>{session.highestScore}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Lowest</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>{session.lowestScore}</div>
                      </div>
                    </div>

                    {/* Student Results (Expandable) */}
                    {selectedSession === session.sessionCode && (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        <h5 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.75rem' }}>
                          Student Results
                        </h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {session.results.map((result, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.75rem',
                                background: 'white',
                                borderRadius: '0.5rem',
                                border: '1px solid #e2e8f0'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: '600', color: '#1e293b' }}>
                                  {result.studentName}
                                  {result.isGuest && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>(Guest)</span>}
                                </div>
                                {result.studentEmail && (
                                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{result.studentEmail}</div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '1.125rem', fontWeight: '700', color: result.percentage >= 70 ? '#10b981' : result.percentage >= 50 ? '#f59e0b' : '#ef4444' }}>
                                    {result.percentage.toFixed(1)}%
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {result.correctAnswers}/{result.totalQuestions}
                                  </div>
                                </div>
                                <Button
                                  variant="glass"
                                  size="xs"
                                  onClick={() => navigate(`/teacher/student/${result.studentId}/history`)}
                                  visible={!result.isGuest} // Only for registered students? Or all if IDs persist? Let's show for all but maybe guests won't have much history.
                                >
                                  📜 History
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppShell.Main>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </AppShell>
  );
};

export default TeacherResultsDashboard;
