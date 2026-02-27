
/**
 * Teacher Classes Page
 * Dashboard for teachers to manage their persistent classes
 */


import React, { useState, useEffect, useMemo } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { AppShell, Modal, TextInput, Textarea, Switch, NumberInput, Loader, Tooltip, Divider, Text, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { classManager } from '../services/classManager';
import type { ClassSummary, CreateClassRequest } from '../types/class.types';
import { IconTrash, IconBook } from '@tabler/icons-react';
import { LinkCourseModal } from '../components/course/LinkCourseModal';

// Modern Components
import { Card, CardBody, CardFooter, Button, Input } from '../components/modern';
import { TeacherHeader } from '../components/navigation';

const TeacherClassesPage: React.FC = () => {
  const { navigateTo } = useNavigation('teacher');
  const { user, profile, logout } = useAuth(); // Added logout
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showLinkCourseModal, setShowLinkCourseModal] = useState(false);
  const [selectedClassForLink, setSelectedClassForLink] = useState<string | null>(null);

  const createForm = useForm({
    initialValues: {
      name: '',
      description: '',
      allowLateJoin: true,
      requireEmail: false,
      maxStudents: 50,
    },
    validate: {
      name: (value) => (value.length < 3 ? 'Name must be at least 3 characters' : null),
    },
  });

  useEffect(() => {
    loadClasses();
  }, [user, profile]);

  const loadClasses = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      // Super admins see ALL classes, teachers see only their own
      const teacherIdFilter = profile?.role === 'super_admin' ? undefined : user.uid;
      const data = await classManager.getClasses(teacherIdFilter);
      setClasses(data);
    } catch (error) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (values: typeof createForm.values) => {
    if (!user?.uid) return;
    setIsCreating(true);
    try {
      const request: CreateClassRequest = {
        name: values.name,
        description: values.description,
        settings: {
          allowLateJoin: values.allowLateJoin,
          requireEmail: values.requireEmail,
          maxStudents: values.maxStudents,
        },
      };

      const result = await classManager.createClass(request, user.uid);

      if (result.success) {
        setShowCreateModal(false);
        createForm.reset();
        loadClasses();
      } else {
        alert('Failed to create class: ' + result.error);
      }
    } catch (error) {
      console.error('Error creating class:', error);
      alert('An error occurred while creating the class');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!window.confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
      return;
    }

    try {
      const success = await classManager.deleteClass(classId);
      if (success) {
        setClasses(classes.filter(c => c.id !== classId));
      } else {
        alert('Failed to delete class');
      }
    } catch (error) {
      console.error('Error deleting class:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Filter classes based on search and status
  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      // Null safety: handle classes with missing name/classCode
      const name = cls.name || '';
      const classCode = cls.classCode || '';
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        classCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter ? cls.status === statusFilter : true;
      return matchesSearch && matchesStatus;
    });
  }, [classes, searchTerm, statusFilter]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <AppShell padding="md">
        {/* Unified Teacher Header with Navigation */}
        <TeacherHeader
          pageTitle="Classes"
          userId={user?.uid}
          userRole={profile?.role}
          onLogout={handleLogout}
        />

        <AppShell.Main>
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>

            {/* Page Header */}
            <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
              <h1 style={{
                fontSize: '2.5rem',
                fontWeight: '800',
                marginBottom: '0.5rem',
                color: '#1e293b'
              }}>
                My Classes
              </h1>
              <p style={{ fontSize: '1rem', color: '#64748b' }}>
                Manage your persistent student groups and track their collective progress.
              </p>
            </div>

            {/* Search and Actions Bar - Glass Card Toolbar (like Course Management) */}
            <Card
              variant="glass"
              style={{
                marginBottom: '2rem',
                animation: 'slideUp 0.5s ease-out 0.1s backwards',
              }}
            >
              <CardBody>
                <div
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-end',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 300px' }}>
                    <Input
                      placeholder="Search classes by name or code..."
                      value={searchTerm}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                      variant="default"
                    />
                  </div>
                  <div style={{ flex: '0 0 180px' }}>
                    <Select
                      placeholder="Filter by Status"
                      data={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                        { value: 'archived', label: 'Archived' },
                      ]}
                      clearable
                      value={statusFilter}
                      onChange={setStatusFilter}
                      styles={{
                        input: {
                          height: '42px',
                          borderRadius: '12px',
                          border: '2px solid #e2e8f0',
                        }
                      }}
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                    Create New Class
                  </Button>
                </div>
              </CardBody>
            </Card>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                <Loader size="xl" color="violet" />
              </div>
            ) : filteredClasses.length === 0 ? (
              <Card
                variant="glass"
                style={{
                  animation: 'scaleIn 0.5s ease-out',
                  textAlign: 'center',
                  padding: '4rem 2rem'
                }}
              >
                <CardBody>
                  <div style={{ fontSize: '4.5rem', marginBottom: '1.5rem', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))' }}>🏫</div>
                  <h3 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.75rem' }}>
                    No Classes Yet
                  </h3>
                  <p style={{ color: '#64748b', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem' }}>
                    Create your first class to start managing students, assigning courses, and conducting formal assessments.
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create Your First Class
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {filteredClasses.map((cls, index) => {
                  const variants: ("lavender" | "sky" | "mint" | "rose" | "peach")[] = ['lavender', 'sky', 'mint', 'rose', 'peach'];
                  const variant = variants[index % variants.length];

                  return (
                    <Card
                      key={cls.id}
                      variant={variant}
                      hover
                      style={{
                        animation: `slideUp 0.5s ease-out ${index * 0.05}s backwards`,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%'
                      }}
                    >
                      <CardBody style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.25rem' }}>
                          <div>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.5rem' }}>
                              {cls.name}
                            </h3>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.25rem 0.75rem',
                              background: 'rgba(255, 255, 255, 0.5)',
                              borderRadius: '9999px',
                              fontSize: '0.8125rem',
                              fontFamily: 'monospace',
                              color: '#475569',
                              fontWeight: '700',
                              border: '1px solid rgba(255,255,255,0.8)'
                            }}>
                              <span style={{ opacity: 0.6 }}>CODE:</span> {cls.classCode}
                            </div>
                          </div>
                          <div style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            letterSpacing: '0.05em',
                            background: cls.status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                            color: cls.status === 'active' ? '#16a34a' : '#475569',
                            border: `1px solid ${cls.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)'}`
                          }}>
                            {cls.status.toUpperCase()}
                          </div>
                        </div>

                        <Text size="sm" color="#64748b" style={{
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minHeight: '2.5rem',
                          marginBottom: '1.5rem'
                        }}>
                          {(cls as any).description || 'Explore the curriculum and materials for this class.'}
                        </Text>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                          <div style={{
                            padding: '0.75rem',
                            background: 'rgba(255, 255, 255, 0.4)',
                            borderRadius: '1rem',
                            border: '1px solid rgba(255, 255, 255, 0.6)',
                            textAlign: 'center'
                          }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Students</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#334155' }}>{cls.studentCount}</div>
                          </div>
                          <div style={{
                            padding: '0.75rem',
                            background: 'rgba(255, 255, 255, 0.4)',
                            borderRadius: '1rem',
                            border: '1px solid rgba(255, 255, 255, 0.6)',
                            textAlign: 'center'
                          }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Active Tests</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#334155' }}>{cls.activeAssignments}</div>
                          </div>
                        </div>
                      </CardBody>
                      <CardFooter style={{ borderTop: '1px solid rgba(255, 255, 255, 0.3)', padding: '1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                          <Button
                            variant="glass"
                            style={{ flex: 1, fontWeight: '700' }}
                            onClick={() => navigateTo('TEACHER_CLASS_DETAIL', { classId: cls.id })}
                          >
                            Manage Class
                          </Button>
                          <Tooltip label="Link Course">
                            <Button
                              variant="primary"
                              style={{ width: '42px', minWidth: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedClassForLink(cls.id);
                                setShowLinkCourseModal(true);
                              }}
                            >
                              <IconBook size={18} />
                            </Button>
                          </Tooltip>
                          <Tooltip label="Delete Class">
                            <Button
                              variant="danger"
                              style={{ width: '42px', minWidth: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClass(cls.id);
                              }}
                            >
                              <IconTrash size={18} />
                            </Button>
                          </Tooltip>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </AppShell.Main>

        <Modal
          opened={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🏫</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>Create New Class</span>
            </div>
          }
          size="md"
          padding="xl"
          radius="lg"
          styles={{
            header: {
              paddingBottom: '1.5rem',
              borderBottom: '1px solid #f1f5f9'
            },
            body: {
              paddingTop: '1.5rem'
            }
          }}
        >
          <form onSubmit={createForm.onSubmit(handleCreateClass)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <TextInput
                label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Class Name</span>}
                placeholder="e.g., Grade 10 Math - Period 2"
                required
                styles={{ input: { borderRadius: '0.75rem', padding: '0.75rem' } }}
                {...createForm.getInputProps('name')}
              />

              <Textarea
                label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Description (Optional)</span>}
                placeholder="What will students learn in this class?"
                minRows={3}
                styles={{ input: { borderRadius: '0.75rem', padding: '0.75rem' } }}
                {...createForm.getInputProps('description')}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <NumberInput
                  label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Max Students</span>}
                  min={1}
                  max={200}
                  styles={{ input: { borderRadius: '0.75rem' } }}
                  {...createForm.getInputProps('maxStudents')}
                />
              </div>

              <div style={{
                padding: '1.25rem',
                background: '#f8fafc',
                borderRadius: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                border: '1px solid #e2e8f0'
              }}>
                <Switch
                  label={<span style={{ fontWeight: 600 }}>Allow Late Join</span>}
                  description="Students can join after assignments start"
                  {...createForm.getInputProps('allowLateJoin', { type: 'checkbox' })}
                />
                <Divider />
                <Switch
                  label={<span style={{ fontWeight: 600 }}>Require Email</span>}
                  description="Students must have an email address"
                  {...createForm.getInputProps('requireEmail', { type: 'checkbox' })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <Button variant="glass" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isCreating}>
                  Create Class
                </Button>
              </div>
            </div>
          </form>
        </Modal>

        {/* Link Course Modal */}
        <LinkCourseModal
          opened={showLinkCourseModal}
          onClose={() => {
            setShowLinkCourseModal(false);
            setSelectedClassForLink(null);
          }}
          classId={selectedClassForLink || ''}
          teacherId={user?.uid || ''}
          onSuccess={() => {
            loadClasses(); // Refresh classes after linking
          }}
        />

        <style>{`
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes scaleIn {
                        from { opacity: 0; transform: scale(0.95); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    @keyframes slideDown {
                        from { opacity: 0; transform: translateY(-20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
      </AppShell>
    </div>
  );
};

export default TeacherClassesPage;
