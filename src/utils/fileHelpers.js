/**
 * File Helper Utilities
 * Provides functions for reading files in different formats
 */

/**
 * Read a file as text
 * @param {File} file - The file to read
 * @returns {Promise<string>} - Promise that resolves with the file content as text
 */
export const readAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = (error) => {
      reject(new Error(`Error reading file as text: ${error.message}`));
    };
    
    reader.readAsText(file);
  });
};

/**
 * Read a file as ArrayBuffer
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} - Promise that resolves with the file content as ArrayBuffer
 */
export const readAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = (error) => {
      reject(new Error(`Error reading file as ArrayBuffer: ${error.message}`));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Read a file as Data URL (useful for images)
 * @param {File} file - The file to read
 * @returns {Promise<string>} - Promise that resolves with the file content as Data URL
 */
export const readAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      resolve(event.target.result);
    };
    
    reader.onerror = (error) => {
      reject(new Error(`Error reading file as Data URL: ${error.message}`));
    };
    
    reader.readAsDataURL(file);
  });
};

/**
 * Get file metadata
 * @param {File} file - The file to get metadata from
 * @returns {Object} - Object containing file metadata
 */
export const getFileMetadata = (file) => {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    lastModifiedDate: new Date(file.lastModified),
    sizeInMB: (file.size / (1024 * 1024)).toFixed(2),
    sizeInKB: (file.size / 1024).toFixed(2)
  };
};

/**
 * Format file size to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};
