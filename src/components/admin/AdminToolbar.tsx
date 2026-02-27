/**
 * AdminToolbar Component
 * 
 * Search and filter toolbar for admin user management.
 * Provides search input, filter dropdowns, action buttons.
 * 
 * @example
 * <AdminToolbar
 *   searchTerm={searchTerm}
 *   onSearchChange={setSearchTerm}
 *   assignmentFilter={assignmentFilter}
 *   onAssignmentFilterChange={setAssignmentFilter}
 *   onSync={loadUsers}
 *   loading={loading}
 *   activeTab="students"
 * />
 */

import { Select } from '@mantine/core';
import { Card, CardBody, Button, Input } from '../modern';
import type { AssignmentFilter, AdminTab } from '../../types/admin.types';
import type { UserProfile } from '../../services/userService';

export interface AdminToolbarProps {
    // Search
    searchTerm: string;
    onSearchChange: (term: string) => void;

    // Filters (for students tab)
    assignmentFilter?: AssignmentFilter;
    onAssignmentFilterChange?: (filter: AssignmentFilter) => void;

    // Teacher filter (super admin only)
    filterByTeacherId?: string | null;
    onTeacherFilterChange?: (teacherId: string | null) => void;
    teacherOptions?: Array<{ value: string; label: string }>;

    // Actions
    onSync: () => void;
    onAddStudent?: () => void;

    // State
    loading: boolean;
    activeTab: AdminTab;
    isSuperAdmin?: boolean;
    showAddStudent?: boolean;
}

export function AdminToolbar({
    searchTerm,
    onSearchChange,
    assignmentFilter,
    onAssignmentFilterChange,
    filterByTeacherId,
    onTeacherFilterChange,
    teacherOptions = [],
    onSync,
    onAddStudent,
    loading,
    activeTab,
    isSuperAdmin = false,
    showAddStudent = false
}: AdminToolbarProps) {
    // Only show toolbar for students and teachers tabs
    if (activeTab !== 'students' && activeTab !== 'teachers') {
        return null;
    }

    const searchPlaceholder = activeTab === 'students'
        ? "Search students by name, email, or class..."
        : "Search teachers...";

    return (
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
                    {/* Search Input */}
                    <div style={{ flex: '1 1 300px' }}>
                        <Input
                            placeholder={searchPlaceholder}
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            variant="default"
                        />
                    </div>

                    {/* Student Scope Filter */}
                    {activeTab === 'students' && assignmentFilter && onAssignmentFilterChange && (
                        <div style={{ flex: '0 0 200px' }}>
                            <Select
                                placeholder="Student Scope"
                                data={[
                                    { value: 'all', label: 'All Students' },
                                    { value: 'assigned', label: 'Managed Only' },
                                    { value: 'unassigned', label: 'Floating (Unlinked)' }
                                ]}
                                value={assignmentFilter}
                                onChange={(val) => onAssignmentFilterChange(val as AssignmentFilter || 'all')}
                                clearable={false}
                                styles={{
                                    input: {
                                        height: '42px',
                                        borderRadius: '12px',
                                        border: '2px solid #e2e8f0',
                                    }
                                }}
                            />
                        </div>
                    )}

                    {/* Teacher Filter (Super Admin Only) */}
                    {activeTab === 'students' && isSuperAdmin && onTeacherFilterChange && (
                        <div style={{ flex: '0 0 220px' }}>
                            <Select
                                placeholder="Filter by Teacher"
                                data={teacherOptions}
                                value={filterByTeacherId}
                                onChange={onTeacherFilterChange}
                                clearable
                                searchable
                                styles={{
                                    input: {
                                        height: '42px',
                                        borderRadius: '12px',
                                        border: '2px solid #e2e8f0',
                                    }
                                }}
                            />
                        </div>
                    )}

                    {/* Add Student Button */}
                    {activeTab === 'students' && showAddStudent && onAddStudent && (
                        <Button
                            variant="primary"
                            onClick={onAddStudent}
                            style={{ marginRight: '0.5rem' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                            </svg>
                            Add Student
                        </Button>
                    )}

                    {/* Sync Button */}
                    <Button
                        variant="glass"
                        onClick={onSync}
                        disabled={loading}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                        </svg>
                        Sync
                    </Button>
                </div>
            </CardBody>
        </Card>
    );
}
