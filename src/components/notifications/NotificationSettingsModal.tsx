import { useState, useEffect } from 'react';
import { Modal, Switch, Stack, Text, Button, Group, Loader } from '@mantine/core';
import { notifications as mantineNotifications } from '@mantine/notifications';
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
            // Fallback to defaults or show error
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
            mantineNotifications.show({
                title: 'Success',
                message: 'Notification preferences saved',
                color: 'green'
            });
            onClose();
        } catch (error) {
            console.error("Failed to save preferences", error);
            mantineNotifications.show({
                title: 'Error',
                message: 'Failed to save preferences',
                color: 'red'
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Notification Preferences" centered>
            {loading ? (
                <Group justify="center" p="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <Stack>
                    <Text size="sm" c="dimmed" mb="xs">
                        Manage how you receive notifications and updates.
                    </Text>

                    <Switch
                        label="Email Results"
                        description="Receive test results via email"
                        checked={preferences.emailResults}
                        onChange={() => handleToggle('emailResults')}
                    />

                    <Switch
                        label="Weekly Report"
                        description="Get a weekly summary of your progress"
                        checked={preferences.weeklyReport}
                        onChange={() => handleToggle('weeklyReport')}
                    />

                    <Switch
                        label="Teacher Alerts"
                        description="Receive immediate alerts from teachers"
                        checked={preferences.teacherAlerts}
                        onChange={() => handleToggle('teacherAlerts')}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave} loading={saving}>Save Preferences</Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
