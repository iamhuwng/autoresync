import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Button } from './modern';

const AdminLoginModal = ({ show, handleClose }) => {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const form = useForm({
    initialValues: {
      username: '',
      password: '',
    },
    validate: {
      username: (value) => (value.trim().length > 0 ? null : 'Username is required'),
      password: (value) => (value.trim().length > 0 ? null : 'Password is required'),
    },
  });

  const handleLogin = (values) => {
    const adminUsername = import.meta.env.VITE_ADMIN_USERNAME;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;

    console.log('Form values:', values);
    console.log('Admin credentials:', adminUsername, adminPassword);

    if (values.username === adminUsername && values.password === adminPassword) {
      console.log('Login successful');
      sessionStorage.setItem('isAdmin', 'true');
      setError('');
      navigate('/sessions'); // Navigate to SessionManagementPage (central hub)
      handleClose();
    } else {
      console.log('Login failed');
      setError('Invalid username or password');
    }
  };

  return (
    <Modal 
      opened={show} 
      onClose={handleClose}
      withCloseButton={false}
      padding={0}
      size="md"
      styles={{
        body: { padding: 0 },
        content: {
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(167, 139, 250, 0.12) 50%, rgba(192, 132, 252, 0.15) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(167, 139, 250, 0.3)',
          boxShadow: '0 8px 32px rgba(139, 92, 246, 0.25)',
          borderRadius: '1rem',
          overflow: 'hidden'
        }
      }}
    >
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        background: 'rgba(139, 92, 246, 0.15)',
        borderBottom: '1px solid rgba(167, 139, 250, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2">
            <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
            <path d="M8.5 8.5v.01"/>
            <path d="M16 15.5v.01"/>
            <path d="M12 12v.01"/>
          </svg>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
              Admin Login
            </div>
            <div style={{ fontSize: '0.875rem', color: '#e2e8f0', marginTop: '0.125rem' }}>
              Enter your credentials to continue
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(167, 139, 250, 0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <form onSubmit={form.onSubmit(handleLogin)}>
        <div style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: 'rgba(254, 242, 242, 0.5)',
              borderRadius: '0.5rem',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke="white" strokeWidth="2"/>
                <line x1="9" y1="9" x2="15" y2="15" stroke="white" strokeWidth="2"/>
              </svg>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.25rem' }}>
                  Login Failed
                </div>
                <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                  {error}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <TextInput
              label="Username"
              placeholder="Enter your username"
              required
              styles={{
                label: {
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#e2e8f0',
                  marginBottom: '0.5rem'
                },
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid rgba(167, 139, 250, 0.3)',
                  fontSize: '0.9375rem',
                  color: '#1e293b',
                  background: 'rgba(255, 255, 255, 0.9)',
                  padding: '0.625rem 0.875rem'
                }
              }}
              {...form.getInputProps('username')}
            />
          </div>

          <div>
            <TextInput
              label="Password"
              placeholder="Enter your password"
              type="password"
              required
              styles={{
                label: {
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#e2e8f0',
                  marginBottom: '0.5rem'
                },
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid rgba(167, 139, 250, 0.3)',
                  fontSize: '0.9375rem',
                  color: '#1e293b',
                  background: 'rgba(255, 255, 255, 0.9)',
                  padding: '0.625rem 0.875rem'
                }
              }}
              {...form.getInputProps('password')}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid rgba(167, 139, 250, 0.3)',
          background: 'rgba(139, 92, 246, 0.1)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem'
        }}>
          <Button variant="glass" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" data-testid="admin-login-button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Login
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AdminLoginModal;
