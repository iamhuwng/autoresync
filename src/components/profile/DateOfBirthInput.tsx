/**
 * DateOfBirthInput Component
 * 
 * Three dropdown selectors for day, month, and year with age validation.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { Select, Group, Text } from '@mantine/core';
import {
    generateDayOptions,
    generateYearOptions,
    MONTHS,
    calculateAge
} from '@/types/profile.types';

interface DateOfBirthInputProps {
    value: string; // DD/MM/YYYY format
    onChange: (value: string) => void;
    error?: string;
    disabled?: boolean;
}

export function DateOfBirthInput({ value, onChange, error, disabled }: DateOfBirthInputProps) {
    // Parse current value
    const parts = value.split('/');
    const day = parts[0] || '';
    const month = parts[1] || '';
    const year = parts[2] || '';

    // Generate options
    const dayOptions = generateDayOptions().map(d => ({
        value: d.toString().padStart(2, '0'),
        label: d.toString(),
    }));

    const monthOptions = MONTHS.map(m => ({
        value: m.value,
        label: m.label,
    }));

    const yearOptions = generateYearOptions().map(y => ({
        value: y.toString(),
        label: y.toString(),
    }));

    const handleDayChange = (newDay: string | null) => {
        if (newDay) {
            const newValue = `${newDay}/${month}/${year}`;
            onChange(newValue);
        }
    };

    const handleMonthChange = (newMonth: string | null) => {
        if (newMonth) {
            const newValue = `${day}/${newMonth}/${year}`;
            onChange(newValue);
        }
    };

    const handleYearChange = (newYear: string | null) => {
        if (newYear) {
            const newValue = `${day}/${month}/${newYear}`;
            onChange(newValue);
        }
    };

    // Calculate age for display
    const age = value && day && month && year ? calculateAge(value) : null;
    const ageError = age !== null && (age < 5 || age > 100)
        ? `Age must be between 5 and 100 years (currently ${age})`
        : undefined;

    const displayError = error || ageError;

    return (
        <div>
            <Text size="sm" fw={500} mb={4}>
                Date of Birth
            </Text>
            <Group align="flex-start" gap="sm">
                <Select
                    placeholder="Day"
                    data={dayOptions}
                    value={day}
                    onChange={handleDayChange}
                    disabled={disabled}
                    searchable
                    styles={{ input: { width: '100px' } }}
                />
                <Select
                    placeholder="Month"
                    data={monthOptions}
                    value={month}
                    onChange={handleMonthChange}
                    disabled={disabled}
                    searchable
                    styles={{ input: { width: '140px' } }}
                />
                <Select
                    placeholder="Year"
                    data={yearOptions}
                    value={year}
                    onChange={handleYearChange}
                    disabled={disabled}
                    searchable
                    styles={{ input: { width: '120px' } }}
                />
            </Group>
            {age !== null && !ageError && (
                <Text size="xs" c="dimmed" mt={4}>
                    Age: {age} years
                </Text>
            )}
            {displayError && (
                <Text size="xs" c="red" mt={4}>
                    {displayError}
                </Text>
            )}
        </div>
    );
}
