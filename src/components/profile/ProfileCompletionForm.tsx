/**
 * ProfileCompletionForm Component
 * 
 * Multi-field form for completing user profile with validation.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { useState } from 'react';
import { TextInput, Select, Button, Stack, Group, Title, Text } from '@mantine/core';
import { PhoneInput } from './PhoneInput';
import { DateOfBirthInput } from './DateOfBirthInput';
import { AvatarUploader } from './AvatarUploader';
import { COUNTRIES, ProfileValidationRules } from '@/types/profile.types';
import type { UserProfile } from '@/types/user.types';

interface ProfileCompletionFormProps {
    onSubmit: (data: Partial<UserProfile>) => Promise<void>;
    initialData?: Partial<UserProfile>;
    userRole?: 'student' | 'teacher' | 'super_admin';
}

export function ProfileCompletionForm({
    onSubmit,
    initialData = {},
    userRole = 'student'
}: ProfileCompletionFormProps) {
    const [formData, setFormData] = useState({
        firstName: initialData.firstName || '',
        familyName: initialData.familyName || '',
        dateOfBirth: initialData.dateOfBirth || '',
        phone: initialData.phone || { countryCode: '+84', number: '' },
        address: initialData.address || {
            street: '',
            city: '',
            province: '',
            country: 'VN',
        },
        school: initialData.school || '',
        job: initialData.job || '',
        // Preserve existing avatar URL - only override when explicitly changed
        avatarUrl: initialData.avatarUrl ?? null,
    });

    // Track if avatar was explicitly changed/removed
    const [avatarChanged, setAvatarChanged] = useState(false);

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        // First name
        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        } else if (formData.firstName.length > ProfileValidationRules.firstName.maxLength) {
            newErrors.firstName = `First name must be less than ${ProfileValidationRules.firstName.maxLength} characters`;
        }

        // Family name
        if (!formData.familyName.trim()) {
            newErrors.familyName = 'Family name is required';
        } else if (formData.familyName.length > ProfileValidationRules.familyName.maxLength) {
            newErrors.familyName = `Family name must be less than ${ProfileValidationRules.familyName.maxLength} characters`;
        }

        // Date of birth
        if (!formData.dateOfBirth) {
            newErrors.dateOfBirth = 'Date of birth is required';
        } else {
            const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
            if (!datePattern.test(formData.dateOfBirth)) {
                newErrors.dateOfBirth = 'Invalid date format (DD/MM/YYYY)';
            }
        }

        // Phone
        if (!formData.phone.number) {
            newErrors.phone = 'Phone number is required';
        } else if (formData.phone.number.length < ProfileValidationRules.phone.number.minLength) {
            newErrors.phone = `Phone number must be at least ${ProfileValidationRules.phone.number.minLength} digits`;
        } else if (formData.phone.number.length > ProfileValidationRules.phone.number.maxLength) {
            newErrors.phone = `Phone number must be less than ${ProfileValidationRules.phone.number.maxLength} digits`;
        }

        // Address
        if (!formData.address.street.trim()) {
            newErrors.street = 'Street address is required';
        }
        if (!formData.address.city.trim()) {
            newErrors.city = 'City is required';
        }
        if (!formData.address.province.trim()) {
            newErrors.province = 'Province/State is required';
        }
        if (!formData.address.country) {
            newErrors.country = 'Country is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setSubmitting(true);
        try {
            // Build submission data - only include avatarUrl if it was explicitly changed
            const submissionData = {
                ...formData,
            };

            // If avatar wasn't changed and we have an initial value, preserve the original
            // by not including avatarUrl in the update (prevents overwriting with null)
            if (!avatarChanged && initialData.avatarUrl) {
                submissionData.avatarUrl = initialData.avatarUrl;
            }

            await onSubmit(submissionData);
        } catch (error) {
            console.error('Profile submission error:', error);
            setErrors({ submit: 'Failed to save profile. Please try again.' });
        } finally {
            setSubmitting(false);
        }
    };

    const countryOptions = COUNTRIES.map(c => ({
        value: c.code,
        label: c.name,
    }));

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="lg">
                <div>
                    <Title order={2} mb="xs">Complete Your Profile</Title>
                    <Text c="dimmed" size="sm">
                        Please fill in all required information to continue.
                    </Text>
                </div>

                {/* Avatar Upload */}
                <AvatarUploader
                    currentAvatarUrl={formData.avatarUrl}
                    onUploadComplete={(url) => {
                        setFormData({ ...formData, avatarUrl: url });
                        setAvatarChanged(true);
                    }}
                    onRemove={() => {
                        setFormData({ ...formData, avatarUrl: null });
                        setAvatarChanged(true);
                    }}
                    disabled={submitting}
                />

                {/* Name Fields */}
                <Group grow>
                    <TextInput
                        label="First Name"
                        placeholder="John"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        error={errors.firstName}
                        required
                        disabled={submitting}
                    />
                    <TextInput
                        label="Family Name"
                        placeholder="Doe"
                        value={formData.familyName}
                        onChange={(e) => setFormData({ ...formData, familyName: e.target.value })}
                        error={errors.familyName}
                        required
                        disabled={submitting}
                    />
                </Group>

                {/* Date of Birth */}
                <DateOfBirthInput
                    value={formData.dateOfBirth}
                    onChange={(value) => setFormData({ ...formData, dateOfBirth: value })}
                    error={errors.dateOfBirth}
                    disabled={submitting}
                />

                {/* Phone */}
                <PhoneInput
                    value={formData.phone}
                    onChange={(value) => setFormData({ ...formData, phone: value })}
                    error={errors.phone}
                    disabled={submitting}
                />

                {/* Address */}
                <Stack gap="sm">
                    <Text size="sm" fw={500}>Address</Text>

                    <TextInput
                        label="Street Address"
                        placeholder="123 Main Street"
                        value={formData.address.street}
                        onChange={(e) => setFormData({
                            ...formData,
                            address: { ...formData.address, street: e.target.value }
                        })}
                        error={errors.street}
                        required
                        disabled={submitting}
                    />

                    <Group grow>
                        <TextInput
                            label="City"
                            placeholder="Hanoi"
                            value={formData.address.city}
                            onChange={(e) => setFormData({
                                ...formData,
                                address: { ...formData.address, city: e.target.value }
                            })}
                            error={errors.city}
                            required
                            disabled={submitting}
                        />
                        <TextInput
                            label="Province/State"
                            placeholder="Hanoi"
                            value={formData.address.province}
                            onChange={(e) => setFormData({
                                ...formData,
                                address: { ...formData.address, province: e.target.value }
                            })}
                            error={errors.province}
                            required
                            disabled={submitting}
                        />
                    </Group>

                    <Select
                        label="Country"
                        placeholder="Select country"
                        data={countryOptions}
                        value={formData.address.country}
                        onChange={(value) => setFormData({
                            ...formData,
                            address: { ...formData.address, country: value || '' }
                        })}
                        error={errors.country}
                        required
                        searchable
                        disabled={submitting}
                    />
                </Stack>

                {/* Optional Fields */}
                {userRole === 'student' && (
                    <TextInput
                        label="School (Optional)"
                        placeholder="Your school name"
                        value={formData.school}
                        onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                        disabled={submitting}
                    />
                )}

                {(userRole === 'teacher' || userRole === 'super_admin') && (
                    <TextInput
                        label="Job Title (Optional)"
                        placeholder="Your job title"
                        value={formData.job}
                        onChange={(e) => setFormData({ ...formData, job: e.target.value })}
                        disabled={submitting}
                    />
                )}

                {/* Submit Error */}
                {errors.submit && (
                    <Text c="red" size="sm">
                        {errors.submit}
                    </Text>
                )}

                {/* Submit Button */}
                <Button
                    type="submit"
                    size="lg"
                    loading={submitting}
                    fullWidth
                >
                    Complete Profile
                </Button>
            </Stack>
        </form>
    );
}
