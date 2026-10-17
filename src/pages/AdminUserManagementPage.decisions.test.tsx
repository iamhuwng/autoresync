import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminUserManagementPage from './AdminUserManagementPage.jsx';
import { ToastContainer, toast } from '../components/modern/ToastNotification';
import { FEATURE_IDS, FEATURE_REGISTRY } from '../config/featureRegistry';

const mocks = vi.hoisted(() => ({
  approveAssignment: vi.fn(), denyAssignment: vi.fn(), approveType: vi.fn(), rejectType: vi.fn(),
  trackAction: vi.fn(), trackPageView: vi.fn(), banner: vi.fn(), loadUsers: vi.fn(), loadAssignments: vi.fn(),
  getTypes: vi.fn(), getPending: vi.fn(), getRequests: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'admin-1' }, profile: { role: 'super_admin' }, logout: vi.fn() }) }));
vi.mock('../hooks/useNavigation', () => ({ useNavigation: () => ({ navigateTo: vi.fn() }) }));
vi.mock('../hooks/useBreadcrumbs', () => ({ addNavigationBreadcrumb: vi.fn() }));
vi.mock('../services/reportingService', () => ({ reportingService: { trackAction: mocks.trackAction, trackPageView: mocks.trackPageView } }));
vi.mock('../services/assignmentManager', () => ({
  approveStudentRequest: mocks.approveAssignment, denyStudentRequest: mocks.denyAssignment,
  getAllAssignmentRequests: mocks.getRequests, createStudentRequest: vi.fn(), removeAssignment: vi.fn(),
}));
vi.mock('../services/courseManager', () => ({
  getAllCourses: vi.fn().mockResolvedValue([]), getCoursesByOwner: vi.fn().mockResolvedValue([]),
  getCourseTypes: mocks.getTypes, getPendingTypeRequests: mocks.getPending,
  approveCourseType: mocks.approveType, rejectCourseType: mocks.rejectType,
}));
vi.mock('../services/classManager', () => ({ getClasses: vi.fn().mockResolvedValue([]), enrollStudent: vi.fn() }));
vi.mock('../hooks/admin', async () => {
  const { useStudentRequests } = await import('../hooks/admin/useStudentRequests');
  const { useCourseTypes } = await import('../hooks/admin/useCourseTypes');
  return {
    useStudentRequests, useCourseTypes,
    useAssignments: () => ({ assignmentsByStudent: {}, loadAssignments: mocks.loadAssignments }),
    useUserManagement: () => ({ users: [{ uid: 'teacher-1', displayName: 'Teacher One', role: 'teacher' }], filteredUsers: [], loadUsers: mocks.loadUsers, setAssignmentFilter: vi.fn(), setSuccessMessage: mocks.banner }),
    useAdminModals: () => ({ modals: {} }), useInvitations: () => ({ invitations: [] }),
  };
});
vi.mock('../components/navigation', () => ({ AdminLayout: ({ children }: any) => <main>{children}</main> }));
vi.mock('../components/admin', async () => {
  const { CourseTypesPanel } = await import('../components/admin/CourseTypesPanel');
  return {
    AlertMessages: () => null, AdminPageTitle: () => null, AdminModalsManager: () => null,
    AdminTabsContainer: (props: any) => <>
      <button onClick={() => props.onApproveRequest('assignment-request')}>Approve assignment</button>
      <button onClick={() => props.onDenyRequest('assignment-request')}>Deny assignment</button>
      <button onClick={() => props.onTabChange('course-types')}>Course types</button>
      <CourseTypesPanel courseTypes={props.courseTypes} pendingRequests={props.pendingTypeRequests} users={props.userManagement.users} onApprove={props.onApproveType} onReject={props.onRejectType} />
    </>,
  };
});

const decisions = [
  { button: 'Approve assignment', action: 'approveStudentRequest', service: mocks.approveAssignment, id: 'assignment-request', message: 'Request approved', confirmed: false },
  { button: 'Deny assignment', action: 'denyStudentRequest', service: mocks.denyAssignment, id: 'assignment-request', message: 'Request denied', confirmed: true },
  { button: 'Approve', action: 'approveCourseType', service: mocks.approveType, id: 'type-request', message: 'Course type approved', confirmed: true },
  { button: 'Reject', action: 'rejectCourseType', service: mocks.rejectType, id: 'type-request', message: 'Course type rejected', confirmed: true },
];

async function openPage() {
  render(<MemoryRouter><AdminUserManagementPage /><ToastContainer /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Course types' }));
  await screen.findByRole('table', { name: 'Pending course type requests' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadUsers.mockResolvedValue(undefined);
  mocks.getRequests.mockResolvedValue([]);
  mocks.getTypes.mockResolvedValue([{ id: 'type-1', name: 'IELTS', createdBy: 'admin-1', createdAt: 1 }]);
  mocks.getPending.mockResolvedValue([{ id: 'type-request', typeName: 'Academic Writing', teacherId: 'teacher-1', requestedAt: 1, status: 'pending' }]);
  for (const decision of decisions) decision.service.mockResolvedValue({ success: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); toast.clear(); vi.restoreAllMocks(); });

describe('Admin assignment and course type decisions', () => {
  it('renders actual adapter names and requester identity for non-empty data', async () => {
    await openPage();
    expect(screen.getByText('IELTS')).toBeInTheDocument();
    expect(screen.getByText('Academic Writing')).toBeInTheDocument();
    expect(screen.getByText('Teacher One')).toBeInTheDocument();
  });

  it.each(decisions)('$action announces committed success and tracks the actual action once', async decision => {
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: decision.button, exact: true }));
    expect(await screen.findByRole('status')).toHaveTextContent(decision.message);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(decision.service).toHaveBeenCalledWith(...(decision.id === 'assignment-request' ? [decision.id, 'admin-1'] : [decision.id]));
    expect(mocks.trackAction).toHaveBeenCalledExactlyOnceWith(FEATURE_IDS.adminPanel, decision.action, { requestId: decision.id });
    expect(FEATURE_REGISTRY.find(feature => feature.id === FEATURE_IDS.adminPanel)?.actions).toContain(decision.action);
    expect(mocks.banner).not.toHaveBeenCalled();
  });

  it.each(decisions)('$action announces a failed product decision with role alert', async decision => {
    decision.service.mockResolvedValue({ success: false, error: 'Permission denied' });
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: decision.button, exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mocks.banner).not.toHaveBeenCalled();
  });

  it.each(decisions.filter(decision => decision.confirmed))('$action cancellation skips storage, tracking and announcements', async decision => {
    vi.mocked(window.confirm).mockReturnValue(false);
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: decision.button, exact: true }));
    expect(decision.service).not.toHaveBeenCalled();
    expect(mocks.trackAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('waits for the product result before showing success', async () => {
    let commit!: (result: { success: boolean }) => void;
    mocks.approveAssignment.mockReturnValue(new Promise(resolve => { commit = resolve; }));
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'Approve assignment' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    commit({ success: true });
    await screen.findByRole('status');
  });

  it('keeps a committed course decision successful when its refresh fails', async () => {
    await openPage();
    mocks.getPending.mockRejectedValue(new Error('Refresh unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Course type approved'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
