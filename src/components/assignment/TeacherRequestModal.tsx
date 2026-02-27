import React, { useState, useEffect } from 'react';
import {
    Modal,
    TextInput,
    Button,
    Text,
    Alert
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface TeacherRequestModalProps {
    opened: boolean;
    onClose: () => void;
    onSubmit: (email: string) => Promise<void>;
}

export const TeacherRequestModal: React.FC<TeacherRequestModalProps> = ({
    opened,
    onClose,
    onSubmit
}) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when modal opens
    useEffect(() => {
        if (opened) {
            setEmail('');
            setError(null);
            setLoading(false);
        }
    }, [opened]);

    const validateEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        setError(null);

        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError('Please enter an email address');
            return;
        }

        if (!validateEmail(trimmedEmail)) {
            setError('Please enter a valid email address');
            return;
        }

        setLoading(true);
        try {
            await onSubmit(trimmedEmail);
            onClose();
        } catch (err) {
            console.error('Error requesting student:', err);
            setError(err instanceof Error ? err.message : 'Failed to send request');
            setLoading(false); // Only stop loading on error, keep loading on success until close
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>👥</span>
                    <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>Request Student</span>
                </div>
            }
            size="md"
            padding="xl"
            radius="lg"
            centered
            styles={{
                header: {
                    paddingBottom: '1.5rem',
                    borderBottom: '1px solid #f1f5f9'
                },
                body: {
                    paddingTop: '1.5rem'
                }
            }}
        >
            <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
                        Enter the email address of the student you want to request access to.
                        The administrator will need to approve this request.
                    </Text>

                    {error && (
                        <Alert
                            icon={<IconAlertCircle size={16} />}
                            color="red"
                            title="Error"
                            styles={{
                                root: { borderRadius: '0.75rem' }
                            }}
                        >
                            {error}
                        </Alert>
                    )}

                    <TextInput
                        label={<span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Student Email</span>}
                        placeholder="student@example.com"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.currentTarget.value);
                            if (error) setError(null);
                        }}
                        disabled={loading}
                        required
                        data-autofocus
                        styles={{
                            input: {
                                borderRadius: '0.75rem',
                                padding: '0.75rem',
                                height: '42px'
                            }
                        }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                        <Button
                            variant="default"
                            onClick={onClose}
                            disabled={loading}
                            styles={{
                                root: {
                                    borderRadius: '0.75rem',
                                    fontWeight: 600
                                }
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            loading={loading}
                            disabled={!email.trim()}
                            styles={{
                                root: {
                                    borderRadius: '0.75rem',
                                    fontWeight: 600
                                }
                            }}
                        >
                            Send Request
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default TeacherRequestModal;
