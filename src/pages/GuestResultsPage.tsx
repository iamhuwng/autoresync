/**
 * Guest Results Page
 * 
 * Allows guests to view their test results by entering their guest name.
 * Results are stored separately and can be claimed when they register.
 */

import { useState } from 'react';
import { IconSearch, IconInfoCircle, IconLogin, IconUserPlus } from '@tabler/icons-react';
import { getGuestResults } from '../services/guestResultsService';
import { ResultCard } from '../components/academicRecord/ResultCard';
import { Button, Card, CardBody, Input, VanillaLoader } from '../components/modern';
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

    const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                padding: '2.5rem 1.25rem 3rem',
                background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
            }}
        >
            <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                    <h1 style={{ margin: 0, color: '#0f172a', fontSize: '2rem', fontWeight: 800 }}>
                        Guest Results
                    </h1>
                    <p style={{ margin: '0.5rem 0 0', color: '#475569', fontSize: '1rem' }}>
                        Enter your guest name to view your test results.
                    </p>
                </div>

                <div
                    role="note"
                    style={{
                        borderRadius: '1rem',
                        border: '1px solid rgba(59, 130, 246, 0.16)',
                        background: 'rgba(239, 246, 255, 0.95)',
                        padding: '1rem 1.1rem',
                        boxShadow: '0 16px 40px rgba(59, 130, 246, 0.08)',
                    }}
                >
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <IconInfoCircle size={20} style={{ color: '#2563eb', flexShrink: 0, marginTop: '0.1rem' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <div style={{ color: '#1d4ed8', fontWeight: 700, fontSize: '0.95rem' }}>
                                About Guest Results
                            </div>
                            <p style={{ margin: 0, color: '#1e3a8a', fontSize: '0.9rem', lineHeight: 1.55 }}>
                                Guest results are stored separately and can be claimed when you create an account.
                            </p>
                            <p style={{ margin: 0, color: '#1e3a8a', fontSize: '0.9rem', lineHeight: 1.55 }}>
                                Your guest name was automatically generated when you first joined a test session.
                            </p>
                        </div>
                    </div>
                </div>

                <Card variant="glass">
                    <CardBody>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <Input
                                label="Guest Name"
                                placeholder="Enter your guest name (e.g., John, Sarah_1)"
                                value={guestName}
                                onChange={(event) => setGuestName(event.currentTarget.value)}
                                onKeyDown={handleKeyPress}
                                icon={<IconSearch size={16} />}
                                error={error ?? undefined}
                                fullWidth
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
                        </div>
                    </CardBody>
                </Card>

                {loading && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem 0' }}>
                        <VanillaLoader size="lg" />
                    </div>
                )}

                {!loading && searched && results.length === 0 && (
                    <Card variant="glass">
                        <CardBody>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem', textAlign: 'center' }}>
                                <IconInfoCircle size={42} stroke={1.5} style={{ color: '#94a3b8' }} />
                                <div style={{ color: '#0f172a', fontSize: '1.05rem', fontWeight: 700 }}>
                                    No results found
                                </div>
                                <p style={{ margin: 0, color: '#64748b', lineHeight: 1.6 }}>
                                    No test results were found for guest name "{guestName}".
                                    <br />
                                    Please check your guest name and try again.
                                </p>
                            </div>
                        </CardBody>
                    </Card>
                )}

                {!loading && results.length > 0 && (
                    <>
                        <Card variant="glass">
                            <CardBody>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <div>
                                        <div style={{ color: '#0f172a', fontSize: '1.05rem', fontWeight: 700 }}>
                                            Found {results.length} result{results.length !== 1 ? 's' : ''}
                                        </div>
                                        <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                                            Guest: {guestName}
                                        </div>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        leftSection={<IconUserPlus size={18} />}
                                        onClick={() => navigate('/')}
                                    >
                                        Create Account to Claim
                                    </Button>
                                </div>
                            </CardBody>
                        </Card>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {results.map((result) => (
                                <ResultCard
                                    key={result.resultId}
                                    result={result}
                                    onClick={() => {
                                        console.log('Result clicked:', result.resultId);
                                    }}
                                />
                            ))}
                        </div>
                    </>
                )}

                <div
                    aria-hidden="true"
                    style={{ height: '1px', background: 'linear-gradient(90deg, rgba(148,163,184,0) 0%, rgba(148,163,184,0.45) 50%, rgba(148,163,184,0) 100%)' }}
                />

                <Card variant="glass">
                    <CardBody>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem', textAlign: 'center' }}>
                            <div style={{ color: '#0f172a', fontSize: '1.05rem', fontWeight: 700 }}>
                                Want to keep your results permanently?
                            </div>
                            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.6, maxWidth: '560px' }}>
                                Create an account to claim your guest results and track your progress over time.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                <Button
                                    variant="secondary"
                                    leftSection={<IconUserPlus size={18} />}
                                    onClick={() => navigate('/')}
                                >
                                    Create Account
                                </Button>
                                <Button
                                    variant="outline"
                                    leftSection={<IconLogin size={18} />}
                                    onClick={() => navigate('/')}
                                >
                                    Already have an account? Login
                                </Button>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            </div>
        </div>
    );
}

export default GuestResultsPage;
