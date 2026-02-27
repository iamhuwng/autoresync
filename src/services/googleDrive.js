/**
 * Google Drive Service
 * Handles image uploads to Google Drive using Google API
 */

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const TOKEN_STORAGE_KEY = 'google_drive_access_token';
const TOKEN_EXPIRY_KEY = 'google_drive_token_expiry';

class GoogleDriveService {
  constructor() {
    this.gapiInited = false;
    this.gisInited = false;
    this.tokenClient = null;
    this.accessToken = null;
    this.initPromise = null;
    
    // Restore token from sessionStorage on instantiation
    this._restoreToken();
  }
  
  /**
   * Restore token from sessionStorage if valid
   */
  _restoreToken() {
    try {
      const savedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      const savedExpiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
      
      if (savedToken && savedExpiry) {
        const expiryTime = parseInt(savedExpiry, 10);
        const now = Date.now();
        
        // Check if token is still valid (with 5 min buffer)
        if (expiryTime > now + 5 * 60 * 1000) {
          this.accessToken = savedToken;
          console.log('🔐 Restored Google Drive token from session (expires in', Math.round((expiryTime - now) / 60000), 'min)');
        } else {
          // Token expired or about to expire, clear it
          this._clearStoredToken();
          console.log('🔐 Stored Google Drive token expired, cleared');
        }
      }
    } catch (e) {
      console.warn('Failed to restore Google Drive token:', e);
    }
  }
  
  /**
   * Save token to sessionStorage
   */
  _saveToken(token, expiresIn = 3600) {
    try {
      const expiryTime = Date.now() + (expiresIn * 1000);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      sessionStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      console.log('🔐 Saved Google Drive token (expires in', expiresIn / 60, 'min)');
    } catch (e) {
      console.warn('Failed to save Google Drive token:', e);
    }
  }
  
  /**
   * Clear stored token
   */
  _clearStoredToken() {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch (e) {
      console.warn('Failed to clear Google Drive token:', e);
    }
  }
  
  /**
   * Check if we have a valid token
   */
  hasValidToken() {
    if (!this.accessToken) return false;
    
    try {
      const savedExpiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
      if (savedExpiry) {
        const expiryTime = parseInt(savedExpiry, 10);
        return expiryTime > Date.now() + 60 * 1000; // 1 min buffer
      }
    } catch (e) {
      // Ignore
    }
    
    return !!this.accessToken;
  }

  /**
   * Initialize Google Drive API
   */
  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  /**
   * Internal initialization logic
   */
  async _doInitialize() {
    try {
      // Validate required environment variables
      const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
      const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;

      if (!apiKey || !clientId) {
        throw new Error(
          'Google Drive credentials not configured.\n\n' +
          'Setup instructions:\n' +
          '1. Go to https://console.cloud.google.com/\n' +
          '2. Create/select a project\n' +
          '3. Enable Google Drive API\n' +
          '4. Create API Key (Credentials > Create Credentials > API Key)\n' +
          '5. Create OAuth 2.0 Client ID (Web application)\n' +
          '6. Add to .env file:\n' +
          '   VITE_GOOGLE_API_KEY=your_api_key\n' +
          '   VITE_GOOGLE_DRIVE_CLIENT_ID=your_client_id.apps.googleusercontent.com'
        );
      }

      // Load Google API script
      await this.loadScript('https://apis.google.com/js/api.js');
      await this.loadScript('https://accounts.google.com/gsi/client');

      // Initialize gapi
      await new Promise((resolve) => {
        window.gapi.load('client', resolve);
      });

      // Initialize Google API client with manual discovery doc loading to avoid 502 errors
      const maxRetries = 3;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔧 Initializing Google API client... (Attempt ${attempt}/${maxRetries})`);
          console.log('API Key present:', !!apiKey);
          console.log('Discovery doc:', DISCOVERY_DOC);
          
          // FIX: Manually load discovery document using direct fetch (avoids 502 errors)
          console.log('📥 Loading discovery document manually...');
          const discoveryResponse = await fetch(DISCOVERY_DOC);
          if (!discoveryResponse.ok) {
            throw new Error(`Discovery doc fetch failed: ${discoveryResponse.status} ${discoveryResponse.statusText}`);
          }
          const discoveryDoc = await discoveryResponse.json();
          console.log('✅ Discovery document loaded successfully');
          
          // Initialize gapi.client with the manually loaded discovery doc
          await window.gapi.client.init({
            apiKey: apiKey,
          });
          
          // Load the Drive API using the discovery document
          await window.gapi.client.load(discoveryDoc);
          
          console.log('✅ Google API client initialized successfully');
          lastError = null; // Success, clear error
          break; // Exit retry loop on success
          
        } catch (initError) {
          lastError = initError;
          console.error(`❌ Google API init error (Attempt ${attempt}/${maxRetries}):`, initError);
          console.error('Error details:', {
            message: initError.message,
            result: initError.result,
            status: initError.status
          });
          
          // If not the last attempt and it's a network error, wait before retrying
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
            console.log(`⏳ Retrying in ${waitTime/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      // If all retries failed, throw appropriate error
      if (lastError) {
        console.error('❌ All retry attempts failed');
        console.error('Final error object:', lastError);
        
        // Extract error message from various possible formats
        const errorMsg = lastError.message || 
                        lastError.error || 
                        (lastError.result && lastError.result.error && lastError.result.error.message) ||
                        JSON.stringify(lastError);
        
        // Check if it's a discovery doc or API initialization error
        const isDiscoveryError = errorMsg.toLowerCase().includes('discovery') || 
                                errorMsg.toLowerCase().includes('missing required fields') ||
                                errorMsg.toLowerCase().includes('failed to load');
        
        if (isDiscoveryError) {
          throw new Error(
            'Google API initialization failed after 3 attempts.\n\n' +
            'This usually happens when:\n' +
            '1. Google API servers are temporarily down (502/503 errors)\n' +
            '2. Network/firewall blocking Google API requests\n' +
            '3. Browser extensions (ad blockers) interfering\n' +
            '4. CORS/CSP issues\n' +
            '5. API Key restrictions too strict\n' +
            '6. Invalid or expired API Key\n\n' +
            'Quick fixes:\n' +
            '- Hard reload the page (Ctrl+Shift+R or Cmd+Shift+R)\n' +
            '- Disable browser extensions temporarily\n' +
            '- Check browser console for network errors (look for 502/503 status codes)\n' +
            '- Clear browser cache\n' +
            '- Verify API key has no domain restrictions in Google Cloud Console\n' +
            '- Try a different network or browser\n\n' +
            'Original error: ' + errorMsg
          );
        }
        
        throw new Error(
          'Failed to initialize Google Drive API after 3 attempts.\n\n' +
          'Possible causes:\n' +
          '1. Google API servers temporarily unavailable\n' +
          '2. Invalid API Key\n' +
          '3. Google Drive API not enabled in your Google Cloud project\n' +
          '4. API Key restrictions blocking this domain\n\n' +
          'Quick fixes:\n' +
          '- Hard reload the page (Ctrl+Shift+R or Cmd+Shift+R)\n' +
          '- Check Google Cloud Console settings\n' +
          '- Verify Google Drive API is enabled\n' +
          '- Try a different network or browser\n\n' +
          'Original error: ' + errorMsg
        );
      }

      this.gapiInited = true;

      // Initialize Google Identity Services
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: '', // defined later
      });

      this.gisInited = true;
      
      // CRITICAL: If we have a restored token, set it on gapi.client so API calls work
      if (this.accessToken) {
        window.gapi.client.setToken({ access_token: this.accessToken });
        console.log('🔐 Set restored token on gapi.client');
      }

      console.log('Google Drive service initialized successfully');
    } catch (error) {
      console.error('Google Drive initialization error:', error);
      this.gapiInited = false;
      this.gisInited = false;
      // CRITICAL FIX: Reset initPromise so subsequent calls can retry
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Load external script
   */
  loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Request access token
   */
  async requestAccessToken() {
    return new Promise((resolve, reject) => {
      try {
        let timeoutId;
        let popupCheckInterval;
        let isResolved = false;

        // Cleanup function to reset state
        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (popupCheckInterval) clearInterval(popupCheckInterval);
          isResolved = true;
        };

        // Set up the callback
        this.tokenClient.callback = async (response) => {
          if (isResolved) return; // Ignore if already resolved/rejected
          
          cleanup();
          
          if (response.error !== undefined) {
            console.error('OAuth error:', response.error);
            // Reset callback for retry
            this.tokenClient.callback = null;
            reject(new Error(`Google authentication failed: ${response.error}`));
            return;
          }
          
          this.accessToken = response.access_token;
          // Save token with expiry (default 1 hour, use response.expires_in if available)
          this._saveToken(response.access_token, response.expires_in || 3600);
          console.log('✅ Access token received');
          resolve(response.access_token);
        };

        // Detect if popup was blocked (timeout after 500ms of no response)
        timeoutId = setTimeout(() => {
          if (!isResolved) {
            cleanup();
            // Reset callback for retry
            this.tokenClient.callback = null;
            const error = new Error(
              'Google sign-in popup may have been blocked.\n\n' +
              'Please try again. If the popup doesn\'t appear:\n' +
              '1. Check if your browser blocked the popup (look for a blocked popup icon in the address bar)\n' +
              '2. Allow popups for this site\n' +
              '3. Close any open file chooser dialogs\n' +
              '4. Try clicking the upload button again'
            );
            reject(error);
          }
        }, 30000); // 30 second timeout

        // Request access token
        console.log('🔐 Requesting Google authentication...');
        if (this.accessToken === null) {
          // Prompt the user to select a Google Account and ask for consent
          this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          // Skip display of account chooser and consent dialog
          this.tokenClient.requestAccessToken({ prompt: '' });
        }
        
        console.log('⏳ Waiting for user to complete authentication...');
      } catch (err) {
        console.error('❌ Token request error:', err);
        // Reset callback for retry
        this.tokenClient.callback = null;
        reject(err);
      }
    });
  }

  /**
   * Upload image file to Google Drive
   * @param {File} file - Image file to upload
   * @param {string} folderName - Optional folder name (default: 'Quiz Passages')
   * @returns {Promise<{fileId: string, webViewLink: string, webContentLink: string}>}
   */
  async uploadImage(file, folderName = 'Quiz Passages') {
    try {
      // Initialize if needed
      await this.initialize();

      // Request access token if needed
      if (!this.accessToken) {
        await this.requestAccessToken();
      }

      // Create or get folder
      const folderId = await this.createOrGetFolder(folderName);

      // Create file metadata
      const metadata = {
        name: file.name,
        mimeType: file.type,
        parents: [folderId],
      };

      // Create form data
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);

      // Upload file
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
        method: 'POST',
        headers: new Headers({ Authorization: 'Bearer ' + this.accessToken }),
        body: form,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Make file publicly accessible
      console.log('🔓 Making file public...');
      await this.makeFilePublic(result.id);
      console.log('✅ File is now public');

      // Get public URL - use thumbnail format which has better browser compatibility
      const publicUrl = `https://drive.google.com/thumbnail?id=${result.id}&sz=w1000`;
      const directUrl = `https://drive.google.com/uc?export=view&id=${result.id}`;
      
      console.log('✅ Image uploaded successfully');
      console.log('📷 Public URL:', publicUrl);
      console.log('📷 Direct URL:', directUrl);
      console.log('📷 File ID:', result.id);

      return {
        fileId: result.id,
        url: publicUrl, // Use thumbnail URL for better compatibility
        directUrl: directUrl, // Backup direct URL
        webViewLink: result.webViewLink,
        webContentLink: result.webContentLink,
        fileName: result.name
      };
    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  }

  /**
   * Upload audio file to Google Drive
   * @param {File} file - Audio file to upload (MP3, WAV, M4A, etc.)
   * @param {string} folderName - Optional folder name (default: 'Listening Test Audio')
   * @param {Function} onProgress - Optional progress callback (percent: number, bytesUploaded: number, totalBytes: number) => void
   * @returns {Promise<{fileId: string, url: string, directUrl: string, webViewLink: string}>}
   */
  async uploadAudio(file, folderName = 'Listening Test Audio', onProgress = null) {
    try {
      // Initialize if needed
      await this.initialize();

      // Request access token if needed
      if (!this.accessToken) {
        await this.requestAccessToken();
      }

      // Create or get folder
      const folderId = await this.createOrGetFolder(folderName);

      // Create file metadata
      const metadata = {
        name: file.name,
        mimeType: file.type || 'audio/mpeg', // Default to MP3 if type not specified
        parents: [folderId],
      };

      // Create form data
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);

      // Upload file with progress tracking
      console.log('📤 Uploading audio file to Google Drive...');
      
      // Use XMLHttpRequest for progress tracking
      const uploadPromise = new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        if (onProgress) {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(percent, e.loaded, e.total);
            }
          });
        }
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              reject(new Error('Failed to parse response'));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink');
        xhr.setRequestHeader('Authorization', 'Bearer ' + this.accessToken);
        xhr.send(form);
      });
      
      const result = await uploadPromise;

      // Make file publicly accessible
      console.log('🔓 Making audio file public...');
      await this.makeFilePublic(result.id);
      console.log('✅ Audio file is now public');

      // Get streaming URL for audio playback
      const streamUrl = `https://drive.google.com/uc?export=download&id=${result.id}`;
      const viewUrl = `https://drive.google.com/file/d/${result.id}/view?usp=sharing`;
      
      console.log('✅ Audio uploaded successfully');
      console.log('🎵 Stream URL:', streamUrl);
      console.log('🎵 View URL:', viewUrl);
      console.log('🎵 File ID:', result.id);

      return {
        fileId: result.id,
        url: viewUrl, // Shareable link (for pasting in form)
        streamUrl: streamUrl, // Direct streaming URL (for audio player)
        directUrl: streamUrl, // Alias for compatibility
        webViewLink: result.webViewLink,
        webContentLink: result.webContentLink,
        fileName: result.name
      };
    } catch (error) {
      console.error('❌ Audio upload error:', error);
      throw error;
    }
  }

  /**
   * Create folder or get existing folder ID
   */
  async createOrGetFolder(folderName) {
    try {
      // Search for existing folder
      const response = await window.gapi.client.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });

      if (response.result.files && response.result.files.length > 0) {
        // Folder exists
        return response.result.files[0].id;
      }

      // Create new folder
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };

      const createResponse = await window.gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
      });

      return createResponse.result.id;
    } catch (error) {
      console.error('Error creating/getting folder:', error);
      throw error;
    }
  }

  /**
   * Make file publicly accessible
   */
  async makeFilePublic(fileId) {
    try {
      await window.gapi.client.drive.permissions.create({
        fileId: fileId,
        resource: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (error) {
      console.error('Error making file public:', error);
      throw error;
    }
  }

  /**
   * Revoke access token
   */
  revokeToken() {
    if (this.accessToken) {
      window.google.accounts.oauth2.revoke(this.accessToken, () => {
        console.log('Access token revoked');
      });
      this.accessToken = null;
    }
  }
}

// Create singleton instance
const googleDriveService = new GoogleDriveService();

export default googleDriveService;
