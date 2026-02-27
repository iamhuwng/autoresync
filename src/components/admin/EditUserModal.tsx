import React from 'react';
import { Modal, Stack, TextInput, Select, Button } from '@mantine/core';

export interface EditFormState {
    displayName: string;
    studentGroup: string;
    status: string;
}

export interface EditUserModalProps {
    opened: boolean;
    onClose: () => void;
    editForm: EditFormState;
    onFormChange: (form: EditFormState) => void;
    onSave: () => void;
    loading?: boolean;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
    opened,
    onClose,
    editForm,
    onFormChange,
    onSave,
    loading = false,
}) => {
    return (
        <Modal opened={opened} onClose={onClose} title="Edit User">
            <Stack>
                <TextInput
                    label="Display Name"
                    value={editForm.displayName}
                    onChange={(e) => onFormChange({ ...editForm, displayName: e.target.value })}
                    disabled={loading}
                />
                <TextInput
                    label="Student Group"
                    value={editForm.studentGroup}
                    onChange={(e) => onFormChange({ ...editForm, studentGroup: e.target.value })}
                    disabled={loading}
                />
                <Select
                    label="Status"
                    value={editForm.status}
                    onChange={(val) => onFormChange({ ...editForm, status: val || 'active' })}
                    data={[
                        { value: 'active', label: 'Active' },
                        { value: 'blocked', label: 'Blocked' }
                    ]}
                    disabled={loading}
                />
                <Button onClick={onSave} loading={loading}>
                    Save Changes
                </Button>
            </Stack>
        </Modal>
    );
};
