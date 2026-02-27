import React from 'react';
import { Tabs, Badge, Text } from '@mantine/core';
import {
    IconUsers, IconUser, IconUserPlus,
    IconChartBar, IconCopy, IconSchool
} from '@tabler/icons-react';
import { Card, CardBody } from '../modern';
import type { AdminTab, AssignmentFilter } from '../../types/admin.types';
import { AdminToolbar } from './AdminToolbar';
import { StudentGrid } from './StudentGrid';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { TeacherTable } from './TeacherTable';
import { InvitationsPanel } from './InvitationsPanel';
import { RequestsPanel } from './RequestsPanel';
import { CourseTypesPanel } from './CourseTypesPanel';
import { AdminCourseManagement } from './AdminCourseManagement';

// Premium tabs styles - Active state uses Mantine's internal styling
const tabsStyles = () => ({
    root: { background: 'transparent' },
    list: {
        gap: '0.5rem',
        padding: '0.6rem',
        background: 'rgba(255, 255, 255, 0.25)',
        backdropFilter: 'blur(12px)',
        borderRadius: '999px',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        marginBottom: '1.5rem',
        width: 'fit-content',
        boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
    },
    tab: {
        fontWeight: 750,
        fontSize: '0.85rem',
        color: '#64748b',
        padding: '0.6rem 1.25rem',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        // Active state styling via CSS variable override
        '--tab-active-bg': 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
        '--tab-active-color': 'white',
    }
});

export interface AdminTabsContainerProps {
    // State
    activeTab: string;
    onTabChange: (tab: string | null) => void;
    isSuperAdmin: boolean;
    isTeacher: boolean;
    currentUserId: string;

    // User Management
    userManagement: {
        users: any[];
        filteredUsers: any[];
        loading: boolean;
        searchTerm: string;
        setSearchTerm: (term: string) => void;
        assignmentFilter: AssignmentFilter;
        setAssignmentFilter: (filter: AssignmentFilter) => void;
        loadUsers: () => Promise<void>;
    };

    // Assignments
    assignments: {
        loading: boolean;
        assignmentsByStudent: Record<string, any[]>;
        assignmentsByTeacher: Record<string, any[]>;
    };

    // Requests
    requests: any[];
    pendingRequestCount: number;

    // Filters
    filterByTeacherId: string | null;
    onTeacherFilterChange: (id: string | null) => void;

    // Invitations
    invitations: any[];
    onGenerateInvite: () => void;
    onRevokeInvite: (code: string) => void;

    // Course Types
    courseTypes: any[];
    pendingTypeRequests: any[];
    onApproveType: (id: string) => void;
    onRejectType: (id: string) => void;

    // Request Actions
    onApproveRequest: (id: string) => void;
    onDenyRequest: (id: string) => void;

    // Student Grid Actions
    onViewAnalytics: (studentId: string) => void;
    onEdit: (user: any) => void;
    onAssignToTeacher: (student: any) => void;
    onRelease: (student: any) => void;
    onAddToClass: (student: any) => void;
    onDeleteUser: (userId: string) => void;
    onAssignStudents: (teacher: any, mode: string) => void;
    onAddStudent: () => void;
}

export const AdminTabsContainer: React.FC<AdminTabsContainerProps> = ({
    activeTab,
    onTabChange,
    isSuperAdmin,
    isTeacher,
    currentUserId,
    userManagement,
    assignments,
    requests,
    pendingRequestCount,
    filterByTeacherId,
    onTeacherFilterChange,
    invitations,
    onGenerateInvite,
    onRevokeInvite,
    courseTypes,
    pendingTypeRequests,
    onApproveType,
    onRejectType,
    onApproveRequest,
    onDenyRequest,
    onViewAnalytics,
    onEdit,
    onAssignToTeacher,
    onRelease,
    onAddToClass,
    onDeleteUser,
    onAssignStudents,
    onAddStudent,
}) => {
    const teachers = userManagement.users.filter(u => u.role === 'teacher' || u.role === 'super_admin');

    return (
        <Tabs value={activeTab} onChange={onTabChange} variant="pills" radius="xl" styles={tabsStyles}>
            {isSuperAdmin && (
                <Tabs.List className="staggered-item" style={{ animationDelay: '0.2s' }}>
                    <Tabs.Tab value="students" leftSection={<IconUsers size={16} />}>Students</Tabs.Tab>
                    <Tabs.Tab value="teachers" leftSection={<IconUser size={16} />}>Teachers</Tabs.Tab>
                    <Tabs.Tab value="requests" leftSection={<IconUserPlus size={16} />}>
                        Requests
                        {pendingRequestCount > 0 && (
                            <Badge size="xs" color="red" circle ml={5}>{pendingRequestCount}</Badge>
                        )}
                    </Tabs.Tab>
                    <Tabs.Tab value="course-types" leftSection={<IconChartBar size={16} />}>Course Types</Tabs.Tab>
                    <Tabs.Tab value="invites" leftSection={<IconCopy size={16} />}>Invites</Tabs.Tab>
                    <Tabs.Tab value="courses" leftSection={<IconSchool size={16} />}>Courses</Tabs.Tab>
                </Tabs.List>
            )}

            <AdminToolbar
                searchTerm={userManagement.searchTerm}
                onSearchChange={userManagement.setSearchTerm}
                assignmentFilter={userManagement.assignmentFilter}
                onAssignmentFilterChange={userManagement.setAssignmentFilter}
                filterByTeacherId={filterByTeacherId}
                onTeacherFilterChange={onTeacherFilterChange}
                teacherOptions={teachers.filter(u => u.role === 'teacher').map(u => ({
                    value: u.uid,
                    label: u.displayName || u.email
                }))}
                onSync={userManagement.loadUsers}
                onAddStudent={onAddStudent}
                loading={userManagement.loading}
                activeTab={activeTab as AdminTab}
                isSuperAdmin={isSuperAdmin}
                showAddStudent={!!filterByTeacherId || isTeacher}
            />

            <Card variant="glass" style={{ minHeight: '600px', padding: '1.5rem', background: 'rgba(255,255,255,0.7)' }}>
                <CardBody>
                    {/* Students/Teachers Panel */}
                    {(activeTab === 'students' || activeTab === 'teachers') && (
                        <Tabs.Panel value={activeTab} pt="xs">
                            {!userManagement.loading && !assignments.loading && userManagement.filteredUsers.length > 0 && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <Text size="sm" c="dimmed" fw={600}>
                                        Showing <b style={{ color: '#1e293b' }}>{userManagement.filteredUsers.length}</b> {activeTab}
                                        {activeTab === 'students' && userManagement.assignmentFilter !== 'all' && ` (${userManagement.assignmentFilter})`}
                                    </Text>
                                </div>
                            )}

                            {userManagement.loading || (isTeacher && assignments.loading) ? (
                                <LoadingState message="Synchronizing data..." />
                            ) : userManagement.filteredUsers.length === 0 ? (
                                <EmptyState
                                    title="No users match your search"
                                    description="We couldn't find any entries for this filter."
                                    actionLabel="Add student"
                                    onAction={onAddStudent}
                                    showAction={isTeacher}
                                />
                            ) : activeTab === 'students' ? (
                                <StudentGrid
                                    students={userManagement.filteredUsers}
                                    assignments={assignments.assignmentsByStudent}
                                    teachers={teachers}
                                    onViewAnalytics={onViewAnalytics}
                                    onEdit={onEdit}
                                    onAssignToTeacher={onAssignToTeacher}
                                    onRelease={onRelease}
                                    onAddToClass={onAddToClass}
                                    isSuperAdmin={isSuperAdmin}
                                    isTeacher={isTeacher}
                                />
                            ) : (
                                <TeacherTable
                                    teachers={userManagement.filteredUsers}
                                    assignmentsByTeacher={assignments.assignmentsByTeacher}
                                    onEdit={onEdit}
                                    onAssignStudents={onAssignStudents}
                                    onDelete={(user) => onDeleteUser(user.uid)}
                                    isSuperAdmin={isSuperAdmin}
                                    activeTab={activeTab}
                                />
                            )}
                        </Tabs.Panel>
                    )}

                    {/* Other Panels */}
                    {activeTab === 'invites' && (
                        <Tabs.Panel value="invites" pt="xs">
                            <InvitationsPanel invitations={invitations} onGenerate={onGenerateInvite} onRevoke={onRevokeInvite} />
                        </Tabs.Panel>
                    )}

                    {activeTab === 'requests' && (
                        <Tabs.Panel value="requests" pt="xs">
                            <RequestsPanel requests={requests} users={userManagement.users} onApprove={onApproveRequest} onDeny={onDenyRequest} />
                        </Tabs.Panel>
                    )}

                    {activeTab === 'course-types' && (
                        <Tabs.Panel value="course-types" pt="xs">
                            <CourseTypesPanel courseTypes={courseTypes} pendingRequests={pendingTypeRequests} users={userManagement.users} onApprove={onApproveType} onReject={onRejectType} />
                        </Tabs.Panel>
                    )}

                    {activeTab === 'courses' && (
                        <Tabs.Panel value="courses" pt="xs">
                            <AdminCourseManagement currentUserId={currentUserId} />
                        </Tabs.Panel>
                    )}
                </CardBody>
            </Card>
        </Tabs>
    );
};
