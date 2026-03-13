/**
 * Admin Components - Barrel Export
 * 
 * Centralized export for all admin-related UI components.
 * 
 * @example
 * import { AdminStatsHeader, AdminToolbar, AlertMessages } from './components/admin';
 */

export { AdminStatsHeader } from './AdminStatsHeader';
export { AdminToolbar } from './AdminToolbar';
export { AlertMessages } from './AlertMessages';
export { StudentCard } from './StudentCard';
export { StudentGrid } from './StudentGrid';
export { LoadingState } from './LoadingState';
export { EmptyState } from './EmptyState';
export { TeacherRow } from './TeacherRow';

// Phase 3: Tab Panels (NEW)
export { TeacherTable } from './TeacherTable';
export { InvitationsPanel } from './InvitationsPanel';
export { RequestsPanel } from './RequestsPanel';
export { CourseTypesPanel } from './CourseTypesPanel';
export { AdminTagManager } from './AdminTagManager';

// Phase 4: Modal Components (NEW)
export { EditUserModal } from './EditUserModal';
export { AdminModalsManager } from './AdminModalsManager';
export type { EditFormState } from './EditUserModal';

// Phase 6: Layout Components (NEW)
export { AdminHeader } from './AdminHeader';
export { AdminPageLayout } from './AdminPageLayout';
export { AdminTabList } from './AdminTabList';
export { AdminTabsContainer } from './AdminTabsContainer';
export { AdminPageTitle } from './AdminPageTitle';

export type { StatItem } from './AdminStatsHeader';
export type { AdminToolbarProps } from './AdminToolbar';
export type { StudentCardProps } from './StudentCard';
export type { StudentGridProps } from './StudentGrid';
export type { TeacherRowProps } from './TeacherRow';

// Phase 3: Tab Panel Types
export type { Invitation } from './InvitationsPanel';
export type { StudentRequest } from './RequestsPanel';
export type { TypeRequest } from './CourseTypesPanel';

// Shared Types
export type { User, Assignment, SelectOption } from './admin.types';
