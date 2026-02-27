/**
 * Document Upload Section
 * File upload UI for test creation
 * Reuses existing file extraction logic
 */

import React, { useState, useMemo } from 'react';
import { Card, CardBody } from '../modern';
import { Button } from '../modern';

interface DocumentUploadSectionProps {
  onDocumentUploaded: (documentText: string) => void;
  onStartParsing: () => void;
}

export const DocumentUploadSection: React.FC<DocumentUploadSectionProps> = ({
  onDocumentUploaded,
  onStartParsing,
}) => {
  const [documentText, setDocumentText] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const wordCount = useMemo(() => {
    return documentText.trim().split(/\s+/).filter(w => w.length > 0).length;
  }, [documentText]);

  /**
   * Handle file upload
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const { extractTextFromFile, isFileTypeSupported } = await import('../../services/file-extractor/file.extractor');

      if (!isFileTypeSupported(file)) {
        alert('Unsupported file type. Please upload TXT, DOCX, or PDF files.');
        setIsUploading(false);
        return;
      }

      const result = await extractTextFromFile(file);
      if (result.success) {
        setDocumentText(result.data);
        onDocumentUploaded(result.data);
      } else {
        alert(`Failed to extract text: ${result.error}`);
      }
    } catch (error) {
      console.error('File extraction error:', error);
      alert('Failed to extract text from file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Handle text paste
   */
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setDocumentText(text);
    onDocumentUploaded(text);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Instructions */}
      <Card variant="sky">
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'start', gap: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📄</span>
            <div>
              <h3 style={{
                fontSize: '1rem',
                fontWeight: '700',
                color: '#1e293b',
                marginBottom: '0.5rem',
                margin: 0
              }}>
                Upload Test Document
              </h3>
              <p style={{
                fontSize: '0.875rem',
                color: '#475569',
                margin: '0.5rem 0 0 0',
                lineHeight: '1.6'
              }}>
                Upload or paste your test document containing passages and questions. 
                Supported formats: <strong>TXT, DOCX, PDF</strong>
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* File Upload */}
      <Card variant="glass">
        <CardBody>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#1e293b',
              marginBottom: '0.5rem',
              display: 'block'
            }}>
              Upload File
            </label>
            <div style={{
              border: '2px dashed #cbd5e1',
              borderRadius: '0.5rem',
              padding: '2rem',
              textAlign: 'center',
              background: 'rgba(248, 250, 252, 0.5)',
              transition: 'all 0.2s ease',
            }}>
              <input
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={handleFileUpload}
                disabled={isUploading}
                style={{ display: 'none' }}
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                style={{
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  display: 'inline-block',
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem', opacity: isUploading ? 0.5 : 1 }}>
                  📎
                </div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                  {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  TXT, DOCX, or PDF (max 10MB)
                </div>
              </label>
            </div>
          </div>

          {/* OR divider */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem', 
            margin: '1.5rem 0' 
          }}>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
              Or
            </span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          </div>

          {/* Text Paste */}
          <div>
            <label style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#1e293b',
              marginBottom: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>Paste Document Text</span>
              <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>
                {wordCount.toLocaleString()} words
              </span>
            </label>
            <textarea
              value={documentText}
              onChange={handleTextChange}
              placeholder="Paste your test document here..."
              rows={12}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '2px solid #e2e8f0',
                fontSize: '0.875rem',
                color: '#1e293b',
                background: 'white',
                fontFamily: 'monospace',
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />
          </div>
        </CardBody>
      </Card>

      {/* Action Button */}
      {wordCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            onClick={onStartParsing}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              border: 'none',
              fontSize: '0.9375rem',
              fontWeight: 600,
              padding: '0.75rem 2rem',
            }}
          >
            Continue to Parsing →
          </Button>
        </div>
      )}

      {/* Info */}
      {wordCount === 0 && (
        <Card variant="mint">
          <CardBody>
            <div style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>
              <strong>💡 Tip:</strong> For best results, ensure your document includes:
              <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
                <li>Clear passage titles or section headers</li>
                <li>Numbered questions (1, 2, 3...)</li>
                <li>Question types labeled (e.g., "Multiple Choice", "True/False/Not Given")</li>
                <li>Answer key at the end</li>
              </ul>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
};
