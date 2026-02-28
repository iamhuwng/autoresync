/**
 * FeedbackPanel — PRD-0030 Task 5.5
 * TipTap rich text editors for per-criterion + overall feedback.
 * NO MANTINE.
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface FeedbackSectionProps {
    label: string;
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
}

function FeedbackSection({ label, value, onChange, placeholder }: FeedbackSectionProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({ placeholder: placeholder || `${label} feedback...` }),
        ],
        content: value,
        onUpdate: ({ editor: ed }) => {
            onChange(ed.getHTML());
        },
    });

    return (
        <div style={{ marginBottom: '0.75rem' }}>
            <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
            }}>
                {label}
            </div>
            <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
            }}>
                {editor && (
                    <div style={{
                        display: 'flex',
                        gap: '2px',
                        padding: '4px 8px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                    }}>
                        <button
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                background: editor.isActive('bold') ? '#e2e8f0' : 'transparent',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                            }}
                        >B</button>
                        <button
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                background: editor.isActive('italic') ? '#e2e8f0' : 'transparent',
                                cursor: 'pointer',
                                fontStyle: 'italic',
                                fontSize: '0.8rem',
                            }}
                        >I</button>
                        <button
                            onClick={() => editor.chain().focus().toggleBulletList().run()}
                            style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                background: editor.isActive('bulletList') ? '#e2e8f0' : 'transparent',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                            }}
                        >• List</button>
                    </div>
                )}
                <EditorContent
                    editor={editor}
                    style={{
                        padding: '8px 12px',
                        minHeight: '80px',
                        fontSize: '0.85rem',
                        lineHeight: 1.6,
                    }}
                />
            </div>
        </div>
    );
}

interface FeedbackPanelProps {
    taskNumber: 1 | 2;
    feedback: {
        ta: string;
        cc: string;
        lr: string;
        gra: string;
        overall: string;
    };
    onChange: (feedback: FeedbackPanelProps['feedback']) => void;
}

export default function FeedbackPanel({ taskNumber, feedback, onChange }: FeedbackPanelProps) {
    const handleChange = (key: keyof typeof feedback, html: string) => {
        onChange({ ...feedback, [key]: html });
    };

    return (
        <div style={{
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: '#fff',
        }}>
            <div style={{
                fontWeight: 600,
                fontSize: '0.95rem',
                color: '#0f172a',
                marginBottom: '0.75rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid #f1f5f9',
            }}>
                Task {taskNumber} Feedback
            </div>

            <FeedbackSection
                label={taskNumber === 1 ? 'Task Achievement' : 'Task Response'}
                value={feedback.ta}
                onChange={(html) => handleChange('ta', html)}
            />
            <FeedbackSection
                label="Coherence & Cohesion"
                value={feedback.cc}
                onChange={(html) => handleChange('cc', html)}
            />
            <FeedbackSection
                label="Lexical Resource"
                value={feedback.lr}
                onChange={(html) => handleChange('lr', html)}
            />
            <FeedbackSection
                label="Grammatical Range"
                value={feedback.gra}
                onChange={(html) => handleChange('gra', html)}
            />
            <FeedbackSection
                label="Overall Comments"
                value={feedback.overall}
                onChange={(html) => handleChange('overall', html)}
                placeholder="Overall feedback for this task..."
            />
        </div>
    );
}
