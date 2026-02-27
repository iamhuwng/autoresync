import React, { useState, useEffect } from 'react';
import { getGroupsByTeacher, createGroup } from '../../services/studentGroupService';
import type { StudentGroup } from '../../types/solo.types';
import './StudentGroupSelector.css';

interface Student {
    id: string;
    name: string;
    email: string;
}

interface StudentGroupSelectorProps {
    teacherId: string;
    availableStudents: Student[];
    selectedStudentIds: string[];
    onSelectionChange: (studentIds: string[]) => void;
    onClose: () => void;
}

export function StudentGroupSelector({
    teacherId,
    availableStudents,
    selectedStudentIds,
    onSelectionChange,
    onClose,
}: StudentGroupSelectorProps) {
    const [groups, setGroups] = useState<StudentGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>(selectedStudentIds);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadGroups();
    }, [teacherId]);

    const loadGroups = async () => {
        try {
            setLoading(true);
            const data = await getGroupsByTeacher(teacherId);
            setGroups(data);
        } catch (error) {
            console.error('Error loading groups:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGroupSelect = (group: StudentGroup) => {
        setSelectedIds(group.studentIds);
    };

    const handleStudentToggle = (studentId: string) => {
        setSelectedIds((prev) =>
            prev.includes(studentId)
                ? prev.filter((id) => id !== studentId)
                : [...prev, studentId]
        );
    };

    const handleSelectAll = () => {
        setSelectedIds(availableStudents.map((s) => s.id));
    };

    const handleDeselectAll = () => {
        setSelectedIds([]);
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || selectedIds.length === 0) {
            alert('Please enter a group name and select at least one student');
            return;
        }

        try {
            await createGroup(teacherId, newGroupName.trim(), selectedIds);
            setNewGroupName('');
            setShowCreateGroup(false);
            await loadGroups();
        } catch (error) {
            console.error('Error creating group:', error);
            alert('Failed to create group');
        }
    };

    const handleApply = () => {
        onSelectionChange(selectedIds);
        onClose();
    };

    const filteredStudents = availableStudents.filter((student) =>
        student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="student-group-selector-overlay" onClick={onClose}>
            <div className="student-group-selector" onClick={(e) => e.stopPropagation()}>
                <div className="selector-header">
                    <h2 className="selector-title">👥 Select Students</h2>
                    <button className="close-btn" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="selector-body">
                    {/* Existing Groups */}
                    <div className="groups-section">
                        <div className="section-header">
                            <h3 className="section-title">Saved Groups</h3>
                            <button
                                className="create-group-btn"
                                onClick={() => setShowCreateGroup(!showCreateGroup)}
                            >
                                {showCreateGroup ? '✕ Cancel' : '➕ New Group'}
                            </button>
                        </div>

                        {showCreateGroup && (
                            <div className="create-group-form">
                                <input
                                    type="text"
                                    className="group-name-input"
                                    placeholder="Group name..."
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                />
                                <button
                                    className="save-group-btn"
                                    onClick={handleCreateGroup}
                                    disabled={!newGroupName.trim() || selectedIds.length === 0}
                                >
                                    💾 Save Current Selection
                                </button>
                            </div>
                        )}

                        {loading ? (
                            <div className="loading-state">Loading groups...</div>
                        ) : groups.length === 0 ? (
                            <div className="empty-state">No saved groups yet</div>
                        ) : (
                            <div className="groups-list">
                                {groups.map((group) => (
                                    <button
                                        key={group.id}
                                        className="group-item"
                                        onClick={() => handleGroupSelect(group)}
                                    >
                                        <span className="group-name">{group.name}</span>
                                        <span className="group-count">
                                            {group.studentIds.length} student{group.studentIds.length !== 1 ? 's' : ''}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Student Selection */}
                    <div className="students-section">
                        <div className="section-header">
                            <h3 className="section-title">
                                Individual Students ({selectedIds.length} selected)
                            </h3>
                            <div className="bulk-actions">
                                <button className="bulk-btn" onClick={handleSelectAll}>
                                    Select All
                                </button>
                                <button className="bulk-btn" onClick={handleDeselectAll}>
                                    Clear
                                </button>
                            </div>
                        </div>

                        <input
                            type="text"
                            className="search-input"
                            placeholder="🔍 Search students..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />

                        <div className="students-list">
                            {filteredStudents.length === 0 ? (
                                <div className="empty-state">No students found</div>
                            ) : (
                                filteredStudents.map((student) => (
                                    <label key={student.id} className="student-item">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(student.id)}
                                            onChange={() => handleStudentToggle(student.id)}
                                        />
                                        <div className="student-info">
                                            <span className="student-name">{student.name}</span>
                                            <span className="student-email">{student.email}</span>
                                        </div>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="selector-footer">
                    <button className="cancel-btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="apply-btn"
                        onClick={handleApply}
                        disabled={selectedIds.length === 0}
                    >
                        Apply Selection ({selectedIds.length})
                    </button>
                </div>
            </div>
        </div>
    );
}
