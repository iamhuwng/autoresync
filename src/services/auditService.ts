/**
 * Audit Service
 * 
 * Provides centralized audit logging for security-sensitive operations.
 * Part of RBAC Security Hardening (PRD-0016), Task 6.0.
 * 
 * Features:
 * - Append-only audit log for all CRUD operations
 * - Fire-and-forget pattern to avoid blocking main operations
 * - Super admin read access only (via Firebase rules)
 * - Comprehensive event tracking
 * 
 * @security Audit logs are write-only for clients, read-only for super_admin
 */

import { ref, push, serverTimestamp, query, orderByChild, limitToLast, get, startAt, endAt } from 'firebase/database';
import { database } from './firebase';
import { AuditAction, AuditLogEntry, UserRole, SecurityAuthContext } from '../types/security.types';
import {
    isRecoveryEffectSuppressed,
    type RecoveryEffectContext,
} from './recoveryEffectGuard';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Parameters for creating an audit log entry
 */
export interface AuditLogParams {
    /** Type of action performed */
    action: AuditAction;
    /** Target resource type (e.g., 'user', 'course', 'assignment') */
    target: string;
    /** Target resource ID */
    targetId: string;
    /** Additional context details */
    details?: Record<string, unknown>;
    /** Recovery projections are held until reconciliation and never fan out here. */
    recoveryContext?: RecoveryEffectContext;
}

/**
 * Query parameters for fetching audit logs
 */
export interface AuditLogQuery {
    /** Maximum number of entries to return */
    limit?: number;
    /** Filter by action type */
    action?: AuditAction;
    /** Filter by user ID */
    userId?: string;
    /** Filter by target type */
    target?: string;
    /** Start timestamp (ISO string) */
    startDate?: string;
    /** End timestamp (ISO string) */
    endDate?: string;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log an audit event (fire-and-forget)
 * 
 * This function is designed to be non-blocking. It logs events asynchronously
 * and does not throw errors that would disrupt the main operation.
 * 
 * @param params - Audit log parameters
 * @param authContext - Security context (or null for unauthenticated events)
 */
export const logAuditEvent = (
    params: AuditLogParams,
    authContext: SecurityAuthContext | null
): void => {
    if (params.recoveryContext
        && isRecoveryEffectSuppressed('audit-fan-out', params.recoveryContext).suppressed) {
        return;
    }
    // Fire-and-forget: don't await, don't block
    logAuditEventAsync(params, authContext).catch((error) => {
        // Log errors but don't throw - audit logging should never break main flow
        console.warn('[Audit] Failed to log event:', error.message, params);
    });
};

/**
 * Internal async implementation of audit logging
 */
const logAuditEventAsync = async (
    params: AuditLogParams,
    authContext: SecurityAuthContext | null
): Promise<void> => {
    const auditRef = ref(database, 'audit_logs');

    const entry: Omit<AuditLogEntry, 'id'> = {
        action: params.action,
        userId: authContext?.userId || 'anonymous',
        userRole: authContext?.userRole || 'student',
        target: params.target,
        targetId: params.targetId,
        timestamp: new Date().toISOString(),
        details: {
            ...params.details,
            activeRole: authContext?.activeRole,
        },
    };

    await push(auditRef, {
        ...entry,
        serverTime: serverTimestamp(),
    });
};

/**
 * Log a security event with predefined actions
 */
export const logSecurityEvent = {
    /**
     * Log a user login event
     */
    login: (userId: string, userRole: UserRole, email?: string): void => {
        logAuditEvent(
            {
                action: 'LOGIN',
                target: 'session',
                targetId: userId,
                details: { email },
            },
            { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
        );
    },

    /**
     * Log a user logout event
     */
    logout: (userId: string, userRole: UserRole, reason?: string): void => {
        logAuditEvent(
            {
                action: 'LOGOUT',
                target: 'session',
                targetId: userId,
                details: { reason },
            },
            { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
        );
    },

    /**
     * Log an access denied event
     */
    accessDenied: (
        userId: string | undefined,
        userRole: UserRole | undefined,
        attemptedPath: string,
        reason: string
    ): void => {
        logAuditEvent(
            {
                action: 'ACCESS_DENIED',
                target: 'route',
                targetId: attemptedPath,
                details: { reason, userRole },
            },
            userId && userRole
                ? { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
                : null
        );
    },

    /**
     * Log a role change event
     */
    roleChange: (
        adminContext: SecurityAuthContext,
        targetUserId: string,
        oldRole: UserRole,
        newRole: UserRole
    ): void => {
        logAuditEvent(
            {
                action: 'ROLE_CHANGE',
                target: 'user',
                targetId: targetUserId,
                details: { oldRole, newRole, changedBy: adminContext.userId },
            },
            adminContext
        );
    },

    /**
     * Log a status change event (block/unblock)
     */
    statusChange: (
        adminContext: SecurityAuthContext,
        targetUserId: string,
        oldStatus: string,
        newStatus: string,
        reason?: string
    ): void => {
        logAuditEvent(
            {
                action: 'STATUS_CHANGE',
                target: 'user',
                targetId: targetUserId,
                details: { oldStatus, newStatus, reason, changedBy: adminContext.userId },
            },
            adminContext
        );
    },
};

// =============================================================================
// CRUD LOGGING HELPERS
// =============================================================================

/**
 * Create audit log for CREATE operations
 */
export const logCreate = (
    authContext: SecurityAuthContext | null,
    target: string,
    targetId: string,
    details?: Record<string, unknown>
): void => {
    logAuditEvent({ action: 'CREATE', target, targetId, details }, authContext);
};

/**
 * Create audit log for READ operations (sensitive data only)
 */
export const logRead = (
    authContext: SecurityAuthContext | null,
    target: string,
    targetId: string,
    details?: Record<string, unknown>
): void => {
    logAuditEvent({ action: 'READ', target, targetId, details }, authContext);
};

/**
 * Create audit log for UPDATE operations
 */
export const logUpdate = (
    authContext: SecurityAuthContext | null,
    target: string,
    targetId: string,
    details?: Record<string, unknown>
): void => {
    logAuditEvent({ action: 'UPDATE', target, targetId, details }, authContext);
};

/**
 * Create audit log for DELETE operations
 */
export const logDelete = (
    authContext: SecurityAuthContext | null,
    target: string,
    targetId: string,
    details?: Record<string, unknown>
): void => {
    logAuditEvent({ action: 'DELETE', target, targetId, details }, authContext);
};

// =============================================================================
// AUDIT LOG QUERIES (Super Admin Only)
// =============================================================================

/**
 * Get recent audit logs (super_admin only)
 * 
 * @param limit - Maximum number of entries to return (default: 100)
 * @returns Array of audit log entries
 */
export const getRecentAuditLogs = async (limit: number = 100): Promise<AuditLogEntry[]> => {
    const auditRef = ref(database, 'audit_logs');
    const recentQuery = query(auditRef, orderByChild('serverTime'), limitToLast(limit));

    const snapshot = await get(recentQuery);

    if (!snapshot.exists()) {
        return [];
    }

    const entries: AuditLogEntry[] = [];
    snapshot.forEach((child) => {
        entries.push({
            id: child.key!,
            ...child.val(),
        });
    });

    // Return in reverse chronological order
    return entries.reverse();
};

/**
 * Get audit logs for a specific user (super_admin only)
 */
export const getAuditLogsByUser = async (
    userId: string,
    limit: number = 50
): Promise<AuditLogEntry[]> => {
    const auditRef = ref(database, 'audit_logs');
    const userQuery = query(auditRef, orderByChild('userId'), startAt(userId), endAt(userId), limitToLast(limit));

    const snapshot = await get(userQuery);

    if (!snapshot.exists()) {
        return [];
    }

    const entries: AuditLogEntry[] = [];
    snapshot.forEach((child) => {
        entries.push({
            id: child.key!,
            ...child.val(),
        });
    });

    return entries.reverse();
};

/**
 * Get audit logs for a specific action type (super_admin only)
 */
export const getAuditLogsByAction = async (
    action: AuditAction,
    limit: number = 50
): Promise<AuditLogEntry[]> => {
    const auditRef = ref(database, 'audit_logs');
    const actionQuery = query(auditRef, orderByChild('action'), startAt(action), endAt(action), limitToLast(limit));

    const snapshot = await get(actionQuery);

    if (!snapshot.exists()) {
        return [];
    }

    const entries: AuditLogEntry[] = [];
    snapshot.forEach((child) => {
        entries.push({
            id: child.key!,
            ...child.val(),
        });
    });

    return entries.reverse();
};

// =============================================================================
// DRAFT-SPECIFIC AUDIT LOGGING (PRD-0022)
// Implements audit requirements for Test Creation Modal
// =============================================================================

// Types from draft.types.ts are used conceptually but we reuse existing audit infrastructure

/**
 * Log draft creation event
 */
export const logDraftCreated = (
    userId: string,
    userRole: 'teacher' | 'super_admin',
    draftId: string,
    details?: Record<string, unknown>
): void => {
    logAuditEvent(
        {
            action: 'CREATE',
            target: 'draft',
            targetId: draftId,
            details: { ...details, draftAction: 'draft_created' },
        },
        { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
    );
};

/**
 * Log draft deletion event
 */
export const logDraftDeleted = (
    userId: string,
    userRole: 'teacher' | 'super_admin',
    draftId: string,
    details?: Record<string, unknown>
): void => {
    logAuditEvent(
        {
            action: 'DELETE',
            target: 'draft',
            targetId: draftId,
            details: { ...details, draftAction: 'draft_deleted' },
        },
        { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
    );
};

/**
 * Log draft status change event
 */
export const logDraftStatusChanged = (
    userId: string,
    userRole: 'teacher' | 'super_admin',
    draftId: string,
    oldStatus: string,
    newStatus: string
): void => {
    logAuditEvent(
        {
            action: 'UPDATE',
            target: 'draft',
            targetId: draftId,
            details: { oldStatus, newStatus, draftAction: 'draft_status_changed' },
        },
        { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
    );
};

/**
 * Log test publication event
 */
export const logTestPublished = (
    userId: string,
    userRole: 'teacher' | 'super_admin',
    testId: string,
    draftId: string,
    isPublic: boolean
): void => {
    logAuditEvent(
        {
            action: 'CREATE',
            target: 'test',
            targetId: testId,
            details: { sourceDraftId: draftId, isPublic, draftAction: 'test_published' },
        },
        { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
    );
};

/**
 * Log test visibility change event
 */
export const logTestVisibilityChanged = (
    userId: string,
    userRole: 'teacher' | 'super_admin',
    testId: string,
    oldVisibility: boolean,
    newVisibility: boolean
): void => {
    logAuditEvent(
        {
            action: 'UPDATE',
            target: 'test',
            targetId: testId,
            details: { oldVisibility, newVisibility, draftAction: 'test_visibility_changed' },
        },
        { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
    );
};

/**
 * Log access denied event for draft/test resources
 */
export const logDraftAccessDenied = (
    userId: string,
    userRole: 'teacher' | 'super_admin',
    targetId: string,
    targetType: 'draft' | 'test',
    reason: string
): void => {
    logAuditEvent(
        {
            action: 'ACCESS_DENIED',
            target: targetType,
            targetId,
            details: { reason, draftAction: 'access_denied' },
        },
        { userId, userRole, activeRole: userRole, roles: [userRole], isActive: true }
    );
};

// =============================================================================
// EXPORT
// =============================================================================

export default {
    logAuditEvent,
    logSecurityEvent,
    logCreate,
    logRead,
    logUpdate,
    logDelete,
    getRecentAuditLogs,
    getAuditLogsByUser,
    getAuditLogsByAction,
    // Draft-specific (PRD-0022)
    logDraftCreated,
    logDraftDeleted,
    logDraftStatusChanged,
    logTestPublished,
    logTestVisibilityChanged,
    logDraftAccessDenied,
};
