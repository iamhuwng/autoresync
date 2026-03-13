import { useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { saveHomeworkTagsConfig, useHomeworkTags } from '../../hooks/useHomeworkTags';
import { Card, Button } from '../modern';

function normalizeTagId(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function AdminTagManager() {
    const { user } = useAuth();
    const { tags, loading } = useHomeworkTags();
    const [tagIdInput, setTagIdInput] = useState('');
    const [tagLabelInput, setTagLabelInput] = useState('');
    const [tagColorInput, setTagColorInput] = useState('#6366f1');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const sortedTags = useMemo(
        () => [...tags].sort((left, right) => left.label.localeCompare(right.label, 'vi', { sensitivity: 'base' })),
        [tags]
    );

    const handleAddTag = async () => {
        const normalizedId = normalizeTagId(tagIdInput || tagLabelInput);
        const nextLabel = tagLabelInput.trim();

        if (!user?.uid) {
            setError('You must be signed in to manage tags.');
            return;
        }

        if (!normalizedId) {
            setError('Tag id is required.');
            return;
        }

        if (!nextLabel) {
            setError('Tag label is required.');
            return;
        }

        if (tags.some((tag) => tag.id === normalizedId)) {
            setError(`Tag id "${normalizedId}" already exists.`);
            return;
        }

        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await saveHomeworkTagsConfig(
                [...tags, { id: normalizedId, label: nextLabel, color: tagColorInput }],
                user.uid
            );
            setTagIdInput('');
            setTagLabelInput('');
            setTagColorInput('#6366f1');
            setSuccessMessage(`Added tag "${nextLabel}".`);
        } catch (saveError) {
            console.error('[AdminTagManager] Failed to add tag:', saveError);
            setError('Failed to add tag.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTag = async (tagId: string) => {
        if (!user?.uid) {
            setError('You must be signed in to manage tags.');
            return;
        }

        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await saveHomeworkTagsConfig(tags.filter((tag) => tag.id !== tagId), user.uid);
            setSuccessMessage(`Deleted tag "${tagId}".`);
        } catch (deleteError) {
            console.error('[AdminTagManager] Failed to delete tag:', deleteError);
            setError('Failed to delete tag.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card variant="glass" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gap: '1.25rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                        Homework Tags
                    </h2>
                    <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        Manage the shared tag definitions used across teacher homework filters and assignment forms.
                    </p>
                </div>

                {error ? (
                    <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                        {error}
                    </div>
                ) : null}

                {successMessage ? (
                    <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                        {successMessage}
                    </div>
                ) : null}

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>Current tags</div>
                    {loading ? (
                        <div style={{ color: '#64748b' }}>Loading tags...</div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                            {sortedTags.map((tag) => (
                                <div
                                    key={tag.id}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        borderRadius: '999px',
                                        padding: '0.45rem 0.8rem',
                                        background: `${tag.color ?? '#64748b'}14`,
                                        border: `1px solid ${(tag.color ?? '#64748b')}33`,
                                        color: tag.color ?? '#334155',
                                    }}
                                >
                                    <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{tag.label}</span>
                                    <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>{tag.id}</span>
                                    <button
                                        type="button"
                                        aria-label={`Delete tag ${tag.label}`}
                                        onClick={() => void handleDeleteTag(tag.id)}
                                        disabled={saving}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: 'inherit',
                                            cursor: saving ? 'not-allowed' : 'pointer',
                                            fontWeight: 700,
                                            fontSize: '0.9rem',
                                            padding: 0,
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: 'grid', gap: '0.9rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>Add tag</div>
                    <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600, fontSize: '0.85rem' }}>
                            Tag id
                            <input
                                type="text"
                                value={tagIdInput}
                                onChange={(event) => setTagIdInput(event.target.value)}
                                placeholder="practice-set-2"
                                aria-label="New tag id"
                                style={{ borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.65rem 0.8rem' }}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600, fontSize: '0.85rem' }}>
                            Label
                            <input
                                type="text"
                                value={tagLabelInput}
                                onChange={(event) => setTagLabelInput(event.target.value)}
                                placeholder="Luyện tập nâng cao"
                                aria-label="New tag label"
                                style={{ borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.65rem 0.8rem' }}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600, fontSize: '0.85rem' }}>
                            Color
                            <input
                                type="color"
                                value={tagColorInput}
                                onChange={(event) => setTagColorInput(event.target.value)}
                                aria-label="New tag color"
                                style={{ width: '100%', minHeight: '42px', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.35rem' }}
                            />
                        </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="primary" onClick={() => void handleAddTag()} disabled={saving || loading}>
                            Add Tag
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}

export default AdminTagManager;
