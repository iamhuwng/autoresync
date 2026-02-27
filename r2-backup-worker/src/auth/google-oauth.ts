/**
 * Google OAuth2 Authentication for Firebase REST APIs (PRD §4.8.1)
 *
 * Mints OAuth2 access tokens from a Google Cloud Service Account JSON key.
 * Tokens are used for BOTH Firebase RTDB REST API and Firestore REST API.
 *
 * Flow: Service Account JSON → JWT → Google OAuth2 token endpoint → Access token (1h expiry)
 */

import { SignJWT, importPKCS8 } from 'jose';

const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
    'https://www.googleapis.com/auth/firebase.database',
    'https://www.googleapis.com/auth/datastore',
    'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

interface ServiceAccountKey {
    client_email: string;
    private_key: string;
}

interface OAuth2TokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

/**
 * Mint a fresh OAuth2 access token from a Service Account JSON key.
 *
 * 1. Parse the SA JSON to extract client_email and private_key
 * 2. Create a JWT with the required claims
 * 3. Sign the JWT using RS256
 * 4. POST to Google OAuth2 token endpoint
 * 5. Return the access_token
 */
export async function getFirebaseAccessToken(saKeyJson: string): Promise<string> {
    // 1. Parse Service Account key
    let saKey: ServiceAccountKey;
    try {
        saKey = JSON.parse(saKeyJson);
    } catch (err: unknown) {
        throw new Error(`Failed to parse SA key JSON (length: ${saKeyJson?.length}): ${err instanceof Error ? err.message : err}`);
    }

    if (!saKey.client_email || !saKey.private_key) {
        throw new Error(`SA key missing fields. Has client_email: ${!!saKey.client_email}, has private_key: ${!!saKey.private_key}, private_key length: ${saKey.private_key?.length}`);
    }

    // 2. Import the private key for signing
    let privateKey;
    try {
        privateKey = await importPKCS8(saKey.private_key, 'RS256');
    } catch (err: unknown) {
        throw new Error(`importPKCS8 failed: ${err instanceof Error ? err.message : err}. Key starts with: "${saKey.private_key.slice(0, 30)}"`);
    }

    // 3. Create and sign the JWT
    const now = Math.floor(Date.now() / 1000);
    const signedJwt = await new SignJWT({
        iss: saKey.client_email,
        sub: saKey.client_email,
        aud: OAUTH2_TOKEN_URL,
        iat: now,
        exp: now + 3600,
        scope: SCOPES,
    })
        .setProtectedHeader({ alg: 'RS256' })
        .sign(privateKey);

    // 4. Exchange JWT for OAuth2 access token
    const response = await fetch(OAUTH2_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth2 token request failed (${response.status}): ${errorText}`);
    }

    const tokenData: OAuth2TokenResponse = await response.json();
    return tokenData.access_token;
}

/**
 * Token cache that refreshes automatically when remaining validity < 5 minutes.
 * Prevents mid-backup token expiry (PRD §4.8.1).
 */
export class TokenCache {
    private cachedToken: string | null = null;
    private expiresAt = 0; // Unix ms
    private saKeyJson: string;

    constructor(saKeyJson: string) {
        this.saKeyJson = saKeyJson;
    }

    /**
     * Get a valid access token, refreshing if within 5 minutes of expiry.
     */
    async getToken(): Promise<string> {
        const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

        if (this.cachedToken && Date.now() < this.expiresAt - REFRESH_BUFFER_MS) {
            return this.cachedToken;
        }

        // Mint a fresh token
        this.cachedToken = await getFirebaseAccessToken(this.saKeyJson);
        // OAuth2 tokens are valid for 1 hour (3600 seconds)
        this.expiresAt = Date.now() + 3600 * 1000;
        return this.cachedToken;
    }
}
