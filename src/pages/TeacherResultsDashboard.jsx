import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { TeacherHeader } from '../components/navigation';
import { Card, CardBody, Button } from '../components/modern';
import {
  downloadCSV,
  exportResultsToCSV,
  filterResultsByDateRange,
  getTeacherResults,
} from '../services/resultsService';
import { classifyTeacherResultVisibility } from '../services/resultVisibility.service';

const TeacherResultsDashboard = () => {
  const { user, profile, logout } = useAuth();
  const { navigateTo } = useNavigation(profile?.role === 'super_admin' ? 'super_admin' : 'teacher');
  const { trackAction } = useFeatureTracking('results');

  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);

  const [dateFilter, setDateFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [guestFilter, setGuestFilter] = useState('all');

  useEffect(() => {
    let isMounted = true;

    const loadResults = async () => {
      if (!user?.uid || !profile?.role) {
        if (isMounted) {
          setResults([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError('');

      try {
        const filterTeacherId = profile.role === 'super_admin' ? undefined : user.uid;
        const teacherResults = await getTeacherResults(filterTeacherId);

        if (!isMounted) {
          return;
        }

        setResults(Array.isArray(teacherResults) ? teacherResults : []);
      } catch (error) {
        console.error('[TeacherResultsDashboard] Failed to load results:', error);

        if (!isMounted) {
          return;
        }

        setResults([]);
        setLoadError('Failed to load teacher results.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      isMounted = false;
    };
  }, [profile?.role, user?.uid]);

  const filteredSessions = useMemo(() => {
    return results
      .map((session) => {
        const analyticsResults = buildAnalyticsEligibleResults(
          session.results || [],
          profile?.role,
          user?.uid,
        );

        const dateFilteredResults = applyDateFilter(
          analyticsResults,
          dateFilter,
          customStartDate,
          customEndDate,
        );

        const guestFilteredResults = applyGuestFilter(dateFilteredResults, guestFilter);

        if (guestFilteredResults.length === 0) {
          return null;
        }

        return buildAnalyticsSession(session, guestFilteredResults);
      })
      .filter(Boolean);
  }, [
    customEndDate,
    customStartDate,
    dateFilter,
    guestFilter,
    profile?.role,
    results,
    user?.uid,
  ]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    const sessionStillVisible = filteredSessions.some(
      (session) => session.sessionCode === selectedSession,
    );

    if (!sessionStillVisible) {
      setSelectedSession(null);
    }
  }, [filteredSessions, selectedSession]);

  const totalSessions = filteredSessions.length;
  const totalStudents = filteredSessions.reduce(
    (sum, session) => sum + session.totalStudents,
    0,
  );
  const overallAverage = totalStudents > 0
    ? filteredSessions.reduce(
      (sum, session) => sum + (session.averagePercentage * session.totalStudents),
      0,
    ) / totalStudents
    : 0;

  const handleToggleSession = (sessionCode) => {
    const nextSessionCode = selectedSession === sessionCode ? null : sessionCode;
    setSelectedSession(nextSessionCode);
    trackAction('toggleSessionDetails', {
      source: 'teacher_results_dashboard',
      sessionCode,
      expanded: nextSessionCode === sessionCode,
    });
  };

  const handleViewResult = (result) => {
    if (!result.id) {
      return;
    }

    trackAction('viewResults', {
      source: 'teacher_results_dashboard',
      resultId: result.id,
      sessionCode: result.sessionCode,
      studentId: result.studentId,
    });

    navigateTo(
      'RESULT_DETAIL',
      { resultId: result.id },
      { reason: 'teacher_results_dashboard_result_detail' },
    );
  };

  const handleViewHistory = (result) => {
    trackAction('openStudentHistory', {
      source: 'teacher_results_dashboard',
      sessionCode: result.sessionCode,
      studentId: result.studentId,
    });

    navigateTo(
      'TEACHER_STUDENT_HISTORY',
      { studentId: result.studentId },
      { reason: 'teacher_results_dashboard_history' },
    );
  };

  const handleExportCSV = () => {
    const exportableResults = filteredSessions.flatMap((session) => session.results);
    if (exportableResults.length === 0) {
      return;
    }

    trackAction('exportResultsCsv', {
      source: 'teacher_results_dashboard',
      resultCount: exportableResults.length,
      sessionCount: filteredSessions.length,
    });

    const csv = exportResultsToCSV(exportableResults);
    const filename = `teacher-results-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(csv, filename);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
    } catch (error) {
      console.error('[TeacherResultsDashboard] Logout failed:', error);
    }
  };

  return (
    <div style={pageShellStyle}>
      <TeacherHeader
        pageTitle="Results Dashboard"
        userId={user?.uid}
        userRole={profile?.role === 'super_admin' ? 'super_admin' : 'teacher'}
        userDisplayName={profile?.displayName || user?.displayName || user?.email}
        userEmail={profile?.email || user?.email}
        userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
        onLogout={handleLogout}
      />

      <div style={pageContentStyle}>
        <div style={contentContainerStyle}>
          <section style={introSectionStyle}>
            <div>
              <h1 style={pageTitleStyle}>Teacher Results Dashboard</h1>
              <p style={pageSubtitleStyle}>
                Session analytics and result navigation powered by the normalized
                teacher visibility pipeline.
              </p>
            </div>
            <Button
              variant="success"
              size="sm"
              onClick={handleExportCSV}
              disabled={filteredSessions.length === 0}
            >
              Export CSV
            </Button>
          </section>

          {isLoading ? (
            <Card variant="glass" style={stateCardStyle}>
              <CardBody style={stateCardBodyStyle}>
                <div style={spinnerStyle} />
                <p style={stateTextStyle}>Loading teacher results...</p>
              </CardBody>
            </Card>
          ) : loadError ? (
            <Card variant="glass" style={stateCardStyle}>
              <CardBody style={stateCardBodyStyle}>
                <p style={errorTextStyle}>{loadError}</p>
              </CardBody>
            </Card>
          ) : (
            <>
              <section style={statsGridStyle}>
                <StatsCard
                  label="Sessions"
                  value={String(totalSessions)}
                  accent="#8b5cf6"
                  testId="teacher-results-total-sessions"
                />
                <StatsCard
                  label="Students"
                  value={String(totalStudents)}
                  accent="#0f766e"
                  testId="teacher-results-total-students"
                />
                <StatsCard
                  label="Average"
                  value={`${overallAverage.toFixed(1)}%`}
                  accent="#2563eb"
                  testId="teacher-results-overall-average"
                />
              </section>

              <FiltersCard
                dateFilter={dateFilter}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                guestFilter={guestFilter}
                onDateFilterChange={setDateFilter}
                onCustomStartDateChange={setCustomStartDate}
                onCustomEndDateChange={setCustomEndDate}
                onGuestFilterChange={setGuestFilter}
              />

              {filteredSessions.length === 0 ? (
                <Card variant="glass" style={stateCardStyle}>
                  <CardBody style={stateCardBodyStyle}>
                    <p style={stateTitleStyle}>No analytics-ready results</p>
                    <p style={stateTextStyle}>
                      No teacher-visible session results match the current filters.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                <div style={sessionListStyle}>
                  {filteredSessions.map((session) => {
                    const isExpanded = selectedSession === session.sessionCode;

                    return (
                      <Card key={session.sessionCode} variant="glass" style={sessionCardStyle}>
                        <CardBody style={sessionCardBodyStyle}>
                          <div style={sessionHeaderStyle}>
                            <div>
                              <h2 style={sessionTitleStyle}>
                                {session.testTitle || 'Untitled session'}
                              </h2>
                              <p style={sessionMetaStyle}>
                                Session {session.sessionCode} • {formatSessionMode(session.sessionMode)} •{' '}
                                {formatDate(session.createdAt)}
                              </p>
                            </div>
                            <Button
                              variant="glass"
                              size="sm"
                              onClick={() => handleToggleSession(session.sessionCode)}
                            >
                              {isExpanded ? 'Hide Details' : 'View Details'}
                            </Button>
                          </div>

                          <div style={sessionStatsGridStyle}>
                            <SessionStat label="Students" value={String(session.totalStudents)} accent="#8b5cf6" />
                            <SessionStat label="Average" value={`${session.averagePercentage.toFixed(1)}%`} accent="#0f766e" />
                            <SessionStat label="Highest" value={formatScore(session.highestScore)} accent="#2563eb" />
                            <SessionStat label="Lowest" value={formatScore(session.lowestScore)} accent="#ea580c" />
                          </div>

                          {isExpanded ? (
                            <div style={resultsListStyle}>
                              {session.results.map((result) => (
                                <div key={result.id || `${result.studentId}-${result.completedAt}`} style={resultRowStyle}>
                                  <div>
                                    <div style={studentNameStyle}>
                                      {result.studentName}
                                      {result.isGuest ? (
                                        <span style={guestBadgeStyle}>Guest</span>
                                      ) : null}
                                    </div>
                                    {result.studentEmail ? (
                                      <div style={studentMetaStyle}>{result.studentEmail}</div>
                                    ) : null}
                                  </div>

                                  <div style={resultSummaryStyle}>
                                    <div style={resultScoreStyle(result.percentage)}>
                                      {result.percentage.toFixed(1)}%
                                    </div>
                                    <div style={studentMetaStyle}>
                                      {result.correctAnswers}/{result.totalQuestions}
                                    </div>
                                  </div>

                                  <div style={rowActionsStyle}>
                                    {result.id ? (
                                      <Button
                                        variant="glass"
                                        size="sm"
                                        onClick={() => handleViewResult(result)}
                                      >
                                        View Result
                                      </Button>
                                    ) : null}
                                    {!result.isGuest ? (
                                      <Button
                                        variant="glass"
                                        size="sm"
                                        onClick={() => handleViewHistory(result)}
                                      >
                                        History
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function buildAnalyticsEligibleResults(results, viewerRole, viewerId) {
  return results.filter((result) => {
    const fallbackTeacherId = viewerRole === 'super_admin'
      ? (result.visibility?.visibilityOwnerTeacherId || viewerId || '')
      : (viewerId || '');

    const verdict = classifyTeacherResultVisibility({
      result,
      teacherId: fallbackTeacherId,
      hasAssignmentAccess: true,
    });

    return verdict.shouldDisplayInTeacherHistory && !verdict.excludeFromAnalytics;
  });
}

function buildAnalyticsSession(session, analyticsResults) {
  const scores = analyticsResults.map((result) => result.score);
  const percentages = analyticsResults.map((result) => result.percentage);
  const averagePercentage = percentages.length > 0
    ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
    : 0;

  return {
    ...session,
    results: analyticsResults,
    totalStudents: analyticsResults.length,
    averagePercentage,
    highestScore: scores.length > 0 ? Math.max(...scores) : 0,
    lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
  };
}

function applyDateFilter(results, dateFilter, customStartDate, customEndDate) {
  if (dateFilter === 'all') {
    return results;
  }

  const now = new Date();
  let startDate = new Date(now);
  let endDate = now;

  if (dateFilter === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (dateFilter === 'week') {
    startDate.setDate(now.getDate() - 7);
  } else if (dateFilter === 'month') {
    startDate.setMonth(now.getMonth() - 1);
  } else if (dateFilter === 'custom') {
    if (!customStartDate || !customEndDate) {
      return results;
    }

    startDate = new Date(customStartDate);
    endDate = new Date(customEndDate);
    endDate.setHours(23, 59, 59, 999);
  }

  return filterResultsByDateRange(results, startDate, endDate);
}

function applyGuestFilter(results, guestFilter) {
  if (guestFilter === 'guest') {
    return results.filter((result) => result.isGuest);
  }

  if (guestFilter === 'registered') {
    return results.filter((result) => !result.isGuest);
  }

  return results;
}

function FiltersCard({
  dateFilter,
  customStartDate,
  customEndDate,
  guestFilter,
  onDateFilterChange,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onGuestFilterChange,
}) {
  return (
    <Card variant="glass" style={filtersCardStyle}>
      <CardBody style={filtersCardBodyStyle}>
        <div style={filtersGridStyle}>
          <div style={fieldGroupStyle}>
            <label htmlFor="teacher-results-date-filter" style={fieldLabelStyle}>
              Date Range
            </label>
            <select
              id="teacher-results-date-filter"
              value={dateFilter}
              onChange={(event) => onDateFilterChange(event.target.value)}
              style={fieldInputStyle}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="teacher-results-guest-filter" style={fieldLabelStyle}>
              Student Type
            </label>
            <select
              id="teacher-results-guest-filter"
              value={guestFilter}
              onChange={(event) => onGuestFilterChange(event.target.value)}
              style={fieldInputStyle}
            >
              <option value="all">All Students</option>
              <option value="registered">Registered Only</option>
              <option value="guest">Guest Only</option>
            </select>
          </div>

          {dateFilter === 'custom' ? (
            <>
              <div style={fieldGroupStyle}>
                <label htmlFor="teacher-results-date-from" style={fieldLabelStyle}>
                  Start Date
                </label>
                <input
                  id="teacher-results-date-from"
                  type="date"
                  value={customStartDate}
                  onChange={(event) => onCustomStartDateChange(event.target.value)}
                  style={fieldInputStyle}
                />
              </div>
              <div style={fieldGroupStyle}>
                <label htmlFor="teacher-results-date-to" style={fieldLabelStyle}>
                  End Date
                </label>
                <input
                  id="teacher-results-date-to"
                  type="date"
                  value={customEndDate}
                  onChange={(event) => onCustomEndDateChange(event.target.value)}
                  style={fieldInputStyle}
                />
              </div>
            </>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function StatsCard({ label, value, accent, testId }) {
  return (
    <Card variant="glass" style={statsCardStyle}>
      <CardBody style={statsCardBodyStyle}>
        <div style={statsLabelStyle}>{label}</div>
        <div data-testid={testId} style={{ ...statsValueStyle, color: accent }}>
          {value}
        </div>
      </CardBody>
    </Card>
  );
}

function SessionStat({ label, value, accent }) {
  return (
    <div style={sessionStatStyle}>
      <span style={sessionStatLabelStyle}>{label}</span>
      <span style={{ ...sessionStatValueStyle, color: accent }}>{value}</span>
    </div>
  );
}

function formatScore(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function formatDate(timestamp) {
  if (!timestamp) {
    return 'Unknown date';
  }

  return new Date(timestamp).toLocaleDateString();
}

function formatSessionMode(mode) {
  return mode === 'quiz' ? 'Quiz' : 'Test';
}

function resultScoreStyle(percentage) {
  if (percentage >= 70) {
    return { ...resultScoreBaseStyle, color: '#0f766e' };
  }

  if (percentage >= 50) {
    return { ...resultScoreBaseStyle, color: '#b45309' };
  }

  return { ...resultScoreBaseStyle, color: '#b91c1c' };
}

const pageShellStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 50%, #f0fdfa 100%)',
};

const pageContentStyle = {
  minHeight: 'calc(100vh - 110px)',
  padding: '2rem 1rem 3rem',
};

const contentContainerStyle = {
  maxWidth: '1200px',
  margin: '0 auto',
  display: 'grid',
  gap: '1.5rem',
};

const introSectionStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const pageTitleStyle = {
  margin: 0,
  fontSize: '2rem',
  fontWeight: 800,
  color: '#0f172a',
};

const pageSubtitleStyle = {
  margin: '0.5rem 0 0',
  color: '#475569',
  fontSize: '1rem',
  maxWidth: '42rem',
};

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '1rem',
};

const statsCardStyle = {
  background: 'rgba(255, 255, 255, 0.92)',
};

const statsCardBodyStyle = {
  padding: '1.5rem',
  textAlign: 'center',
};

const statsLabelStyle = {
  color: '#64748b',
  fontSize: '0.8125rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const statsValueStyle = {
  marginTop: '0.5rem',
  fontSize: '2.25rem',
  fontWeight: 800,
};

const filtersCardStyle = {
  background: 'rgba(255, 255, 255, 0.9)',
};

const filtersCardBodyStyle = {
  padding: '1.5rem',
};

const filtersGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '1rem',
};

const fieldGroupStyle = {
  display: 'grid',
  gap: '0.5rem',
};

const fieldLabelStyle = {
  fontSize: '0.875rem',
  fontWeight: 700,
  color: '#475569',
};

const fieldInputStyle = {
  width: '100%',
  padding: '0.75rem',
  borderRadius: '0.75rem',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  fontSize: '0.95rem',
};

const stateCardStyle = {
  background: 'rgba(255, 255, 255, 0.92)',
};

const stateCardBodyStyle = {
  padding: '2rem',
  textAlign: 'center',
  display: 'grid',
  gap: '0.75rem',
  justifyItems: 'center',
};

const stateTitleStyle = {
  margin: 0,
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#0f172a',
};

const stateTextStyle = {
  margin: 0,
  color: '#64748b',
};

const errorTextStyle = {
  margin: 0,
  color: '#b91c1c',
  fontWeight: 700,
};

const spinnerStyle = {
  width: 40,
  height: 40,
  border: '4px solid #e2e8f0',
  borderTopColor: '#8b5cf6',
  borderRadius: '999px',
  animation: 'teacher-results-spin 0.8s linear infinite',
};

const sessionListStyle = {
  display: 'grid',
  gap: '1rem',
};

const sessionCardStyle = {
  background: 'rgba(255, 255, 255, 0.92)',
};

const sessionCardBodyStyle = {
  padding: '1.5rem',
  display: 'grid',
  gap: '1rem',
};

const sessionHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const sessionTitleStyle = {
  margin: 0,
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#0f172a',
};

const sessionMetaStyle = {
  margin: '0.35rem 0 0',
  color: '#64748b',
  fontSize: '0.9rem',
};

const sessionStatsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '0.75rem',
  padding: '1rem',
  borderRadius: '1rem',
  background: 'rgba(139, 92, 246, 0.06)',
  border: '1px solid rgba(139, 92, 246, 0.12)',
};

const sessionStatStyle = {
  display: 'grid',
  gap: '0.25rem',
};

const sessionStatLabelStyle = {
  color: '#64748b',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const sessionStatValueStyle = {
  fontSize: '1.4rem',
  fontWeight: 800,
};

const resultsListStyle = {
  display: 'grid',
  gap: '0.75rem',
};

const resultRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
  gap: '1rem',
  alignItems: 'center',
  padding: '1rem',
  borderRadius: '1rem',
  border: '1px solid #e2e8f0',
  background: '#ffffff',
};

const studentNameStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  fontSize: '1rem',
  fontWeight: 700,
  color: '#0f172a',
};

const studentMetaStyle = {
  color: '#64748b',
  fontSize: '0.875rem',
};

const guestBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.2rem 0.55rem',
  borderRadius: '999px',
  background: 'rgba(148, 163, 184, 0.15)',
  color: '#475569',
  fontSize: '0.75rem',
  fontWeight: 700,
};

const resultSummaryStyle = {
  minWidth: '6rem',
  textAlign: 'right',
};

const resultScoreBaseStyle = {
  fontSize: '1.1rem',
  fontWeight: 800,
};

const rowActionsStyle = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

export default TeacherResultsDashboard;
