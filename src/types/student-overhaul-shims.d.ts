declare module '@/services/invitationService' {
  export function redeemTeacherInvite(
    code: string,
    userUid: string
  ): Promise<{
    success?: boolean;
    error?: string;
    message?: string;
    role?: string;
  }>;
}

declare module '../../services/invitationService' {
  export function redeemTeacherInvite(
    code: string,
    userUid: string
  ): Promise<{
    success?: boolean;
    error?: string;
    message?: string;
    role?: string;
  }>;
}

declare module '../services/invitationService' {
  export function redeemTeacherInvite(
    code: string,
    userUid: string
  ): Promise<{
    success?: boolean;
    error?: string;
    message?: string;
    role?: string;
  }>;
}

declare module '../pages/StudentDashboardPage.jsx' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<any>;
  export default Component;
}

declare module '../pages/StudentClassDetailPage.jsx' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<any>;
  export default Component;
}

declare module '../pages/StudentWaitingRoomPage.jsx' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<any>;
  export default Component;
}

declare module '../components/PrivateRoute.jsx' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<any>;
  export default Component;
}
