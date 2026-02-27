import React from 'react';
import { Tabs } from '@mantine/core';

export interface AdminTabListProps {
    isSuperAdmin: boolean;
}

export const AdminTabList: React.FC<AdminTabListProps> = ({
    isSuperAdmin,
}) => {
    return (
        <Tabs.List>
            <Tabs.Tab value="students">Students</Tabs.Tab>
            {isSuperAdmin && <Tabs.Tab value="teachers">Teachers</Tabs.Tab>}
            {isSuperAdmin && <Tabs.Tab value="invitations">Invitations</Tabs.Tab>}
            {isSuperAdmin && <Tabs.Tab value="requests">Requests</Tabs.Tab>}
            {isSuperAdmin && <Tabs.Tab value="course-types">Course Types</Tabs.Tab>}
        </Tabs.List>
    );
};
