/**
 * StudentActionMenu — Per-student action dropdown on the homework detail page.
 * PRD-0034 Task 11.1
 *
 * Renders a "⋮" button that toggles a dropdown with: Extend Deadline, Exempt, Add Note, Send Reminder.
 * Disables "Send Reminder" if: student already submitted, reminderCount >= 3, or within 24h cooldown.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const REMINDER_LIMIT = 3;
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StudentActionMenuProps {
    studentName: string;
    hasSubmitted: boolean;
    isExempted: boolean;
    reminderCount: number;
    lastRemindedAt: number | null;
    onExtendDeadline: () => void;
    onExempt: () => void;
    onAddNote: () => void;
    onSendReminder: () => void;
}

function getReminderDisableReason(
    hasSubmitted: boolean,
    reminderCount: number,
    lastRemindedAt: number | null,
): string | null {
    if (hasSubmitted) {
        return 'Already submitted';
    }

    if (reminderCount >= REMINDER_LIMIT) {
        return `Maximum reminders sent (${REMINDER_LIMIT}/${REMINDER_LIMIT})`;
    }

    if (lastRemindedAt && Date.now() - lastRemindedAt < REMINDER_COOLDOWN_MS) {
        const hoursLeft = Math.max(1, Math.ceil((REMINDER_COOLDOWN_MS - (Date.now() - lastRemindedAt)) / (60 * 60 * 1000)));
        return `Reminder sent recently. Try again in ${hoursLeft}h`;
    }

    return null;
}

const triggerStyle: CSSProperties = {
    width: '2rem',
    height: '2rem',
    borderRadius: '50%',
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(255,255,255,0.92)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#475569',
    transition: 'background 0.15s, box-shadow 0.15s',
    position: 'relative',
};

const dropdownStyle: CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.35rem',
    minWidth: '200px',
    borderRadius: '0.9rem',
    background: '#fff',
    border: '1px solid rgba(148,163,184,0.18)',
    boxShadow: '0 12px 24px rgba(15,23,42,0.1), 0 4px 8px rgba(15,23,42,0.05)',
    padding: '0.35rem',
    zIndex: 30,
    animation: 'scaleIn 0.15s ease-out',
};

const menuItemBase: CSSProperties = {
    width: '100%',
    border: 'none',
    background: 'transparent',
    padding: '0.55rem 0.7rem',
    borderRadius: '0.6rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#334155',
    textAlign: 'left',
    transition: 'background 0.12s',
    whiteSpace: 'nowrap',
};

export default function StudentActionMenu({
    studentName,
    hasSubmitted,
    isExempted,
    reminderCount,
    lastRemindedAt,
    onExtendDeadline,
    onExempt,
    onAddNote,
    onSendReminder,
}: StudentActionMenuProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const reminderDisableReason = getReminderDisableReason(hasSubmitted, reminderCount, lastRemindedAt);
    const isReminderDisabled = reminderDisableReason !== null;

    const handleClickOutside = useCallback((event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
            setOpen(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [handleClickOutside, open]);

    const handleAction = useCallback((action: () => void) => {
        setOpen(false);
        action();
    }, []);

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
                type="button"
                aria-label={`Actions for ${studentName}`}
                aria-expanded={open}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((current) => !current);
                }}
                style={{
                    ...triggerStyle,
                    ...(open ? { background: '#f1f5f9', boxShadow: '0 2px 8px rgba(15,23,42,0.08)' } : {}),
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.08)';
                }}
                onMouseLeave={(e) => {
                    if (!open) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.92)';
                        e.currentTarget.style.boxShadow = 'none';
                    }
                }}
            >
                ⋮
            </button>

            {open ? (
                <>
                {/* Mobile backdrop (Task 17.2) — visible only via CSS media query */}
                <div className="action-menu-backdrop" onClick={() => setOpen(false)} />
                <div className="action-menu-dropdown" style={dropdownStyle}>
                    {/* Mobile header label */}
                    <div style={{ padding: '0.5rem 0.7rem 0.25rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                        {studentName}
                    </div>
                    <button
                        type="button"
                        style={menuItemBase}
                        onClick={() => handleAction(onExtendDeadline)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        📌 Extend Deadline
                    </button>
                    <button
                        type="button"
                        style={{
                            ...menuItemBase,
                            ...(isExempted ? { color: '#94a3b8' } : {}),
                        }}
                        onClick={() => handleAction(onExempt)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        🎓 {isExempted ? 'Remove Exemption' : 'Exempt Student'}
                    </button>
                    <button
                        type="button"
                        style={menuItemBase}
                        onClick={() => handleAction(onAddNote)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        📝 Add Note
                    </button>
                    <div
                        style={{ height: '1px', background: 'rgba(148,163,184,0.16)', margin: '0.25rem 0.5rem' }}
                    />
                    <button
                        type="button"
                        disabled={isReminderDisabled}
                        title={reminderDisableReason ?? `Send reminder to ${studentName}`}
                        style={{
                            ...menuItemBase,
                            ...(isReminderDisabled
                                ? { opacity: 0.45, cursor: 'not-allowed', color: '#94a3b8' }
                                : {}),
                        }}
                        onClick={() => {
                            if (!isReminderDisabled) {
                                handleAction(onSendReminder);
                            }
                        }}
                        onMouseEnter={(e) => {
                            if (!isReminderDisabled) {
                                e.currentTarget.style.background = 'rgba(245,158,11,0.08)';
                            }
                        }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        ⚡ Send Reminder
                        {reminderCount > 0 ? (
                            <span style={{
                                fontSize: '0.72rem',
                                color: '#94a3b8',
                                marginLeft: 'auto',
                            }}>
                                ({reminderCount}/{REMINDER_LIMIT})
                            </span>
                        ) : null}
                    </button>
                </div>
                </>
            ) : null}
        </div>
    );
}
