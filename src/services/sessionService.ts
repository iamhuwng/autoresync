/**
 * Session Service
 * Centralized management of session storage operations
 * Provides type-safe access to session data
 */

export interface SessionData {
  playerId: string | null;
  playerName: string | null;
  sessionCode: string | null;
  teacherId?: string | null;
  isAdmin?: boolean;
  testSubmission?: any;
}

class SessionService {
  /**
   * Player/Student Data
   */
  getPlayerId(): string | null {
    return sessionStorage.getItem('playerId');
  }

  setPlayerId(id: string): void {
    sessionStorage.setItem('playerId', id);
  }

  getPlayerName(): string | null {
    return sessionStorage.getItem('playerName');
  }

  setPlayerName(name: string): void {
    sessionStorage.setItem('playerName', name);
  }

  /**
   * Session Data
   */
  getSessionCode(): string | null {
    return sessionStorage.getItem('sessionCode');
  }

  setSessionCode(code: string): void {
    sessionStorage.setItem('sessionCode', code);
  }

  /**
   * Teacher Data
   */
  getTeacherId(sessionCode?: string): string | null {
    const key = sessionCode ? `teacherId_${sessionCode}` : 'teacherId';
    return sessionStorage.getItem(key);
  }

  setTeacherId(id: string, sessionCode?: string): void {
    const key = sessionCode ? `teacherId_${sessionCode}` : 'teacherId';
    sessionStorage.setItem(key, id);
  }

  /**
   * Admin Status
   */
  isAdmin(): boolean {
    return sessionStorage.getItem('isAdmin') === 'true';
  }

  setAdmin(isAdmin: boolean): void {
    sessionStorage.setItem('isAdmin', isAdmin.toString());
  }

  /**
   * Test Submission Data
   */
  getTestSubmission(): any | null {
    const data = sessionStorage.getItem('testSubmission');
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return null;
  }

  setTestSubmission(data: any): void {
    sessionStorage.setItem('testSubmission', JSON.stringify(data));
  }

  /**
   * Set Player Data (convenience method for join)
   */
  setPlayerData(playerId: string, playerName: string, sessionCode: string): void {
    this.setPlayerId(playerId);
    this.setPlayerName(playerName);
    this.setSessionCode(sessionCode);
  }

  /**
   * Get All Session Data
   */
  getAllSessionData(): SessionData {
    return {
      playerId: this.getPlayerId(),
      playerName: this.getPlayerName(),
      sessionCode: this.getSessionCode(),
      teacherId: this.getTeacherId(),
      isAdmin: this.isAdmin(),
      testSubmission: this.getTestSubmission(),
    };
  }

  /**
   * Validate Student Session
   * Checks if all required student data is present
   */
  validateStudentSession(expectedSessionCode?: string): boolean {
    const playerId = this.getPlayerId();
    const playerName = this.getPlayerName();
    const sessionCode = this.getSessionCode();

    if (!playerId || !playerName || !sessionCode) {
      return false;
    }

    if (expectedSessionCode && sessionCode !== expectedSessionCode) {
      return false;
    }

    return true;
  }

  /**
   * Clear Session Data
   */
  clearSession(): void {
    sessionStorage.removeItem('playerId');
    sessionStorage.removeItem('playerName');
    sessionStorage.removeItem('sessionCode');
    sessionStorage.removeItem('testSubmission');
  }

  /**
   * Clear All Data (including admin)
   */
  clearAll(): void {
    // Get all keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all keys
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  }

  /**
   * Session Ownership Check
   */
  isSessionOwner(sessionCode: string): boolean {
    const teacherId = this.getTeacherId(sessionCode);
    return teacherId !== null;
  }
}

// Export singleton instance
export const sessionService = new SessionService();

// Export type for easier imports
export type { SessionService };
