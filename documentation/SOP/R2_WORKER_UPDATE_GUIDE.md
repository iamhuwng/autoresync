# Cloudflare Worker Update Guide - Smart Cleanup Support

## Step 1: Update Your Worker Code

Replace your current worker code at **r2-upload-signer** with the following:

```javascript
/**
 * R2 Upload Worker with Smart Cleanup Support
 * 
 * Features:
 * - Upload files to R2 bucket
 * - Move files from temp/ to permanent storage
 * - Proper CORS handling
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    
    try {
      // ============================================
      // MOVE ENDPOINT - Move file from temp to permanent
      // ============================================
      if (url.pathname === '/move' && request.method === 'POST') {
        const { sourceKey, destKey } = await request.json();
        
        if (!sourceKey || !destKey) {
          return new Response(JSON.stringify({ error: 'sourceKey and destKey required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get the source file
        const sourceObject = await env.R2_BUCKET.get(sourceKey);
        
        if (!sourceObject) {
          return new Response(JSON.stringify({ error: 'Source file not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Copy to destination
        await env.R2_BUCKET.put(destKey, sourceObject.body, {
          httpMetadata: sourceObject.httpMetadata,
          customMetadata: sourceObject.customMetadata,
        });

        // Delete the source (temp) file
        await env.R2_BUCKET.delete(sourceKey);

        return new Response(JSON.stringify({ 
          success: true, 
          message: `Moved ${sourceKey} to ${destKey}` 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // UPLOAD ENDPOINT - Get upload URL and upload file
      // ============================================
      if (request.method === 'POST') {
        const filename = url.searchParams.get('filename');
        
        if (!filename) {
          return new Response(JSON.stringify({ error: 'Filename required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Return the upload info - client will PUT to this same worker
        const key = filename;
        const uploadUrl = `${url.origin}?key=${encodeURIComponent(key)}`;

        return new Response(JSON.stringify({ key, uploadUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // PUT ENDPOINT - Actual file upload
      // ============================================
      if (request.method === 'PUT') {
        const key = url.searchParams.get('key');
        
        if (!key) {
          return new Response('Key required', { status: 400, headers: corsHeaders });
        }

        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        
        await env.R2_BUCKET.put(key, request.body, {
          httpMetadata: { contentType },
        });

        const publicUrl = `${env.PUBLIC_URL}/${key}`;

        return new Response(JSON.stringify({ success: true, url: publicUrl, key }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response('Method not allowed', { status: 405, headers: corsHeaders });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
```

## Step 2: Deploy the Updated Worker

1. Go to **Cloudflare Dashboard** > **Workers & Pages**
2. Click on your **r2-upload-signer** worker
3. Click **Edit code**
4. Replace ALL the code with the code above
5. Click **Save and deploy**

## Step 3: Configure R2 Lifecycle Rule

This is the critical step that enables auto-cleanup of unused temp files:

1. Go to **Cloudflare Dashboard** > **R2** > **kahoot-media** bucket
2. Click the **Settings** tab
3. Scroll to **Object lifecycle rules**
4. Click **Add rule**
5. Configure:
   - **Rule name**: `Delete temp files after 24h`
   - **Prefix filter**: `temp/`
   - **Action**: `Delete objects`
   - **Days after upload**: `1` (24 hours)
6. Click **Save**

## How It Works

1. **User uploads audio** → File goes to `temp/audio/123-file.mp3`
2. **User saves test** → File moves to `audio/123-file.mp3`
3. **User abandons test** → File stays in `temp/` and gets auto-deleted after 24 hours

This saves storage costs by automatically cleaning up unused uploads!

## Testing

After deploying, test the move endpoint:

```bash
curl -X POST https://r2-upload-signer.iamhuwng.workers.dev/move \
  -H "Content-Type: application/json" \
  -d '{"sourceKey": "temp/test.txt", "destKey": "permanent/test.txt"}'
```
