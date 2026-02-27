/**
 * User Types
 * 
 * Defines user roles and profile structures for the authentication system.
 */

export type UserRole = 'super_admin' | 'teacher' | 'student';

export interface EnrolledClass {
  joinedAt: number;
  classCode: string;
}

export interface UserProfile {
  /** Firebase Auth UID */
  uid: string;
  /** User's email address */
  email: string | null;
  /** Display name */
  displayName: string | null;
  /** Profile picture URL */
  photoURL: string | null;
  /** Assigned role */
  role: UserRole;
  /** Account creation timestamp */
  createdAt: number;
  /** Last login timestamp */
  lastLoginAt: number;
  /** Account status */
  status: 'active' | 'disabled';

  /** 
   * For Teachers: UID of the Super Admin who invited them 
   * For Students: null/undefined
   */
  invitedBy?: string | null;

  /** 
   * For Students: Record of enrolled class codes
   * Key is classCode, value can be simple boolean true or object with details
   */
  enrolledClasses?: Record<string, EnrolledClass | true>;

  /** User preferences */
  preferences?: {
    notifications?: {
      emailResults?: boolean;
      weeklyReport?: boolean;
      teacherAlerts?: boolean;
    };
  };

  // ============================================
  // ENHANCED PROFILE FIELDS (PRD-0015)
  // ============================================

  /** User's first name */
  firstName?: string;

  /** User's family name (last name) */
  familyName?: string;

  /** Date of birth in DD/MM/YYYY format */
  dateOfBirth?: string;

  /** Phone number with country code */
  phone?: {
    countryCode: string;
    number: string;
  };

  /** User's address */
  address?: {
    street: string;
    city: string;
    province: string;
    country: string;
  };

  /** School name (for students) */
  school?: string | null;

  /** Job title (for teachers/admins) */
  job?: string | null;

  /** Custom avatar URL (R2 storage) - overrides photoURL if set */
  avatarUrl?: string | null;

  /** Timestamp when profile was marked as complete */
  profileCompletedAt?: number | null;
}

/**
 * Extended user object including both Firebase Auth user and Firestore profile
 */
export interface AuthUser extends UserProfile {
  /** Whether the user email is verified */
  emailVerified: boolean;
  /** Custom claims from ID token */
  customClaims?: {
    role?: UserRole;
    [key: string]: any;
  };
}
