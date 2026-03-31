import React from 'react';
import { Outlet } from 'react-router-dom';
import { StudentShellDataProvider } from '../context/StudentShellDataContext.tsx';

export default function StudentShellRoute() {
  return (
    <StudentShellDataProvider>
      <Outlet />
    </StudentShellDataProvider>
  );
}
