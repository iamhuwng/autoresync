/**
 * Session Access Control Tests
 * Tests for guest access, authenticated access, and access control enforcement
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSession,
  validateGuestJoin,
  validateSessionForJoin,
  SessionMode,
} from '../../services/sessionManager';
import { database } from '../../services/firebase';
import { ref, set, get, remove } from 'firebase/database';

// Test data
const TEST_SESSION_CODE = 'TEST01';

// Cleanup helper
const cleanupTestData = async () => {
  try {
    await remove(ref(database, `game_sessions/${TEST_SESSION_CODE}`));
  } catch (error) {
    console.error('Cleanup error:', error);
  }
};

describe('Session Access Control - Guest Access', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should allow guest to join session when allowAnonymous is true', async () => {
    // Create session with guest access enabled
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowAnonymous: true,
        allowLateJoin: true,
      },
    });

    expect(result.success).toBe(true);
    const sessionCode = result.sessionCode!;

    // Validate guest can join
    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(true);
    expect(validation.session).toBeDefined();
  });

  it('should block guest from joining session when allowAnonymous is false', async () => {
    // Create session with guest access disabled
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowAnonymous: false,
        allowLateJoin: true,
      },
    });

    expect(result.success).toBe(true);
    const sessionCode = result.sessionCode!;

    // Validate guest cannot join
    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('requires authentication');
  });

  it('should allow guest to join when allowAnonymous is undefined (defaults to true)', async () => {
    // Create session without explicitly setting allowAnonymous
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowLateJoin: true,
      },
    });

    expect(result.success).toBe(true);
    const sessionCode = result.sessionCode!;

    // Validate guest can join (should default to allowing guests)
    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(true);
  });

  it('should enforce other session rules even when allowAnonymous is true', async () => {
    // Create session that's expired
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowAnonymous: true,
      },
    });

    const sessionCode = result.sessionCode!;

    // Manually set session to expired
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    await set(sessionRef, {
      ...(await get(sessionRef)).val(),
      status: 'expired',
    });

    // Guest should still be blocked due to expiration
    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('expired');
  });
});

describe('Session Access Control - Authenticated Student Access', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should allow authenticated student to join public session', async () => {
    // Create public session
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'public',
        allowAnonymous: true,
      },
    });

    expect(result.success).toBe(true);
    const sessionCode = result.sessionCode!;

    // Authenticated students use validateSessionForJoin (not validateGuestJoin)
    const validation = await validateSessionForJoin(sessionCode);
    expect(validation.valid).toBe(true);
  });

  it('should allow authenticated student to join even when allowAnonymous is false', async () => {
    // Create session that blocks guests but allows authenticated users
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        allowAnonymous: false,
        allowLateJoin: true,
      },
    });

    expect(result.success).toBe(true);
    const sessionCode = result.sessionCode!;

    // Authenticated students should be able to join
    const validation = await validateSessionForJoin(sessionCode);
    expect(validation.valid).toBe(true);

    // But guests should be blocked
    const guestValidation = await validateGuestJoin(sessionCode);
    expect(guestValidation.valid).toBe(false);
  });
});

describe('Session Access Control - Access Control Settings', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should create session with public access control', async () => {
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        accessControl: 'public',
        allowAnonymous: true,
      },
    });

    expect(result.success).toBe(true);
    const sessionCode = result.sessionCode!;

    // Verify settings were saved
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('public');
    expect(session.settings.allowAnonymous).toBe(true);
  });

  it('should create session with class-only access control', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'class-only',
        allowAnonymous: false,
      },
    });

    expect(result.success).toBe(true);
    const sessionCode = result.sessionCode!;

    // Verify settings were saved
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('class-only');
    expect(session.settings.allowAnonymous).toBe(false);
  });
});

describe('Session Access Control - Late Join with Guest Access', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should block guest from late join when allowLateJoin is false', async () => {
    // Create session with late join disabled
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowAnonymous: true,
        allowLateJoin: false,
      },
    });

    const sessionCode = result.sessionCode!;

    // Set session to in-progress
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();
    await set(sessionRef, {
      ...sessionData,
      status: 'in-progress',
    });

    // Guest should be blocked from joining
    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('already started');
  });

  it('should allow guest to late join when both allowAnonymous and allowLateJoin are true', async () => {
    // Create session with both settings enabled
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowAnonymous: true,
        allowLateJoin: true,
      },
    });

    const sessionCode = result.sessionCode!;

    // Set session to in-progress
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();
    await set(sessionRef, {
      ...sessionData,
      status: 'in-progress',
    });

    // Guest should be allowed to join
    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(true);
  });
});

describe('Session Access Control - Combined Scenarios', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should handle strict session (class-only, no guests, no late join)', async () => {
    const result = await createSession({
      mode: SessionMode.TEST,
      settings: {
        accessControl: 'class-only',
        allowAnonymous: false,
        allowLateJoin: false,
      },
    });

    const sessionCode = result.sessionCode!;

    // Verify all settings
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('class-only');
    expect(session.settings.allowAnonymous).toBe(false);
    expect(session.settings.allowLateJoin).toBe(false);

    // Guest should be blocked
    const guestValidation = await validateGuestJoin(sessionCode);
    expect(guestValidation.valid).toBe(false);
  });

  it('should handle open session (public, guests allowed, late join allowed)', async () => {
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        accessControl: 'public',
        allowAnonymous: true,
        allowLateJoin: true,
      },
    });

    const sessionCode = result.sessionCode!;

    // Verify all settings
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const snapshot = await get(sessionRef);
    const session = snapshot.val();

    expect(session.settings.accessControl).toBe('public');
    expect(session.settings.allowAnonymous).toBe(true);
    expect(session.settings.allowLateJoin).toBe(true);

    // Guest should be allowed
    const guestValidation = await validateGuestJoin(sessionCode);
    expect(guestValidation.valid).toBe(true);

    // Set to in-progress and verify late join works
    await set(sessionRef, {
      ...session,
      status: 'in-progress',
    });

    const lateJoinValidation = await validateGuestJoin(sessionCode);
    expect(lateJoinValidation.valid).toBe(true);
  });
});

describe('Session Access Control - Error Messages', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should provide clear error message for guest blocked by allowAnonymous', async () => {
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowAnonymous: false,
      },
    });

    const sessionCode = result.sessionCode!;
    const validation = await validateGuestJoin(sessionCode);

    expect(validation.valid).toBe(false);
    expect(validation.message).toBe('This session requires authentication. Please log in to join.');
  });

  it('should provide clear error message for non-existent session', async () => {
    const validation = await validateGuestJoin('INVALID');
    
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('not found');
  });

  it('should provide clear error message for expired session', async () => {
    const result = await createSession({
      mode: SessionMode.QUIZ,
      settings: {
        allowAnonymous: true,
      },
    });

    const sessionCode = result.sessionCode!;
    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const sessionData = (await get(sessionRef)).val();
    
    await set(sessionRef, {
      ...sessionData,
      status: 'expired',
    });

    const validation = await validateGuestJoin(sessionCode);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain('expired');
  });
});
