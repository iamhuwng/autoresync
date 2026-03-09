/**
 * Teacher Homework List Page
 * PRD-0016: Solo Study & Homework System
 * 
 * Unified design following app-wide patterns.
 * Uses TeacherHeader, AppShell, and modern components.
 */

import { useState } from 'react';
import { AppShell, Tabs, Loader, Stack, Text, Center } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClipboard, IconCalendar, IconCheckbox, IconFolder, IconClock, IconAlertTriangle, IconLock, IconEdit } from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useHomeworkList } from '../hooks/useHomeworkList';
import { HomeworkCard, HomeworkCreateModal, HomeworkEditModal } from '../components/homework';
import { deleteHomework, duplicateHomework, extendDeadline } from '../services/homeworkManager';
import type { HomeworkAssignment, HomeworkStatus } from '../types/homework.types';

// Modern Components
import { Card, CardBody, Button, Input } from '../components/modern';
import { TeacherHeader } from '../components/navigation';
import { THCSHomeworkAssignDialog } from '../components/thcs-editor/THCSHomeworkAssignDialog';

type ViewMode = 'by_class' | 'chronological' | 'by_status';

export function TeacherHomeworkListPage() {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const [viewMode, setViewMode] = useState<ViewMode>('chronological');
    const [statusFilter, setStatusFilter] = useState<HomeworkStatus | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingHomework, setEditingHomework] = useState<HomeworkAssignment | null>(null);
    // Phase 3 Task 2.2: Entry Point B — THCS homework from list page
    const [showThcsAssignDialog, setShowThcsAssignDialog] = useState(false);

    const {
        homework,
        loading,
        error,
        refetch,
        filteredHomework,
        statusCounts
    } = useHomeworkList({
        teacherId: user?.uid,
        autoRefresh: true,
    });

    const handleDelete = async (hw: HomeworkAssignment) => {
        if (!confirm(`Are you sure you want to delete "${hw.materialTitle}"?`)) {
            return;
        }

        try {
            await deleteHomework(hw.id);
            notifications.show({
                title: 'Deleted',
                message: `"${hw.materialTitle}" has been deleted`,
                color: 'red'
            });
            await refetch();
        } catch (error) {
            console.error('Error deleting homework:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to delete homework',
                color: 'red'
            });
        }
    };

    const handleDuplicate = async (hw: HomeworkAssignment) => {
        try {
            await duplicateHomework(hw.id, {});
            notifications.show({
                title: 'Duplicated',
                message: `"${hw.materialTitle}" has been duplicated`,
                color: 'green'
            });
            await refetch();
        } catch (error) {
            console.error('Error duplicating homework:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to duplicate homework',
                color: 'red'
            });
        }
    };

    const handleEdit = (hw: HomeworkAssignment) => {
        setEditingHomework(hw);
    };

    const handleExtendDeadline = async (hw: HomeworkAssignment) => {
        const currentDue = new Date(hw.scheduling.dueDate);
        const newDateStr = prompt(
            `Current deadline: ${currentDue.toLocaleString()}\n\nEnter new deadline (YYYY-MM-DD HH:MM):`,
            `${currentDue.getFullYear()}-${String(currentDue.getMonth() + 1).padStart(2, '0')}-${String(currentDue.getDate()).padStart(2, '0')} ${String(currentDue.getHours()).padStart(2, '0')}:${String(currentDue.getMinutes()).padStart(2, '0')}`
        );
        if (!newDateStr) return;

        const newDate = new Date(newDateStr.replace(' ', 'T'));
        if (isNaN(newDate.getTime())) {
            alert('Invalid date format. Please use YYYY-MM-DD HH:MM');
            return;
        }
        if (newDate.getTime() <= hw.scheduling.dueDate) {
            alert('New deadline must be after the current deadline.');
            return;
        }

        try {
            await extendDeadline(hw.id, newDate);
            alert('Deadline extended successfully!');
            await refetch();
        } catch (err) {
            console.error('Error extending deadline:', err);
            alert('Failed to extend deadline.');
        }
    };

    const handleCreateHomework = () => {
        setShowCreateModal(true);
    };

    const handleLogout = async () => {
        try {
            await logout();
            sessionStorage.removeItem('isAdmin');
            navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    // Filter homework based on search query and status
    const searchFilteredHomework = filteredHomework.filter((hw) => {
        const matchesSearch = hw.materialTitle.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter ? hw.status === statusFilter : true;
        return matchesSearch && matchesStatus;
    });

    // Group homework by class for "by_class" view
    const homeworkByClass = searchFilteredHomework.reduce((acc, hw) => {
        if (hw.target.type === 'class') {
            const className = hw.target.className || 'Unknown Class';
            if (!acc[className]) {
                acc[className] = [];
            }
            acc[className].push(hw);
        } else {
            if (!acc['Other']) {
                acc['Other'] = [];
            }
            acc['Other'].push(hw);
        }
        return acc;
    }, {} as Record<string, HomeworkAssignment[]>);

    // Group homework by status for "by_status" view
    const homeworkByStatus = searchFilteredHomework.reduce((acc, hw) => {
        if (!acc[hw.status]) {
            acc[hw.status] = [];
        }
        acc[hw.status].push(hw);
        return acc;
    }, {} as Record<HomeworkStatus, HomeworkAssignment[]>);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active': return <IconCheckbox size={16} />;
            case 'scheduled': return <IconClock size={16} />;
            case 'past_due': return <IconAlertTriangle size={16} />;
            case 'draft': return <IconEdit size={16} />;
            case 'closed': return <IconLock size={16} />;
            default: return null;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'active': return 'Active';
            case 'scheduled': return 'Scheduled';
            case 'past_due': return 'Past Due';
            case 'draft': return 'Draft';
            case 'closed': return 'Closed';
            default: return status;
        }
    };

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
                    pageTitle="Homework"
                    userId={user?.uid}
                    userRole={profile?.role}
                    userDisplayName={profile?.displayName || user?.displayName || user?.email}
                    userEmail={profile?.email || user?.email}
                    userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                    onLogout={handleLogout}
                />

                <AppShell.Main>
                    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1rem' }}>
                        {/* Page Header */}
                        <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
                            <h1
                                style={{
                                    fontSize: '2.5rem',
                                    fontWeight: '800',
                                    marginBottom: '0.5rem',
                                    color: '#1e293b',
                                }}
                            >
                                📋 Homework Management
                            </h1>
                            <p style={{ fontSize: '1rem', color: '#64748b' }}>
                                Create, manage, and track homework assignments for your students
                            </p>
                        </div>

                        {/* Search and Actions Bar */}
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
                                            placeholder="🔍 Search homework..."
                                            value={searchQuery}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                            variant="default"
                                        />
                                    </div>

                                    {/* View Mode Toggle */}
                                    <Tabs
                                        value={viewMode}
                                        onChange={(value) => setViewMode(value as ViewMode)}
                                        variant="pills"
                                        styles={{
                                            root: {
                                                background: 'rgba(241, 245, 249, 0.8)',
                                                padding: '4px',
                                                borderRadius: '12px',
                                            },
                                            tab: {
                                                fontWeight: 600,
                                                '&[data-active]': {
                                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                                },
                                            }
                                        }}
                                    >
                                        <Tabs.List>
                                            <Tabs.Tab value="chronological" leftSection={<IconCalendar size={14} />}>
                                                Timeline
                                            </Tabs.Tab>
                                            <Tabs.Tab value="by_class" leftSection={<IconFolder size={14} />}>
                                                By Class
                                            </Tabs.Tab>
                                            <Tabs.Tab value="by_status" leftSection={<IconClipboard size={14} />}>
                                                By Status
                                            </Tabs.Tab>
                                        </Tabs.List>
                                    </Tabs>

                                    <Button
                                        variant="primary"
                                        onClick={handleCreateHomework}
                                        style={{
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                                        </svg>
                                        Create Homework
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={() => setShowThcsAssignDialog(true)}
                                        style={{
                                            background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                                        }}
                                    >
                                        📝 Create THCS Homework
                                    </Button>
                                </div>
                            </CardBody>
                        </Card>

                        {/* Status Filters */}
                        <Card
                            variant="glass"
                            style={{
                                marginBottom: '2rem',
                                animation: 'slideUp 0.5s ease-out 0.15s backwards',
                            }}
                        >
                            <CardBody>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <Button
                                        variant={statusFilter === null ? 'primary' : 'glass'}
                                        onClick={() => setStatusFilter(null)}
                                        size="sm"
                                    >
                                        All ({homework.length})
                                    </Button>
                                    <Button
                                        variant={statusFilter === 'active' ? 'primary' : 'glass'}
                                        onClick={() => setStatusFilter('active')}
                                        size="sm"
                                        style={statusFilter === 'active' ? { background: '#10b981' } : {}}
                                    >
                                        ✅ Active ({statusCounts.active})
                                    </Button>
                                    <Button
                                        variant={statusFilter === 'scheduled' ? 'primary' : 'glass'}
                                        onClick={() => setStatusFilter('scheduled')}
                                        size="sm"
                                        style={statusFilter === 'scheduled' ? { background: '#6366f1' } : {}}
                                    >
                                        ⏰ Scheduled ({statusCounts.scheduled})
                                    </Button>
                                    <Button
                                        variant={statusFilter === 'past_due' ? 'primary' : 'glass'}
                                        onClick={() => setStatusFilter('past_due')}
                                        size="sm"
                                        style={statusFilter === 'past_due' ? { background: '#f59e0b' } : {}}
                                    >
                                        ⚠️ Past Due ({statusCounts.past_due})
                                    </Button>
                                    <Button
                                        variant={statusFilter === 'draft' ? 'primary' : 'glass'}
                                        onClick={() => setStatusFilter('draft')}
                                        size="sm"
                                        style={statusFilter === 'draft' ? { background: '#64748b' } : {}}
                                    >
                                        📝 Draft ({statusCounts.draft})
                                    </Button>
                                    <Button
                                        variant={statusFilter === 'closed' ? 'primary' : 'glass'}
                                        onClick={() => setStatusFilter('closed')}
                                        size="sm"
                                        style={statusFilter === 'closed' ? { background: '#1e293b' } : {}}
                                    >
                                        🔒 Closed ({statusCounts.closed})
                                    </Button>
                                </div>
                            </CardBody>
                        </Card>

                        {/* Content Area */}
                        {loading ? (
                            <Card
                                variant="default"
                                style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                }}
                            >
                                <Center>
                                    <Stack align="center" gap="md">
                                        <Loader size="xl" color="violet" type="bars" />
                                        <Text fw={500} c="dimmed">Loading homework...</Text>
                                    </Stack>
                                </Center>
                            </Card>
                        ) : error ? (
                            <Card
                                variant="default"
                                style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#dc2626' }}>
                                    {error}
                                </h2>
                                <Button variant="primary" onClick={refetch} style={{ marginTop: '1rem' }}>
                                    🔄 Retry
                                </Button>
                            </Card>
                        ) : searchFilteredHomework.length === 0 ? (
                            <Card
                                variant="default"
                                style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                                }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>
                                    No homework found
                                </h2>
                                <p style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                                    {searchQuery
                                        ? 'Try adjusting your search or filters'
                                        : 'Create your first homework assignment to get started'}
                                </p>
                                {!searchQuery && (
                                    <Button
                                        variant="primary"
                                        onClick={handleCreateHomework}
                                        style={{
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        }}
                                    >
                                        Create First Homework
                                    </Button>
                                )}
                            </Card>
                        ) : (
                            <>
                                {/* Chronological View */}
                                {viewMode === 'chronological' && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '1rem',
                                        }}
                                    >
                                        {searchFilteredHomework.map((hw, index) => (
                                            <div
                                                key={hw.id}
                                                style={{ animation: `slideUp 0.5s ease-out ${index * 0.05}s backwards` }}
                                            >
                                                <HomeworkCard
                                                    homework={hw}
                                                    onEdit={handleEdit}
                                                    onDuplicate={handleDuplicate}
                                                    onDelete={handleDelete}
                                                    onExtendDeadline={handleExtendDeadline}
                                                    showSubmissionProgress={true}
                                                    onResetComplete={refetch}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* By Class View */}
                                {viewMode === 'by_class' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                        {Object.entries(homeworkByClass).map(([className, homeworkList], groupIndex) => (
                                            <Card
                                                key={className}
                                                variant="default"
                                                style={{
                                                    animation: `slideUp 0.5s ease-out ${groupIndex * 0.1}s backwards`
                                                }}
                                            >
                                                <CardBody>
                                                    <h2 style={{
                                                        fontSize: '1.25rem',
                                                        fontWeight: '700',
                                                        color: '#1e293b',
                                                        marginBottom: '1rem',
                                                        paddingBottom: '0.75rem',
                                                        borderBottom: '2px solid #e2e8f0',
                                                    }}>
                                                        📚 {className} ({homeworkList.length})
                                                    </h2>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        {homeworkList.map((hw) => (
                                                            <HomeworkCard
                                                                key={hw.id}
                                                                homework={hw}
                                                                onEdit={handleEdit}
                                                                onDuplicate={handleDuplicate}
                                                                onDelete={handleDelete}
                                                                onExtendDeadline={handleExtendDeadline}
                                                                onResetComplete={refetch}
                                                            />
                                                        ))}
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        ))}
                                    </div>
                                )}

                                {/* By Status View */}
                                {viewMode === 'by_status' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                        {Object.entries(homeworkByStatus).map(([status, homeworkList], groupIndex) => (
                                            <Card
                                                key={status}
                                                variant="default"
                                                style={{
                                                    animation: `slideUp 0.5s ease-out ${groupIndex * 0.1}s backwards`
                                                }}
                                            >
                                                <CardBody>
                                                    <h2 style={{
                                                        fontSize: '1.25rem',
                                                        fontWeight: '700',
                                                        color: '#1e293b',
                                                        marginBottom: '1rem',
                                                        paddingBottom: '0.75rem',
                                                        borderBottom: '2px solid #e2e8f0',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                    }}>
                                                        {getStatusIcon(status)} {getStatusLabel(status)} ({homeworkList.length})
                                                    </h2>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        {homeworkList.map((hw) => (
                                                            <HomeworkCard
                                                                key={hw.id}
                                                                homework={hw}
                                                                onEdit={handleEdit}
                                                                onDuplicate={handleDuplicate}
                                                                onDelete={handleDelete}
                                                                onExtendDeadline={handleExtendDeadline}
                                                                onResetComplete={refetch}
                                                            />
                                                        ))}
                                                    </div>
                                                </CardBody>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </AppShell.Main>

                {/* Homework Create Modal */}
                <HomeworkCreateModal
                    isOpen={showCreateModal}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={refetch}
                />

                {/* Homework Edit Modal */}
                <HomeworkEditModal
                    isOpen={!!editingHomework}
                    homework={editingHomework}
                    onClose={() => setEditingHomework(null)}
                    onSuccess={refetch}
                />

                {/* Phase 3 Task 2.2: THCS Homework Assign Dialog (Entry Point B) */}
                <THCSHomeworkAssignDialog
                    isOpen={showThcsAssignDialog}
                    onClose={() => setShowThcsAssignDialog(false)}
                    onSuccess={refetch}
                    testId=""
                    testTitle="THCS Test"
                />
            </AppShell>

            {/* Animations */}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}

export default TeacherHomeworkListPage;
