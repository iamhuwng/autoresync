/**
 * RoleSwitcher Component
 * 
 * Allows users with multiple roles to switch between them.
 * Part of RBAC Security Hardening (PRD-0016, Task 7.5)
 * 
 * @security Shows only available roles for the current user
 */

import React, { useState } from 'react';
import {
    Menu,
    Button,
    Group,
    Text,
    Badge,
    Tooltip,
    useMantineTheme,
    rem,
} from '@mantine/core';
import {
    IconChevronDown,
    IconShieldStar,
    IconSchool,
    IconUser,
    IconCheck,
} from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import { notifications } from '@mantine/notifications';
import type { UserRole } from '../../types/security.types';

interface RoleSwitcherProps {
    /** Show as compact button */
    compact?: boolean;
    /** Custom class name */
    className?: string;
}

/**
 * Role display configuration
 */
const ROLE_CONFIG = {
    super_admin: {
        label: 'Super Admin',
        color: 'red',
        icon: IconShieldStar,
        description: 'Full system access',
    },
    teacher: {
        label: 'Teacher',
        color: 'blue',
        icon: IconSchool,
        description: 'Manage students and courses',
    },
    student: {
        label: 'Student',
        color: 'green',
        icon: IconUser,
        description: 'View courses and take tests',
    },
} as const;

type RoleType = keyof typeof ROLE_CONFIG;

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
    compact = false,
    className,
}) => {
    const theme = useMantineTheme();
    const {
        activeRole,
        availableRoles,
        hasMultipleRoles,
        switchRole,
        primaryRole,
    } = useAuth();

    const [isLoading, setIsLoading] = useState(false);

    // Don't render if user has only one role
    if (!hasMultipleRoles) {
        return null;
    }

    const currentRoleConfig = ROLE_CONFIG[activeRole as RoleType] || ROLE_CONFIG.student;
    const CurrentIcon = currentRoleConfig.icon;

    const handleRoleSwitch = async (newRole: UserRole) => {
        if (newRole === activeRole) return;

        setIsLoading(true);
        try {
            await switchRole(newRole);
            notifications.show({
                title: 'Role Switched',
                message: `You are now viewing as ${ROLE_CONFIG[newRole as RoleType]?.label || newRole}`,
                color: ROLE_CONFIG[newRole as RoleType]?.color || 'blue',
                icon: <IconCheck size={16} />,
            });
        } catch (error) {
            notifications.show({
                title: 'Role Switch Failed',
                message: error instanceof Error ? error.message : 'Failed to switch role',
                color: 'red',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Menu shadow="md" width={220} position="bottom-end">
            <Menu.Target>
                <Tooltip label="Switch role" disabled={compact}>
                    <Button
                        variant="subtle"
                        size={compact ? 'xs' : 'sm'}
                        className={className}
                        loading={isLoading}
                        leftSection={<CurrentIcon size={rem(16)} />}
                        rightSection={<IconChevronDown size={rem(14)} />}
                        styles={{
                            root: {
                                paddingLeft: compact ? rem(8) : rem(12),
                                paddingRight: compact ? rem(8) : rem(12),
                            },
                        }}
                    >
                        {compact ? (
                            <Badge size="xs" color={currentRoleConfig.color}>
                                {currentRoleConfig.label.charAt(0)}
                            </Badge>
                        ) : (
                            <Text size="sm" fw={500}>
                                {currentRoleConfig.label}
                            </Text>
                        )}
                    </Button>
                </Tooltip>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>Switch Role</Menu.Label>
                {availableRoles.map((role: UserRole) => {
                    const config = ROLE_CONFIG[role];
                    if (!config) return null;

                    const RoleIcon = config.icon;
                    const isActive = role === activeRole;
                    const isPrimary = role === primaryRole;

                    return (
                        <Menu.Item
                            key={role}
                            leftSection={<RoleIcon size={rem(16)} color={theme.colors[config.color][6]} />}
                            rightSection={
                                <Group gap={4}>
                                    {isPrimary && (
                                        <Badge size="xs" variant="light" color="gray">
                                            Primary
                                        </Badge>
                                    )}
                                    {isActive && (
                                        <IconCheck size={rem(14)} color={theme.colors.green[6]} />
                                    )}
                                </Group>
                            }
                            onClick={() => handleRoleSwitch(role)}
                            disabled={isActive}
                            styles={{
                                item: {
                                    backgroundColor: isActive ? theme.colors.gray[1] : undefined,
                                },
                            }}
                        >
                            <div>
                                <Text size="sm" fw={isActive ? 600 : 400}>
                                    {config.label}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {config.description}
                                </Text>
                            </div>
                        </Menu.Item>
                    );
                })}

                <Menu.Divider />
                <Menu.Label>
                    <Text size="xs" c="dimmed">
                        Primary role: {ROLE_CONFIG[primaryRole as RoleType]?.label || primaryRole}
                    </Text>
                </Menu.Label>
            </Menu.Dropdown>
        </Menu>
    );
};

export default RoleSwitcher;
