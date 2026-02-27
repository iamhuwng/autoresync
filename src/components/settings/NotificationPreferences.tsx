
import React, { useState, useEffect } from 'react';
import { Card, CardBody, Button } from '../modern';
import { auth } from '../../services/firebase';
import { updateUserProfile, UserProfile } from '../../services/userService'; // Should ideally get single user
import { get } from 'firebase/database';
import { ref } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';

interface NotificationPreferencesProps {
    userId?: string;
}

export const NotificationPreferences: React.FC<NotificationPreferencesProps> = ({ userId }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [prefs, setPrefs] = useState({
        emailResults: true,
        weeklyReport: true,
        teacherAlerts: true
    });
    const [message, setMessage] = useState('');

    const currentUserId = userId || auth.currentUser?.uid;

    useEffect(() => {
        if (!currentUserId) return;
        loadPreferences();
    }, [currentUserId]);

    const loadPreferences = async () => {
        setLoading(true);
        try {
            const userRef = ref(database, `users/${currentUserId}`);
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val() as UserProfile;
                if (userData.preferences?.notifications) {
                    setPrefs(prev => ({ ...prev, ...userData.preferences?.notifications }));
                }
            }
        } catch (error) {
            console.error('Failed to load preferences', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!currentUserId) return;
        setSaving(true);
        try {
            await updateUserProfile(currentUserId, {
                preferences: {
                    notifications: prefs
                }
            });
            setMessage('Preferences saved successfully!');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage('Failed to save preferences.');
        } finally {
            setSaving(false);
        }
    };

    const Toggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0.5rem 0' }}>
            <span style={{ color: '#1e293b', fontWeight: 500 }}>{label}</span>
            <div
                onClick={() => onChange(!checked)}
                style={{
                    width: '48px', height: '24px', borderRadius: '12px',
                    background: checked ? '#10b981' : '#cbd5e1',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
                }}
            >
                <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                    position: 'absolute', top: '2px', left: checked ? '26px' : '2px',
                    transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }} />
            </div>
        </div>
    );

    if (!currentUserId) return <div>Please log in to manage settings.</div>;
    if (loading) return <div>Loading settings...</div>;

    return (
        <Card variant="glass">
            <CardBody style={{ padding: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem' }}>
                    Notification Settings
                </h2>

                <Toggle
                    label="Email me after every test result"
                    checked={prefs.emailResults}
                    onChange={v => setPrefs(p => ({ ...p, emailResults: v }))}
                />

                <Toggle
                    label="Weekly progress report"
                    checked={prefs.weeklyReport}
                    onChange={v => setPrefs(p => ({ ...p, weeklyReport: v }))}
                />

                <Toggle
                    label="Teacher alerts (Session completion)"
                    checked={prefs.teacherAlerts}
                    onChange={v => setPrefs(p => ({ ...p, teacherAlerts: v }))}
                />

                <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Button variant="primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Preferences'}
                    </Button>
                    {message && <span style={{ color: message.includes('Failed') ? '#ef4444' : '#10b981' }}>{message}</span>}
                </div>
            </CardBody>
        </Card>
    );
};
