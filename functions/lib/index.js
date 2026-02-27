"use strict";
/**
 * Firebase Cloud Functions - Audio Proxy
 *
 * This function proxies audio requests from Google Drive,
 * adding the necessary CORS headers so the browser can
 * use native HTML5 <audio> elements with full JavaScript control.
 *
 * Why this is needed:
 * - Google Drive doesn't send CORS headers for audio files
 * - Without CORS, browsers block direct <audio src="..."> usage
 * - Falls back to iframe embed (no JS control)
 * - With this proxy, we get: play(), pause(), onended, volume control
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = exports.audioProxy = void 0;
const functions = require("firebase-functions");
const node_fetch_1 = require("node-fetch");
// Allowed origins for CORS (add your domains here)
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://kahut1.web.app',
    'https://kahut1.firebaseapp.com',
];
/**
 * Audio Proxy Function
 *
 * Usage: https://your-project.cloudfunctions.net/audioProxy?id=GOOGLE_DRIVE_FILE_ID
 *
 * This streams the audio file from Google Drive through our server,
 * adding CORS headers so the client can use it with HTML5 Audio API.
 */
exports.audioProxy = functions.https.onRequest(async (req, res) => {
    // Handle CORS preflight
    const origin = req.headers.origin || '';
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || origin.includes('localhost');
    // Set CORS headers
    if (isAllowedOrigin) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    else {
        res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    // Handle OPTIONS preflight request
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    // Only allow GET requests
    if (req.method !== 'GET') {
        res.status(405).send('Method not allowed');
        return;
    }
    // Get file ID from query parameter
    const fileId = req.query.id;
    if (!fileId) {
        res.status(400).json({
            error: 'Missing file ID',
            usage: '/audioProxy?id=YOUR_GOOGLE_DRIVE_FILE_ID'
        });
        return;
    }
    // Validate file ID format (basic check)
    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        res.status(400).json({ error: 'Invalid file ID format' });
        return;
    }
    try {
        // Google Drive direct download URL
        // This works for files shared with "Anyone with the link"
        const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        console.log(`Proxying audio: ${fileId}`);
        // Fetch from Google Drive
        // Pass through Range header for seeking support
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }
        const response = await (0, node_fetch_1.default)(driveUrl, { headers });
        // Check if we got a redirect (Google sometimes does this)
        if (response.status >= 400) {
            console.error(`Google Drive returned ${response.status}`);
            res.status(response.status).json({
                error: 'Failed to fetch audio from Google Drive',
                hint: 'Make sure the file is shared with "Anyone with the link"'
            });
            return;
        }
        // Set response headers
        res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
        res.set('Accept-Ranges', 'bytes');
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            res.set('Content-Length', contentLength);
        }
        const contentRange = response.headers.get('content-range');
        if (contentRange) {
            res.set('Content-Range', contentRange);
            res.status(206); // Partial content
        }
        else {
            res.status(200);
        }
        // Cache the audio for 1 hour to reduce repeated requests
        res.set('Cache-Control', 'public, max-age=3600');
        // Stream the response body to client
        if (response.body) {
            response.body.pipe(res);
        }
        else {
            // Fallback: buffer the response
            const buffer = await response.buffer();
            res.send(buffer);
        }
    }
    catch (error) {
        console.error('Audio proxy error:', error);
        res.status(500).json({
            error: 'Failed to proxy audio',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * Health check endpoint
 */
exports.healthCheck = functions.https.onRequest((req, res) => {
    res.json({
        status: 'ok',
        service: 'audio-proxy',
        timestamp: new Date().toISOString()
    });
});
//# sourceMappingURL=index.js.map