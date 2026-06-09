import React, { useRef, useState, useEffect } from 'react';
import { TextInput, Stack, Text, Modal } from '@mantine/core';
import { Button } from './modern';
import r2StorageService from '../services/r2Storage';

/**
 * PassageEditorPanel - Right panel for editing individual passages
 * Matches QuestionEditorPanel design
 * Features rich text editing with resizable content area
 */
const PassageEditorPanel = ({
  passage,
  passageIndex,
  totalPassages,
  onUpdate,
  onClose,
  onPrevious,
  onNext,
  isFirst,
  isLast,
  quizQuestionsLength
}) => {
  const textareaRef = useRef(null);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleChange = (field, value) => {
    const updated = { ...passage, [field]: value };
    onUpdate(updated);
  };

  const insertFormatting = (before, after) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = passage.content.substring(start, end);
    const newText = passage.content.substring(0, start) + before + selectedText + after + passage.content.substring(end);

    handleChange('content', newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleBold = () => {
    insertFormatting('**', '**');
  };

  const handleItalic = () => {
    insertFormatting('*', '*');
  };

  const handleUnderline = () => {
    insertFormatting('<u>', '</u>');
  };

  const handleHeading = () => {
    insertFormatting('### ', '');
  };

  const handleBulletList = () => {
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const lines = passage.content.substring(0, start).split('\n');
    const currentLineStart = passage.content.lastIndexOf('\n', start - 1) + 1;
    insertFormatting('\n- ', '');
  };

  const handleImageUploadClick = () => {
    setShowImageUpload(true);
    setUploadError(null);
  };

  // R2 doesn't need authentication - always ready
  const handleAuthenticate = async () => {
    setIsAuthenticated(true);
    console.log('✅ R2 Storage ready - no sign-in needed');
  };

  const processFile = async (file) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('Image size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const imageData = passage.type === 'image'
        ? await r2StorageService.uploadImageReplacement(file, passage.imageUrl)
        : await r2StorageService.uploadImage(file);
      console.log('✅ Image uploaded to R2:', imageData.url);

      if (passage.type === 'image') {
        // Direct image link for image passages
        handleChange('imageUrl', imageData.url);
      } else {
        // Insert image as Markdown at cursor position (legacy/text behavior)
        const imageMarkdown = `\n![${file.name}](${imageData.url})\n`;
        insertFormatting(imageMarkdown, '');
      }

      // Close modal
      setShowImageUpload(false);
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Failed to upload image. Please try again.');

      if (err.message?.includes('authentication') || err.message?.includes('token')) {
        setIsAuthenticated(false);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      // Reset file input
      e.target.value = '';
    }
  };

  // Enable pasting from clipboard when modal is open and authenticated
  useEffect(() => {
    if (!showImageUpload || !isAuthenticated) return;

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          processFile(file);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showImageUpload, isAuthenticated]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <Text size="lg" fw={700} style={{ color: '#1e293b' }}>
            Editing Passage {passageIndex + 1} of {totalPassages}
          </Text>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              display: 'flex',
              alignItems: 'center',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <Text size="xs" style={{ color: '#64748b' }}>
          Changes are saved automatically
        </Text>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '1.5rem',
        minHeight: 0
      }}>
        <Stack spacing="lg">
          {/* Title */}
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Passage Title *
            </Text>
            <TextInput
              value={passage.title || ''}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Enter passage title..."
              styles={{
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid #cbd5e1',
                  fontSize: '0.9375rem',
                  color: '#1e293b',
                  background: '#ffffff'
                }
              }}
            />
          </div>

          {/* Image Preview & Management */}
          {(passage.type === 'image' || passage.imageUrl) && (
            <div style={{
              padding: '1rem',
              background: '#f8fafc',
              borderRadius: '0.5rem',
              border: '2px dashed #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem'
            }}>
              {passage.imageUrl ? (
                <>
                  <img
                    src={passage.imageUrl}
                    alt="Passage"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '300px',
                      borderRadius: '0.25rem',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={handleImageUploadClick}
                    >
                      Replace Image
                    </Button>
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('Remove this image?')) {
                          handleChange('imageUrl', '');
                          handleChange('type', 'text');
                        }
                      }}
                      style={{ color: '#ef4444', borderColor: '#ef4444' }}
                    >
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <Text size="sm" color="dimmed" mb="sm">No image uploaded yet</Text>
                  <Button onClick={handleImageUploadClick}>Upload Image</Button>
                </div>
              )}
            </div>
          )}

          {/* Content with Rich Text Toolbar */}
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Passage Content *
            </Text>

            {/* Rich Text Toolbar */}
            <div style={{
              display: 'flex',
              gap: '0.25rem',
              padding: '0.5rem',
              background: 'rgba(241, 245, 249, 0.6)',
              borderRadius: '0.5rem 0.5rem 0 0',
              border: '2px solid #cbd5e1',
              borderBottom: '1px solid #e2e8f0',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={handleBold}
                title="Bold (Markdown: **text**)"
                style={{
                  padding: '0.375rem 0.625rem',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: '#1e293b',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
                </svg>
                <span style={{ fontSize: '0.75rem' }}>Bold</span>
              </button>

              <button
                onClick={handleItalic}
                title="Italic (Markdown: *text*)"
                style={{
                  padding: '0.375rem 0.625rem',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontStyle: 'italic',
                  fontWeight: 600,
                  color: '#1e293b',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
                </svg>
                <span style={{ fontSize: '0.75rem' }}>Italic</span>
              </button>

              <button
                onClick={handleUnderline}
                title="Underline (HTML: <u>text</u>)"
                style={{
                  padding: '0.375rem 0.625rem',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  textDecoration: 'underline',
                  fontWeight: 600,
                  color: '#1e293b',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
                </svg>
                <span style={{ fontSize: '0.75rem' }}>Underline</span>
              </button>

              <div style={{ width: '1px', background: '#cbd5e1', margin: '0 0.25rem' }} />

              <button
                onClick={handleHeading}
                title="Heading (Markdown: ### text)"
                style={{
                  padding: '0.375rem 0.625rem',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: '#1e293b',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h8m-8-6h16M4 18h16" />
                </svg>
                <span style={{ fontSize: '0.75rem' }}>Heading</span>
              </button>

              <button
                onClick={handleBulletList}
                title="Bullet List (Markdown: - item)"
                style={{
                  padding: '0.375rem 0.625rem',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#1e293b',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                <span style={{ fontSize: '0.75rem' }}>List</span>
              </button>

              <div style={{ width: '1px', background: '#cbd5e1', margin: '0 0.25rem' }} />

              <button
                onClick={handleImageUploadClick}
                title="Insert Image (Upload to Cloud Storage)"
                style={{
                  padding: '0.375rem 0.625rem',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#1e293b',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={{ fontSize: '0.75rem' }}>Image</span>
              </button>
            </div>

            {/* Resizable Textarea */}
            <textarea
              ref={textareaRef}
              value={passage.content || ''}
              onChange={(e) => handleChange('content', e.target.value)}
              placeholder="Enter passage content..."
              style={{
                width: '100%',
                height: '200px',
                minHeight: '120px',
                maxHeight: '400px',
                padding: '1rem',
                borderRadius: '0 0 0.5rem 0.5rem',
                border: '2px solid #cbd5e1',
                borderTop: 'none',
                fontSize: '0.9375rem',
                color: '#1e293b',
                background: '#ffffff',
                fontFamily: 'Georgia, serif',
                lineHeight: 1.8,
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
            />

            <Text size="xs" style={{ color: '#94a3b8', marginTop: '0.5rem', fontStyle: 'italic' }}>
              💡 Supports Markdown formatting: **bold**, *italic*, ### heading, - list
            </Text>
          </div>

          {/* Question Range */}
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Question Range
            </Text>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Text size="xs" fw={600} mb="xs" style={{ color: '#475569' }}>
                  Start
                </Text>
                <TextInput
                  type="number"
                  min={1}
                  max={quizQuestionsLength}
                  value={passage.questionStart || 1}
                  onChange={(e) => handleChange('questionStart', parseInt(e.target.value) || 1)}
                  styles={{
                    input: {
                      borderRadius: '0.5rem',
                      border: '2px solid #cbd5e1',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      background: '#ffffff'
                    }
                  }}
                />
              </div>
              <Text size="sm" fw={600} style={{ color: '#64748b', marginBottom: '0.5rem' }}>to</Text>
              <div style={{ flex: 1 }}>
                <Text size="xs" fw={600} mb="xs" style={{ color: '#475569' }}>
                  End
                </Text>
                <TextInput
                  type="number"
                  min={passage.questionStart || 1}
                  max={quizQuestionsLength}
                  value={passage.questionEnd || quizQuestionsLength}
                  onChange={(e) => handleChange('questionEnd', parseInt(e.target.value) || quizQuestionsLength)}
                  styles={{
                    input: {
                      borderRadius: '0.5rem',
                      border: '2px solid #cbd5e1',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      background: '#ffffff'
                    }
                  }}
                />
              </div>
            </div>
            <Text size="xs" style={{ color: '#64748b', marginTop: '0.5rem' }}>
              This passage will be associated with questions {passage.questionStart} through {passage.questionEnd}
            </Text>
          </div>
        </Stack>
      </div>

      {/* Footer Navigation */}
      <div style={{
        padding: '1.5rem',
        borderTop: '1px solid rgba(59, 130, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(14, 165, 233, 0.03) 100%)',
        display: 'flex',
        gap: '0.75rem',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <Button
          variant="glass"
          size="sm"
          onClick={onPrevious}
          disabled={isFirst}
          style={{
            opacity: isFirst ? 0.5 : 1,
            cursor: isFirst ? 'not-allowed' : 'pointer'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Previous
        </Button>

        <Button
          variant="glass"
          size="sm"
          onClick={onNext}
          disabled={isLast}
          style={{
            opacity: isLast ? 0.5 : 1,
            cursor: isLast ? 'not-allowed' : 'pointer'
          }}
        >
          Next
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '0.5rem' }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Button>
      </div>

      {/* Image Upload Modal */}
      <Modal
        opened={showImageUpload}
        onClose={() => {
          setShowImageUpload(false);
          setIsAuthenticated(false);
          setUploadError(null);
        }}
        title="Insert Image"
        size="md"
        centered
      >
        <Stack spacing="md">
          {/* Step 1: Authentication */}
          {!isAuthenticated && (
            <>
              <Text size="sm" style={{ color: '#64748b' }}>
                <strong>Step 1:</strong> Click to enable cloud upload
              </Text>
              <Button
                onClick={handleAuthenticate}
                loading={isAuthenticating}
                fullWidth
                variant="filled"
                style={{
                  background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                  color: 'white'
                }}
              >
                {isAuthenticating ? 'Connecting...' : '☁️ Enable Cloud Upload'}
              </Button>
            </>
          )}

          {/* Step 2: File Selection */}
          {isAuthenticated && (
            <>
              <Text size="sm" style={{ color: '#10b981', fontWeight: 600 }}>
                ✅ Authenticated! Now select your image file.
              </Text>
              <Text size="sm" style={{ color: '#64748b' }}>
                <strong>Step 2:</strong> Choose an image file to upload
              </Text>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageUpload}
                disabled={isUploading}
                style={{
                  padding: '0.75rem',
                  border: '2px dashed #cbd5e1',
                  borderRadius: '0.5rem',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              />
              {isUploading && (
                <Text size="sm" style={{ color: '#3b82f6', fontWeight: 600 }}>
                  ⛳ Uploading image to R2...
                </Text>
              )}
            </>
          )}

          {/* Error Display */}
          {uploadError && (
            <div style={{
              padding: '1rem',
              background: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '0.5rem',
              color: '#dc2626'
            }}>
              <Text size="sm" fw={600} style={{ marginBottom: '0.25rem' }}>
                ❌ Upload Error
              </Text>
              <Text size="xs">{uploadError}</Text>
            </div>
          )}

          {/* Instructions */}
          {!isAuthenticated && !uploadError && (
            <div style={{
              padding: '1rem',
              background: '#eff6ff',
              border: '1px solid #3b82f6',
              borderRadius: '0.5rem'
            }}>
              <Text size="xs" style={{ color: '#1e40af' }}>
                <strong>📝 Note:</strong> Images will be uploaded to cloud storage (Cloudflare R2) and made publicly accessible.
                <br /><br />
                Supported formats: JPEG, PNG, GIF, WebP (max 10MB)
              </Text>
            </div>
          )}
        </Stack>
      </Modal>
    </div>
  );
};

export default PassageEditorPanel;
