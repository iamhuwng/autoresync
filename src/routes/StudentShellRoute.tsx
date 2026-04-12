import React from 'react';
import { Outlet } from 'react-router-dom';
import { StudentShellDataProvider } from '../context/StudentShellDataContext.tsx';
import StudentResumeBootstrap from './StudentResumeBootstrap.tsx';

export default function StudentShellRoute() {
  return (
    <StudentShellDataProvider>
      <StudentResumeBootstrap />
      <Outlet />
    </StudentShellDataProvider>
  );
}
