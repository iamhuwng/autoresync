/**
 * StatusTracker — In-memory + R2-persisted progress tracking (PRD §4.14.2)
 *
 * Since Workers are stateless across requests, progress is stored in a
 * backup_status_<id>.json or restore_status_<id>.json file in backup R2,
 * updated every ~5 seconds during operations.
 */

import type { StatusTrackerState } from '../types';
import type { BackupR2Client } from '../utils/r2-client';

export class StatusTracker {
    state: StatusTrackerState;
    private r2: BackupR2Client | null = null;
    private lastPersisted = 0;
    private persistIntervalMs = 5000; // Persist to R2 every 5 seconds

    constructor(type: 'backup' | 'restore') {
        const id = `${type === 'backup' ? 'BK' : 'RS'}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
        this.state = {
            id,
            type,
            phase: 'initializing',
            progress: 0,
            currentNode: '',
            startedAt: new Date().toISOString(),
        };
    }

    /**
     * Set the R2 client for persisting status.
     */
    setR2Client(r2: BackupR2Client): void {
        this.r2 = r2;
    }

    /**
     * Update progress and optionally persist to R2.
     */
    async update(phase: string, progress: number, currentNode: string): Promise<void> {
        this.state.phase = phase;
        this.state.progress = Math.min(100, Math.max(0, progress));
        this.state.currentNode = currentNode;

        // Persist to R2 if enough time has passed
        const now = Date.now();
        if (this.r2 && now - this.lastPersisted >= this.persistIntervalMs) {
            await this.persist();
            this.lastPersisted = now;
        }
    }

    /**
     * Mark the operation as complete.
     */
    async complete(): Promise<void> {
        this.state.phase = 'complete';
        this.state.progress = 100;
        this.state.completedAt = new Date().toISOString();
        await this.persist();
    }

    /**
     * Mark the operation as failed.
     */
    async fail(error: string): Promise<void> {
        this.state.phase = 'failed';
        this.state.error = error;
        this.state.completedAt = new Date().toISOString();
        await this.persist();
    }

    /**
     * Force persist current state to R2.
     */
    async persist(): Promise<void> {
        if (!this.r2) return;
        const key = `${this.state.type}_status_${this.state.id}.json`;
        await this.r2.putObject(
            key,
            JSON.stringify(this.state, null, 2),
            'application/json'
        );
    }
}
