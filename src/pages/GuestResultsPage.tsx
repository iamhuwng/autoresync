/**
 * Guest Results Page
 * 
 * Allows guests to view their test results by entering their guest name.
 * Results are stored separately and can be claimed when they register.
 */

import { useState } from 'react';
import {
    Container,
    Title,
    TextInput,
    Button,
    Stack,
    Paper,
    Text,
    Group,
    Alert,
    Loader,
    Center,
    Divider
} from '@mantine/core';
import { IconSearch, IconInfoCircle, IconLogin, IconUserPlus } from '@tabler/icons-react';
import { getGuestResults } from '../services/guestResultsService';
import { ResultCard } from '../components/academicRecord/ResultCard';
import type { EnhancedTestResultRecord } from '../types/results.types';
import { useNavigate } from 'react-router-dom';

export function GuestResultsPage() {
    const navigate = useNavigate();
    const [guestName, setGuestName] = useState('');
    const [results, setResults] = useState<EnhancedTestResultRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    const handleSearch = async () => {
        if (!guestName.trim()) {
            setError('Please enter a guest name');
            return;
        }

        setLoading(true);
        setError(null);
        setSearched(false);

        try {
            const guestResults = await getGuestResults(guestName.trim());
            setResults(guestResults);
            setSearched(true);
        } catch (err) {
            console.error('Error fetching guest results:', err);
            setError('Failed to fetch results. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                {/* Header */}
                <div>
                    <Title order={1}>Guest Results</Title>
                    <Text c="dimmed" size="lg" mt="xs">
                        Enter your guest name to view your test results
                    </Text>
                </div>

                {/* Info Alert */}
                <Alert icon={<IconInfoCircle size={16} />} title="About Guest Results" color="blue">
                    <Stack gap="xs">
                        <Text size="sm">
                            Guest results are stored separately and can be claimed when you create an account.
                        </Text>
                        <Text size="sm">
                            Your guest name was automatically generated when you first joined a test session.
                        </Text>
                    </Stack>
                </Alert>

                {/* Search Box */}
                <Paper shadow="sm" p="lg" radius="md" withBorder>
                    <Stack gap="md">
                        <TextInput
                            label="Guest Name"
                            placeholder="Enter your guest name (e.g., John, Sarah_1)"
                            value={guestName}
                            onChange={(e) => setGuestName(e.currentTarget.value)}
                            onKeyPress={handleKeyPress}
                            leftSection={<IconSearch size={16} />}
                            size="md"
                            error={error}
                        />

                        <Button
                            onClick={handleSearch}
                            loading={loading}
                            leftSection={<IconSearch size={18} />}
                            size="md"
                            fullWidth
                        >
                            Search Results
                        </Button>
                    </Stack>
                </Paper>

                {/* Results Display */}
                {loading && (
                    <Center py="xl">
                        <Loader size="lg" />
                    </Center>
                )}

                {!loading && searched && results.length === 0 && (
                    <Paper shadow="sm" p="xl" radius="md" withBorder>
                        <Stack align="center" gap="md">
                            <IconInfoCircle size={48} stroke={1.5} color="gray" />
                            <Text size="lg" fw={500}>No results found</Text>
                            <Text c="dimmed" ta="center">
                                No test results were found for guest name "{guestName}".
                                <br />
                                Please check your guest name and try again.
                            </Text>
                        </Stack>
                    </Paper>
                )}

                {!loading && results.length > 0 && (
                    <>
                        <Paper shadow="sm" p="md" radius="md" withBorder>
                            <Group justify="space-between">
                                <div>
                                    <Text fw={600} size="lg">Found {results.length} result{results.length !== 1 ? 's' : ''}</Text>
                                    <Text size="sm" c="dimmed">Guest: {guestName}</Text>
                                </div>
                                <Button
                                    variant="light"
                                    leftSection={<IconUserPlus size={18} />}
                                    onClick={() => navigate('/register')}
                                >
                                    Create Account to Claim
                                </Button>
                            </Group>
                        </Paper>

                        <Stack gap="md">
                            {results.map((result) => (
                                <ResultCard
                                    key={result.resultId}
                                    result={result}
                                    onClick={() => {
                                        // Navigate to result detail page if needed
                                        console.log('Result clicked:', result.resultId);
                                    }}
                                />
                            ))}
                        </Stack>
                    </>
                )}

                <Divider />

                {/* Login/Register Links */}
                <Paper shadow="sm" p="lg" radius="md" withBorder bg="gray.0">
                    <Stack gap="md" align="center">
                        <Text fw={500} size="lg">Want to keep your results permanently?</Text>
                        <Text c="dimmed" ta="center">
                            Create an account to claim your guest results and track your progress over time.
                        </Text>
                        <Group>
                            <Button
                                variant="light"
                                leftSection={<IconUserPlus size={18} />}
                                onClick={() => navigate('/register')}
                            >
                                Create Account
                            </Button>
                            <Button
                                variant="subtle"
                                leftSection={<IconLogin size={18} />}
                                onClick={() => navigate('/login')}
                            >
                                Already have an account? Login
                            </Button>
                        </Group>
                    </Stack>
                </Paper>
            </Stack>
        </Container>
    );
}

export default GuestResultsPage;
