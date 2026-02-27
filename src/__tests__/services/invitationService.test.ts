import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateTeacherInvite,
  redeemTeacherInvite,
  getInvitationsByAdmin,
  revokeInvitation
} from '../../services/invitationService';
import * as firebaseDatabase from 'firebase/database';

// Mock Firebase Database
vi.mock('firebase/database');
vi.mock('../../services/firebase', () => ({
  database: {}
}));

describe('invitationService', () => {
  let mockRef: any;
  let mockGet: any;
  let mockSet: any;
  let mockUpdate: any;
  let mockServerTimestamp: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRef = vi.fn().mockReturnValue({});
    mockGet = vi.fn();
    mockSet = vi.fn();
    mockUpdate = vi.fn();
    mockServerTimestamp = vi.fn().mockReturnValue({ '.sv': 'timestamp' });

    vi.mocked(firebaseDatabase.ref).mockImplementation(mockRef);
    vi.mocked(firebaseDatabase.get).mockImplementation(mockGet);
    vi.mocked(firebaseDatabase.set).mockImplementation(mockSet);
    vi.mocked(firebaseDatabase.update).mockImplementation(mockUpdate);
    vi.mocked(firebaseDatabase.serverTimestamp).mockImplementation(mockServerTimestamp);
  });

  describe('generateTeacherInvite', () => {
    it('should generate a unique 6-character invite code', async () => {
      // Mock that code doesn't exist
      mockGet.mockResolvedValue({
        exists: () => false,
        val: () => null
      });

      mockSet.mockResolvedValue(undefined);

      const result = await generateTeacherInvite('admin-uid-123', 7);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code?.length).toBe(6);
      expect(/^[A-Z]{3}[0-9]{3}$/.test(result.code!)).toBe(true);
    });

    it('should retry if code collision occurs', async () => {
      let callCount = 0;
      
      // First call: code exists, second call: code doesn't exist
      mockGet.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          exists: () => callCount === 1,
          val: () => callCount === 1 ? { code: 'ABC123' } : null
        });
      });

      mockSet.mockResolvedValue(undefined);

      const result = await generateTeacherInvite('admin-uid-123', 7);

      expect(result.success).toBe(true);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('should store invitation with correct data structure', async () => {
      mockGet.mockResolvedValue({
        exists: () => false,
        val: () => null
      });

      mockSet.mockResolvedValue(undefined);

      const adminUid = 'admin-uid-123';
      const expiresInDays = 7;

      await generateTeacherInvite(adminUid, expiresInDays);

      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          createdBy: adminUid,
          status: 'active',
          redeemedBy: null,
          redeemedAt: null
        })
      );
    });

    it('should fail after max retry attempts', async () => {
      // Always return that code exists
      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => ({ code: 'ABC123' })
      });

      const result = await generateTeacherInvite('admin-uid-123', 7);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to generate unique code');
    });
  });

  describe('redeemTeacherInvite', () => {
    it('should successfully redeem a valid active code', async () => {
      const mockInvite = {
        code: 'ABC123',
        createdBy: 'admin-uid',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        status: 'active',
        redeemedBy: null,
        redeemedAt: null
      };

      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => mockInvite
      });

      mockUpdate.mockResolvedValue(undefined);

      const result = await redeemTeacherInvite('ABC123', 'user-uid-456');

      expect(result.success).toBe(true);
      
      // Verify invitation was marked as redeemed
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'redeemed',
          redeemedBy: 'user-uid-456'
        })
      );

      // Verify user was upgraded to teacher
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: 'teacher',
          invitedBy: 'admin-uid'
        })
      );
    });

    it('should fail with invalid invitation code', async () => {
      mockGet.mockResolvedValue({
        exists: () => false,
        val: () => null
      });

      const result = await redeemTeacherInvite('INVALID', 'user-uid-456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid invitation code');
    });

    it('should fail if code already redeemed', async () => {
      const mockInvite = {
        code: 'ABC123',
        createdBy: 'admin-uid',
        status: 'redeemed',
        redeemedBy: 'another-user',
        redeemedAt: Date.now() - 1000
      };

      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => mockInvite
      });

      const result = await redeemTeacherInvite('ABC123', 'user-uid-456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('This code has already been used');
    });

    it('should fail if code is expired', async () => {
      const mockInvite = {
        code: 'ABC123',
        createdBy: 'admin-uid',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        status: 'active',
        redeemedBy: null
      };

      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => mockInvite
      });

      mockUpdate.mockResolvedValue(undefined);

      const result = await redeemTeacherInvite('ABC123', 'user-uid-456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('This invitation code has expired');
      
      // Verify code was marked as expired
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'expired'
        })
      );
    });
  });

  describe('getInvitationsByAdmin', () => {
    it('should return all invitations created by admin', async () => {
      const mockInvitations = {
        'ABC123': {
          code: 'ABC123',
          createdBy: 'admin-uid-1',
          createdAt: Date.now() - 2000,
          status: 'active'
        },
        'DEF456': {
          code: 'DEF456',
          createdBy: 'admin-uid-1',
          createdAt: Date.now() - 1000,
          status: 'redeemed'
        },
        'GHI789': {
          code: 'GHI789',
          createdBy: 'admin-uid-2',
          createdAt: Date.now(),
          status: 'active'
        }
      };

      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => mockInvitations
      });

      const result = await getInvitationsByAdmin('admin-uid-1');

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('DEF456'); // Most recent first
      expect(result[1].code).toBe('ABC123');
    });

    it('should return empty array if no invitations exist', async () => {
      mockGet.mockResolvedValue({
        exists: () => false,
        val: () => null
      });

      const result = await getInvitationsByAdmin('admin-uid-1');

      expect(result).toEqual([]);
    });

    it('should return empty array if admin has no invitations', async () => {
      const mockInvitations = {
        'ABC123': {
          code: 'ABC123',
          createdBy: 'other-admin',
          createdAt: Date.now(),
          status: 'active'
        }
      };

      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => mockInvitations
      });

      const result = await getInvitationsByAdmin('admin-uid-1');

      expect(result).toEqual([]);
    });
  });

  describe('revokeInvitation', () => {
    it('should successfully revoke an invitation', async () => {
      mockGet.mockResolvedValue({
        exists: () => true,
        val: () => ({
          code: 'ABC123',
          status: 'active'
        })
      });

      mockUpdate.mockResolvedValue(undefined);

      const result = await revokeInvitation('ABC123');

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'revoked'
        })
      );
    });

    it('should fail if invitation does not exist', async () => {
      mockGet.mockResolvedValue({
        exists: () => false,
        val: () => null
      });

      const result = await revokeInvitation('INVALID');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invitation not found');
    });
  });
});
