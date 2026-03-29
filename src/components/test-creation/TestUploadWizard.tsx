/**
 * TestUploadWizard Component
 * 
 * Entry point for creating IELTS Reading tests.
 * Premium design with glassmorphism, animations, and visual depth.
 * 
 * @module TestUploadWizard
 * @version 2.0.0 - Premium Redesign
 * @date 2026-02-07
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IconUpload, IconClipboardText, IconFileText, IconX } from '@tabler/icons-react';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type UploadMode = 'file' | 'paste';

export interface TestUploadWizardProps {
    onChange?: (content: { type: 'file' | 'text'; data: File | string | null; format: 'academic' | 'general' }) => void;
    defaultFormat?: 'academic' | 'general';
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.markdown'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const TestUploadWizard: React.FC<TestUploadWizardProps> = ({
    onChange,
    defaultFormat = 'academic',
}) => {
    const [mode, setMode] = useState<UploadMode>('file');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [pasteText, setPasteText] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        if (mode === 'file') {
            onChangeRef.current?.({ type: 'file', data: selectedFile, format: defaultFormat });
            return;
        }

        const text = pasteText.trim();
        onChangeRef.current?.({ type: 'text', data: text.length > 50 ? text : null, format: defaultFormat });
    }, [mode, selectedFile, pasteText, defaultFormat]);

    // ─────────────────────────────────────────────────────────────
    // FILE HANDLING
    // ─────────────────────────────────────────────────────────────

    const validateFile = useCallback((file: File): string | null => {
        const extension = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(extension)) {
            return `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return `File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB`;
        }
        return null;
    }, []);

    const handleFileSelect = useCallback((file: File) => {
        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            setSelectedFile(null);
            return;
        }
        setError(null);
        setSelectedFile(file);
    }, [validateFile]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    }, [handleFileSelect]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    }, [handleFileSelect]); const handleRemoveFile = useCallback(() => {
        setSelectedFile(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    return (
        <div style={{
            maxWidth: '720px',
            margin: '0 auto',
            padding: '0 1rem',
            animation: 'wizardFadeIn 0.6s ease-out',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            position: 'relative',
        }}>
            {/* Floating Decorative Elements */}
            <div style={{
                position: 'absolute',
                top: '-20px',
                right: '-30px',
                width: '120px',
                height: '120px',
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
                borderRadius: '50%',
                animation: 'floatBubble 6s ease-in-out infinite',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute',
                bottom: '40px',
                left: '-40px',
                width: '100px',
                height: '100px',
                background: 'radial-gradient(circle, rgba(14, 165, 233, 0.12) 0%, transparent 70%)',
                borderRadius: '50%',
                animation: 'floatBubble 8s ease-in-out infinite reverse',
                pointerEvents: 'none',
            }} />

            {/* Main Content Area (blends with modal) */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                position: 'relative',
            }}>
                {/* Content Area */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '0.875rem 1.25rem',
                    minHeight: 0,
                    gap: '0.75rem',
                }}>
                    {/* Input Method Selection - Format is already set in MetadataStep */}
                    <div>
                        <label style={{
                            display: 'block',
                            fontWeight: '700',
                            fontSize: '0.625rem',
                            color: '#94a3b8',
                            marginBottom: '0.375rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                        }}>
                            Input Method
                        </label>
                        <div style={{
                            display: 'flex',
                            background: 'rgba(241, 245, 249, 0.8)',
                            borderRadius: '10px',
                            padding: '3px',
                            position: 'relative',
                            maxWidth: '240px',
                        }}>
                            {/* Animated Background Slider */}
                            <div style={{
                                position: 'absolute',
                                top: '4px',
                                left: mode === 'file' ? '4px' : 'calc(50% + 2px)',
                                width: 'calc(50% - 6px)',
                                height: 'calc(100% - 6px)',
                                background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                                borderRadius: '7px',
                                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                            }} />

                            <button
                                onClick={() => setMode('file')}
                                style={{
                                    flex: 1,
                                    padding: '0.375rem 0.625rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: mode === 'file' ? 'white' : '#64748b',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    transition: 'color 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.375rem',
                                    position: 'relative',
                                    zIndex: 1,
                                }}
                            >
                                <IconUpload size={15} />
                                Upload
                            </button>
                            <button
                                onClick={() => setMode('paste')}
                                style={{
                                    flex: 1,
                                    padding: '0.375rem 0.625rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: mode === 'paste' ? 'white' : '#64748b',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    transition: 'color 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.375rem',
                                    position: 'relative',
                                    zIndex: 1,
                                }}
                            >
                                <IconClipboardText size={15} />
                                Paste
                            </button>
                        </div>
                    </div>

                    {/* Upload / Paste Content Area */}
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        {mode === 'file' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                {/* Premium Drop Zone */}
                                <div
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            fileInputRef.current?.click();
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={selectedFile ? `Selected: ${selectedFile.name}` : 'Drop file or click to upload'}
                                    style={{
                                        flex: 1,
                                        minHeight: '90px',
                                        maxHeight: '110px',
                                        borderRadius: '14px',
                                        padding: '1rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        background: dragActive
                                            ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)'
                                            : selectedFile
                                                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.06) 0%, rgba(16, 185, 129, 0.06) 100%)'
                                                : 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.6) 100%)',
                                        border: `2px dashed ${dragActive ? '#8b5cf6'
                                            : error ? '#ef4444'
                                                : selectedFile ? '#22c55e'
                                                    : 'rgba(203, 213, 225, 0.6)'
                                            }`,
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {/* Animated background pattern */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: `
                                            radial-gradient(circle at 20% 80%, rgba(139, 92, 246, 0.03) 0%, transparent 50%),
                                            radial-gradient(circle at 80% 20%, rgba(14, 165, 233, 0.03) 0%, transparent 50%)
                                        `,
                                        pointerEvents: 'none',
                                    }} />

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={SUPPORTED_EXTENSIONS.join(',')}
                                        onChange={handleInputChange}
                                        style={{ display: 'none' }}
                                    />

                                    {selectedFile ? (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            animation: 'fileAppear 0.4s ease-out',
                                        }}>
                                            <div style={{
                                                width: '44px',
                                                height: '44px',
                                                borderRadius: '12px',
                                                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)',
                                                flexShrink: 0,
                                            }}>
                                                <IconFileText size={22} color="white" />
                                            </div>
                                            <div style={{ textAlign: 'left' }}>
                                                <p style={{
                                                    fontWeight: '700',
                                                    color: '#1e293b',
                                                    margin: 0,
                                                    fontSize: '0.875rem',
                                                }}>
                                                    {selectedFile.name}
                                                </p>
                                                <p style={{
                                                    fontSize: '0.75rem',
                                                    color: '#64748b',
                                                    margin: '0.125rem 0 0',
                                                }}>
                                                    {(selectedFile.size / 1024).toFixed(1)} KB • Ready to parse
                                                </p>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
                                                style={{
                                                    padding: '0.5rem',
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    transition: 'all 0.2s ease',
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                                                aria-label="Remove file"
                                            >
                                                <IconX size={18} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{
                                                width: '52px',
                                                height: '52px',
                                                borderRadius: '14px',
                                                background: dragActive
                                                    ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                                                    : 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginBottom: '0.625rem',
                                                boxShadow: dragActive
                                                    ? '0 6px 20px rgba(139, 92, 246, 0.35)'
                                                    : '0 3px 10px rgba(99, 102, 241, 0.15)',
                                                transition: 'all 0.3s ease',
                                                animation: dragActive ? 'dropPulse 1s ease-in-out infinite' : 'none',
                                            }}>
                                                <IconUpload
                                                    size={24}
                                                    color={dragActive ? 'white' : '#6366f1'}
                                                    style={{ transition: 'all 0.3s ease' }}
                                                />
                                            </div>
                                            <p style={{
                                                fontWeight: '700',
                                                color: dragActive ? '#8b5cf6' : '#1e293b',
                                                margin: 0,
                                                fontSize: '0.875rem',
                                                transition: 'color 0.2s ease',
                                            }}>
                                                {dragActive ? 'Release to upload' : 'Drop your file here'}
                                            </p>
                                            <p style={{
                                                fontSize: '0.75rem',
                                                color: '#94a3b8',
                                                margin: '0.25rem 0 0',
                                            }}>
                                                or <span style={{ color: '#8b5cf6', fontWeight: 600 }}>browse</span> • PDF, DOCX, TXT, MD
                                            </p>
                                        </>
                                    )}
                                </div>

                                {error && (
                                    <div style={{
                                        marginTop: '0.75rem',
                                        padding: '0.75rem 1rem',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        borderRadius: '10px',
                                        color: '#dc2626',
                                        fontSize: '0.8125rem',
                                        fontWeight: '600',
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                    }}>
                                        ⚠️ {error}
                                    </div>
                                )}
                            </div>
                        )}

                        {mode === 'paste' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <div style={{
                                    flex: 1,
                                    position: 'relative',
                                    borderRadius: '14px',
                                    overflow: 'hidden',
                                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
                                }}>
                                    <textarea
                                        value={pasteText}
                                        onChange={(e) => setPasteText(e.target.value)}
                                        placeholder="Paste your IELTS Reading test content here...

Include the reading passage, all questions (numbered), and answer key if available. Our AI will automatically detect question types and structure."
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            minHeight: '140px',
                                            maxHeight: '180px',
                                            padding: '1rem',
                                            borderRadius: '14px',
                                            border: '2px solid rgba(226, 232, 240, 0.8)',
                                            fontSize: '0.875rem',
                                            lineHeight: '1.6',
                                            resize: 'none',
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            transition: 'all 0.2s ease',
                                            background: 'rgba(255, 255, 255, 0.6)',
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#8b5cf6';
                                            e.target.style.boxShadow = '0 0 0 4px rgba(139, 92, 246, 0.1)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'rgba(226, 232, 240, 0.8)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                                <div style={{
                                    marginTop: '0.625rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: '#94a3b8',
                                        fontWeight: 500,
                                    }}>
                                        {pasteText.length.toLocaleString()} characters
                                    </span>
                                    {pasteText.length > 0 && pasteText.length < 50 && (
                                        <span style={{
                                            fontSize: '0.75rem',
                                            color: '#f59e0b',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                        }}>
                                            ⚡ Need at least 50 characters
                                        </span>
                                    )}
                                    {pasteText.length >= 50 && (
                                        <span style={{
                                            fontSize: '0.75rem',
                                            color: '#22c55e',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                        }}>
                                            ✓ Ready to parse
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Premium Animations */}
            <style>{`
                @keyframes wizardFadeIn {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes gradientShift {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
                @keyframes floatBubble {
                    0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
                    50% { transform: translateY(-12px) scale(1.05); opacity: 0.8; }
                }
                @keyframes iconPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.03); }
                }
                @keyframes sparkle {
                    0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
                    50% { transform: scale(1.2) rotate(15deg); opacity: 0.8; }
                }
                @keyframes statusPulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(0.9); }
                }
                @keyframes dropPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes fileAppear {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default TestUploadWizard;
