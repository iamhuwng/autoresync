/**
 * Admin Migration Page
 * Run database migrations for ownership fields
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell, Alert } from '@mantine/core';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
import { runOwnershipMigration, dryRunOwnershipMigration } from '../services/migrations/addOwnershipFields';
import { useAuth } from '../hooks/useAuth';

const AdminMigrationPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [dryRunResults, setDryRunResults] = useState<{ testsToMigrate: number; classesToMigrate: number } | null>(null);
  const [migrationResults, setMigrationResults] = useState<any>(null);
  const [superAdminUid, setSuperAdminUid] = useState('');

  const handleDryRun = async () => {
    setIsRunning(true);
    try {
      const results = await dryRunOwnershipMigration();
      setDryRunResults(results);
    } catch (error) {
      console.error('Dry run failed:', error);
      alert('Dry run failed. Check console for details.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunMigration = async () => {
    if (!superAdminUid) {
      alert('Please enter the Super Admin UID');
      return;
    }

    if (!window.confirm(
      `This will migrate all legacy tests to be owned by ${superAdminUid} and marked as public. Continue?`
    )) {
      return;
    }

    setIsRunning(true);
    try {
      const results = await runOwnershipMigration(superAdminUid);
      setMigrationResults(results);
      alert(results.success ? 'Migration completed successfully!' : 'Migration completed with errors. Check results below.');
    } catch (error) {
      console.error('Migration failed:', error);
      alert('Migration failed. Check console for details.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <AppShell
      header={{ height: 70 }}
      padding="md"
      style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
        minHeight: '100vh'
      }}
    >
      <AppShell.Header style={{
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.6)'
      }}>
        <div style={{ 
          height: '100%', 
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>
            🔧 Database Migration
          </h2>
          <Button variant="glass" onClick={() => navigate('/lobby')}>
            ← Back to Lobby
          </Button>
        </div>
      </AppShell.Header>

      <AppShell.Main>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
          
          <Alert color="blue" title="Migration Purpose" style={{ marginBottom: '2rem' }}>
            This migration adds <code>ownerId</code> and <code>isPublic</code> fields to existing tests.
            Legacy tests will be assigned to a super admin account and marked as public so all teachers can access them.
          </Alert>

          {/* Super Admin UID Input */}
          <Card variant="glass" style={{ marginBottom: '2rem' }}>
            <CardBody>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#1e293b' }}>
                Step 1: Enter Super Admin UID
              </h3>
              <p style={{ color: '#64748b', marginBottom: '1rem' }}>
                Current user UID: <code style={{ background: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
                  {user?.uid || 'Not logged in'}
                </code>
              </p>
              <input
                type="text"
                value={superAdminUid}
                onChange={(e) => setSuperAdminUid(e.target.value)}
                placeholder="Enter super admin UID (or use current user UID)"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSuperAdminUid(user?.uid || '')}
                style={{ marginTop: '0.5rem' }}
              >
                Use Current User UID
              </Button>
            </CardBody>
          </Card>

          {/* Dry Run */}
          <Card variant="glass" style={{ marginBottom: '2rem' }}>
            <CardBody>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#1e293b' }}>
                Step 2: Check What Will Be Migrated (Dry Run)
              </h3>
              <Button
                variant="primary"
                onClick={handleDryRun}
                disabled={isRunning}
                loading={isRunning}
              >
                🔍 Run Dry Run
              </Button>

              {dryRunResults && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: '#1e293b' }}>
                    Dry Run Results:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#64748b' }}>
                    <li>Tests needing migration: <strong>{dryRunResults.testsToMigrate}</strong></li>
                    <li>Classes needing migration: <strong>{dryRunResults.classesToMigrate}</strong></li>
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Run Migration */}
          <Card variant="lavender" style={{ marginBottom: '2rem' }}>
            <CardBody>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#1e293b' }}>
                Step 3: Run Migration
              </h3>
              <Alert color="orange" title="Warning" style={{ marginBottom: '1rem' }}>
                This will modify your Firebase database. Make sure you have a backup!
              </Alert>
              <Button
                variant="success"
                onClick={handleRunMigration}
                disabled={isRunning || !superAdminUid}
                loading={isRunning}
              >
                ▶️ Run Migration
              </Button>

              {migrationResults && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: migrationResults.success ? '#f0fdf4' : '#fef2f2', borderRadius: '0.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: migrationResults.success ? '#166534' : '#991b1b' }}>
                    {migrationResults.success ? '✅ Migration Successful' : '⚠️ Migration Completed with Errors'}
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#64748b' }}>
                    <li>Tests updated: <strong>{migrationResults.testsUpdated}</strong></li>
                    <li>Classes updated: <strong>{migrationResults.classesUpdated}</strong></li>
                    <li>Errors: <strong>{migrationResults.errors.length}</strong></li>
                  </ul>

                  {migrationResults.errors.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <h5 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#991b1b' }}>Errors:</h5>
                      <ul style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                        {migrationResults.errors.map((error: string, index: number) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Instructions */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#1e293b' }}>
                📖 What This Does
              </h3>
              <ol style={{ color: '#64748b', lineHeight: 1.8 }}>
                <li>Scans all tests in Firebase</li>
                <li>For items missing <code>ownerId</code>: Sets to the super admin UID you provide</li>
                <li>For items missing <code>isPublic</code>: Sets to <code>true</code> (public)</li>
                <li>Preserves existing ownership data if already set</li>
                <li>Updates <code>updatedAt</code> timestamp</li>
              </ol>
              <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
                After migration, all legacy content will appear in the "Public Library" tab for all teachers.
              </p>
            </CardBody>
          </Card>

        </div>
      </AppShell.Main>
    </AppShell>
  );
};

export default AdminMigrationPage;
