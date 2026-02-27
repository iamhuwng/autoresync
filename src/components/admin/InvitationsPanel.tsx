import React from 'react';
import { Table, Button, Group, Text, CopyButton, ActionIcon, Badge } from '@mantine/core';
import { IconUserPlus, IconCheck, IconCopy } from '@tabler/icons-react';

export interface Invitation {
    code: string;
    status: 'active' | 'used' | 'expired' | 'revoked';
    createdAt: number;
    expiresAt: number;
    usedAt?: number;
    usedBy?: string;
}

interface InvitationsPanelProps {
    invitations: Invitation[];
    loading?: boolean;
    onGenerate: () => void;
    onRevoke: (code: string) => void;
}

const getStatusBadge = (invite: Invitation) => {
    const statusConfig = {
        active: { color: 'green', label: 'Active' },
        used: { color: 'blue', label: 'Used' },
        expired: { color: 'orange', label: 'Expired' },
        revoked: { color: 'red', label: 'Revoked' },
    };

    const config = statusConfig[invite.status] || { color: 'gray', label: invite.status };

    return (
        <Badge color={config.color} variant="light">
            {config.label}
        </Badge>
    );
};

export const InvitationsPanel: React.FC<InvitationsPanelProps> = ({
    invitations,
    loading = false,
    onGenerate,
    onRevoke,
}) => {
    return (
        <div>
            <Button
                onClick={onGenerate}
                leftSection={<IconUserPlus size={16} />}
                mb="md"
                loading={loading}
            >
                Generate Invitation
            </Button>

            <Table striped highlightOnHover>
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th>Expires At</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {invitations.length === 0 ? (
                        <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                                <Text c="dimmed">No invitations yet. Generate one to get started!</Text>
                            </td>
                        </tr>
                    ) : (
                        invitations.map((invite) => (
                            <tr key={invite.code}>
                                {/* Code with Copy Button */}
                                <td>
                                    <Group gap="xs">
                                        <Text style={{ fontFamily: 'monospace' }}>{invite.code}</Text>
                                        <CopyButton value={invite.code}>
                                            {({ copied, copy }) => (
                                                <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                                                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                                </ActionIcon>
                                            )}
                                        </CopyButton>
                                    </Group>
                                </td>

                                {/* Status Badge */}
                                <td>{getStatusBadge(invite)}</td>

                                {/* Created At */}
                                <td>{new Date(invite.createdAt).toLocaleDateString()}</td>

                                {/* Expires At */}
                                <td>{new Date(invite.expiresAt).toLocaleDateString()}</td>

                                {/* Action */}
                                <td>
                                    {invite.status === 'active' && (
                                        <Button
                                            color="red"
                                            size="xs"
                                            variant="outline"
                                            onClick={() => onRevoke(invite.code)}
                                        >
                                            Revoke
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </Table>
        </div>
    );
};
