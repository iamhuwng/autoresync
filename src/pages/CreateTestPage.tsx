
/**
 * Create Test Page
 * Page for creating IELTS/TOEFL/Custom tests with metadata inputs
 */

import React from 'react';
import { AppShell } from '@mantine/core';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';

import { TestReviewEditor } from '../components/test/TestReviewEditor';

// Custom Hooks
import { useCreateTestForm } from '../hooks/test/useCreateTestForm';
import { useTestDocumentParser } from '../hooks/test/useTestDocumentParser';
import { useTestSaver } from '../hooks/test/useTestSaver';
const CreateTestPage: React.FC = () => {
  // Initialize Hooks
  const form = useCreateTestForm();
  const parser = useTestDocumentParser(form.metadata);
  const saver = useTestSaver();

  const stepInfo = form.getStepInfo();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
      backgroundAttachment: 'fixed'
    }}>
      <AppShell header={{ height: 70 }} padding="md">
        <AppShell.Header style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(203, 213, 225, 0.3)'
        }}>
          <div style={{
            height: '100%',
            padding: '0 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                onClick={form.handleBack}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  color: '#64748b',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                ←
              </button>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                color: '#1e293b',
                margin: 0
              }}>
                Create New Test
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>
                Step {stepInfo?.step || 1} of 4: {stepInfo?.title || 'Test Information'}
              </span>
            </div>
          </div>
        </AppShell.Header>

        <AppShell.Main>
          <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
            {form.currentStep === 'metadata' && (
              <>
                {/* Page Header */}
                <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                  <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '800',
                    marginBottom: '0.5rem',
                    color: '#1e293b'
                  }}>
                    Test Information
                  </h1>
                </div>

                {/* Test Metadata Form */}
                <Card variant="glass" style={{ marginBottom: '2rem' }}>
                  <CardBody>
                    {/* Title */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: '0.5rem'
                      }}>
                        Test Title *
                      </label>
                      <input
                        type="text"
                        value={form.metadata.title}
                        onChange={(e) => form.updateMetadata({ title: e.target.value })}
                        placeholder="e.g., IELTS Reading Practice Test 1"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          border: form.errors.title ? '2px solid #ef4444' : '2px solid #e2e8f0',
                          fontSize: '0.9375rem',
                          color: '#1e293b',
                          background: 'white',
                        }}
                        required
                      />
                      {form.errors.title && (
                        <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                          {form.errors.title}
                        </div>
                      )}
                    </div>

                    {/* Test Type and Skill (Side by Side) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                      {/* Test Type */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#1e293b',
                          marginBottom: '0.5rem'
                        }}>
                          Test Type *
                        </label>
                        <select
                          value={form.metadata.type}
                          onChange={(e) => form.handleTypeChange(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: '2px solid #e2e8f0',
                            fontSize: '0.9375rem',
                            color: '#1e293b',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="IELTS">IELTS</option>
                          <option value="TOEFL">TOEFL</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>

                      {/* Skill */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#1e293b',
                          marginBottom: '0.5rem'
                        }}>
                          Skill *
                        </label>
                        <select
                          value={form.metadata.skill}
                          onChange={(e) => form.handleSkillChange(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: '2px solid #e2e8f0',
                            fontSize: '0.9375rem',
                            color: '#1e293b',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="Reading">Reading</option>
                          <option value="Listening">Listening</option>
                          <option value="Writing">Writing</option>
                          <option value="Speaking">Speaking</option>
                        </select>
                      </div>
                    </div>

                    {/* Duration and Difficulty (Side by Side) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                      {/* Duration */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#1e293b',
                          marginBottom: '0.5rem'
                        }}>
                          Duration (minutes) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={form.metadata.duration}
                          onChange={(e) => form.updateMetadata({ duration: parseInt(e.target.value) || 0 })}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: form.errors.duration ? '2px solid #ef4444' : '2px solid #e2e8f0',
                            fontSize: '0.9375rem',
                            color: '#1e293b',
                            background: 'white',
                          }}
                        />
                        {form.errors.duration && (
                          <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {form.errors.duration}
                          </div>
                        )}
                      </div>

                      {/* Difficulty */}
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#1e293b',
                          marginBottom: '0.5rem'
                        }}>
                          Difficulty
                        </label>
                        <select
                          value={form.metadata.difficulty}
                          onChange={(e) => form.updateMetadata({ difficulty: e.target.value as any })}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: '2px solid #e2e8f0',
                            fontSize: '0.9375rem',
                            color: '#1e293b',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="Beginner">Beginner</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Advanced">Advanced</option>
                        </select>
                      </div>
                    </div>

                    {/* Description */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: '0.5rem'
                      }}>
                        Description (Optional)
                      </label>
                      <textarea
                        value={form.metadata.description}
                        onChange={(e) => form.updateMetadata({ description: e.target.value })}
                        placeholder="Brief description of the test..."
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          border: '2px solid #e2e8f0',
                          fontSize: '0.9375rem',
                          color: '#1e293b',
                          background: 'white',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    {/* IELTS-specific fields */}
                    {form.metadata.type === 'IELTS' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#1e293b',
                            marginBottom: '0.5rem'
                          }}>
                            Target Band (Optional)
                          </label>
                          <input
                            type="text"
                            value={form.metadata.targetBand}
                            onChange={(e) => form.updateMetadata({ targetBand: e.target.value })}
                            placeholder="e.g., 7.0"
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              borderRadius: '0.5rem',
                              border: '2px solid #e2e8f0',
                              fontSize: '0.9375rem',
                              color: '#1e293b',
                              background: 'white',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#1e293b',
                            marginBottom: '0.5rem'
                          }}>
                            Estimated Score Range (Optional)
                          </label>
                          <input
                            type="text"
                            value={form.metadata.estimatedScore}
                            onChange={(e) => form.updateMetadata({ estimatedScore: e.target.value })}
                            placeholder="e.g., 6.5-7.5"
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              borderRadius: '0.5rem',
                              border: '2px solid #e2e8f0',
                              fontSize: '0.9375rem',
                              color: '#1e293b',
                              background: 'white',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    variant="glass"
                    onClick={form.handleBack}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={form.handleContinue}
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      border: 'none',
                    }}
                  >
                    Next Step →
                  </Button>
                </div>
              </>
            )}

            {form.currentStep === 'upload' && (
              <>
                <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                  <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>
                    Upload Test Document
                  </h1>
                  <p style={{ fontSize: '1rem', color: '#64748b' }}>
                    Upload your test document containing passages and questions.
                  </p>
                </div>

                <Card variant="glass" style={{ marginBottom: '2rem' }}>
                  <CardBody>
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                      <input
                        type="file"
                        accept=".txt,.docx,.pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            form.goToStep('parsing');
                            const success = await parser.handleFileUpload(file);
                            if (success) {
                              form.goToStep('review');
                            } else {
                              // If parsing failed (and not canceled), go back to upload
                              // Note: handleFileUpload alerts on failure
                              form.goToStep('upload');
                            }
                          }
                        }}
                        style={{ display: 'none' }}
                        id="file-upload"
                      />
                      <label htmlFor="file-upload">
                        <Button
                          variant="primary"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById('file-upload')?.click();
                          }}
                        >
                          📁 Choose File
                        </Button>
                      </label>
                      <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
                        Supported formats: TXT, DOCX, PDF
                      </p>
                    </div>
                  </CardBody>
                </Card>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Button variant="glass" onClick={form.handleBack}>← Back</Button>
                </div>
              </>
            )}

            {form.currentStep === 'parsing' && (
              <>
                <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                  <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>
                    Processing Document
                  </h1>
                  <p style={{ fontSize: '1rem', color: '#64748b' }}>
                    {parser.parsingStage || 'Analyzing your document...'}
                  </p>
                </div>

                <Card variant="lavender" style={{ marginBottom: '2rem' }}>
                  <CardBody>
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚙️</div>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{
                          width: '100%',
                          height: '8px',
                          background: 'rgba(203, 213, 225, 0.3)',
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${parser.parsingProgress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>
                      <p style={{ fontSize: '1rem', color: '#64748b' }}>
                        {parser.parsingProgress}% complete
                      </p>
                      <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '1rem' }}>
                        {parser.isParsing ? 'This may take a moment...' : 'Processing complete!'}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              </>
            )}

            {form.currentStep === 'review' && (
              <TestReviewEditor
                passages={parser.parsedPassages}
                questions={parser.parsedQuestions}
                metadata={form.metadata}
                onPassagesChange={(passages) => parser.updateParsedContent(passages, parser.parsedQuestions)}
                onQuestionsChange={(questions) => parser.updateParsedContent(parser.parsedPassages, questions)}
                onSave={() => saver.saveTest(form.metadata, parser.parsedPassages, parser.parsedQuestions)}
                onBack={form.handleBack}
              />
            )}
          </div>
        </AppShell.Main>
      </AppShell>

    </div>
  );
};

export default CreateTestPage;
