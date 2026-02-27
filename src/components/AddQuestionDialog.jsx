import React from 'react';
import { Modal, Text } from '@mantine/core';
import { Card } from './modern';

const AddQuestionDialog = ({ show, onClose, onSelectSingle, onSelectBulk }) => {
  return (
    <Modal
      opened={show}
      onClose={onClose}
      size="auto"
      withCloseButton={false}
      padding={0}
      centered
      styles={{
        body: { padding: 0 },
        content: {
          background: 'transparent',
          boxShadow: 'none'
        }
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1rem'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '0.5rem'
        }}>
          <Text size="xl" fw={700} style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
            Add Questions
          </Text>
          <Text size="sm" style={{ color: '#64748b' }}>
            Choose how you want to add questions
          </Text>
        </div>

        <div style={{
          display: 'flex',
          gap: '1.5rem',
          justifyContent: 'center'
        }}>
          {/* Add Single Question Card */}
          <Card
            variant="glass"
            hover={true}
            onClick={onSelectSingle}
            style={{
              width: '280px',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)',
              border: '2px solid rgba(139, 92, 246, 0.2)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(139, 92, 246, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
              e.currentTarget.style.boxShadow = '';
            }}
          >
            <div style={{
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '1rem',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(139, 92, 246, 0.3)'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <Text size="lg" fw={700} style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
                  Add 1 Question
                </Text>
                <Text size="sm" style={{ color: '#64748b', lineHeight: 1.6 }}>
                  Create a single question with custom type and fields
                </Text>
              </div>

              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#8b5cf6'
              }}>
                Quick & Precise
              </div>
            </div>
          </Card>

          {/* Add Bulk Questions Card */}
          <Card
            variant="glass"
            hover={true}
            onClick={onSelectBulk}
            style={{
              width: '280px',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(14, 165, 233, 0.05) 100%)',
              border: '2px solid rgba(59, 130, 246, 0.2)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(59, 130, 246, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
              e.currentTarget.style.boxShadow = '';
            }}
          >
            <div style={{
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '1rem',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <Text size="lg" fw={700} style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
                  Add Bulk
                </Text>
                <Text size="sm" style={{ color: '#64748b', lineHeight: 1.6 }}>
                  Paste text or upload files for AI parsing
                </Text>
              </div>

              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#3b82f6'
              }}>
                Fast & Efficient
              </div>
            </div>
          </Card>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: '0.5rem'
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#64748b',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)';
              e.currentTarget.style.color = '#475569';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AddQuestionDialog;
