/**
 * Claim Results Modal
 * 
 * Shows on first login if claimable guest results are found.
 * Allows users to claim guest results created with their email prefix.
 */

import { useState } from 'react';
import {
    Modal,
    Stack,
    Text,
    Button,
    Group,
    Alert,
    List,
    Loader,
    Paper,
    Badge,
    Progress
} from '@mantine/core';
import { IconGift, IconInfoCircle, IconCheck } from '@tabler/icons-react';
import { claimGuestResults, getGuestResultCount } from '../../services/guestResultsService';
import { notifications } from '@mantine/notifications';

interface ClaimResultsModalProps {
    opened: boolean;
    onClose: () => void;
    email: string;
    userId: string;
    claimableGuestNames: string[];
    onClaimComplete?: () => void;
}

export function ClaimResultsModal({
    opened,
    onClose,
    email,
    userId,
    claimableGuestNames,
    onClaimComplete
}: ClaimResultsModalProps) {
    const [claiming, setClaiming] = useState(false);
    const [claimedNames, setClaimedNames] = useState<string[]>([]);
    const [currentClaiming, setCurrentClaiming] = useState<string | null>(null);
    const [resultCounts, setResultCounts] = useState<Record<string, number>>({});

    // Load result counts on mount
    useState(() => {
        const loadCounts = async () => {
            const counts: Record<string, number> = {};
            for (const guestName of claimableGuestNames) {
                const count = await getGuestResultCount(guestName);
                counts[guestName] = count;
            }
            setResultCounts(counts);
        };
        if (opened && claimableGuestNames.length > 0) {
            loadCounts();
        }
    });

    const handleClaim = async () => {
        setClaiming(true);
        let totalClaimed = 0;

        try {
            for (const guestName of claimableGuestNames) {
                setCurrentClaiming(guestName);

                const count = await claimGuestResults(guestName, userId);
                totalClaimed += count;

                setClaimedNames(prev => [...prev, guestName]);
            }

            notifications.show({
                title: 'Results Claimed!',
                message: `Successfully claimed ${totalClaimed} test result${totalClaimed !== 1 ? 's' : ''} from ${claimableGuestNames.length} guest account${claimableGuestNames.length !== 1 ? 's' : ''}`,
                color: 'green',
                icon: <IconCheck size={18} />,
                autoClose: 5000
            });

            onClaimComplete?.();
            onClose();
        } catch (error) {
            console.error('Error claiming results:', error);
            notifications.show({
                title: 'Claim Failed',
                message: 'Failed to claim some results. Please try again later.',
                color: 'red',
                autoClose: 5000
            });
        } finally {
            setClaiming(false);
            setCurrentClaiming(null);
        }
    };

    const handleSkip = () => {
        onClose();
    };

    const totalResults = Object.values(resultCounts).reduce((sum, count) => sum + count, 0);
    const progressPercent = claimableGuestNames.length > 0
        ? (claimedNames.length / claimableGuestNames.length) * 100
        : 0;

    return (
        <Modal
            opened={opened}
            onClose={claiming ? () => { } : onClose}
            title={
                <Group gap="xs">
                    <IconGift size={24} />
                    <Text fw={600} size="lg">Claim Your Guest Results</Text>
                </Group>
            }
            size="md"
            closeOnClickOutside={!claiming}
            closeOnEscape={!claiming}
        >
            <Stack gap="lg">
                <Alert icon={<IconInfoCircle size={16} />} title="Guest Results Found!" color="blue">
                    <Text size="sm">
                        We found test results associated with your email address from when you
                        participated as a guest. You can claim these results to add them to your account.
                    </Text>
                </Alert>

                <Paper p="md" radius="md" withBorder>
                    <Stack gap="sm">
                        <Group justify="space-between">
                            <Text fw={500}>Guest Accounts Found:</Text>
                            <Badge size="lg" variant="filled">{claimableGuestNames.length}</Badge>
                        </Group>
                        <Group justify="space-between">
                            <Text fw={500}>Total Results:</Text>
                            <Badge size="lg" variant="filled" color="green">{totalResults}</Badge>
                        </Group>
                    </Stack>
                </Paper>

                <div>
                    <Text fw={500} mb="xs">Guest Names:</Text>
                    <List spacing="xs">
                        {claimableGuestNames.map((guestName) => (
                            <List.Item key={guestName}>
                                <Group justify="space-between">
                                    <Text>
                                        {guestName}
                                        {claimedNames.includes(guestName) && (
                                            <IconCheck size={16} color="green" style={{ marginLeft: 8 }} />
                                        )}
                                    </Text>
                                    <Badge variant="light">
                                        {resultCounts[guestName] || 0} result{resultCounts[guestName] !== 1 ? 's' : ''}
                                    </Badge>
                                </Group>
                            </List.Item>
                        ))}
                    </List>
                </div>

                {claiming && (
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Claiming: {currentClaiming}
                            </Text>
                            <Text size="sm" fw={500}>
                                {claimedNames.length} / {claimableGuestNames.length}
                            </Text>
                        </Group>
                        <Progress value={progressPercent} animated />
                    </Stack>
                )}

                <Group justify="space-between" grow>
                    <Button
                        variant="subtle"
                        onClick={handleSkip}
                        disabled={claiming}
                    >
                        Skip for Now
                    </Button>
                    <Button
                        onClick={handleClaim}
                        loading={claiming}
                        leftSection={claiming ? <Loader size={16} /> : <IconGift size={18} />}
                    >
                        {claiming ? 'Claiming...' : 'Claim Results'}
                    </Button>
                </Group>

                <Text size="xs" c="dimmed" ta="center">
                    You can only claim these results once. Skipped results can be claimed later from your profile.
                </Text>
            </Stack>
        </Modal>
    );
}
