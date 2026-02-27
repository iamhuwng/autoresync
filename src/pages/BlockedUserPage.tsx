/**
 * BlockedUserPage
 * 
 * Displayed when a user's account has been blocked.
 * Part of RBAC Security Hardening (PRD-0016), Task 5.8.
 * 
 * Features:
 * - Clear message explaining account is blocked
 * - Contact information for support
 * - Logout button to clear session
 * - Prevention of navigation to other protected routes
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
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
import { IconBan, IconLogout, IconMail } from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';

interface BlockedUserPageProps {
    /** Optional custom message */
    message?: string;
    /** Reason for blocking (from state or props) */
    reason?: string;
}

const BlockedUserPage: React.FC<BlockedUserPageProps> = ({
    message,
    reason = 'Your account has been blocked by an administrator.',
}) => {
    const navigate = useNavigate();
    const { logout, user } = useAuth();
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('light');

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login', { replace: true });
        } catch (error) {
            console.error('Logout failed:', error);
            // Force navigation anyway
            navigate('/', { replace: true });
        }
    };

    const handleContactSupport = () => {
        // Open email client with pre-filled subject
        const email = 'support@example.com'; // TODO: Configure actual support email
        const subject = encodeURIComponent('Account Blocked - Appeal Request');
        const body = encodeURIComponent(`
Hello Support Team,

My account has been blocked and I would like to request a review.

Account Email: ${user?.email || 'N/A'}
Date: ${new Date().toISOString()}

Please review my account status.

Thank you.
        `.trim());

        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
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
                    {/* Ban Icon */}
                    <ThemeIcon
                        size={80}
                        radius="xl"
                        variant="gradient"
                        gradient={{ from: 'red.7', to: 'red.5', deg: 135 }}
                    >
                        <IconBan size={40} stroke={1.5} />
                    </ThemeIcon>

                    {/* Title */}
                    <Title
                        order={1}
                        ta="center"
                        style={{
                            background: 'linear-gradient(135deg, #c92a2a 0%, #e03131 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Account Blocked
                    </Title>

                    {/* Main Message */}
                    <Text size="lg" c="dimmed" ta="center" maw={400}>
                        {message || reason}
                    </Text>

                    {/* User Info */}
                    {user?.email && (
                        <Paper
                            p="sm"
                            radius="md"
                            withBorder
                            style={{
                                backgroundColor: colorScheme === 'dark'
                                    ? 'rgba(0, 0, 0, 0.2)'
                                    : 'rgba(0, 0, 0, 0.02)',
                            }}
                        >
                            <Text size="sm" c="dimmed">
                                <strong>Account:</strong> {user.email}
                            </Text>
                        </Paper>
                    )}

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
                            This could happen for several reasons:
                        </Text>
                        <List size="sm" spacing="xs" c="dimmed">
                            <List.Item>Violation of terms of service</List.Item>
                            <List.Item>Security concerns with your account</List.Item>
                            <List.Item>Administrative action</List.Item>
                            <List.Item>Suspicious activity detected</List.Item>
                        </List>
                    </Paper>

                    {/* Action Buttons */}
                    <Group gap="md" mt="md">
                        <Button
                            variant="light"
                            color="blue"
                            leftSection={<IconMail size={18} />}
                            onClick={handleContactSupport}
                        >
                            Contact Support
                        </Button>

                        <Button
                            variant="gradient"
                            gradient={{ from: 'red.6', to: 'orange.5', deg: 135 }}
                            leftSection={<IconLogout size={18} />}
                            onClick={handleLogout}
                        >
                            Log Out
                        </Button>
                    </Group>

                    {/* Footer Note */}
                    <Text size="xs" c="dimmed" ta="center" mt="md">
                        If you believe this is an error, please contact the administrator for assistance.
                    </Text>
                </Stack>
            </Paper>
        </Container>
    );
};

export default BlockedUserPage;
