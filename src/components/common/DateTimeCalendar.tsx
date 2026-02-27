/**
 * DateTimeCalendar — Custom visual calendar + time picker
 * 
 * Built with pure HTML/CSS/React — NO Mantine.
 * Shows a clickable monthly calendar grid with navigation arrows,
 * a time input, and a text input for manual entry.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface DateTimeCalendarProps {
    label: string;
    value: Date | null;
    onChange: (date: Date | null) => void;
    required?: boolean;
    minDate?: Date;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export function DateTimeCalendar({ label, value, onChange, required, minDate }: DateTimeCalendarProps) {
    const [showCalendar, setShowCalendar] = useState(false);
    const [viewMonth, setViewMonth] = useState(() => (value || new Date()).getMonth());
    const [viewYear, setViewYear] = useState(() => (value || new Date()).getFullYear());
    const containerRef = useRef<HTMLDivElement>(null);

    // Close calendar on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowCalendar(false);
            }
        };
        if (showCalendar) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showCalendar]);

    // Sync viewMonth/viewYear when value changes externally
    useEffect(() => {
        if (value) {
            setViewMonth(value.getMonth());
            setViewYear(value.getFullYear());
        }
    }, [value]);

    const handleDayClick = useCallback((day: number) => {
        const hours = value?.getHours() || 12;
        const minutes = value?.getMinutes() || 0;
        const newDate = new Date(viewYear, viewMonth, day, hours, minutes);
        onChange(newDate);
    }, [viewYear, viewMonth, value, onChange]);

    const handleTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const [h, m] = e.target.value.split(':').map(Number);
        if (value) {
            const d = new Date(value);
            d.setHours(h || 0, m || 0);
            onChange(d);
        } else {
            // If no date selected yet, use today
            const d = new Date();
            d.setHours(h || 0, m || 0, 0, 0);
            onChange(d);
        }
    }, [value, onChange]);

    const handleClear = useCallback(() => {
        onChange(null);
    }, [onChange]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };

    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    // Build calendar grid
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isDisabled = (day: number): boolean => {
        if (!minDate) return false;
        const d = new Date(viewYear, viewMonth, day);
        d.setHours(0, 0, 0, 0);
        const min = new Date(minDate);
        min.setHours(0, 0, 0, 0);
        return d < min;
    };

    const isSelected = (day: number): boolean => {
        if (!value) return false;
        return value.getDate() === day && value.getMonth() === viewMonth && value.getFullYear() === viewYear;
    };

    const isToday = (day: number): boolean => {
        return today.getDate() === day && today.getMonth() === viewMonth && today.getFullYear() === viewYear;
    };

    const formattedValue = value
        ? `${value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
        : '';

    const timeValue = value
        ? `${value.getHours().toString().padStart(2, '0')}:${value.getMinutes().toString().padStart(2, '0')}`
        : '';

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            {/* Label */}
            <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '4px',
                color: '#1e293b',
            }}>
                {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
            </label>

            {/* Input trigger */}
            <div
                onClick={() => setShowCalendar(prev => !prev)}
                style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: showCalendar ? '1.5px solid #7c3aed' : '1px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    backgroundColor: '#fff',
                    color: value ? '#1e293b' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    transition: 'border-color 0.15s',
                    minHeight: '36px',
                }}
            >
                <span>{formattedValue || 'Select date & time...'}</span>
                <span style={{ fontSize: '1rem', opacity: 0.6 }}>📅</span>
            </div>

            {/* Calendar dropdown */}
            {showCalendar && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    zIndex: 1000,
                    marginTop: '4px',
                    background: '#fff',
                    borderRadius: '10px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
                    border: '1px solid #e2e8f0',
                    width: '280px',
                    overflow: 'hidden',
                }}>
                    {/* Month/Year navigation */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.75rem',
                        background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                        color: '#fff',
                    }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); prevMonth(); }}
                            style={{
                                background: 'rgba(255,255,255,0.15)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                width: 28, height: 28,
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >‹</button>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {MONTHS[viewMonth]} {viewYear}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); nextMonth(); }}
                            style={{
                                background: 'rgba(255,255,255,0.15)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                width: 28, height: 28,
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >›</button>
                    </div>

                    {/* Day headers */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        padding: '0.4rem 0.5rem 0',
                    }}>
                        {DAYS.map(d => (
                            <div key={d} style={{
                                textAlign: 'center',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: '#94a3b8',
                                padding: '4px 0',
                            }}>{d}</div>
                        ))}
                    </div>

                    {/* Day grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        padding: '0.25rem 0.5rem 0.5rem',
                        gap: '2px',
                    }}>
                        {/* Empty cells for offset */}
                        {Array.from({ length: firstDayOfMonth }, (_, i) => (
                            <div key={`empty-${i}`} />
                        ))}

                        {/* Day buttons */}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const disabled = isDisabled(day);
                            const selected = isSelected(day);
                            const todayMark = isToday(day);

                            return (
                                <button
                                    key={day}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!disabled) handleDayClick(day);
                                    }}
                                    disabled={disabled}
                                    style={{
                                        width: '100%',
                                        aspectRatio: '1',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        fontWeight: selected ? 700 : todayMark ? 600 : 400,
                                        cursor: disabled ? 'not-allowed' : 'pointer',
                                        background: selected
                                            ? 'linear-gradient(135deg, #7c3aed, #6366f1)'
                                            : todayMark
                                                ? 'rgba(139,92,246,0.1)'
                                                : 'transparent',
                                        color: selected
                                            ? '#fff'
                                            : disabled
                                                ? '#cbd5e1'
                                                : todayMark
                                                    ? '#7c3aed'
                                                    : '#334155',
                                        transition: 'all 0.1s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!disabled && !selected) {
                                            (e.target as HTMLElement).style.background = 'rgba(139,92,246,0.08)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!disabled && !selected) {
                                            (e.target as HTMLElement).style.background = todayMark ? 'rgba(139,92,246,0.1)' : 'transparent';
                                        }
                                    }}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>

                    {/* Time input + actions */}
                    <div style={{
                        borderTop: '1px solid #e2e8f0',
                        padding: '0.5rem 0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>🕐</span>
                            <input
                                type="time"
                                value={timeValue}
                                onChange={handleTimeChange}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '4px',
                                    padding: '0.25rem 0.4rem',
                                    fontSize: '0.8rem',
                                    width: '100px',
                                    color: '#334155',
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {value && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleClear(); }}
                                    style={{
                                        background: 'none', border: '1px solid #e2e8f0',
                                        borderRadius: '4px', padding: '0.2rem 0.5rem',
                                        fontSize: '0.75rem', color: '#ef4444',
                                        cursor: 'pointer',
                                    }}
                                >Clear</button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowCalendar(false); }}
                                style={{
                                    background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                                    border: 'none', borderRadius: '4px',
                                    padding: '0.2rem 0.6rem',
                                    fontSize: '0.75rem', color: '#fff',
                                    fontWeight: 600, cursor: 'pointer',
                                }}
                            >Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
