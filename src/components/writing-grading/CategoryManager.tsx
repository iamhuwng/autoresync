/**
 * CategoryManager — PRD-0030 Task 5.6
 * Manages annotation categories (4 IELTS defaults + custom).
 * Auto-populates defaults on first load.
 * NO MANTINE.
 */

import { useState, useEffect, useCallback } from 'react';
import { getAnnotationCategories, saveAnnotationCategories } from '../../services/writingAnnotationService';
import type { AnnotationCategory } from '../../types/ielts-writing.types';

const DEFAULT_CATEGORIES: AnnotationCategory[] = [
    { id: 'cat-ta', label: 'Task Achievement', color: '#3b82f6', isDefault: true },
    { id: 'cat-cc', label: 'Coherence & Cohesion', color: '#10b981', isDefault: true },
    { id: 'cat-lr', label: 'Lexical Resource', color: '#f97316', isDefault: true },
    { id: 'cat-gra', label: 'Grammar & Accuracy', color: '#ef4444', isDefault: true },
];

interface CategoryManagerProps {
    teacherId: string;
    categories: AnnotationCategory[];
    onCategoriesChange: (categories: AnnotationCategory[]) => void;
}

export default function CategoryManager({
    teacherId,
    categories,
    onCategoriesChange,
}: CategoryManagerProps) {
    const [newName, setNewName] = useState('');
    const [showAdd, setShowAdd] = useState(false);

    // Auto-populate defaults on mount if empty
    const initCategories = useCallback(async () => {
        const existing = await getAnnotationCategories(teacherId);
        if (existing.length === 0) {
            await saveAnnotationCategories(teacherId, DEFAULT_CATEGORIES);
            onCategoriesChange(DEFAULT_CATEGORIES);
        } else {
            onCategoriesChange(existing);
        }
    }, [teacherId, onCategoriesChange]);

    useEffect(() => {
        initCategories();
    }, [initCategories]);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        const newCat: AnnotationCategory = {
            id: crypto.randomUUID(),
            label: newName.trim(),
            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
            isDefault: false,
        };
        const updated = [...categories, newCat];
        onCategoriesChange(updated);
        await saveAnnotationCategories(teacherId, updated);
        setNewName('');
        setShowAdd(false);
    };

    const handleDelete = async (id: string) => {
        const cat = categories.find(c => c.id === id);
        if (!cat || cat.isDefault) return;
        const updated = categories.filter(c => c.id !== id);
        onCategoriesChange(updated);
        await saveAnnotationCategories(teacherId, updated);
    };

    return (
        <div style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
        }}>
            <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
            }}>
                Annotation Categories
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                {categories.map(cat => (
                    <span
                        key={cat.id}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            border: `1px solid ${cat.color}40`,
                            background: `${cat.color}10`,
                            color: cat.color,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                        }}
                    >
                        {cat.isDefault && '🔒 '}{cat.label}
                        {!cat.isDefault && (
                            <button
                                onClick={() => handleDelete(cat.id)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    padding: 0,
                                    lineHeight: 1,
                                }}
                            >×</button>
                        )}
                    </span>
                ))}

                {showAdd ? (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            placeholder="Name"
                            style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                fontSize: '0.7rem',
                                width: '100px',
                            }}
                            autoFocus
                        />
                        <button
                            onClick={handleAdd}
                            style={{
                                padding: '3px 8px', borderRadius: '6px', border: 'none',
                                background: '#10b981', color: '#fff', fontSize: '0.7rem', cursor: 'pointer',
                            }}
                        >✓</button>
                        <button
                            onClick={() => { setShowAdd(false); setNewName(''); }}
                            style={{
                                padding: '3px 8px', borderRadius: '6px', border: 'none',
                                background: '#ef4444', color: '#fff', fontSize: '0.7rem', cursor: 'pointer',
                            }}
                        >✕</button>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowAdd(true)}
                        style={{
                            padding: '3px 10px', borderRadius: '999px', border: '1px dashed #cbd5e1',
                            background: 'transparent', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer',
                        }}
                    >+ Add</button>
                )}
            </div>
        </div>
    );
}
