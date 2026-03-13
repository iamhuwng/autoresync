import { useEffect, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Textarea } from '../modern';

interface TemplateSaveModalProps {
    isOpen: boolean;
    submitting?: boolean;
    error?: string | null;
    existingTemplateNames?: string[];
    onClose: () => void;
    onSubmit: (values: { name: string; description: string }) => void;
}

export function TemplateSaveModal({
    isOpen,
    submitting = false,
    error = null,
    existingTemplateNames = [],
    onClose,
    onSubmit,
}: TemplateSaveModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setName('');
        setDescription('');
        setLocalError(null);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !submitting) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose, submitting]);

    if (!isOpen) {
        return null;
    }

    const activeError = localError || error;

    const handleSubmit = () => {
        const trimmedName = name.trim();
        const trimmedDescription = description.trim();

        if (!trimmedName) {
            setLocalError('Template name is required.');
            return;
        }

        const normalizedName = trimmedName.toLocaleLowerCase();
        const duplicate = existingTemplateNames.some(
            (existingName) => existingName.trim().toLocaleLowerCase() === normalizedName
        );
        if (duplicate) {
            setLocalError('A template with this name already exists.');
            return;
        }

        setLocalError(null);
        onSubmit({
            name: trimmedName,
            description: trimmedDescription,
        });
    };

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Save homework template"
            onClick={(event) => {
                if (event.target === event.currentTarget && !submitting) {
                    onClose();
                }
            }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2100,
                background: 'rgba(15, 23, 42, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                backdropFilter: 'blur(6px)',
            }}
        >
            <div
                style={{
                    width: 'min(560px, 100%)',
                    borderRadius: '1.25rem',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))',
                    border: '1px solid rgba(226,232,240,0.95)',
                    boxShadow: '0 24px 60px rgba(15,23,42,0.24)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1.15rem 1.25rem',
                        borderBottom: '1px solid rgba(226,232,240,0.9)',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                            Save Homework Template
                        </div>
                        <div style={{ marginTop: '0.15rem', fontSize: '0.88rem', color: '#64748b' }}>
                            Save the current homework configuration for reuse.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#64748b',
                            fontSize: '1.45rem',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: 'grid', gap: '1rem', padding: '1.25rem' }}>
                    {activeError ? (
                        <div
                            style={{
                                borderRadius: '1rem',
                                padding: '0.9rem 1rem',
                                background: 'rgba(254,226,226,0.85)',
                                border: '1px solid rgba(239,68,68,0.18)',
                                color: '#b91c1c',
                            }}
                        >
                            {activeError}
                        </div>
                    ) : null}

                    <Input
                        label="Template Name"
                        error={localError?.includes('already exists') || localError?.includes('required') ? localError : undefined}
                        value={name}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            setName(event.target.value);
                            if (localError) {
                                setLocalError(null);
                            }
                        }}
                        placeholder="For example: Midterm practice template"
                        fullWidth
                    />

                    <Textarea
                        label="Description (optional)"
                        value={description}
                        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
                        placeholder="Add notes about when to reuse this template..."
                        rows={4}
                        fullWidth
                    />
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                        padding: '0 1.25rem 1.25rem',
                    }}
                >
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        loading={submitting}
                        disabled={submitting}
                    >
                        Save Template
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default TemplateSaveModal;
