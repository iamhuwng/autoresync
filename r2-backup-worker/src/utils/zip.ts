/**
 * Streaming ZIP Builder (PRD §4.4, Task 2.4)
 *
 * ⚠️ CRITICAL: Uses fflate's streaming Zip class, NOT zipSync().
 * zipSync() accumulates the entire ZIP buffer synchronously in RAM.
 * With 128 MB Cloudflare Worker memory limit and ~110 MB payload,
 * zipSync() WILL cause Out-Of-Memory crash.
 *
 * Streaming approach: processes each file one at a time through the ZIP
 * compressor, keeping only the current entry + compressed output in memory
 * (peak ~10-15 MB instead of ~110 MB).
 */

import { Zip, ZipPassThrough, unzipSync } from 'fflate';
import type { BackupManifest, MediaManifest } from '../types';

/**
 * ZIP folder structure (PRD §4.4):
 *   rtdb/<node>.json          — One file per RTDB node
 *   firestore/<collection>.json — One file per Firestore collection (if included)
 *   manifest.json             — Backup metadata
 *   media_manifest.json       — Media reference list
 */

interface ZipInput {
    rtdb: Record<string, unknown>;
    firestore: Record<string, unknown> | null;
    manifest: BackupManifest;
    mediaManifest: MediaManifest;
}

/**
 * Compute SHA-256 hex checksum for a Uint8Array using Web Crypto API.
 */
async function sha256Hex(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a backup ZIP using streaming compression.
 * Returns the final ZIP as a Uint8Array and the checksums for each file.
 */
export async function createBackupZip(
    input: ZipInput
): Promise<{ zipData: Uint8Array; checksums: Record<string, string> }> {
    const checksums: Record<string, string> = {};
    const chunks: Uint8Array[] = [];

    const zip = new Zip((err, chunk, _final) => {
        if (err) throw err;
        chunks.push(chunk);
    });

    // Helper: add a JSON file to the ZIP
    const addJsonFile = async (path: string, data: unknown): Promise<void> => {
        const jsonStr = JSON.stringify(data, null, 2);
        const jsonBytes = new TextEncoder().encode(jsonStr);

        // Compute checksum before adding
        checksums[path] = `sha256:${await sha256Hex(jsonBytes)}`;

        const entry = new ZipPassThrough(path);
        zip.add(entry);
        entry.push(jsonBytes, true); // true = final chunk for this entry
    };

    // Add RTDB node files
    for (const [nodeName, nodeData] of Object.entries(input.rtdb)) {
        await addJsonFile(`rtdb/${nodeName}.json`, nodeData);
    }

    // Add Firestore collection files (if included)
    if (input.firestore) {
        for (const [collectionName, collectionData] of Object.entries(input.firestore)) {
            await addJsonFile(`firestore/${collectionName}.json`, collectionData);
        }
    }

    // Add manifest and media manifest at root
    await addJsonFile('manifest.json', input.manifest);
    await addJsonFile('media_manifest.json', input.mediaManifest);

    // Finalize the archive
    zip.end();

    // Concatenate all chunks into final Uint8Array
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return { zipData: result, checksums };
}

/**
 * Extract a backup ZIP.
 *
 * ⚠️ For extraction, unzipSync() IS safe to use since the compressed ZIP
 * is much smaller than the raw data (~15-30 MB compressed).
 */
export function extractBackupZip(zipData: Uint8Array): {
    rtdb: Record<string, unknown>;
    firestore: Record<string, unknown> | null;
    manifest: BackupManifest;
    mediaManifest: MediaManifest;
} {
    const files = unzipSync(zipData);
    const decoder = new TextDecoder();

    const rtdb: Record<string, unknown> = {};
    let firestore: Record<string, unknown> | null = null;
    let manifest: BackupManifest | null = null;
    let mediaManifest: MediaManifest | null = null;

    for (const [path, data] of Object.entries(files)) {
        const jsonStr = decoder.decode(data);
        const parsed = JSON.parse(jsonStr);

        if (path === 'manifest.json') {
            manifest = parsed;
        } else if (path === 'media_manifest.json') {
            mediaManifest = parsed;
        } else if (path.startsWith('rtdb/')) {
            const nodeName = path.slice('rtdb/'.length).replace('.json', '');
            rtdb[nodeName] = parsed;
        } else if (path.startsWith('firestore/')) {
            if (!firestore) firestore = {};
            const collectionName = path.slice('firestore/'.length).replace('.json', '');
            firestore[collectionName] = parsed;
        }
    }

    if (!manifest) throw new Error('manifest.json not found in backup ZIP');
    if (!mediaManifest) throw new Error('media_manifest.json not found in backup ZIP');

    return { rtdb, firestore, manifest, mediaManifest };
}
