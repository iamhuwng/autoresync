/**
 * TestCreationRedirectPage.tsx
 * 
 * Redirect page for backward compatibility.
 * Redirects `/teacher/test/create` → `/admin/materials?openCreateModal=true`
 * 
 * This allows existing links/bookmarks to continue working after
 * the test creation flow was moved into the modal-based workflow.
 * 
 * @module TestCreationRedirectPage
 * @version 1.0.0
 * @date 2026-02-07
 * @see PRD-0022 Task 5.8
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Center, Loader, Text, Stack } from '@mantine/core';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../constants/routes';

const TestCreationRedirectPage: React.FC = () => {
    const navigate = useNavigate();
    const { profile } = useAuth();

    useEffect(() => {
        // Wait for auth to load, then redirect
        if (profile) {
            // Redirect to Materials tab with query param to auto-open modal
            const targetPath = `${ROUTES.ADMIN_MATERIALS}?openCreateModal=true`;
            navigate(targetPath, { replace: true });
        }
    }, [profile, navigate]);

    return (
        <Center style={{ height: '100vh' }}>
            <Stack align="center" gap="md">
                <Loader size="lg" color="violet" />
                <Text size="sm" c="dimmed">
                    Redirecting to Materials...
                </Text>
            </Stack>
        </Center>
    );
};

export default TestCreationRedirectPage;
