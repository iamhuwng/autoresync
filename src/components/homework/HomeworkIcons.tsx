import React from 'react';

// ─── Existing icon imports for re-export ─────────────────────────────────────
// @ts-ignore — icons.jsx has no type declarations (pre-existing pattern)
import { ClockIcon as _ClockIcon, EditIcon as _EditIcon, DeleteIcon as _DeleteIcon, CloneIcon as _CloneIcon } from '../modern/icons.jsx';
import { IconSearch as _IconSearch, IconProfile as _IconProfile } from '../layout/StudentIcons';

// ─── Shared HomeworkIconProps Interface (PRD Section 6.6.8) ──────────────────
export interface HomeworkIconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.2 — Adapter-wrapped re-exports (6 icons)
// ═══════════════════════════════════════════════════════════════════════════════

/** Adapter for ClockIcon — wraps to support `color` prop via CSS inheritance */
export const ClockIcon: React.FC<HomeworkIconProps> = ({ size = 14, color, className, style }) => (
  <span style={{ color, display: 'inline-flex', ...style }} className={className}>
    <_ClockIcon size={size} />
  </span>
);

/** Adapter for EditIcon — wraps to support `color` prop via CSS inheritance */
export const EditIcon: React.FC<HomeworkIconProps> = ({ size = 14, color, className, style }) => (
  <span style={{ color, display: 'inline-flex', ...style }} className={className}>
    <_EditIcon size={size} />
  </span>
);

/** Adapter for DeleteIcon — wraps to support `color` prop via CSS inheritance */
export const DeleteIcon: React.FC<HomeworkIconProps> = ({ size = 14, color, className, style }) => (
  <span style={{ color, display: 'inline-flex', ...style }} className={className}>
    <_DeleteIcon size={size} />
  </span>
);

/** Adapter for CloneIcon → DuplicateIcon — wraps to support `color` prop */
export const DuplicateIcon: React.FC<HomeworkIconProps> = ({ size = 16, color, className, style }) => (
  <span style={{ color, display: 'inline-flex', ...style }} className={className}>
    <_CloneIcon size={size} />
  </span>
);

/** Adapter for IconSearch → SearchIcon — wraps to support `size` prop (original hardcodes 20x20) */
export const SearchIcon: React.FC<HomeworkIconProps> = ({ size = 20, className, style }) => (
  <span style={{ width: size, height: size, display: 'inline-flex', overflow: 'hidden', ...style }} className={className}>
    <span style={{ display: 'inline-flex', transform: `scale(${size / 20})`, transformOrigin: 'top left' }}>
      <_IconSearch />
    </span>
  </span>
);

/** Adapter for IconProfile → StudentIcon — wraps to support `size` prop (original hardcodes 24x24) */
export const StudentIcon: React.FC<HomeworkIconProps> = ({ size = 20, className, style }) => (
  <span style={{ width: size, height: size, display: 'inline-flex', overflow: 'hidden', ...style }} className={className}>
    <span style={{ display: 'inline-flex', transform: `scale(${size / 24})`, transformOrigin: 'top left' }}>
      <_IconProfile />
    </span>
  </span>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.3 — Target Card Icons (6 icons)
// ═══════════════════════════════════════════════════════════════════════════════

/** Open book icon for class targets */
export const ClassIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

/** Lightning bolt icon — FILLED (only filled icon, uses fill instead of stroke) */
export const OverdueFlashIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'}
    stroke="none" className={className} style={style}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

/** Calendar with dot indicator */
export const CalendarIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <circle cx="12" cy="16" r="1.5" fill={color || 'currentColor'} stroke="none" />
  </svg>
);

/** Two overlapping person outlines */
export const UsersIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/** Circle with checkmark */
export const CheckCircleIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

/** Map pin icon for targets */
export const TargetPinIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.4 — Compact Homework Card Icons (4 icons)
// ═══════════════════════════════════════════════════════════════════════════════

/** Page with folded corner + 3 lines */
export const DocumentIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

/** 270° circular arrow with arrowhead (retry) */
export const RetryIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

/** 3 vertical bars ascending */
export const BarChartIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

/** Horizontal bar with partial fill (progress indicator) */
export const ProgressIcon: React.FC<HomeworkIconProps & { progress?: number }> = ({
  size = 20, color, className, style, progress = 50
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
    <rect x="2" y="9" width="20" height="6" rx="3" ry="3"
      stroke={color || 'currentColor'} strokeWidth="2" fill="none" />
    <rect x="4" y="11" width={Math.max(0, Math.min(16, (progress / 100) * 16))} height="2" rx="1" ry="1"
      fill={color || 'currentColor'} stroke="none" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.5 — Kebab Menu Action Icons (5 icons)
// ═══════════════════════════════════════════════════════════════════════════════

/** 3 stacked circles (kebab/more menu) — filled */
export const KebabMenuIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'}
    stroke="none" className={className} style={style}>
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

/** Clock with forward arrow (extend deadline) */
export const ExtendIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
    <path d="M17 17l3 3" />
    <polyline points="20 17 20 20 17 20" />
  </svg>
);

/** Counter-clockwise arrow with center X (reset) */
export const ResetIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    <line x1="10" y1="10" x2="14" y2="14" />
    <line x1="14" y1="10" x2="10" y2="14" />
  </svg>
);

/** Upward arrow from box (restore) */
export const RestoreIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);

/** Trash can with X overlay (permanent delete) */
export const PermanentDeleteIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="14" y2="15" />
    <line x1="14" y1="11" x2="10" y2="15" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.6 — Search & Filter Icons (4 icons)
// ═══════════════════════════════════════════════════════════════════════════════

/** X cross (clear/close) */
export const ClearIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/** Funnel icon (filter) */
export const FilterIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

/** Funnel with active indicator dot */
export const FilterActiveIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    <circle cx="19" cy="5" r="3" fill="#6366f1" stroke="none" />
  </svg>
);

/** 3 descending-width lines (sort) */
export const SortIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="16" y2="12" />
    <line x1="4" y1="18" x2="12" y2="18" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.7 — Navigation & UI Icons (5 icons)
// ═══════════════════════════════════════════════════════════════════════════════

/** Left chevron/arrow (back navigation) */
export const BackArrowIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

/** Right chevron */
export const ChevronRightIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/** Downward chevron (load more) */
export const LoadMoreIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** Full circular arrow (refresh) */
export const RefreshIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

/** Square with top-right arrow (external link) */
export const ExternalLinkIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.8 — Stats Bar and Empty State Icons (7 icons)
// ═══════════════════════════════════════════════════════════════════════════════

/** Stacked pages (total count) */
export const TotalIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="2" y="7" width="16" height="14" rx="2" ry="2" />
    <path d="M6 3h12a2 2 0 0 1 2 2v12" />
  </svg>
);

/** Circle with play triangle (active) */
export const ActiveIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill={color || 'currentColor'} stroke="none" />
  </svg>
);

/** Triangle with exclamation — filled */
export const WarningIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'}
    stroke="none" className={className} style={style}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="white" />
  </svg>
);

/** Donut chart arc (percentage/average) */
export const PercentIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" className={className} style={style}>
    <path d="M12 2a10 10 0 0 1 10 10" />
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <circle cx="12" cy="12" r="6" strokeOpacity="0.15" />
  </svg>
);

/** Bell with dot (needs attention) */
export const AttentionIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    <circle cx="18" cy="4" r="3" fill="#ef4444" stroke="none" />
  </svg>
);

/** Circle with + (create new) */
export const CreatePlusIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

/** Square with diagonal line (close all) */
export const CloseAllIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="7" y1="7" x2="17" y2="17" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1.9 — Large Empty State Icons (3 icons, viewBox 0 0 64 64)
// ═══════════════════════════════════════════════════════════════════════════════

/** Large clipboard (empty homework state) */
export const EmptyHomeworkIcon: React.FC<HomeworkIconProps> = ({ size = 64, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="12" y="8" width="40" height="50" rx="4" ry="4" />
    <rect x="22" y="4" width="20" height="10" rx="2" ry="2" />
    <line x1="22" y1="28" x2="42" y2="28" strokeOpacity="0.5" />
    <line x1="22" y1="36" x2="38" y2="36" strokeOpacity="0.5" />
    <line x1="22" y1="44" x2="34" y2="44" strokeOpacity="0.5" />
  </svg>
);

/** Two people with question mark (empty students state) */
export const EmptyStudentsIcon: React.FC<HomeworkIconProps> = ({ size = 64, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <circle cx="22" cy="20" r="8" />
    <path d="M6 52v-4a12 12 0 0 1 12-12h8a12 12 0 0 1 12 12v4" />
    <circle cx="42" cy="20" r="8" strokeOpacity="0.4" />
    <path d="M46 36a12 12 0 0 1 12 12v4" strokeOpacity="0.4" />
    <text x="32" y="16" textAnchor="middle" fontSize="16" fill={color || 'currentColor'}
      stroke="none" fontWeight="bold" opacity="0.6">?</text>
  </svg>
);

/** Document with empty checkboxes (empty assignments state) */
export const EmptyAssignmentsIcon: React.FC<HomeworkIconProps> = ({ size = 64, color, className, style }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color || 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M38 4H16a4 4 0 0 0-4 4v48a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V18z" />
    <polyline points="38 4 38 18 52 18" />
    <rect x="20" y="26" width="6" height="6" rx="1" strokeOpacity="0.5" />
    <line x1="30" y1="29" x2="44" y2="29" strokeOpacity="0.5" />
    <rect x="20" y="38" width="6" height="6" rx="1" strokeOpacity="0.5" />
    <line x1="30" y1="41" x2="44" y2="41" strokeOpacity="0.5" />
    <rect x="20" y="50" width="6" height="6" rx="1" strokeOpacity="0.5" />
    <line x1="30" y1="53" x2="40" y2="53" strokeOpacity="0.5" />
  </svg>
);
