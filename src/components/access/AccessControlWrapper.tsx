/**
 * AccessControlWrapper.tsx
 * 
 * A wrapper component that verifies teacher access to student data.
 * Enforces access control based on teacher-student assignments.
 * 
 * Per PRD-0016, Q7: Access is revoked IMMEDIATELY when unassigned.
 * Results remain in database (Q6), but access is blocked.
 * 
 * @module components/access/AccessControlWrapper
 */

import React, { useEffect, useState, useCallback, ReactNode } from 'react';
import {
    Alert,
    Button,
    Center,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon
} from '@mantine/core';
import {
    IconAlertCircle,
    IconLock,
    IconRefresh,
    IconUserOff
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { isStudentAssignedToTeacher } from '../../services/assignmentManager';

// ============================================================================
// TYPES
// ============================================================================

export interface AccessControlWrapperProps {
    /** Teacher ID to verify access for */
    teacherId: string;
    /** Student ID(s) to check access against */
    studentIds: string | string[];
    /** Content to render if access is granted */
    children: ReactNode;
    /** If true, require access to ALL students (AND logic) */
    requireAll?: boolean;
    /** Called when access is denied */
    onAccessDenied?: (deniedIds: string[]) => void;
    /** Called when access is revoked (real-time) */
    onAccessRevoked?: () => void;
    /** Custom message for access denied state */
    accessDeniedMessage?: string;
    /** If true, show loading state while checking */
    showLoading?: boolean;
    /** Interval for re-checking access (ms), 0 to disable */
    recheckInterval?: number;
    /** If true, hide access denied UI and just render null */
    hideOnDenied?: boolean;
}

interface AccessState {
    isChecking: boolean;
    hasAccess: boolean;
    deniedStudents: string[];
    error: string | null;
    lastChecked: number | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RECHECK_INTERVAL = 30000; // 30 seconds

// ============================================================================
// COMPONENT
// ============================================================================

export const AccessControlWrapper: React.FC<AccessControlWrapperProps> = ({
    teacherId,
    studentIds,
    children,
    requireAll = false,
    onAccessDenied,
    onAccessRevoked,
    accessDeniedMessage = 'You no longer have access to this student\'s data.',
    showLoading = true,
    recheckInterval = DEFAULT_RECHECK_INTERVAL,
    hideOnDenied = false
}) => {
    const navigate = useNavigate();
    const [accessState, setAccessState] = useState<AccessState>({
        isChecking: true,
        hasAccess: false,
        deniedStudents: [],
        error: null,
        lastChecked: null
    });

    // Normalize studentIds to array
    const studentIdArray = Array.isArray(studentIds) ? studentIds : [studentIds];

    /**
     * Check access for all student IDs
     */
    const checkAccess = useCallback(async (isRecheck = false) => {
        if (!teacherId || studentIdArray.length === 0) {
            setAccessState(prev => ({
                ...prev,
                isChecking: false,
                hasAccess: false,
                error: 'Invalid teacher or student ID'
            }));
            return;
        }

        // Only show loading on initial check
        if (!isRecheck) {
            setAccessState(prev => ({ ...prev, isChecking: true }));
        }

        try {
            const accessResults = await Promise.all(
                studentIdArray.map(async (studentId) => {
                    const hasAccess = await isStudentAssignedToTeacher(studentId, teacherId);
                    return { studentId, hasAccess };
                })
            );

            const deniedStudents = accessResults
                .filter(r => !r.hasAccess)
                .map(r => r.studentId);

            const hasAllAccess = deniedStudents.length === 0;
            const hasAnyAccess = accessResults.some(r => r.hasAccess);
            const hasAccess = requireAll ? hasAllAccess : hasAnyAccess;

            // Check if access was revoked (had access before, now denied)
            const previouslyHadAccess = accessState.hasAccess && accessState.lastChecked !== null;
            const accessRevoked = previouslyHadAccess && !hasAccess;

            setAccessState({
                isChecking: false,
                hasAccess,
                deniedStudents,
                error: null,
                lastChecked: Date.now()
            });

            if (!hasAccess && deniedStudents.length > 0) {
                onAccessDenied?.(deniedStudents);
            }

            if (accessRevoked) {
                onAccessRevoked?.();
            }
        } catch (error) {
            console.error('Error checking teacher access:', error);
            setAccessState(prev => ({
                ...prev,
                isChecking: false,
                error: error instanceof Error ? error.message : 'Failed to verify access'
            }));
        }
    }, [teacherId, studentIdArray, requireAll, onAccessDenied, onAccessRevoked, accessState.hasAccess, accessState.lastChecked]);

    // Initial access check
    useEffect(() => {
        checkAccess(false);
    }, [teacherId, JSON.stringify(studentIdArray)]);

    // Periodic recheck for access revocation
    useEffect(() => {
        if (recheckInterval <= 0 || !accessState.hasAccess) {
            return;
        }

        const intervalId = setInterval(() => {
            checkAccess(true);
        }, recheckInterval);

        return () => clearInterval(intervalId);
    }, [recheckInterval, accessState.hasAccess, checkAccess]);

    // Loading state
    if (accessState.isChecking && showLoading) {
        return (
            <Center py="xl">
                <Stack align="center" gap="sm">
                    <Loader size="md" />
                    <Text size="sm" c="dimmed">Verifying access...</Text>
                </Stack>
            </Center>
        );
    }

    // Error state
    if (accessState.error) {
        return (
            <Alert
                icon={<IconAlertCircle size={16} />}
                title="Access Error"
                color="red"
            >
                <Stack gap="sm">
                    <Text size="sm">{accessState.error}</Text>
                    <Group>
                        <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconRefresh size={14} />}
                            onClick={() => checkAccess(false)}
                        >
                            Retry
                        </Button>
                    </Group>
                </Stack>
            </Alert>
        );
    }

    // Access denied state
    if (!accessState.hasAccess) {
        if (hideOnDenied) {
            return null;
        }

        return (
            <Paper p="xl" withBorder>
                <Stack align="center" gap="md">
                    <ThemeIcon size="xl" color="red" variant="light">
                        <IconUserOff size={24} />
                    </ThemeIcon>
                    <Stack align="center" gap="xs">
                        <Text fw={600}>Access Denied</Text>
                        <Text size="sm" c="dimmed" ta="center" maw={400}>
                            {accessDeniedMessage}
                        </Text>
                        {accessState.deniedStudents.length > 0 && (
                            <Text size="xs" c="dimmed">
                                Students without access: {accessState.deniedStudents.length}
                            </Text>
                        )}
                    </Stack>
                    <Group>
                        <Button
                            variant="light"
                            leftSection={<IconRefresh size={16} />}
                            onClick={() => checkAccess(false)}
                        >
                            Check Again
                        </Button>
                        <Button
                            variant="subtle"
                            onClick={() => navigate(-1)}
                        >
                            Go Back
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        );
    }

    // Access granted - render children
    return <>{children}</>;
};

// ============================================================================
// HOC VERSION
// ============================================================================

export interface WithAccessControlProps {
    teacherId: string;
    studentId: string;
}

/**
 * Higher-Order Component for access control
 * Wraps a component with access control verification
 */
export function withAccessControl<P extends WithAccessControlProps>(
    WrappedComponent: React.ComponentType<P>,
    options?: Partial<Omit<AccessControlWrapperProps, 'teacherId' | 'studentIds' | 'children'>>
) {
    return function AccessControlledComponent(props: P) {
        return (
            <AccessControlWrapper
                teacherId={props.teacherId}
                studentIds={props.studentId}
                {...options}
            >
                <WrappedComponent {...props} />
            </AccessControlWrapper>
        );
    };
}

// ============================================================================
// HOOK VERSION
// ============================================================================

export interface UseAccessControlOptions {
    teacherId: string;
    studentId: string;
    recheckInterval?: number;
}

export interface UseAccessControlReturn {
    hasAccess: boolean;
    isChecking: boolean;
    error: string | null;
    recheckAccess: () => Promise<void>;
}

/**
 * Hook for checking access control imperatively
 */
export function useAccessControl({
    teacherId,
    studentId,
    recheckInterval = 0
}: UseAccessControlOptions): UseAccessControlReturn {
    const [state, setState] = useState<{
        hasAccess: boolean;
        isChecking: boolean;
        error: string | null;
    }>({
        hasAccess: false,
        isChecking: true,
        error: null
    });

    const checkAccess = useCallback(async () => {
        if (!teacherId || !studentId) {
            setState({
                hasAccess: false,
                isChecking: false,
                error: 'Invalid teacher or student ID'
            });
            return;
        }

        try {
            setState(prev => ({ ...prev, isChecking: true }));
            const hasAccess = await isStudentAssignedToTeacher(studentId, teacherId);
            setState({
                hasAccess,
                isChecking: false,
                error: null
            });
        } catch (error) {
            setState({
                hasAccess: false,
                isChecking: false,
                error: error instanceof Error ? error.message : 'Access check failed'
            });
        }
    }, [teacherId, studentId]);

    // Initial check
    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    // Periodic recheck
    useEffect(() => {
        if (recheckInterval <= 0 || !state.hasAccess) {
            return;
        }

        const intervalId = setInterval(checkAccess, recheckInterval);
        return () => clearInterval(intervalId);
    }, [recheckInterval, state.hasAccess, checkAccess]);

    return {
        hasAccess: state.hasAccess,
        isChecking: state.isChecking,
        error: state.error,
        recheckAccess: checkAccess
    };
}

export default AccessControlWrapper;
