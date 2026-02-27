/**
 * PhoneInput Component
 * 
 * Country code dropdown with flag icons and formatted phone number input.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { Select, TextInput, Group } from '@mantine/core';
import { COUNTRY_CODES } from '@/types/profile.types';

interface PhoneInputProps {
    value: {
        countryCode: string;
        number: string;
    };
    onChange: (value: { countryCode: string; number: string }) => void;
    error?: string;
    disabled?: boolean;
}

export function PhoneInput({ value, onChange, error, disabled }: PhoneInputProps) {
    // Format country code options for Select component
    // Use country code + dial code as unique key to avoid duplicates (US/CA both use +1)
    const countryOptions = COUNTRY_CODES.map((country) => ({
        value: `${country.code}:${country.dialCode}`, // Unique value (e.g., "US:+1", "CA:+1")
        label: `${country.flag} ${country.name} ${country.dialCode}`,
    }));

    // Find current selection by matching dialCode
    const currentSelection = COUNTRY_CODES.find(
        (country) => country.dialCode === value.countryCode
    );
    const selectValue = currentSelection
        ? `${currentSelection.code}:${currentSelection.dialCode}`
        : undefined;

    const handleCountryCodeChange = (newValue: string | null) => {
        if (newValue) {
            // Extract dialCode from "CODE:+XX" format
            const dialCode = newValue.split(':')[1];
            if (dialCode) {
                onChange({
                    ...value,
                    countryCode: dialCode,
                });
            }
        }
    };

    const handleNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newNumber = event.target.value;

        // Only allow digits
        const digitsOnly = newNumber.replace(/\D/g, '');

        onChange({
            ...value,
            number: digitsOnly,
        });
    };

    // Validate phone number
    const numberError = error || validateNumber(value.number);

    return (
        <Group align="flex-start" gap="sm" grow>
            <Select
                label="Country Code"
                placeholder="Select code"
                data={countryOptions}
                value={selectValue}
                onChange={handleCountryCodeChange}
                disabled={disabled}
                searchable
                styles={{
                    input: {
                        width: '140px',
                    },
                }}
            />
            <TextInput
                label="Phone Number"
                placeholder="123456789"
                value={value.number}
                onChange={handleNumberChange}
                error={numberError}
                disabled={disabled}
                type="tel"
                inputMode="numeric"
            />
        </Group>
    );
}

/**
 * Validate phone number format
 */
function validateNumber(number: string): string | undefined {
    if (!number) {
        return undefined;
    }

    if (number.length < 6) {
        return 'Phone number must be at least 6 digits';
    }

    if (number.length > 15) {
        return 'Phone number must be less than 15 digits';
    }

    if (!/^\d+$/.test(number)) {
        return 'Phone number must contain only digits';
    }

    return undefined;
}
