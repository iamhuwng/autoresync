/**
 * AccessDeniedPage.tsx
 * 
 * Displays a user-friendly error page when access to a route is denied.
 * Part of RBAC Security Hardening (PRD-0016).
 * 
 * @security This page is shown when PrivateRoute denies access based on role
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Container,
    Title,
    Text,
    Button,
    Group,
    Stack,
    Paper,
    ThemeIcon,
    List,
    useMantineTheme,
    useComputedColorScheme,
} from '@mantine/core';
import { IconLock, IconHome, IconLogout, IconArrowLeft } from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';

interface LocationState {
    from?: string;
    reason?: 'role' | 'ownership' | 'blocked' | 'session' | 'unknown';
}

/**
 * Get role-appropriate dashboard path
 */
const getDashboardPath = (role?: string): string => {
    switch (role) {
        case 'student':
            return '/student/dashboard';
        case 'teacher':
            return '/lobby';
        case 'super_admin':
            return '/admin/users';
        default:
            return '/';
    }
};

/**
 * Get human-readable reason for access denial
 */
const getReasonText = (reason?: string): string => {
    switch (reason) {
        case 'role':
            return 'Your account role does not have permission to view this page.';
        case 'ownership':
            return 'You can only access data that belongs to you or is assigned to you.';
        case 'blocked':
            return 'Your account has been temporarily blocked. Please contact support.';
        case 'session':
            return 'Your session has expired or is invalid. Please log in again.';
        default:
            return 'You do not have the required permissions to access this page.';
    }
};

const AccessDeniedPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { profile, logout } = useAuth();
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('light');

    const state = location.state as LocationState | undefined;
    const attemptedPath = state?.from || 'this page';
    const reason = state?.reason || 'unknown';

    const dashboardPath = getDashboardPath(profile?.role);
    const reasonText = getReasonText(reason);

    const handleGoBack = () => {
        // Try to go back in history, or go to dashboard
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate(dashboardPath);
        }
    };

    const handleGoToDashboard = () => {
        navigate(dashboardPath);
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error('Logout failed:', error);
            navigate('/');
        }
    };

    return (
        <Container size="sm" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
            <Paper
                p="xl"
                radius="lg"
                withBorder
                style={{
                    width: '100%',
                    background: colorScheme === 'dark'
                        ? 'linear-gradient(145deg, rgba(37, 38, 43, 0.9), rgba(26, 27, 30, 0.95))'
                        : 'linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(248, 249, 250, 0.9))',
                    backdropFilter: 'blur(10px)',
                    borderColor: colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3],
                }}
            >
                <Stack align="center" gap="lg">
                    {/* Lock Icon */}
                    <ThemeIcon
                        size={80}
                        radius="xl"
                        variant="gradient"
                        gradient={{ from: 'red.6', to: 'orange.5', deg: 135 }}
                    >
                        <IconLock size={40} stroke={1.5} />
                    </ThemeIcon>

                    {/* Title */}
                    <Title
                        order={1}
                        ta="center"
                        style={{
                            background: 'linear-gradient(135deg, #fa5252 0%, #fd7e14 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Access Denied
                    </Title>

                    {/* Main Message */}
                    <Text size="lg" c="dimmed" ta="center" maw={400}>
                        {reasonText}
                    </Text>

                    {/* Possible Reasons List */}
                    <Paper
                        p="md"
                        radius="md"
                        withBorder
                        style={{
                            width: '100%',
                            backgroundColor: colorScheme === 'dark'
                                ? 'rgba(0, 0, 0, 0.2)'
                                : 'rgba(0, 0, 0, 0.02)',
                        }}
                    >
                        <Text size="sm" fw={500} mb="xs">
                            This could be because:
                        </Text>
                        <List size="sm" spacing="xs" c="dimmed">
                            <List.Item>You're trying to access an admin-only or teacher-only page</List.Item>
                            <List.Item>You're trying to view data that belongs to someone else</List.Item>
                            <List.Item>Your session has expired and needs to be refreshed</List.Item>
                            <List.Item>Your account permissions have been recently changed</List.Item>
                        </List>
                    </Paper>

                    {/* Action Buttons */}
                    <Group gap="md" mt="md">
                        <Button
                            variant="light"
                            leftSection={<IconArrowLeft size={18} />}
                            onClick={handleGoBack}
                        >
                            Go Back
                        </Button>

                        <Button
                            variant="gradient"
                            gradient={{ from: 'blue.6', to: 'cyan.5', deg: 135 }}
                            leftSection={<IconHome size={18} />}
                            onClick={handleGoToDashboard}
                        >
                            Go to Dashboard
                        </Button>

                        <Button
                            variant="subtle"
                            color="gray"
                            leftSection={<IconLogout size={18} />}
                            onClick={handleLogout}
                        >
                            Log Out
                        </Button>
                    </Group>

                    {/* Debug Info (development only) */}
                    {process.env.NODE_ENV === 'development' && (
                        <Text size="xs" c="dimmed" ta="center" mt="md">
                            <strong>Debug:</strong> Attempted: {attemptedPath}, Reason: {reason}, Role: {profile?.role || 'none'}
                        </Text>
                    )}
                </Stack>
            </Paper>
        </Container>
    );
};

export default AccessDeniedPage;
