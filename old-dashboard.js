import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { enrollStudent, getStudentClasses } from '../services/classManager';
import { getStudentHistory, getAvailablePublicSessions } from '../services/resultsService';
import { getAssignmentsByStudent } from '../services/assignmentManager';
import { getPaginatedUserNotifications, markNotificationAsRead } from '../services/notificationService';
import { Card, CardBody, CardFooter, Button, Input } from '../components/modern';
import { AppShell, Tabs, Loader, Badge, ThemeIcon } from '@mantine/core';
import { useNavigation } from '../hooks/useNavigation';
import { StudentHeader } from '../components/navigation';
import { useMediaQuery } from '@mantine/hooks';

const StudentDashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { navigateTo } = useNavigation('student');

  const [classCode, setClassCode] = useState('');
  const [enrolledClasses, setEnrolledClasses] = useState([]);
  const [studentHistory, setStudentHistory] = useState([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [publicSessions, setPublicSessions] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);

  const [activeView, setActiveView] = useState('feed'); // 'feed' | 'classes' | 'history'
  const [feedFilter, setFeedFilter] = useState('all'); // 'all' | 'homework' | 'tests' | 'classes'
  const [showMobileLeft, setShowMobileLeft] = useState(false);
  const [showMobileRight, setShowMobileRight] = useState(false);
  const [allNotifications, setAllNotifications] = useState([]);
  const [notifCursor, setNotifCursor] = useState(undefined);
  const [hasMoreNotifs, setHasMoreNotifs] = useState(false);
  const [joinSuccessMessage, setJoinSuccessMessage] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'feed') {
      setActiveView('feed');
      console.log(`≡ƒôó [Dashboard] Loaded with query param view=${params.get('view')}`);
    }
  }, []);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user?.uid) return;
      try {
        const result = await getPaginatedUserNotifications(user.uid, 20);
        setAllNotifications(result.notifications || []);
        setHasMoreNotifs(result.hasMore);
        setNotifCursor(result.lastKey);
        console.log(`≡ƒôó [Dashboard] Initial feed fetch: ${result.notifications?.length || 0} items, hasMore=${result.hasMore}`);
      } catch (e) {
        console.error('Error loading notifications', e);
      }
    };

    const loadDashboardData = async () => {
      if (!user?.uid) return;
      setIsLoading(true);
      try {
        const classes = await getStudentClasses(user.uid);
        setEnrolledClasses(classes || []);

        const history = await getStudentHistory(user.uid);
        setStudentHistory(history || []);

        const sessions = await getAvailablePublicSessions();
        setPublicSessions(sessions || []);

        const assignments = await getAssignmentsByStudent(user.uid);
        setTeacherAssignments(assignments || []);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.uid) {
      loadNotifications();
      loadDashboardData();
    }
  }, [user]);

  const handleLoadMore = async () => {
    if (!user?.uid || !hasMoreNotifs) return;
    setIsLoadingMore(true);
    try {
      const result = await getPaginatedUserNotifications(user.uid, 20, notifCursor);
      setAllNotifications(prev => [...prev, ...result.notifications]);
      setHasMoreNotifs(result.hasMore);
      setNotifCursor(result.lastKey);
      console.log(`≡ƒôó [Dashboard] Load More: appended ${result.notifications.length} items, total now ${allNotifications.length + result.notifications.length}`);
    } catch (e) {
      console.error('Error loading more notifications', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleJoinClass = async (e) => {
    e.preventDefault();
    if (!classCode.trim()) {
      setEnrollError('Please enter a class code');
      return;
    }
    if (!user?.uid) return;

    setIsEnrolling(true);
    setEnrollError('');
    setJoinSuccessMessage('');

    try {
      const result = await enrollStudent(classCode.trim().toUpperCase(), user.uid, user.displayName || 'Student', user.email);
      if (result.success) {
        setJoinSuccessMessage(`Γ£à Successfully joined ${classCode.trim().toUpperCase()}!`);
        setClassCode('');

        // Refresh classes manually
        const classes = await getStudentClasses(user.uid);
        setEnrolledClasses(classes || []);

        setTimeout(() => setJoinSuccessMessage(''), 3000);
      } else {
        setEnrollError(result.error || 'Failed to join class');
      }
    } catch (error) {
      console.error('Error joining class:', error);
      setEnrollError('An error occurred. Please try again.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    let result = allNotifications;
    if (feedFilter === 'homework') {
      result = result.filter(n => n.metadata?.homeworkId);
    } else if (feedFilter === 'tests') {
      result = result.filter(n => (n.metadata?.resultId || n.metadata?.testName) && !n.metadata?.homeworkId);
    } else if (feedFilter === 'classes') {
      result = result.filter(n => n.metadata?.className || (n.title && n.title.includes('Joined Class')));
    }
    return result;
  }, [allNotifications, feedFilter]);

  useEffect(() => {
    console.log(`≡ƒôó [Dashboard] Feed filter changed to '${feedFilter}', showing ${filteredNotifications.length} of ${allNotifications.length} items`);
  }, [feedFilter, filteredNotifications.length, allNotifications.length]);

  const handleSidebarClick = (view) => {
    setActiveView(view);
    if (isMobile) {
      setShowMobileLeft(false);
    }
    console.log(`≡ƒôó [Dashboard] Sidebar: activeView changed to '${view}'`);
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.link) return;
    try {
      markNotificationAsRead(user.uid, notif.id);
      console.log(`≡ƒôó [Dashboard] Feed item clicked: ${notif.id}, navigating to ${notif.link}`);
      navigate(notif.link);
    } catch (err) {
      console.error('Error marking notification as read', err);
    }
  };

  const handleLogout = () => {
    logout();
    navigateTo('LOGIN', {}, { reason: 'student_logout', replace: true });
  };

  const getNotifProps = (type) => {
    switch (type) {
      case 'success': return { color: 'green', char: 'Γ£à' };
      case 'warning': return { color: 'orange', char: 'ΓÜá∩╕Å' };
      case 'error': return { color: 'red', char: '≡ƒÜ¿' };
      case 'info':
      default: return { color: 'blue', char: 'Γä╣∩╕Å' };
    }
  };

  const renderLeftSidebar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      <div style={{ padding: '0 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Kahoot!</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.5rem', paddingLeft: '1rem' }}>
          Daily
        </h3>

        {[{ id: 'feed', label: 'Activity Feed', icon: '≡ƒÅá' }, { id: 'classes', label: 'My Classes', icon: '≡ƒÅ½' }, { id: 'history', label: 'Recent History', icon: '≡ƒô£' }].map(item => (
          <button
            key={item.id}
            onClick={() => handleSidebarClick(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem',
              background: activeView === item.id ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
              border: 'none', borderLeft: activeView === item.id ? '3px solid var(--mantine-color-blue-6)' : '3px solid transparent',
              color: activeView === item.id ? '#1e293b' : '#475569',
              fontWeight: activeView === item.id ? 600 : 500,
              cursor: 'pointer', textAlign: 'left', borderRadius: '0 0.25rem 0.25rem 0'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '0 1rem' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.5rem', paddingLeft: '1rem' }}>
          Study & Account
        </h3>

        {[{ route: '/student/courses', label: 'Courses', icon: '≡ƒôÜ' }, { route: '/student/homework', label: 'Homework', icon: '≡ƒô¥' }, { route: '/student/library', label: 'Library', icon: '≡ƒôû' }, { route: '/student/academic-record', label: 'Academic Record', icon: '≡ƒôê' }, { route: '/profile', label: 'Profile & Settings', icon: '≡ƒæñ' }].map(item => (
          <button
            key={item.route}
            onClick={() => navigate(item.route)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem',
              background: 'transparent', border: 'none', borderLeft: '3px solid transparent',
              color: '#475569', fontWeight: 500, cursor: 'pointer', textAlign: 'left'
            }}
            onMouseOver={e => e.currentTarget.style.color = '#0f172a'}
            onMouseOut={e => e.currentTarget.style.color = '#475569'}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><span style={{ fontSize: '1.1rem' }}>{item.icon}</span> {item.label}</span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Γåù</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderJoinClassBar = () => (
    <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'white', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <form onSubmit={handleJoinClass} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Input
            value={classCode}
            onChange={e => setClassCode(e.target.value)}
            placeholder="Enter Class Code..."
            disabled={isEnrolling}
            style={{ textTransform: 'uppercase' }}
          />
        </div>
        <Button type="submit" variant="primary" loading={isEnrolling} disabled={!classCode.trim()}>Join Class</Button>
      </form>
      {joinSuccessMessage && <div style={{ color: '#16a34a', fontSize: '0.875rem', marginTop: '0.75rem', fontWeight: 500 }}>{joinSuccessMessage}</div>}
      {enrollError && <div style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.75rem', fontWeight: 500 }}>{enrollError}</div>}
    </div>
  );

  return (
    <AppShell header={{ height: 70 }} padding="0" style={{ background: '#f8fafc', minHeight: '100vh' }}>

      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '60px', background: 'white', zIndex: 50, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem' }}>
          <button onClick={() => { setShowMobileLeft(!showMobileLeft); setShowMobileRight(false); console.log('≡ƒôó [Dashboard] Mobile: toggled left sidebar, closed other.'); }} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>Γÿ░</button>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Kahoot!</div>
          <button onClick={() => { setShowMobileRight(!showMobileRight); setShowMobileLeft(false); console.log('≡ƒôó [Dashboard] Mobile: toggled right sidebar, closed other.'); }} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>≡ƒùô∩╕Å</button>
        </div>
      )}

      <AppShell.Header style={{ background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(203, 213, 225, 0.3)', display: isMobile ? 'none' : 'block' }}>
        <StudentHeader pageTitle="Student Dashboard" userId={user?.uid} onLogout={handleLogout} hideBackButton={true} />
      </AppShell.Header>

      <AppShell.Main>
        <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: '250px 1fr 320px', gap: '0', maxWidth: '1400px', margin: '0 auto', minHeight: 'calc(100vh - 70px)' }}>

          {isMobile && (showMobileLeft || showMobileRight) && (
            <div onClick={() => { setShowMobileLeft(false); setShowMobileRight(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 999 }} />
          )}

          <aside style={{
            position: isMobile ? 'fixed' : 'sticky',
            top: isMobile ? '0' : '70px',
            left: isMobile ? (showMobileLeft ? 0 : '-100%') : 'auto',
            height: isMobile ? '100vh' : 'calc(100vh - 70px)',
            width: isMobile ? '280px' : 'auto',
            padding: '1.5rem 0',
            borderRight: '1px solid #e2e8f0',
            background: 'white',
            transition: 'transform 0.3s ease-in-out',
            zIndex: isMobile ? 1000 : 10
          }}>
            {renderLeftSidebar()}
          </aside>

          <main style={{ overflowY: 'auto', padding: isMobile ? '80px 1rem 2rem' : '2rem', background: '#f8fafc', height: isMobile ? 'auto' : 'calc(100vh - 70px)' }}>

            {renderJoinClassBar()}

            {activeView === 'feed' && (
              <div style={{ marginBottom: '1rem' }}>
                <Tabs value={feedFilter} onChange={setFeedFilter} color="blue">
                  <Tabs.List>
                    <Tabs.Tab value="all">All</Tabs.Tab>
                    <Tabs.Tab value="homework">Homework</Tabs.Tab>
                    <Tabs.Tab value="tests">Tests</Tabs.Tab>
                    <Tabs.Tab value="classes">Classes</Tabs.Tab>
                  </Tabs.List>
                </Tabs>
              </div>
            )}

            <div style={{
              transition: 'opacity 200ms ease-out, transform 200ms ease-out',
              animation: 'fadeIn 200ms ease-out forwards'
            }}>

              {allNotifications.length === 0 && enrolledClasses.length === 0 && isLoading === false && activeView === 'feed' && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div style={{ fontSize: '3rem' }}>≡ƒæï</div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '1rem 0 0.5rem' }}>Welcome to Kahoot!</h2>
                  <p style={{ color: '#64748b' }}>Ask your teacher for a class code to get started.</p>
                  {publicSessions.length > 0 && (
                    <div style={{ marginTop: '2rem', textAlign: 'left' }}>
                      <h3 style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '1rem' }}>Or try a public session</h3>
                      {publicSessions.slice(0, 3).map(s => (
                        <Card key={s.sessionCode} style={{ marginBottom: '0.5rem' }}>
                          <CardBody style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <div style={{ fontWeight: 600 }}>{s.testTitle}</div>
                              <Button size="sm" onClick={() => navigateTo('STUDENT_WAITING', { gameSessionId: s.sessionCode })}>Join</Button>
                            </div>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeView === 'feed' && (allNotifications.length > 0 || isLoading) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {filteredNotifications.length === 0 && !isLoading && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No {feedFilter} activity yet.</div>
                  )}
                  {filteredNotifications.map(notif => {
                    const iconSet = getNotifProps(notif.type);
                    return (
                      <Card
                        key={notif.id}
                        style={{ cursor: notif.link ? 'pointer' : 'default', background: 'white', padding: '1rem', borderRadius: '0.5rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                        onClick={() => handleNotificationClick(notif)}
                        hover={!!notif.link}
                      >
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <div style={{ fontSize: '1.5rem' }}>{iconSet.char}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <strong style={{ color: '#0f172a' }}>{notif.title}</strong>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{new Date(notif.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.875rem' }}>{notif.message}</div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {hasMoreNotifs && (
                    <Button variant="light" fullWidth onClick={handleLoadMore} loading={isLoadingMore}>Load More</Button>
                  )}
                </div>
              )}

              {activeView === 'classes' && (
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>My Classes</h2>
                  {isLoading ? <Loader size="sm" /> : enrolledClasses.length === 0 ? <p style={{ color: '#64748b' }}>No classes yet.</p> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                      {enrolledClasses.map(cls => (
                        <Card key={cls.id} hover onClick={() => navigateTo('STUDENT_CLASS_DETAIL', { classId: cls.id })} style={{ cursor: 'pointer' }}>
                          <CardBody>
                            <div style={{ fontSize: '0.75rem', color: '#8b5cf6', fontWeight: 700, marginBottom: '0.5rem' }}>{cls.classCode}</div>
                            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>{cls.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>≡ƒæÑ {cls.studentCount} students</div>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeView === 'history' && (
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Recent History</h2>
                  {isLoading ? <Loader size="sm" /> : studentHistory.length === 0 ? <p style={{ color: '#64748b' }}>No history yet.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {studentHistory.map((h, i) => (
                        <Card key={i}>
                          <CardBody>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{h.testTitle || 'Untitled Test'}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(h.completedAt).toLocaleDateString()}</div>
                              </div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: h.percentage >= 50 ? '#10b981' : '#ef4444' }}>
                                {h.percentage.toFixed(1)}%
                              </div>
                            </div>
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isLoading && activeView !== 'feed' && (
                <div style={{ textAlign: 'center', padding: '2rem' }}><Loader /></div>
              )}

            </div>
          </main>

          <aside style={{
            position: isMobile ? 'fixed' : 'sticky',
            top: isMobile ? '0' : '70px',
            right: isMobile ? (showMobileRight ? 0 : '-100%') : 'auto',
            height: isMobile ? '100vh' : 'calc(100vh - 70px)',
            width: '320px',
            padding: '1.5rem',
            borderLeft: '1px solid #e2e8f0',
            background: 'white',
            transition: 'transform 0.3s ease-in-out',
            zIndex: isMobile ? 1000 : 10,
            overflowY: 'auto'
          }}>
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>Up Next</h3>
              {teacherAssignments.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '1rem' }}>No upcoming deadlines ≡ƒÄë</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[...teacherAssignments].sort((a, b) => a.dueDate - b.dueDate).map((assignment) => {
                    const isOverdue = assignment.dueDate < Date.now();
                    return (
                      <div key={assignment.id} style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.25rem' }}>
                          <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{assignment.title}</strong>
                          {isOverdue && <Badge color="red" size="sm" variant="light">Overdue</Badge>}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: isOverdue ? '#dc2626' : '#64748b' }}>{new Date(assignment.dueDate).toLocaleDateString()}</span>
                          <a href="/student/homework" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#3b82f6', textDecoration: 'none' }}>View</a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {publicSessions.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>Live Now ≡ƒöÑ</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[...publicSessions]
                    .sort((a, b) => b.playerCount - a.playerCount || a.createdAt - b.createdAt)
                    .slice(0, 5)
                    .map(session => (
                      <div key={session.sessionCode} style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{session.testTitle}</strong>
                          <Badge color="blue" size="sm" variant="light">{session.playerCount} playing</Badge>
                        </div>
                        <Button size="xs" variant="light" onClick={() => navigateTo('STUDENT_WAITING', { gameSessionId: session.sessionCode })}>Join</Button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </aside>

        </div>
      </AppShell.Main>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AppShell>
  );
};

export default StudentDashboardPage;
