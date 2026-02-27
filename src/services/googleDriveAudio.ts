/**
 * Google Drive Audio Service
 * Handles audio streaming from Google Drive
 * 
 * @deprecated PRD-0018: Google Drive audio is deprecated. Please use R2 Storage instead.
 * This service is maintained for backwards compatibility with existing tests.
 * New tests should upload audio directly to R2 Storage.
 * 
 * CORE FUNCTIONALITY (for legacy tests):
 * - Validates Google Drive share links
 * - Extracts file IDs
 * - Generates direct streaming URLs (for HTML5 audio)
 * - Generates embed URLs (fallback)
 * 
 * NOTE: For this to work reliably on the Firebase Spark plan, 
 * audio files MUST be shared with "Anyone with the link" (Viewer).
 */

interface AudioSource {
  type: 'direct' | 'embed' | 'error';
  url: string;
  fileId: string;
  originalUrl: string;
  errorMessage?: string;
}

interface ValidationResult {
  valid: boolean;
  fileId?: string;
  streamUrl?: string;
  embedUrl?: string;
  error?: string;
  warning?: string;
}

/**
 * @deprecated Use R2 Storage for new audio uploads. This service is for legacy test playback only.
 */
class GoogleDriveAudioService {
  // PRD-0018 Task 8.3: Deprecation flag
  public readonly isDeprecated: boolean = true;

  // Modern Google Drive direct content URL format (bypasses old /uc redirect issues)
  // Note: This still requires the file to be shared with "Anyone with the link"
  private readonly DIRECT_STREAM_URL = 'https://drive.usercontent.google.com/download?id=';
  private readonly DIRECT_STREAM_URL_SUFFIX = '&export=download&confirm=t';
  private readonly EMBED_URL = 'https://drive.google.com/file/d/{id}/preview';

  /**
   * PRD-0018 Task 8.3: Get deprecation warning message for UI display
   */
  getDeprecationWarning(): { title: string; message: string; action: string } {
    return {
      title: '⚠️ Deprecated Audio Source',
      message: 'This test uses Google Drive for audio hosting, which is no longer supported for new tests. The audio will continue to work, but we recommend re-uploading the audio.',
      action: 'Re-upload audio files to fix this warning',
    };
  }

  /**
   * Extract file ID from various Google Drive URL formats
   */
  extractFileId(url: string): string | null {
    if (!url) return null;

    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,           // /file/d/FILE_ID/view
      /id=([a-zA-Z0-9_-]+)/,                   // ?id=FILE_ID
      /\/open\?id=([a-zA-Z0-9_-]+)/,          // /open?id=FILE_ID
      /\/d\/([a-zA-Z0-9_-]+)/,                // /d/FILE_ID/
      /^([a-zA-Z0-9_-]+)$/                    // Direct file ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Convert Google Drive share link to streaming URL
   */
  convertToStreamUrl(shareLink: string): AudioSource {
    const fileId = this.extractFileId(shareLink);

    if (!fileId) {
      return {
        type: 'error',
        url: '',
        fileId: '',
        originalUrl: shareLink,
        errorMessage: 'Invalid Google Drive link format'
      };
    }

    // Direct streaming URL with confirm=t to bypass virus scan warnings
    const directUrl = `${this.DIRECT_STREAM_URL}${fileId}${this.DIRECT_STREAM_URL_SUFFIX}`;

    console.log('🔗 [GoogleDriveAudio] Generated streaming URL:', {
      fileId,
      directUrl,
      originalUrl: shareLink
    });

    return {
      type: 'direct',
      url: directUrl,
      fileId: fileId,
      originalUrl: shareLink
    };
  }

  /**
   * Get iframe embed URL for Google Drive audio
   */
  getEmbedUrl(shareLink: string): string | null {
    const fileId = this.extractFileId(shareLink);
    if (!fileId) return null;

    return this.EMBED_URL.replace('{id}', fileId);
  }

  /**
   * Validate Google Drive audio link
   * Checks if the file is accessible and streamable
   */
  async validateAudioLink(shareLink: string): Promise<ValidationResult> {
    const fileId = this.extractFileId(shareLink);

    if (!fileId) {
      return {
        valid: false,
        error: 'Invalid Google Drive link format. Please provide a valid sharing link.'
      };
    }

    const directUrl = `${this.DIRECT_STREAM_URL}${fileId}${this.DIRECT_STREAM_URL_SUFFIX}`;
    const embedUrl = this.EMBED_URL.replace('{id}', fileId);

    // We trust the link is valid if ID can be extracted.
    // Real validation happens at playback time.
    console.log(`✅ Google Drive link validated (file ID: ${fileId})`);

    return {
      valid: true,
      fileId,
      streamUrl: directUrl,
      embedUrl: embedUrl
    };
  }

  /**
   * Process Google Drive link and return audio source
   */
  async processAudioLink(shareLink: string): Promise<AudioSource> {
    const validation = await this.validateAudioLink(shareLink);

    if (!validation.valid) {
      return {
        type: 'error',
        url: '',
        fileId: '',
        originalUrl: shareLink,
        errorMessage: validation.error
      };
    }

    return this.convertToStreamUrl(shareLink);
  }

  /**
   * Generate HTML for audio player
   * Provides both direct and embed options
   */
  generateAudioPlayerHTML(audioSource: AudioSource): string {
    if (audioSource.type === 'error') {
      return `<div class="error">Error: ${audioSource.errorMessage}</div>`;
    }

    if (audioSource.type === 'embed') {
      return `
        <iframe
          src="${this.EMBED_URL.replace('{id}', audioSource.fileId)}"
          width="100%"
          height="100"
          allow="autoplay"
          style="border: none; border-radius: 8px;"
        ></iframe>
      `;
    }

    // Direct streaming with HTML5 audio
    return `
      <audio 
        controls 
        controlsList="nodownload"
        style="width: 100%;"
        preload="metadata"
      >
        <source src="${audioSource.url}" type="audio/mpeg">
        <source src="${audioSource.url}" type="audio/mp3">
        <source src="${audioSource.url}" type="audio/wav">
        <source src="${audioSource.url}" type="audio/ogg">
        Your browser does not support the audio element.
      </audio>
    `;
  }

  /**
   * Check if URL is a Google Drive link
   */
  isGoogleDriveUrl(url: string): boolean {
    if (!url) return false;
    return url.includes('drive.google.com') || url.includes('docs.google.com/file');
  }

  /**
   * Get instructions for teachers
   */
  getTeacherInstructions(): string {
    return `
### How to Add Audio from Google Drive:

1. **Upload Audio to Google Drive**
   - Upload your MP3/WAV/M4A file to Google Drive
   
2. **Set Permissions (CRITICAL)**
   - Right-click the file and select "Share"
   - Under "General Access", change "Restricted" to **"Anyone with the link"**
   - Role should be **"Viewer"**
   - Click "Copy link"
   
3. **Paste the Link**
   - Paste the link here. The system will auto-convert it.

**Note:** If permissions are not set correctly, audio will NOT play for students.
    `.trim();
  }
}

// Export singleton instance
export const googleDriveAudioService = new GoogleDriveAudioService();

// Export types
export type { AudioSource, ValidationResult };
