/**
 * AdminSettingsPage
 * 
 * Super admin settings page for managing API keys and system configuration.
 * 
 * Route: /admin/settings
 * Allowed Roles: super_admin only
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { AdminLayout } from '../components/navigation';
import { Card, Button, Input } from '../components/modern';
import {
    IconKey,
    IconPlus,
    IconTrash,
    IconCheck,
    IconX,
    IconAlertCircle,
    IconRefresh,
    IconEye,
    IconEyeOff,
} from '@tabler/icons-react';
import {
    type AIProvider,
    type APIKeyEntry,
    type APIKeysConfig,
    getAPIKeys,
    addAPIKey,
    updateAPIKey,
    deleteAPIKey,
    subscribeToAPIKeys,
} from '../services/api-keys.service';
import { getEnv } from '../config/env.config';

// ============================================================================
// Types
// ============================================================================

interface KeyCardProps {
    entry: APIKeyEntry;
    isEnvKey?: boolean;
    onToggle: (id: string, isActive: boolean) => void;
    onDelete: (id: string) => void;
}

interface AddKeyModalProps {
    isOpen: boolean;
    provider: AIProvider | null;
    onClose: () => void;
    onAdd: (provider: AIProvider, label: string, key: string) => Promise<void>;
}

// ============================================================================
// Sub-components
// ============================================================================

const KeyCard: React.FC<KeyCardProps> = ({ entry, isEnvKey, onToggle, onDelete }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                background: entry.isActive ? 'rgba(16, 185, 129, 0.05)' : 'rgba(148, 163, 184, 0.05)',
                borderRadius: '12px',
                border: `1px solid ${entry.isActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`,
                transition: 'all 0.2s ease',
            }}
        >
            {/* Status Indicator */}
            <div
                style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: entry.isActive ? '#10b981' : '#94a3b8',
                    flexShrink: 0,
                }}
                title={entry.isActive ? 'Active' : 'Inactive'}
            />

            {/* Key Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: '600', color: '#1e293b' }}>{entry.label}</span>
                    {isEnvKey && (
                        <span
                            style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.4rem',
                                background: 'rgba(99, 102, 241, 0.1)',
                                color: '#6366f1',
                                borderRadius: '4px',
                                fontWeight: '600',
                            }}
                        >
                            .env
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: '#64748b' }}>
                    <span style={{ fontFamily: 'monospace' }}>{entry.keyPreview}</span>
                    {entry.createdAt && <span>Added {formatDate(entry.createdAt)}</span>}
                    {entry.requestCount > 0 && (
                        <span style={{ color: '#10b981' }}>{entry.requestCount} requests</span>
                    )}
                    {entry.errorCount > 0 && (
                        <span style={{ color: '#ef4444' }}>{entry.errorCount} errors</span>
                    )}
                </div>
            </div>

            {/* Actions */}
            {!isEnvKey && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => onToggle(entry.id, !entry.isActive)}
                        style={{
                            padding: '0.5rem',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            color: entry.isActive ? '#10b981' : '#94a3b8',
                            transition: 'all 0.2s',
                        }}
                        title={entry.isActive ? 'Deactivate' : 'Activate'}
                    >
                        {entry.isActive ? <IconEye size={18} /> : <IconEyeOff size={18} />}
                    </button>

                    {confirmDelete ? (
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                                onClick={() => {
                                    onDelete(entry.id);
                                    setConfirmDelete(false);
                                }}
                                style={{
                                    padding: '0.5rem',
                                    background: '#ef4444',
                                    border: 'none',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    color: 'white',
                                }}
                                title="Confirm Delete"
                            >
                                <IconCheck size={16} />
                            </button>
                            <button
                                onClick={() => setConfirmDelete(false)}
                                style={{
                                    padding: '0.5rem',
                                    background: '#94a3b8',
                                    border: 'none',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    color: 'white',
                                }}
                                title="Cancel"
                            >
                                <IconX size={16} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            style={{
                                padding: '0.5rem',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                color: '#ef4444',
                                transition: 'all 0.2s',
                            }}
                            title="Delete"
                        >
                            <IconTrash size={18} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const AddKeyModal: React.FC<AddKeyModalProps> = ({ isOpen, provider, onClose, onAdd }) => {
    const [label, setLabel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setLabel('');
            setApiKey('');
            setShowKey(false);
            setError('');
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!provider || !label.trim() || !apiKey.trim()) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onAdd(provider, label.trim(), apiKey.trim());
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add key');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !provider) return null;

    const providerInfo = {
        gemini: {
            name: 'Google Gemini',
            color: '#6366f1',
            placeholder: 'AIza...',
        },
        groq: {
            name: 'Groq',
            color: '#10b981',
            placeholder: 'gsk_...',
        },
    };

    const info = providerInfo[provider];

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'white',
                    borderRadius: '16px',
                    padding: '2rem',
                    width: '100%',
                    maxWidth: '480px',
                    margin: '1rem',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.5rem' }}>
                    Add {info.name} API Key
                </h2>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#475569', marginBottom: '0.5rem' }}>
                            Label
                        </label>
                        <Input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g., Production Key 1"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#475569', marginBottom: '0.5rem' }}>
                            API Key
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Input
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={info.placeholder}
                                style={{ width: '100%', paddingRight: '3rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                style={{
                                    position: 'absolute',
                                    right: '0.75rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                }}
                            >
                                {showKey ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                                color: '#ef4444',
                                fontSize: '0.875rem',
                            }}
                        >
                            <IconAlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <Button variant="glass" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            disabled={loading || !label.trim() || !apiKey.trim()}
                            style={{ background: info.color }}
                        >
                            {loading ? 'Adding...' : 'Add Key'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const AdminSettingsPage: React.FC = () => {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('admin');

    const [config, setConfig] = useState<APIKeysConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addModalProvider, setAddModalProvider] = useState<AIProvider | null>(null);
    const [envKeys, setEnvKeys] = useState<{ gemini: string[]; groq: string[] }>({ gemini: [], groq: [] });

    const isSuperAdmin = profile?.role === 'super_admin';

    // Load .env keys on mount
    useEffect(() => {
        try {
            const env = getEnv();
            const geminiKeys: string[] = [];
            const groqKeys: string[] = [];

            // Check Gemini keys from .env
            for (let i = 1; i <= 5; i++) {
                const key = env[`VITE_GEMINI_API_KEY_${i}` as keyof typeof env] as string | undefined;
                if (key && key.trim().length > 0 && !key.includes('your_')) {
                    geminiKeys.push(key);
                }
            }
            // Legacy key
            if (env.VITE_GOOGLE_API_KEY && !env.VITE_GOOGLE_API_KEY.includes('your_')) {
                if (!geminiKeys.includes(env.VITE_GOOGLE_API_KEY)) {
                    geminiKeys.push(env.VITE_GOOGLE_API_KEY);
                }
            }

            // Check Groq key from .env
            if (env.VITE_GROQ_API_KEY && !env.VITE_GROQ_API_KEY.includes('your_')) {
                groqKeys.push(env.VITE_GROQ_API_KEY);
            }

            setEnvKeys({ gemini: geminiKeys, groq: groqKeys });
        } catch (error) {
            console.warn('[Settings] Failed to load env keys:', error);
        }
    }, []);

    // Subscribe to Firestore keys
    useEffect(() => {
        const unsubscribe = subscribeToAPIKeys((newConfig) => {
            setConfig(newConfig);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Initial load
    useEffect(() => {
        getAPIKeys().then((data) => {
            setConfig(data);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const handleLogout = async () => {
        await logout();
        sessionStorage.removeItem('isAdmin');
        navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
    };

    const handleSidebarNavigate = (page: string) => {
        const pageRoutes: Record<string, string> = {
            dashboard: 'ADMIN_DASHBOARD',
            materials: 'ADMIN_MATERIALS',
            users: 'ADMIN_USERS',
            courses: 'ADMIN_COURSES',
            classes: 'ADMIN_CLASSES',
            sessions: 'ADMIN_SESSIONS',
            settings: 'ADMIN_SETTINGS',
            backup: 'ADMIN_BACKUP',
        };

        const route = pageRoutes[page];
        if (route) {
            navigateTo(route as any, {}, { reason: `admin_nav_${page}` });
        }
    };

    const handleAddKey = useCallback(async (provider: AIProvider, label: string, key: string) => {
        if (!user?.uid) throw new Error('Not authenticated');
        await addAPIKey(provider, label, key, user.uid);
    }, [user?.uid]);

    const handleToggleKey = useCallback(async (provider: AIProvider, keyId: string, isActive: boolean) => {
        if (!user?.uid) return;
        await updateAPIKey(provider, keyId, { isActive }, user.uid);
    }, [user?.uid]);

    const handleDeleteKey = useCallback(async (provider: AIProvider, keyId: string) => {
        if (!user?.uid) return;
        await deleteAPIKey(provider, keyId, user.uid);
    }, [user?.uid]);

    const openAddModal = (provider: AIProvider) => {
        setAddModalProvider(provider);
        setAddModalOpen(true);
    };

    // Convert .env keys to display format
    const envKeyEntries = {
        gemini: envKeys.gemini.map((key, index) => ({
            id: `env_gemini_${index}`,
            provider: 'gemini' as AIProvider,
            label: index === 0 && envKeys.gemini.length === 1 ? 'Default Key' : `Env Key ${index + 1}`,
            encryptedKey: '',
            keyPreview: `${key.substring(0, 4)}...${key.substring(key.length - 8)}`,
            createdAt: 0,
            createdBy: 'system',
            isActive: true,
            requestCount: 0,
            errorCount: 0,
        })),
        groq: envKeys.groq.map((key, index) => ({
            id: `env_groq_${index}`,
            provider: 'groq' as AIProvider,
            label: 'Default Key',
            encryptedKey: '',
            keyPreview: `${key.substring(0, 4)}...${key.substring(key.length - 8)}`,
            createdAt: 0,
            createdBy: 'system',
            isActive: true,
            requestCount: 0,
            errorCount: 0,
        })),
    };

    // Combine env + Firestore keys
    const geminiKeys = [
        ...envKeyEntries.gemini,
        ...Object.values(config?.gemini || {}),
    ];

    const groqKeys = [
        ...envKeyEntries.groq,
        ...Object.values(config?.groq || {}),
    ];

    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Access Denied</h2>
                <p>This page is only accessible to super administrators.</p>
            </div>
        );
    }

    return (
        <AdminLayout
            pageTitle="Settings"
            currentPage="settings"
            onNavigate={handleSidebarNavigate}
            onLogout={handleLogout}
            userRole={profile?.role}
        >
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <h1
                        style={{
                            fontSize: '2rem',
                            fontWeight: '700',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            marginBottom: '0.5rem',
                        }}
                    >
                        Settings ⚙️
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '1rem' }}>
                        Manage API keys and system configuration
                    </p>
                </div>

                {loading ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center' }}>
                        <IconRefresh size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading settings...</p>
                    </Card>
                ) : (
                    <>
                        {/* Gemini API Keys */}
                        <Card variant="glass" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '10px',
                                            background: 'rgba(99, 102, 241, 0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#6366f1',
                                        }}
                                    >
                                        <IconKey size={20} />
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                            Google Gemini API Keys
                                        </h2>
                                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                                            {geminiKeys.length} key{geminiKeys.length !== 1 ? 's' : ''} configured
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="primary"
                                    onClick={() => openAddModal('gemini')}
                                    style={{ background: '#6366f1' }}
                                >
                                    <IconPlus size={16} />
                                    Add Key
                                </Button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {geminiKeys.length === 0 ? (
                                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
                                        No Gemini API keys configured. Add one to enable AI features.
                                    </p>
                                ) : (
                                    geminiKeys.map((entry) => (
                                        <KeyCard
                                            key={entry.id}
                                            entry={entry}
                                            isEnvKey={entry.id.startsWith('env_')}
                                            onToggle={(id, isActive) => handleToggleKey('gemini', id, isActive)}
                                            onDelete={(id) => handleDeleteKey('gemini', id)}
                                        />
                                    ))
                                )}
                            </div>
                        </Card>

                        {/* Groq API Keys */}
                        <Card variant="glass" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '10px',
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#10b981',
                                        }}
                                    >
                                        <IconKey size={20} />
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                            Groq API Keys
                                        </h2>
                                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                                            {groqKeys.length} key{groqKeys.length !== 1 ? 's' : ''} configured
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="primary"
                                    onClick={() => openAddModal('groq')}
                                    style={{ background: '#10b981' }}
                                >
                                    <IconPlus size={16} />
                                    Add Key
                                </Button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {groqKeys.length === 0 ? (
                                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
                                        No Groq API keys configured. Add one to enable fallback AI.
                                    </p>
                                ) : (
                                    groqKeys.map((entry) => (
                                        <KeyCard
                                            key={entry.id}
                                            entry={entry}
                                            isEnvKey={entry.id.startsWith('env_')}
                                            onToggle={(id, isActive) => handleToggleKey('groq', id, isActive)}
                                            onDelete={(id) => handleDeleteKey('groq', id)}
                                        />
                                    ))
                                )}
                            </div>
                        </Card>

                        {/* Info Card */}
                        <Card variant="glass" style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', fontSize: '0.875rem', color: '#475569' }}>
                                <IconAlertCircle size={18} style={{ color: '#6366f1', flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <strong>How it works:</strong>
                                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                                        <li>Keys from <code>.env</code> file are loaded first (shown with badge)</li>
                                        <li>Keys added here are stored encrypted in Firestore</li>
                                        <li>All active keys are used in rotation for load balancing</li>
                                        <li>Deactivate keys to temporarily disable them without deleting</li>
                                    </ul>
                                </div>
                            </div>
                        </Card>
                    </>
                )}
            </div>

            {/* Add Key Modal */}
            <AddKeyModal
                isOpen={addModalOpen}
                provider={addModalProvider}
                onClose={() => setAddModalOpen(false)}
                onAdd={handleAddKey}
            />

            {/* Spin animation */}
            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </AdminLayout>
    );
};

export default AdminSettingsPage;
