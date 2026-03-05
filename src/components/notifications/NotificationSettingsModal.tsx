import { useState, useEffect } from 'react';
import { getUserById, updateUserProfile } from '../../services/userService';

interface NotificationSettingsModalProps {
    userId: string;
    opened: boolean;
    onClose: () => void;
}

export function NotificationSettingsModal({ userId, opened, onClose }: NotificationSettingsModalProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [preferences, setPreferences] = useState({
        emailResults: true,
        weeklyReport: true,
        teacherAlerts: true
    });

    useEffect(() => {
        if (opened && userId) {
            loadPreferences();
        }
    }, [opened, userId]);

    const loadPreferences = async () => {
        setLoading(true);
        try {
            const user = await getUserById(userId);
            if (user && user.preferences && user.preferences.notifications) {
                setPreferences({
                    emailResults: user.preferences.notifications.emailResults ?? true,
                    weeklyReport: user.preferences.notifications.weeklyReport ?? true,
                    teacherAlerts: user.preferences.notifications.teacherAlerts ?? true
                });
            }
        } catch (error) {
            console.error("Failed to load preferences", error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (key: keyof typeof preferences) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateUserProfile(userId, {
                preferences: {
                    notifications: preferences
                }
            });
            alert('Notification preferences saved successfully.');
            onClose();
        } catch (error) {
            console.error("Failed to save preferences", error);
            alert('Failed to save preferences.');
        } finally {
            setSaving(false);
        }
    };

    if (!opened) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '1rem', padding: '1.5rem',
                width: '100%', maxWidth: '400px',
                boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                margin: '1rem',
                display: 'flex', flexDirection: 'column'
            }} onClick={(e) => e.stopPropagation()}>

                <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#1e293b' }}>
                    Notification Preferences
                </h2>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
                    Manage how you receive notifications and updates.
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                        <div style={{
                            width: '2rem', height: '2rem', border: '3px solid #e2e8f0',
                            borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite'
                        }}>
                            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={preferences.emailResults}
                                onChange={() => handleToggle('emailResults')}
                                style={{ marginTop: '0.25rem' }}
                            />
                            <div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>Email Results</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Receive test results via email</div>
                            </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={preferences.weeklyReport}
                                onChange={() => handleToggle('weeklyReport')}
                                style={{ marginTop: '0.25rem' }}
                            />
                            <div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>Weekly Report</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Get a weekly summary of your progress</div>
                            </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={preferences.teacherAlerts}
                                onChange={() => handleToggle('teacherAlerts')}
                                style={{ marginTop: '0.25rem' }}
                            />
                            <div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>Teacher Alerts</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Receive immediate alerts from teachers</div>
                            </div>
                        </label>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button
                                onClick={onClose}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0',
                                    background: 'white', color: '#64748b', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none',
                                    background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer',
                                    opacity: saving ? 0.7 : 1
                                }}
                            >
                                {saving ? 'Saving...' : 'Save Preferences'}
                            </button>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
