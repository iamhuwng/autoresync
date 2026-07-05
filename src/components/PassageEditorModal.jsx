import React, { useState, useEffect } from 'react';
import { TextInput, Textarea, Stack, Text } from '@mantine/core';
import { Button, Card, CardBody } from './modern';

/**
 * PassageEditorModal - Edit passages
 * 
 * Features:
 * - Add/edit/delete passages
 * - Each passage has title and content
 * - Question range binding
 * - Inline editing
 */
const PassageEditorModal = ({ quiz, passages, onSave, onClose, show }) => {
  const [localPassages, setLocalPassages] = useState([]);
  const [selectedPassageIndex, setSelectedPassageIndex] = useState(null);

  useEffect(() => {
    if (show && passages) {
      // If passages exist on questions, extract them
      if (!passages || passages.length === 0) {
        // Extract passages from questions
        const passagesMap = {};
        quiz?.questions?.forEach((q) => {
          if (q.passage && q.passage.id) {
            if (!passagesMap[q.passage.id]) {
              passagesMap[q.passage.id] = {
                id: q.passage.id,
                title: q.passage.title || '',
                content: q.passage.content || '',
                questionStart: q.passage.questionStart || 1,
                questionEnd: q.passage.questionEnd || quiz.questions.length
              };
            }
          }
        });
        const extractedPassages = Object.values(passagesMap);
        setLocalPassages(extractedPassages.length > 0 ? extractedPassages : []);
      } else {
        setLocalPassages(passages);
      }
    }
  }, [show, passages, quiz]);

  const handlePassageChange = (index, field, value) => {
    const updated = [...localPassages];
    updated[index] = { ...updated[index], [field]: value };
    setLocalPassages(updated);
  };

  const handleAddPassage = () => {
    const newPassage = {
      id: `passage_${Date.now()}`,
      title: '',
      content: '',
      questionStart: 1,
      questionEnd: quiz.questions.length
    };
    setLocalPassages([...localPassages, newPassage]);
    setSelectedPassageIndex(localPassages.length); // Auto-select new passage
  };

  const handleDeletePassage = (index) => {
    if (window.confirm('Are you sure you want to delete this passage? Questions will lose their passage reference.')) {
      const updated = localPassages.filter((_, i) => i !== index);
      setLocalPassages(updated);
      if (selectedPassageIndex === index) {
        setSelectedPassageIndex(null);
      } else if (selectedPassageIndex > index) {
        setSelectedPassageIndex(selectedPassageIndex - 1);
      }
    }
  };

  const handleSave = () => {
    onSave(localPassages);
  };

  if (!show) return null;

  const selectedPassage = selectedPassageIndex !== null ? localPassages[selectedPassageIndex] : null;

  return (
    <div style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
      {/* Left Panel - Passage List */}
      <Card 
        variant="glass" 
        hover={false}
        style={{ 
          width: selectedPassage ? '300px' : '450px',
          maxHeight: '80vh', 
          display: 'flex', 
          flexDirection: 'column',
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 245, 255, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          boxShadow: '0 8px 32px rgba(139, 92, 246, 0.15)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <Text size="lg" fw={700} style={{ color: '#1e293b', flex: 1 }}>
              Manage Passages
            </Text>
          </div>
          
          <Button
            variant="primary"
            size="sm"
            onClick={handleAddPassage}
            style={{ width: '100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Passage
          </Button>
        </div>

        {/* Passage List */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto',
          padding: '0.5rem'
        }}>
          {localPassages.length === 0 ? (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '3rem',
                marginBottom: '0.5rem',
                opacity: 0.3
              }}>📄</div>
              <Text size="sm" style={{ color: '#64748b', marginBottom: '0.5rem' }}>
                No passages yet
              </Text>
              <Text size="xs" style={{ color: '#94a3b8' }}>
                Click "Add Passage" to create one
              </Text>
            </div>
          ) : (
            <Stack spacing="xs">
              {localPassages.map((passage, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedPassageIndex(index)}
                  style={{
                    padding: '0.75rem',
                    background: selectedPassageIndex === index 
                      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(59, 130, 246, 0.12) 100%)'
                      : 'rgba(255, 255, 255, 0.5)',
                    border: selectedPassageIndex === index 
                      ? '2px solid rgba(139, 92, 246, 0.3)'
                      : '1px solid rgba(139, 92, 246, 0.1)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPassageIndex !== index) {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPassageIndex !== index) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
                      e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.1)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                    <Text size="sm" fw={600} style={{ color: '#1e293b', flex: 1 }}>
                      {passage.title || `Passage ${index + 1} (Untitled)`}
                    </Text>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePassage(index);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        borderRadius: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                  <Text size="xs" style={{ color: '#64748b' }}>
                    Questions {passage.questionStart}-{passage.questionEnd}
                  </Text>
                </div>
              ))}
            </Stack>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid rgba(139, 92, 246, 0.15)',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, rgba(59, 130, 246, 0.03) 100%)',
          display: 'flex',
          gap: '0.75rem'
        }}>
          <Button variant="glass" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} style={{ flex: 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21" fill="white"/>
              <polyline points="7 3 7 8 15 8" fill="white"/>
            </svg>
            Save
          </Button>
        </div>
      </Card>

      {/* Right Panel - Passage Editor (Similar to QuestionEditorPanel) */}
      {selectedPassage && (
        <Card
          variant="glass"
          hover={false}
          style={{
            flex: 1,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 245, 255, 0.95) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)'
          }}>
            <Text size="lg" fw={700} style={{ color: '#1e293b' }}>
              Editing Passage {selectedPassageIndex + 1} of {localPassages.length}
            </Text>
            <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
              Changes are saved automatically
            </Text>
          </div>

          {/* Content */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem'
          }}>
            <Stack spacing="lg">
              {/* Title */}
              <div>
                <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                  Passage Title *
                </Text>
                <TextInput
                  value={selectedPassage.title || ''}
                  onChange={(e) => handlePassageChange(selectedPassageIndex, 'title', e.target.value)}
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

              {/* Content */}
              <div>
                <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                  Passage Content *
                </Text>
                <Textarea
                  value={selectedPassage.content || ''}
                  onChange={(e) => handlePassageChange(selectedPassageIndex, 'content', e.target.value)}
                  placeholder="Enter passage content..."
                  minRows={12}
                  maxRows={20}
                  styles={{
                    input: {
                      borderRadius: '0.5rem',
                      border: '2px solid #cbd5e1',
                      fontSize: '0.9375rem',
                      color: '#1e293b',
                      background: '#ffffff',
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.8
                    }
                  }}
                />
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
                      max={quiz.questions.length}
                      value={selectedPassage.questionStart || 1}
                      onChange={(e) => handlePassageChange(selectedPassageIndex, 'questionStart', parseInt(e.target.value) || 1)}
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
                      min={selectedPassage.questionStart || 1}
                      max={quiz.questions.length}
                      value={selectedPassage.questionEnd || quiz.questions.length}
                      onChange={(e) => handlePassageChange(selectedPassageIndex, 'questionEnd', parseInt(e.target.value) || quiz.questions.length)}
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
                  This passage will be associated with questions {selectedPassage.questionStart} through {selectedPassage.questionEnd}
                </Text>
              </div>
            </Stack>
          </div>
        </Card>
      )}
    </div>
  );
};

export default PassageEditorModal;
