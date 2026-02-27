/**
 * Session Code Service
 * Handles generation, validation, and uniqueness checking of session codes
 */

import { ref, get } from 'firebase/database';
import { database } from './firebase';

// Configuration
const CODE_LENGTH = 6;
const CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // 36 characters
const MAX_COLLISION_RETRIES = 5;

/**
 * Generate a random 6-character alphanumeric session code
 * Format: ABC123 (uppercase letters and numbers)
 * 
 * @returns {string} A random 6-character code (e.g., "ABC123")
 */
export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * CODE_CHARSET.length);
    code += CODE_CHARSET[randomIndex];
  }
  return code;
}

/**
 * Validate session code format
 * Rules:
 * - Exactly 6 characters
 * - Only uppercase letters (A-Z) and digits (0-9)
 * - No spaces or special characters
 * 
 * @param {string} code - The code to validate
 * @returns {boolean} True if valid format, false otherwise
 */
export function validateCode(code) {
  if (!code || typeof code !== 'string') {
    return false;
  }
  
  // Check length
  if (code.length !== CODE_LENGTH) {
    return false;
  }
  
  // Check characters (only A-Z and 0-9)
  const validPattern = /^[A-Z0-9]+$/;
  return validPattern.test(code);
}

/**
 * Check if a session code already exists in Firebase
 * Queries the game_sessions node to see if code is taken
 * 
 * @param {string} code - The code to check
 * @returns {Promise<boolean>} True if code is unique (not taken), false if already exists
 * @throws {Error} If Firebase query fails
 */
export async function checkCodeUniqueness(code) {
  try {
    // Query Firebase to check if this code exists
    const sessionRef = ref(database, `game_sessions/${code}`);
    const snapshot = await get(sessionRef);
    
    // Code is unique if snapshot doesn't exist
    return !snapshot.exists();
  } catch (error) {
    console.error('Error checking code uniqueness:', error);
    throw new Error('Failed to check session code uniqueness');
  }
}

/**
 * Generate a unique session code with collision handling
 * Keeps generating codes until a unique one is found
 * 
 * @param {number} maxRetries - Maximum retry attempts (default: 5)
 * @returns {Promise<string>} A guaranteed unique session code
 * @throws {Error} If max retries exceeded or Firebase error
 */
export async function generateUniqueCode(maxRetries = MAX_COLLISION_RETRIES) {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    const code = generateCode();
    
    // Validate format (should always pass, but safety check)
    if (!validateCode(code)) {
      attempts++;
      continue;
    }
    
    // Check uniqueness
    const isUnique = await checkCodeUniqueness(code);
    
    if (isUnique) {
      console.log(`✅ Generated unique session code: ${code} (attempts: ${attempts + 1})`);
      return code;
    }
    
    // Collision detected, try again
    console.warn(`⚠️ Code collision detected: ${code}, retrying...`);
    attempts++;
  }
  
  // Max retries exceeded
  throw new Error(`Failed to generate unique session code after ${maxRetries} attempts`);
}

/**
 * Format error message for invalid session codes
 * Provides user-friendly feedback
 * 
 * @param {string} code - The invalid code
 * @returns {string} User-friendly error message
 */
export function getValidationErrorMessage(code) {
  if (!code || code.trim() === '') {
    return 'Session code is required';
  }
  
  if (code.length !== CODE_LENGTH) {
    return `Session code must be exactly ${CODE_LENGTH} characters`;
  }
  
  if (!/^[A-Z0-9]+$/.test(code)) {
    return 'Session code can only contain uppercase letters and numbers';
  }
  
  return 'Invalid session code format';
}

/**
 * Normalize user input (convert to uppercase, trim whitespace)
 * Helps with user input variations
 * 
 * @param {string} code - The raw user input
 * @returns {string} Normalized code (uppercase, trimmed)
 */
export function normalizeCode(code) {
  if (!code || typeof code !== 'string') {
    return '';
  }
  
  return code.trim().toUpperCase();
}
