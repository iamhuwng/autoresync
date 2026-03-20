/**
 * Backup R2 Client - S3-compatible wrapper using aws4fetch (PRD §4.8.2)
 *
 * Uses aws4fetch (Cloudflare's recommended library) for Workers S3 compatibility.
 *
 * @aws-sdk/client-s3 does NOT work in Workers (DOMParser not available).
 * aws4fetch handles AWS Signature V4 signing natively in Workers.
 */

import { AwsClient } from 'aws4fetch';

export class BackupR2Client {
    private client: AwsClient;
    private baseUrl: string; // e.g. https://<account-id>.r2.cloudflarestorage.com/<bucket>

    constructor(
        accessKeyId: string,
        secretAccessKey: string,
        endpoint: string,
        bucketName: string
    ) {
        this.client = new AwsClient({
            accessKeyId,
            secretAccessKey,
            service: 's3',
        });
        // Normalize: remove trailing slash from endpoint
        const cleanEndpoint = endpoint.replace(/\/+$/, '');
        this.baseUrl = `${cleanEndpoint}/${bucketName}`;
    }

    /**
     * Upload an object to backup R2.
     */
    async putObject(key: string, body: Uint8Array | string, contentType?: string): Promise<void> {
        const bodyData = typeof body === 'string' ? new TextEncoder().encode(body) : body;
        const response = await this.client.fetch(`${this.baseUrl}/${key}`, {
            method: 'PUT',
            body: bodyData,
            headers: {
                'Content-Type': contentType ?? 'application/octet-stream',
            },
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`R2 PUT failed (${response.status}): ${text.slice(0, 200)}`);
        }
    }

    /**
     * Download an object from backup R2 as Uint8Array.
     * Returns null if the object does not exist.
     */
    async getObject(key: string): Promise<Uint8Array | null> {
        const response = await this.client.fetch(`${this.baseUrl}/${key}`, {
            method: 'GET',
        });

        if (response.status === 404) return null;
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`R2 GET failed (${response.status}): ${text.slice(0, 200)}`);
        }

        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }

    /**
     * Download an object from backup R2 and parse it as JSON.
     * Returns null if the object does not exist.
     */
    async getObjectAsJson<T>(key: string): Promise<T | null> {
        const data = await this.getObject(key);
        if (!data) return null;
        const text = new TextDecoder().decode(data);
        return JSON.parse(text) as T;
    }

    /**
     * List objects in backup R2 under a given prefix.
     */
    async listObjects(prefix: string): Promise<{ key: string; size: number; lastModified: Date }[]> {
        const results: { key: string; size: number; lastModified: Date }[] = [];
        let continuationToken: string | undefined;

        do {
            const params = new URLSearchParams({
                'list-type': '2',
                prefix,
            });
            if (continuationToken) {
                params.set('continuation-token', continuationToken);
            }

            const response = await this.client.fetch(`${this.baseUrl}?${params.toString()}`, {
                method: 'GET',
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`R2 LIST failed (${response.status}): ${text.slice(0, 200)}`);
            }

            const xml = await response.text();

            // Parse <Contents> entries from S3 ListObjectsV2 XML response
            const contentMatches = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
            for (const match of contentMatches) {
                const block = match[1];
                const keyMatch = block.match(/<Key>(.*?)<\/Key>/);
                const sizeMatch = block.match(/<Size>(.*?)<\/Size>/);
                const modifiedMatch = block.match(/<LastModified>(.*?)<\/LastModified>/);

                if (keyMatch && sizeMatch && modifiedMatch) {
                    results.push({
                        key: keyMatch[1],
                        size: parseInt(sizeMatch[1], 10),
                        lastModified: new Date(modifiedMatch[1]),
                    });
                }
            }

            // Check for truncation
            const isTruncated = xml.includes('<IsTruncated>true</IsTruncated>');
            if (isTruncated) {
                const tokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
                continuationToken = tokenMatch ? tokenMatch[1] : undefined;
            } else {
                continuationToken = undefined;
            }
        } while (continuationToken);

        return results;
    }

    /**
     * Check if an object exists in backup R2 and get its size.
     */
    async headObject(key: string): Promise<{ exists: boolean; size?: number }> {
        const response = await this.client.fetch(`${this.baseUrl}/${key}`, {
            method: 'HEAD',
        });

        if (response.status === 404) {
            return { exists: false };
        }
        if (!response.ok) {
            throw new Error(`R2 HEAD failed (${response.status})`);
        }

        const size = parseInt(response.headers.get('content-length') ?? '0', 10);
        return { exists: true, size };
    }

    /**
     * Delete an object from backup R2.
     */
    async deleteObject(key: string): Promise<void> {
        const response = await this.client.fetch(`${this.baseUrl}/${key}`, {
            method: 'DELETE',
        });

        if (response.status === 404) {
            return;
        }
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`R2 DELETE failed (${response.status}): ${text.slice(0, 200)}`);
        }
    }
}
