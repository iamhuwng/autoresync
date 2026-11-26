/**
 * TeacherRequestModal Component
 *
 * Native <dialog> modal for requesting admin approval to assign a student by email.
 */

import React, { useEffect, useId, useState } from 'react';
import { IconAlertCircle, IconUserPlus } from '@tabler/icons-react';
import { NativeDialog } from './NativeDialog';

export interface TeacherRequestModalProps {
    opened: boolean;
    onClose: () => void;
    onSubmit: (email: string) => Promise<void>;
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const TeacherRequestModal: React.FC<TeacherRequestModalProps> = ({
    opened,
    onClose,
    onSubmit,
}) => {
    const emailId = useId();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (opened) {
            setEmail('');
            setError(null);
            setLoading(false);
        }
    }, [opened]);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        setError(null);

        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError('Please enter an email address');
            return;
        }

        if (!isValidEmail(trimmedEmail)) {
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
            setLoading(false);
        }
    };

    return (
        <NativeDialog
            opened={opened}
            onClose={onClose}
            title="Request Student"
            icon={<IconUserPlus size={20} color="#6366f1" aria-hidden="true" />}
            busy={loading}
        >
            <form onSubmit={handleSubmit} noValidate className="assignment-dialog__field" style={{ gap: '1rem' }}>
                <p className="assignment-dialog__text">
                    Enter the email address of the student you want to request access to. The administrator will need to
                    approve this request.
                </p>

                {error && (
                    <div className="assignment-dialog__alert assignment-dialog__alert--error" role="alert">
                        <IconAlertCircle size={16} className="assignment-dialog__alert-icon" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="assignment-dialog__field">
                    <label htmlFor={emailId} className="assignment-dialog__label">
                        Student Email
                    </label>
                    <input
                        id={emailId}
                        type="email"
                        className="assignment-dialog__input"
                        placeholder="student@example.com"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.currentTarget.value);
                            if (error) setError(null);
                        }}
                        disabled={loading}
                        autoComplete="email"
                        autoFocus
                        required
                    />
                </div>

                <div className="assignment-dialog__footer">
                    <button
                        type="button"
                        className="assignment-dialog__btn assignment-dialog__btn--secondary"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="assignment-dialog__btn assignment-dialog__btn--primary"
                        disabled={!email.trim() || loading}
                    >
                        {loading ? 'Sending...' : 'Send Request'}
                    </button>
                </div>
            </form>
        </NativeDialog>
    );
};

export default TeacherRequestModal;
