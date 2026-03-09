/**
 * previewLogCollector — shared diagnostic log buffer for Step 2 + Preview.
 *
 * Usage:
 *   import { plog, getPreviewLogs, clearPreviewLogs } from './previewLogCollector';
 *   plog('Some message', { extra: 'data' });
 *   // Later: getPreviewLogs() returns all accumulated lines.
 */

const MAX_ENTRIES = 500;
const buffer: string[] = [];

/** Log a message to BOTH console and the shared buffer. */
export function plog(message: string, ...args: unknown[]): void {
    const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
    const extra = args.length > 0
        ? ' ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')
        : '';
    const line = `[${ts}] ${message}${extra}`;

    // Also log to console for DevTools visibility
    console.log(message, ...args);

    buffer.push(line);
    if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

/** Get all buffered log lines as a single string. */
export function getPreviewLogs(): string {
    return buffer.join('\n');
}

/** Clear the buffer. */
export function clearPreviewLogs(): void {
    buffer.length = 0;
}

/** Get current buffer size. */
export function getPreviewLogCount(): number {
    return buffer.length;
}
