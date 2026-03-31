import React from 'react';
import { useRoutes } from 'react-router-dom';
import { adminRoutes } from './adminRoutes.tsx';

export default function AdminRoleRoutes() {
  return useRoutes(adminRoutes);
}
