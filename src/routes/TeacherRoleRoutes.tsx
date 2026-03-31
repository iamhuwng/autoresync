import React from 'react';
import { useRoutes } from 'react-router-dom';
import { teacherRoutes } from './teacherRoutes.tsx';

export default function TeacherRoleRoutes() {
  return useRoutes(teacherRoutes);
}
