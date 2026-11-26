/**
 * StudentCard Component
 *
 * Displays a single student in a card: avatar, name, email, enrolled class(es),
 * role, teacher oversight, and the actions the current viewer is allowed to use.
 *
 * Native HTML/CSS only (Rule 15 - no Mantine).
 */

import { useEffect, useState } from 'react';
import { IconSchool, IconUser, IconEdit, IconUserPlus, IconUserMinus, IconChartBar } from '@tabler/icons-react';
import { Card } from '../modern';
import type { UserProfile } from '../../services/userService';
import type { StudentTeacherAssignment } from '../../types/assignment.types';
import './StudentCard.css';

export interface StudentCardClassBadge {
    id: string;
    name: string;
    classCode?: string;
}

export interface StudentCardProps {
    student: UserProfile;
    variant?: 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
    index: number;

    // Data
    assignments: StudentTeacherAssignment[];
    teachers: UserProfile[];
    /** Enrolled classes for this student (rendered in place of legacy studentGroup when present). */
    enrolledClasses?: StudentCardClassBadge[];
    /** Viewer uid; lets a teacher see "You" instead of an unresolved teacher badge. */
    currentUserId?: string | null;

    // Actions - an action button only renders when its handler is provided.
    onViewAnalytics: (studentId: string) => void;
    onEdit?: (student: UserProfile) => void;
    onAssignToTeacher?: (student: UserProfile) => void;
    onRelease?: (student: UserProfile) => void;
    onAddToClass?: (student: UserProfile) => void;

    // Permissions
    isSuperAdmin?: boolean;
    isTeacher?: boolean;
}

/** Entrance animation stagger is capped so large rosters do not appear seconds late. */
const MAX_STAGGER_STEPS = 8;
const STAGGER_STEP_SECONDS = 0.03;
const MAX_VISIBLE_CLASSES = 2;

const getInitial = (student: UserProfile) =>
    (student.displayName?.trim().charAt(0) || student.email?.trim().charAt(0) || '?').toUpperCase();

export function StudentCard({
    student,
    variant = 'lavender',
    index,
    assignments,
    teachers,
    enrolledClasses = [],
    currentUserId = null,
    onViewAnalytics,
    onEdit,
    onAssignToTeacher,
    onRelease,
    onAddToClass,
    isSuperAdmin = false,
    isTeacher = false
}: StudentCardProps) {
    const studentName = student.displayName || student.email || 'Unnamed User';
    const studentGroup = (student as UserProfile & { studentGroup?: string }).studentGroup;
    const avatarUrl = (student as UserProfile & { avatarUrl?: string }).avatarUrl || student.photoURL;
    const [avatarFailed, setAvatarFailed] = useState(false);

    useEffect(() => {
        setAvatarFailed(false);
    }, [avatarUrl]);

    const hasTeachers = assignments.length > 0;
    const canRelease = Boolean(onRelease) && (isSuperAdmin || (isTeacher && hasTeachers));
    const staggerDelay = `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_STEP_SECONDS}s`;

    const visibleClasses = enrolledClasses.slice(0, MAX_VISIBLE_CLASSES);
    const hiddenClassCount = Math.max(0, enrolledClasses.length - visibleClasses.length);
    const allClassNames = enrolledClasses.map((cls) => cls.name).join(', ');

    const teacherLabel = (assignment: StudentTeacherAssignment) => {
        const teacher = teachers.find(t => t.uid === assignment.teacherId);
        if (teacher) {
            return {
                label: teacher.displayName?.split(' ')[0] || teacher.email || 'Teacher',
                title: teacher.email || teacher.displayName || 'Teacher',
            };
        }
        if (currentUserId && assignment.teacherId === currentUserId) {
            return { label: 'You', title: 'Assigned to you' };
        }
        return { label: 'Teacher', title: 'Assigned teacher' };
    };

    return (
        <article
            className="student-card-item"
            style={{ animationDelay: staggerDelay }}
            aria-label={`Student ${studentName}`}
            data-testid="student-card"
        >
            <Card variant={variant} hover className="student-card">
                {/* Header: Avatar + Name + Email */}
                <div className="student-card__header">
                    <div className="student-card__avatar-wrap">
                        {avatarUrl && !avatarFailed ? (
                            <img
                                className="student-card__avatar"
                                src={avatarUrl}
                                alt=""
                                onError={() => setAvatarFailed(true)}
                            />
                        ) : (
                            <span className="student-card__avatar student-card__avatar--initial" aria-hidden="true">
                                {getInitial(student)}
                            </span>
                        )}
                        <span
                            className={`student-card__status ${student.status === 'blocked' ? 'is-blocked' : 'is-active'}`}
                            title={student.status === 'blocked' ? 'Blocked' : 'Active'}
                        />
                    </div>
                    <div className="student-card__identity">
                        <h3 className="student-card__name" title={studentName}>{studentName}</h3>
                        {student.email && (
                            <p className="student-card__email" title={student.email}>{student.email}</p>
                        )}
                    </div>
                </div>

                {/* Body: Class + Role Badges, Oversight */}
                <div className="student-card__body">
                    <div className="student-card__badges">
                        {visibleClasses.length > 0 ? (
                            <>
                                {visibleClasses.map((cls) => (
                                    <span
                                        key={cls.id}
                                        className="student-card__badge student-card__badge--class"
                                        title={cls.classCode ? `${cls.name} (${cls.classCode})` : cls.name}
                                    >
                                        <IconSchool size={11} aria-hidden="true" />
                                        {cls.name}
                                    </span>
                                ))}
                                {hiddenClassCount > 0 && (
                                    <span
                                        className="student-card__badge student-card__badge--class"
                                        title={allClassNames}
                                    >
                                        +{hiddenClassCount} more
                                    </span>
                                )}
                            </>
                        ) : (
                            <span className="student-card__badge student-card__badge--class">
                                <IconSchool size={11} aria-hidden="true" />
                                {studentGroup || 'No Class'}
                            </span>
                        )}
                        <span className="student-card__badge student-card__badge--role">
                            <IconUser size={11} aria-hidden="true" />
                            {student.role?.toUpperCase() || 'STUDENT'}
                        </span>
                    </div>

                    <div className="student-card__oversight">
                        <p className="student-card__oversight-label">Oversight</p>
                        {!hasTeachers ? (
                            <p className="student-card__floating">Floating (Unlinked)</p>
                        ) : (
                            <div className="student-card__badges">
                                {assignments.map((assignment) => {
                                    const { label, title } = teacherLabel(assignment);
                                    return (
                                        <span
                                            key={assignment.id || `${assignment.teacherId}-${assignment.studentId}`}
                                            className="student-card__badge student-card__badge--teacher"
                                            title={title}
                                        >
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer: Action Buttons */}
                <div className="student-card__actions">
                    <button
                        type="button"
                        className="student-card__primary-action"
                        onClick={() => onViewAnalytics(student.uid)}
                        aria-label={`View analytics for ${studentName}`}
                    >
                        <IconChartBar size={16} aria-hidden="true" />
                        Analytics
                    </button>

                    {onEdit && (
                        <button
                            type="button"
                            className="student-card__icon-action"
                            onClick={() => onEdit(student)}
                            aria-label={`Edit ${studentName}`}
                            title="Edit"
                        >
                            <IconEdit size={18} aria-hidden="true" />
                        </button>
                    )}

                    {isSuperAdmin && onAssignToTeacher && (
                        <button
                            type="button"
                            className="student-card__icon-action student-card__icon-action--indigo"
                            onClick={() => onAssignToTeacher(student)}
                            aria-label={`Assign ${studentName} to teacher`}
                            title="Assign to Teacher"
                        >
                            <IconUserPlus size={18} aria-hidden="true" />
                        </button>
                    )}

                    {isTeacher && onAddToClass && (
                        <button
                            type="button"
                            className="student-card__icon-action student-card__icon-action--teal"
                            onClick={() => onAddToClass(student)}
                            aria-label={`Add ${studentName} to class`}
                            title="Add to Class"
                        >
                            <IconSchool size={18} aria-hidden="true" />
                        </button>
                    )}

                    {canRelease && onRelease && (
                        <button
                            type="button"
                            className="student-card__icon-action student-card__icon-action--danger"
                            onClick={() => onRelease(student)}
                            aria-label={`Release ${studentName}`}
                            title={isTeacher ? 'Release from your oversight' : 'Release from teacher(s)'}
                        >
                            <IconUserMinus size={18} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </Card>
        </article>
    );
}
