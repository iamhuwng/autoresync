/**
 * RoleSelector Component
 * 
 * Shows a role selection modal for users with multiple roles at login.
 * Part of RBAC Security Hardening (PRD-0016), Task 7.6.
 * 
 * @security Used to select initial role for multi-role users
 */

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Stack,
    Title,
    Text,
    Button,
    Group,
    ThemeIcon,
    Paper,
    rem,
    Center,
} from '@mantine/core';
import {
    IconSchool,
    IconUserCheck,
    IconShieldCheck,
    IconArrowRight,
} from '@tabler/icons-react';
import type { UserRole } from '../../types/security.types';

// =============================================================================
// TYPES
// =============================================================================

interface RoleSelectorProps {
    /** Whether the modal is open */
    opened: boolean;
    /** Available roles for the user */
    availableRoles: UserRole[];
    /** Current selected role */
    currentRole?: UserRole;
    /** Callback when role is selected */
    onRoleSelected: (role: UserRole) => void;
    /** Callback to close modal (optional - if not provided, user must select a role) */
    onClose?: () => void;
    /** User's email for display */
    userEmail?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ROLE_CONFIG: Record<UserRole, {
    icon: React.ComponentType<any>;
    color: string;
    title: string;
    description: string;
}> = {
    student: {
        icon: IconSchool,
        color: 'teal',
        title: 'Student',
        description: 'Access your courses, take tests, and view your results',
    },
    teacher: {
        icon: IconUserCheck,
        color: 'blue',
        title: 'Teacher',
        description: 'Manage students, create tests, and view class results',
    },
    super_admin: {
        icon: IconShieldCheck,
        color: 'violet',
        title: 'Super Admin',
        description: 'Full system access including user management and auditing',
    },
};

// =============================================================================
// COMPONENT
// =============================================================================

export const RoleSelector: React.FC<RoleSelectorProps> = ({
    opened,
    availableRoles,
    currentRole,
    onRoleSelected,
    onClose,
    userEmail,
}) => {
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(currentRole || null);
    const [hoveredRole, setHoveredRole] = useState<UserRole | null>(null);

    // Sync selected role with currentRole prop
    useEffect(() => {
        if (currentRole && !selectedRole) {
            setSelectedRole(currentRole);
        }
    }, [currentRole, selectedRole]);

    const handleConfirm = () => {
        if (selectedRole) {
            onRoleSelected(selectedRole);
        }
    };

    const handleRoleClick = (role: UserRole) => {
        setSelectedRole(role);
    };

    const handleDoubleClick = (role: UserRole) => {
        setSelectedRole(role);
        onRoleSelected(role);
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose || (() => { })}
            title={null}
            centered
            size="md"
            closeOnClickOutside={!!onClose}
            closeOnEscape={!!onClose}
            withCloseButton={!!onClose}
            overlayProps={{
                backgroundOpacity: 0.55,
                blur: 3,
            }}
        >
            <Stack gap="lg">
                {/* Header */}
                <Center>
                    <Stack gap="xs" align="center">
                        <Title order={3}>Select Your Role</Title>
                        {userEmail && (
                            <Text size="sm" c="dimmed">
                                Signed in as {userEmail}
                            </Text>
                        )}
                    </Stack>
                </Center>

                {/* Info text */}
                <Text size="sm" c="dimmed" ta="center">
                    You have access to multiple roles. Select which role you'd like to use for this session.
                    You can switch roles later from your profile.
                </Text>

                {/* Role Cards */}
                <Stack gap="xs">
                    {availableRoles.map((role) => {
                        const config = ROLE_CONFIG[role];
                        const isSelected = selectedRole === role;
                        const isHovered = hoveredRole === role;
                        const IconComponent = config.icon;

                        return (
                            <Paper
                                key={role}
                                p="md"
                                radius="md"
                                withBorder
                                onClick={() => handleRoleClick(role)}
                                onDoubleClick={() => handleDoubleClick(role)}
                                onMouseEnter={() => setHoveredRole(role)}
                                onMouseLeave={() => setHoveredRole(null)}
                                style={{
                                    cursor: 'pointer',
                                    borderColor: isSelected
                                        ? `var(--mantine-color-${config.color}-6)`
                                        : isHovered
                                            ? `var(--mantine-color-${config.color}-3)`
                                            : undefined,
                                    borderWidth: isSelected ? 2 : 1,
                                    backgroundColor: isSelected
                                        ? `var(--mantine-color-${config.color}-light)`
                                        : isHovered
                                            ? `var(--mantine-color-gray-0)`
                                            : undefined,
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <Group>
                                    <ThemeIcon
                                        size="xl"
                                        radius="md"
                                        color={config.color}
                                        variant={isSelected ? 'filled' : 'light'}
                                    >
                                        <IconComponent size={rem(24)} />
                                    </ThemeIcon>
                                    <div style={{ flex: 1 }}>
                                        <Text fw={600} size="md">
                                            {config.title}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {config.description}
                                        </Text>
                                    </div>
                                    {isSelected && (
                                        <ThemeIcon size="sm" color={config.color} variant="outline" radius="xl">
                                            <IconArrowRight size={rem(14)} />
                                        </ThemeIcon>
                                    )}
                                </Group>
                            </Paper>
                        );
                    })}
                </Stack>

                {/* Actions */}
                <Group justify="flex-end" mt="md">
                    {onClose && (
                        <Button variant="subtle" onClick={onClose}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedRole}
                        rightSection={<IconArrowRight size={rem(16)} />}
                    >
                        Continue as {selectedRole ? ROLE_CONFIG[selectedRole].title : '...'}
                    </Button>
                </Group>

                {/* Hint */}
                <Text size="xs" c="dimmed" ta="center">
                    💡 Tip: Double-click a role to quickly select and continue
                </Text>
            </Stack>
        </Modal>
    );
};

export default RoleSelector;
