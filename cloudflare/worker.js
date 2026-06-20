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

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/move' && request.method === 'POST') {
        const { sourceKey, destKey } = await request.json();

        if (!sourceKey || !destKey) {
          return new Response(JSON.stringify({ error: 'sourceKey and destKey required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const sourceObject = await env.R2_BUCKET.get(sourceKey);

        if (!sourceObject) {
          return new Response(JSON.stringify({ error: 'Source file not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await env.R2_BUCKET.put(destKey, sourceObject.body, {
          httpMetadata: sourceObject.httpMetadata,
          customMetadata: sourceObject.customMetadata,
        });

        await env.R2_BUCKET.delete(sourceKey);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Moved ${sourceKey} to ${destKey}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (request.method === 'POST') {
        const filename = url.searchParams.get('filename');

        if (!filename) {
          return new Response(JSON.stringify({ error: 'Filename required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const key = filename;
        const uploadUrl = `${url.origin}?key=${encodeURIComponent(key)}`;

        return new Response(JSON.stringify({ key, uploadUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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
