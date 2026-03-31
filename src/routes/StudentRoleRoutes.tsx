import React from 'react';
import { useRoutes } from 'react-router-dom';
import { studentRoutes } from './studentRoutes.tsx';

export default function StudentRoleRoutes() {
  return useRoutes(studentRoutes);
}
