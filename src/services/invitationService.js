import { ref, get, set, update, serverTimestamp } from 'firebase/database';
import { database } from './firebase';

/**
 * Generate a unique 6-character invitation code
 * Format: ABC123 (3 uppercase letters + 3 digits)
 */
function generateInviteCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  
  return code;
}

/**
 * Check if an invite code already exists
 */
async function codeExists(code) {
  const codeRef = ref(database, `invitations/${code}`);
  const snapshot = await get(codeRef);
  return snapshot.exists();
}

/**
 * Generate a unique teacher invitation code
 * @param {string} adminUid - UID of the Super Admin creating the invite
 * @param {number} expiresInDays - Number of days until code expires (default: 7)
 * @returns {Promise<{success: boolean, code?: string, error?: string}>}
 */
export async function generateTeacherInvite(adminUid, expiresInDays = 7) {
  try {
    // Generate unique code (retry if collision)
    let code;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      code = generateInviteCode();
      attempts++;
      if (attempts > maxAttempts) {
        return { success: false, error: 'Failed to generate unique code' };
      }
    } while (await codeExists(code));
    
    // Calculate expiration timestamp
    const expiresAt = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
    
    // Store invitation in database
    const inviteData = {
      code,
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      expiresAt,
      status: 'active', // active, redeemed, expired
      redeemedBy: null,
      redeemedAt: null
    };
    
    const inviteRef = ref(database, `invitations/${code}`);
    await set(inviteRef, inviteData);
    
    return { success: true, code };
  } catch (error) {
    console.error('Error generating invite:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Redeem a teacher invitation code
 * @param {string} code - The invitation code
 * @param {string} userUid - UID of the user redeeming the code
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function redeemTeacherInvite(code, userUid) {
  try {
    const inviteRef = ref(database, `invitations/${code}`);
    const snapshot = await get(inviteRef);
    
    if (!snapshot.exists()) {
      return { success: false, error: 'Invalid invitation code' };
    }
    
    const invite = snapshot.val();
    
    // Check if already redeemed
    if (invite.status === 'redeemed') {
      return { success: false, error: 'This code has already been used' };
    }
    
    // Check if expired
    if (invite.expiresAt < Date.now()) {
      // Mark as expired
      await update(inviteRef, { status: 'expired' });
      return { success: false, error: 'This invitation code has expired' };
    }
    
    // Mark invitation as redeemed
    await update(inviteRef, {
      status: 'redeemed',
      redeemedBy: userUid,
      redeemedAt: serverTimestamp()
    });
    
    // Upgrade user to teacher role
    const userRef = ref(database, `users/${userUid}`);
    await update(userRef, {
      role: 'teacher',
      invitedBy: invite.createdBy,
      upgradedAt: serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error redeeming invite:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all invitations created by a Super Admin
 * @param {string} adminUid - UID of the Super Admin
 * @returns {Promise<Array>} Array of invitation objects
 */
export async function getInvitationsByAdmin(adminUid) {
  try {
    const invitesRef = ref(database, 'invitations');
    const snapshot = await get(invitesRef);
    
    if (!snapshot.exists()) {
      return [];
    }
    
    const allInvites = snapshot.val();
    const adminInvites = Object.entries(allInvites)
      .filter(([_, invite]) => invite.createdBy === adminUid)
      .map(([code, invite]) => ({ ...invite, code }))
      .sort((a, b) => b.createdAt - a.createdAt); // Most recent first
    
    return adminInvites;
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return [];
  }
}

/**
 * Revoke/deactivate an invitation code
 * @param {string} code - The invitation code to revoke
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function revokeInvitation(code) {
  try {
    const inviteRef = ref(database, `invitations/${code}`);
    const snapshot = await get(inviteRef);
    
    if (!snapshot.exists()) {
      return { success: false, error: 'Invitation not found' };
    }
    
    await update(inviteRef, {
      status: 'revoked',
      revokedAt: serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error revoking invitation:', error);
    return { success: false, error: error.message };
  }
}
