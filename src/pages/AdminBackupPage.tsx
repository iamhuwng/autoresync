/**
 * AdminBackupPage — Backup & Disaster Recovery Admin UI (PRD-0026 §5)
 *
 * Dashboard with: system health, backup history, manual actions,
 * media status, restore preview/execution, and progress tracking.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './AdminBackupPage.css';
import * as backupService from '../services/backupService';
import { AdminLayout } from '../components/navigation';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';

// ─── Types ─────────────────────────────────────────────────────────────

interface BackupEntry {
    backupId: string;
    type: string;
    trigger: string;
    createdAt: string;
    status: string;
    includesFirestore: boolean;
    totalSizeBytes: number;
    entityCounts: {
        rtdb: Record<string, number>;
        firestore: Record<string, number>;
    };
    firestoreSkipReason: string | null;
}

interface HealthStatus {
    status: string;
    primaryR2: boolean;
    backupR2: boolean;
    firebase: boolean;
    quotaStatus: {
        firestoreReadsToday: number;
        rtdbBytesThisMonth: number;
    };
    mediaChain?: {
        lastBackupId: string | null;
        sequenceNumber: number;
        lastBackupDate: string | null;
        chainLength: number;
        checkpointInterval: number;
    };
}

interface RestorePreview {
    backupId: string;
    backupDate: string;
    categories: Array<{
        name: string;
        backupCount: number;
        currentCount: number;
        difference: number;
        status: string;
    }>;
    includesFirestore: boolean;
    firestoreMergeAvailable: {
        available: boolean;
        fromBackupId?: string;
        fromDate?: string;
    };
    gdprExcludedCount: number;
    warnings: string[];
}

interface Toast {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
}

// ─── Helper Functions ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ─── Component ─────────────────────────────────────────────────────────

const AdminBackupPage: React.FC = () => {
    // State
    const [history, setHistory] = useState<BackupEntry[]>([]);
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [backupInProgress, setBackupInProgress] = useState(false);
    const [backupProgress, setBackupProgress] = useState<{
        phase: string; progress: number; currentNode: string;
    } | null>(null);
    const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
    const [restoreInProgress, setRestoreInProgress] = useState(false);
    const [restoreScope, setRestoreScope] = useState<Record<string, boolean>>({});
    const [restoreMode, setRestoreMode] = useState<'smart_auto' | 'per_entity'>('smart_auto');
    const [mediaDownloadInProgress, setMediaDownloadInProgress] = useState(false);
    const [mediaDownloadProgress, setMediaDownloadProgress] = useState<{
        current: number; total: number; currentFile: string;
    } | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    // Auth & navigation (admin layout pattern)
    const { profile, logout } = useAuth();
    const { navigateTo } = useNavigation('admin');

    const handleLogout = async () => {
        await logout();
        navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
    };

    const handleSidebarNavigate = (page: string) => {
        const pageRoutes: Record<string, string> = {
            dashboard: 'ADMIN_DASHBOARD',
            materials: 'ADMIN_MATERIALS',
            users: 'ADMIN_USERS',
            courses: 'ADMIN_COURSES',
            classes: 'ADMIN_CLASSES',
            sessions: 'ADMIN_SESSIONS',
            settings: 'ADMIN_SETTINGS',
            backup: 'ADMIN_BACKUP',
            reports: 'ADMIN_REPORTS',
        };
        const route = pageRoutes[page];
        if (route) {
            navigateTo(route as any, {}, { reason: `admin_nav_${page}` });
        }
    };

    // Toast helper
    const showToast = useCallback((type: Toast['type'], message: string) => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    // Load data
    const loadData = useCallback(async () => {
        try {
            const [historyData, healthData] = await Promise.all([
                backupService.getBackupHistory().catch(() => []),
                backupService.getHealthStatus().catch(() => null),
            ]);
            setHistory(historyData);
            setHealth(healthData);
        } catch (err) {
            console.error('[AdminBackupPage] Error loading data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Cleanup polling + wake lock on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => { });
                wakeLockRef.current = null;
            }
        };
    }, []);

    // ── Wake Lock Helpers ────────────────────────────────────────────────

    const acquireWakeLock = useCallback(async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                console.log('[WakeLock] Acquired');
            }
        } catch {
            console.warn('[WakeLock] Not supported or denied');
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            await wakeLockRef.current.release().catch(() => { });
            wakeLockRef.current = null;
            console.log('[WakeLock] Released');
        }
    }, []);

    // ── Backup Actions ──────────────────────────────────────────────────

    const handleTriggerBackup = async () => {
        try {
            setBackupInProgress(true);
            setBackupProgress({ phase: 'Starting...', progress: 0, currentNode: '' });
            showToast('info', 'Manual backup started...');

            const { backupId } = await backupService.triggerBackup();

            // Poll progress
            pollingRef.current = setInterval(async () => {
                try {
                    const status = await backupService.getBackupStatus(backupId);
                    setBackupProgress({
                        phase: status.phase,
                        progress: status.progress,
                        currentNode: status.currentNode,
                    });

                    if (status.completedAt) {
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        pollingRef.current = null;
                        setBackupInProgress(false);
                        setBackupProgress(null);

                        if (status.error) {
                            showToast('error', `Backup failed: ${status.error}`);
                        } else {
                            showToast('success', 'Backup completed successfully!');
                        }
                        loadData();
                    }
                } catch {
                    // Status check failed — will retry next interval
                }
            }, 3000);
        } catch (err: unknown) {
            setBackupInProgress(false);
            setBackupProgress(null);
            showToast('error', `Failed to start backup: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    const handleDownload = async (backupId: string) => {
        try {
            showToast('info', 'Downloading backup...');
            const blob = await backupService.downloadBackup(backupId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${backupId}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('success', 'Download complete!');
        } catch (err: unknown) {
            showToast('error', `Download failed: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    // ── Media Backup (Task 5.6) ──────────────────────────────────────────

    const handleMediaBackup = async () => {
        try {
            setMediaDownloadInProgress(true);
            await acquireWakeLock();
            showToast('info', 'Calculating media delta...');

            const delta = await backupService.getMediaDelta();

            if (delta.files.length === 0) {
                showToast('info', 'No new media files since last backup.');
                setMediaDownloadInProgress(false);
                await releaseWakeLock();
                return;
            }

            const totalSize = formatBytes(delta.totalSizeBytes);
            const confirmed = confirm(
                `Media Backup (${delta.type} #${delta.sequenceNumber})\n\n` +
                `${delta.files.length} files (${totalSize})\n` +
                `Chain: ${delta.chainInfo}\n\n` +
                `Proceed with download?`
            );

            if (!confirmed) {
                setMediaDownloadInProgress(false);
                await releaseWakeLock();
                return;
            }

            // File System Access API if supported
            if ('showDirectoryPicker' in window) {
                try {
                    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });

                    // Download in batches of 3
                    for (let i = 0; i < delta.files.length; i += 3) {
                        const batch = delta.files.slice(i, i + 3);
                        await Promise.all(batch.map(async (file: any) => {
                            const fileName = file.key.split('/').pop() || file.key;
                            setMediaDownloadProgress({
                                current: i + 1,
                                total: delta.files.length,
                                currentFile: fileName,
                            });
                            const blob = await backupService.downloadMediaFile(file.key);
                            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(blob);
                            await writable.close();
                        }));
                    }
                } catch (err: unknown) {
                    if ((err as any)?.name === 'AbortError') {
                        showToast('info', 'Folder selection cancelled.');
                        setMediaDownloadInProgress(false);
                        setMediaDownloadProgress(null);
                        await releaseWakeLock();
                        return;
                    }
                    throw err;
                }
            } else {
                // Fallback: individual file downloads
                showToast('info', 'Your browser doesn\'t support folder selection. Files will download individually.');
                for (let i = 0; i < delta.files.length; i++) {
                    const file = delta.files[i] as { key: string; sizeBytes: number };
                    if (!file) continue;
                    const fileName = file.key.split('/').pop() || file.key;
                    setMediaDownloadProgress({
                        current: i + 1,
                        total: delta.files.length,
                        currentFile: fileName,
                    });
                    const blob = await backupService.downloadMediaFile(file.key);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            setMediaDownloadInProgress(false);
            setMediaDownloadProgress(null);
            await releaseWakeLock();
            showToast('success', `Media backup complete! ${delta.files.length} files downloaded.`);
            showToast('info', '⚠️ Media backup stored on YOUR computer only. Consider copying to an external drive.');
        } catch (err: unknown) {
            setMediaDownloadInProgress(false);
            setMediaDownloadProgress(null);
            await releaseWakeLock();
            showToast('error', `Media backup failed: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    // ── Restore Actions ─────────────────────────────────────────────────

    const handleRestorePreview = async (backupId: string) => {
        try {
            showToast('info', 'Generating restore preview...');
            const preview = await backupService.getRestorePreview(backupId);
            setRestorePreview(preview);
            // Initialize scope: all categories checked, notifications unchecked by default
            const initialScope: Record<string, boolean> = {};
            preview.categories.forEach(cat => {
                initialScope[cat.name] = cat.name !== 'notifications';
            });
            setRestoreScope(initialScope);
            setRestoreMode('smart_auto');
        } catch (err: unknown) {
            showToast('error', `Preview failed: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    const handleExecuteRestore = async () => {
        if (!restorePreview) return;

        if (!confirm('⚠️ A pre-restore safety snapshot will be created first. This action will modify your live database. Continue?')) return;

        try {
            setRestoreInProgress(true);
            await acquireWakeLock();
            showToast('info', 'Restore started...');

            const selectedScope = Object.entries(restoreScope)
                .filter(([, v]) => v)
                .map(([k]) => k);

            const { restoreId } = await backupService.executeRestore({
                backupId: restorePreview.backupId,
                scope: selectedScope.length === restorePreview.categories.length ? ['all'] : selectedScope,
                mode: restoreMode,
                mergeFirestoreFromBackupId: restorePreview.firestoreMergeAvailable.fromBackupId,
            });

            setRestorePreview(null);

            // Poll restore progress
            pollingRef.current = setInterval(async () => {
                try {
                    const status = await backupService.getRestoreStatus(restoreId);

                    if (status.completedAt) {
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        pollingRef.current = null;
                        setRestoreInProgress(false);

                        if (status.error) {
                            showToast('error', `Restore failed: ${status.error}`);
                        } else {
                            showToast('success', '✅ Restore complete.');
                        }
                        await releaseWakeLock();
                        loadData();
                    }
                } catch {
                    // Will retry next interval
                }
            }, 3000);
        } catch (err: unknown) {
            setRestoreInProgress(false);
            await releaseWakeLock();
            showToast('error', `Restore failed: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    // ── Computed Values ──────────────────────────────────────────────────

    const getNextMonday3AM = (): string => {
        const now = new Date();
        const day = now.getUTCDay();
        const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
        const next = new Date(now);
        next.setUTCDate(now.getUTCDate() + daysUntilMonday);
        next.setUTCHours(3, 0, 0, 0);
        return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' 3:00 AM UTC';
    };

    const anyOperationInProgress = backupInProgress || restoreInProgress || mediaDownloadInProgress;

    // ── Render ───────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="backup-page">
                <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                    Loading backup system...
                </div>
            </div>
        );
    }

    const lastBackup = history.length > 0 ? history[0] : null;
    const totalBackups = history.length;
    const completedBackups = history.filter(b => b.status === 'complete').length;
    const failedBackups = history.filter(b => b.status === 'failed').length;

    return (
        <AdminLayout
            pageTitle="Backup & Recovery"
            currentPage="backup"
            onNavigate={handleSidebarNavigate}
            onLogout={handleLogout}
            userRole={profile?.role}
        >
            <div className="backup-page">
                <h1>🛡️ Backup & Recovery</h1>
                <p className="page-subtitle">
                    Manage data backups, media snapshots, and disaster recovery
                </p>

                {/* Dashboard Cards */}
                <div className="backup-dashboard-grid">
                    <div className="backup-dashboard-card">
                        <div className="card-header">
                            <div className="card-icon green">✅</div>
                            {health && (
                                <span className={`status-badge ${health.status}`}>
                                    <span className={`health-dot ${health.status === 'ok' ? 'green' : 'red'}`} />
                                    {health.status === 'ok' ? 'All Systems OK' : 'Issue Detected'}
                                </span>
                            )}
                        </div>
                        <div className="card-value">{health?.status === 'ok' ? 'Healthy' : 'Check Required'}</div>
                        <div className="card-label">System Status</div>
                    </div>

                    <div className="backup-dashboard-card">
                        <div className="card-header">
                            <div className="card-icon blue">📊</div>
                        </div>
                        <div className="card-value">{totalBackups}</div>
                        <div className="card-label">Total Backups ({completedBackups} ✓ / {failedBackups} ✗)</div>
                    </div>

                    <div className="backup-dashboard-card">
                        <div className="card-header">
                            <div className="card-icon amber">🕒</div>
                        </div>
                        <div className="card-value">
                            {lastBackup ? timeAgo(lastBackup.createdAt) : 'Never'}
                        </div>
                        <div className="card-label">Last Backup</div>
                    </div>

                    <div className="backup-dashboard-card">
                        <div className="card-header">
                            <div className="card-icon blue">📁</div>
                        </div>
                        <div className="card-value">
                            {lastBackup ? formatBytes(lastBackup.totalSizeBytes) : '—'}
                        </div>
                        <div className="card-label">Last Backup Size</div>
                    </div>
                </div>

                {/* Health Details */}
                {health && (
                    <div className="backup-section">
                        <h2>🔗 Connectivity</h2>
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            <div className="health-indicator">
                                <span className={`health-dot ${health.primaryR2 ? 'green' : 'red'}`} />
                                Primary R2: {health.primaryR2 ? 'Connected' : 'Disconnected'}
                            </div>
                            <div className="health-indicator">
                                <span className={`health-dot ${health.backupR2 ? 'green' : 'red'}`} />
                                Backup R2: {health.backupR2 ? 'Connected' : 'Disconnected'}
                            </div>
                            <div className="health-indicator">
                                <span className={`health-dot ${health.firebase ? 'green' : 'red'}`} />
                                Firebase: {health.firebase ? 'Connected' : 'Disconnected'}
                            </div>
                            <div className="health-indicator" style={{ marginLeft: 'auto' }}>
                                📖 Firestore reads today: {health.quotaStatus.firestoreReadsToday.toLocaleString()}
                            </div>
                        </div>
                    </div>
                )}

                {/* Actions Bar */}
                <div className="backup-actions">
                    <button
                        className="backup-btn primary"
                        onClick={handleTriggerBackup}
                        disabled={anyOperationInProgress}
                        id="backup-trigger-btn"
                    >
                        {backupInProgress ? '⏳ Backup Running...' : '📦 Run Manual Backup'}
                    </button>
                    <button
                        className="backup-btn glass"
                        onClick={handleMediaBackup}
                        disabled={anyOperationInProgress}
                        id="media-backup-btn"
                    >
                        {mediaDownloadInProgress ? '⏳ Downloading...' : '🖼️ Media Backup'}
                    </button>
                    <button
                        className="backup-btn glass"
                        onClick={loadData}
                        disabled={anyOperationInProgress}
                        id="backup-refresh-btn"
                    >
                        🔄 Refresh
                    </button>
                </div>

                {/* Wake Lock Warning Banner */}
                {anyOperationInProgress && (
                    <div className="warning-banner" style={{ marginBottom: '1rem' }}>
                        ⚠️ Please do not close this tab or put your computer to sleep until the process completes.
                    </div>
                )}

                {/* Backup Progress */}
                {backupProgress && (
                    <div className="backup-section">
                        <h2>⏳ Backup In Progress</h2>
                        <div className="backup-progress-bar">
                            <div
                                className="backup-progress-fill"
                                style={{ width: `${backupProgress.progress}%` }}
                            />
                        </div>
                        <div className="backup-progress-text">
                            <span>{backupProgress.phase}</span>
                            <span>{backupProgress.progress}%</span>
                        </div>
                        {backupProgress.currentNode && (
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                Processing: {backupProgress.currentNode}
                            </div>
                        )}
                    </div>
                )}

                {/* Backup History */}
                <div className="backup-section">
                    <h2>📋 Backup History</h2>
                    {history.length === 0 ? (
                        <div className="backup-empty-state">
                            <div className="empty-icon">📦</div>
                            <p>No backups yet. Run your first backup to get started.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="backup-history-table">
                                <thead>
                                    <tr>
                                        <th>Backup ID</th>
                                        <th>Date</th>
                                        <th>Trigger</th>
                                        <th>Status</th>
                                        <th>Size</th>
                                        <th>Firestore</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(entry => (
                                        <tr key={entry.backupId}>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                {entry.backupId}
                                            </td>
                                            <td>{formatDate(entry.createdAt)}</td>
                                            <td>
                                                <span className={`status-badge info`}>
                                                    {entry.trigger === 'auto' ? '⏰ Auto' : '👤 Manual'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${entry.status}`}>
                                                    {entry.status === 'complete' ? '✅' : entry.status === 'failed' ? '❌' : '⏳'}
                                                    {' '}{entry.status}
                                                </span>
                                            </td>
                                            <td>{formatBytes(entry.totalSizeBytes)}</td>
                                            <td>
                                                {entry.includesFirestore ? (
                                                    <span className="status-badge ok">✅ Yes</span>
                                                ) : (
                                                    <span className="status-badge warning" title={entry.firestoreSkipReason || undefined}>
                                                        ⚠️ Skipped
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="row-actions">
                                                    <button
                                                        className="row-action-btn"
                                                        onClick={() => handleDownload(entry.backupId)}
                                                        title="Download backup ZIP"
                                                    >
                                                        ⬇️ Download
                                                    </button>
                                                    {entry.status === 'complete' && (
                                                        <button
                                                            className="row-action-btn"
                                                            onClick={() => handleRestorePreview(entry.backupId)}
                                                            disabled={restoreInProgress}
                                                            title="Preview restore from this backup"
                                                        >
                                                            🔄 Restore
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Settings Section (5.10 — read-only) */}
                <div className="backup-section">
                    <h2>⚙️ Settings</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                        <div className="backup-dashboard-card" style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 600 }}>Auto-Backup</div>
                            <div style={{ color: '#10b981', fontSize: '0.9rem' }}>✅ Enabled</div>
                        </div>
                        <div className="backup-dashboard-card" style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 600 }}>Schedule</div>
                            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Every Monday at 3:00 AM UTC</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Next: {getNextMonday3AM()}</div>
                        </div>
                        <div className="backup-dashboard-card" style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 600 }}>Retention</div>
                            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>R2 lifecycle: 77 days</div>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.75rem' }}>
                        ℹ️ Schedule change requires Worker redeployment (wrangler.toml edit).
                    </p>
                </div>

                {/* Media Backup Status (Task 5.8) */}
                <div className="backup-section">
                    <h2>🖼️ Media Backup Status</h2>
                    {health?.mediaChain && health.mediaChain.sequenceNumber > 0 ? (
                        <>
                            <div className="media-chain-pills">
                                {Array.from(
                                    { length: Math.min(health.mediaChain.sequenceNumber, 10) },
                                    (_, i) => {
                                        const n = i + 1;
                                        const interval = health.mediaChain!.checkpointInterval || 6;
                                        const isFull = n === 1 || n % interval === 0;
                                        return (
                                            <React.Fragment key={n}>
                                                {i > 0 && <span className="media-chain-arrow">→</span>}
                                                <span className={`media-chain-pill ${isFull ? 'full' : 'delta'}`}>
                                                    {isFull ? 'Full' : 'Delta'}({n})
                                                </span>
                                            </React.Fragment>
                                        );
                                    }
                                )}
                                {health.mediaChain.sequenceNumber > 10 && (
                                    <span className="media-chain-arrow">
                                        … +{health.mediaChain.sequenceNumber - 10} more
                                    </span>
                                )}
                            </div>
                            <div className="media-chain-info">
                                <div className="media-chain-stat">
                                    Last Media Backup: <strong>
                                        {health.mediaChain.lastBackupDate
                                            ? timeAgo(health.mediaChain.lastBackupDate)
                                            : 'Never'}
                                    </strong>
                                </div>
                                <div className="media-chain-stat">
                                    Chain Position: <strong>
                                        #{health.mediaChain.sequenceNumber}
                                    </strong>
                                </div>
                                <div className="media-chain-stat">
                                    Next Full Backup: <strong>
                                        in {(() => {
                                            const interval = health.mediaChain!.checkpointInterval || 6;
                                            const remaining = interval - (health.mediaChain!.sequenceNumber % interval);
                                            return remaining === interval ? 'next backup' : `${remaining} backup${remaining !== 1 ? 's' : ''}`;
                                        })()}
                                    </strong>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="backup-empty-state" style={{ padding: '1.5rem 1rem' }}>
                            <p>No media backups yet. Click &quot;Media Backup&quot; to start.</p>
                        </div>
                    )}
                </div>

                {/* Restore Preview Modal */}
                {restorePreview && (
                    <div className="restore-preview-overlay" onClick={() => setRestorePreview(null)}>
                        <div className="restore-preview-modal" onClick={e => e.stopPropagation()}>
                            <h2>🔄 Restore Preview — {restorePreview.backupId}</h2>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                Backup from: {formatDate(restorePreview.backupDate)}
                            </p>

                            {/* Warnings */}
                            {restorePreview.warnings.map((w, i) => (
                                <div key={i} className="warning-banner">
                                    ⚠️ {w}
                                </div>
                            ))}

                            {/* Firestore Merge */}
                            {!restorePreview.includesFirestore && restorePreview.firestoreMergeAvailable.available && (
                                <div className="warning-banner" style={{ borderColor: 'rgba(59, 130, 246, 0.25)', background: 'rgba(59, 130, 246, 0.05)', color: '#1e40af' }}>
                                    💡 Firestore data available from backup {restorePreview.firestoreMergeAvailable.fromBackupId}
                                    {' '}({formatDate(restorePreview.firestoreMergeAvailable.fromDate || '')}).
                                    It will be merged automatically.
                                </div>
                            )}

                            {/* Scope Selection (Task 5.7 §3) */}
                            <div style={{ marginBottom: '1rem' }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Restore Scope</h3>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <button
                                        className="backup-btn glass"
                                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                                        onClick={() => {
                                            const all: Record<string, boolean> = {};
                                            restorePreview.categories.forEach(c => { all[c.name] = true; });
                                            setRestoreScope(all);
                                        }}
                                    >
                                        Select All
                                    </button>
                                    <button
                                        className="backup-btn glass"
                                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                                        onClick={() => {
                                            const none: Record<string, boolean> = {};
                                            restorePreview.categories.forEach(c => { none[c.name] = false; });
                                            setRestoreScope(none);
                                        }}
                                    >
                                        Deselect All
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {restorePreview.categories.map(cat => (
                                        <label
                                            key={cat.name}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                                                fontSize: '0.8rem', padding: '0.25rem 0.5rem',
                                                background: restoreScope[cat.name] ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0,0,0,0.02)',
                                                borderRadius: '6px', cursor: 'pointer',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={restoreScope[cat.name] || false}
                                                onChange={e => setRestoreScope(prev => ({ ...prev, [cat.name]: e.target.checked }))}
                                            />
                                            {cat.name}
                                            {cat.name === 'notifications' && (
                                                <span title="Excluded by default to prevent spamming students with old notifications" style={{ cursor: 'help' }}>ℹ️</span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {/* Category Grid */}
                            <div className="category-grid">
                                <div className="category-row header">
                                    <span>Node/Collection</span>
                                    <span>Backup</span>
                                    <span>Current</span>
                                    <span>Diff</span>
                                    <span>Status</span>
                                </div>
                                {restorePreview.categories.map(cat => (
                                    <div key={cat.name} className="category-row">
                                        <span style={{ fontWeight: 500 }}>{cat.name}</span>
                                        <span>{cat.backupCount.toLocaleString()}</span>
                                        <span>{cat.currentCount.toLocaleString()}</span>
                                        <span style={{
                                            color: cat.difference > 0
                                                ? '#10b981'
                                                : cat.difference < 0
                                                    ? '#ef4444'
                                                    : '#64748b',
                                            fontWeight: 600,
                                        }}>
                                            {cat.difference > 0 ? '+' : ''}{cat.difference}
                                        </span>
                                        <span>
                                            <span className={`status-badge ${cat.status === 'match' ? 'ok' : cat.status === 'extra' ? 'info' : 'warning'}`}>
                                                {cat.status}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {restorePreview.gdprExcludedCount > 0 && (
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                    🔒 {restorePreview.gdprExcludedCount} GDPR-completed entities will be excluded
                                </p>
                            )}

                            {/* Mode Selection (Task 5.7 §5) */}
                            <div style={{ margin: '1rem 0', padding: '0.75rem', background: 'rgba(248, 250, 252, 0.6)', borderRadius: '8px' }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Restore Mode</h3>
                                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <input type="radio" name="restoreMode" value="smart_auto" checked={restoreMode === 'smart_auto'}
                                        onChange={() => setRestoreMode('smart_auto')} />
                                    <strong>Smart Auto</strong> — Skip entities that already exist, restore only missing ones. <em>(Recommended)</em>
                                </label>
                                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <input type="radio" name="restoreMode" value="per_entity" checked={restoreMode === 'per_entity'}
                                        onChange={() => setRestoreMode('per_entity')} />
                                    <strong>Per-Entity Manual</strong> — Choose what to do with each conflicting entity.
                                </label>
                            </div>
                            {/* Actions */}
                            <div className="modal-actions">
                                <button
                                    className="backup-btn glass"
                                    onClick={() => setRestorePreview(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="backup-btn danger"
                                    onClick={handleExecuteRestore}
                                    disabled={restoreInProgress}
                                    id="restore-execute-btn"
                                >
                                    {restoreInProgress ? '⏳ Restoring...' : `🔄 Execute Restore (${restoreMode === 'smart_auto' ? 'Smart Auto' : 'Per-Entity'})`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Media Download Progress */}
                {mediaDownloadProgress && (
                    <div className="backup-section">
                        <h2>🖼️ Media Download In Progress</h2>
                        <div className="backup-progress-bar">
                            <div
                                className="backup-progress-fill"
                                style={{ width: `${(mediaDownloadProgress.current / mediaDownloadProgress.total) * 100}%` }}
                            />
                        </div>
                        <div className="backup-progress-text">
                            <span>Downloading: {mediaDownloadProgress.currentFile}</span>
                            <span>{mediaDownloadProgress.current} / {mediaDownloadProgress.total}</span>
                        </div>
                    </div>
                )}

                {/* Toast Notifications */}
                {toasts.map((toast, idx) => (
                    <div
                        key={toast.id}
                        className={`backup-toast ${toast.type}`}
                        style={{ bottom: `${2 + idx * 4}rem` }}
                    >
                        {toast.type === 'success' && '✅'}
                        {toast.type === 'error' && '❌'}
                        {toast.type === 'info' && 'ℹ️'}
                        {' '}{toast.message}
                    </div>
                ))}
            </div>
        </AdminLayout>
    );
};

export default AdminBackupPage;
