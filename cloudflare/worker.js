import { AwsClient } from 'aws4fetch';
export default {
  async fetch(request, env) {
    // 1. CORS Headers (Allow your app to call this)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PUT, POST, GET, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    // 2. Validate Request - only POST allowed for all routes
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }
    
    // 3. Setup AWS Client (R2 uses S3 API)
    const r2 = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      region: 'auto',
    });
    
    const url = new URL(request.url);
    const bucketUrl = `https://${env.BUCKET_NAME}.${env.ACCOUNT_ID}.r2.cloudflarestorage.com`;
    
    // ========================================
    // ROUTE: /move - Move file from temp to permanent storage
    // ========================================
    if (url.pathname === '/move') {
      try {
        const body = await request.json();
        const { sourceKey, destKey } = body;
        
        if (!sourceKey || !destKey) {
          return new Response(
            JSON.stringify({ error: 'Missing sourceKey or destKey' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Step 1: Copy the object to new location
        const copyResponse = await r2.fetch(`${bucketUrl}/${destKey}`, {
          method: 'PUT',
          headers: {
            'x-amz-copy-source': `/${env.BUCKET_NAME}/${sourceKey}`,
          },
        });
        
        if (!copyResponse.ok) {
          const errorText = await copyResponse.text();
          console.error('Copy failed:', errorText);
          return new Response(
            JSON.stringify({ error: 'Failed to copy file', details: errorText }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Step 2: Delete the original file
        const deleteResponse = await r2.fetch(`${bucketUrl}/${sourceKey}`, {
          method: 'DELETE',
        });
        
        if (!deleteResponse.ok) {
          console.warn('Delete of source file failed (file was copied successfully)');
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            sourceKey,
            destKey,
            newUrl: `https://pub-${env.BUCKET_ID}.r2.dev/${destKey}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Move error:', error);
        return new Response(
          JSON.stringify({ error: 'Move operation failed', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // ========================================
    // ROUTE: Default - Generate Presigned Upload URL
    // ========================================
    const filename = url.searchParams.get('filename'); // e.g., "temp/listening-audio/1234-file.mp3"
    
    if (!filename) return new Response('Missing filename', { status: 400, headers: corsHeaders });
    
    // Use the filename path as-is from frontend (already includes temp/ prefix and folder structure)
    // Frontend sends: "temp/listening-audio/1234-file.mp3"
    // We use it directly instead of wrapping it in uploads/timestamp-
    const key = filename;
    
    // Create the signed URL for the Frontend to upload to
    const signedUrl = await r2.sign(
      `${bucketUrl}/${key}`,
      {
        method: 'PUT',
        aws: { signQuery: true },
      }
    );
    // Return the package
    return new Response(
      JSON.stringify({
        key: key,
        uploadUrl: signedUrl.url, // The secure URL to upload to
        publicUrl: `https://pub-${env.BUCKET_ID}.r2.dev/${key}` // Direct access URL
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  },
};