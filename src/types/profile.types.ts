/**
 * Profile Types
 * 
 * Validation schemas, constants, and interfaces for the enhanced profile system.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

// ============================================
// PROFILE FORM DATA
// ============================================

export interface ProfileFormData {
    firstName: string;
    familyName: string;
    dateOfBirth: string; // DD/MM/YYYY format
    phone: {
        countryCode: string;
        number: string;
    };
    address: {
        street: string;
        city: string;
        province: string;
        country: string;
    };
    school?: string;
    job?: string;
}

// ============================================
// VALIDATION RULES
// ============================================

export const ProfileValidationRules = {
    firstName: {
        minLength: 1,
        maxLength: 50,
        required: true,
    },
    familyName: {
        minLength: 1,
        maxLength: 50,
        required: true,
    },
    dateOfBirth: {
        required: true,
        minAge: 5,
        maxAge: 100,
    },
    phone: {
        number: {
            minLength: 6,
            maxLength: 15,
            pattern: /^[0-9]+$/,
        },
        required: true,
    },
    address: {
        street: {
            minLength: 1,
            maxLength: 200,
        },
        city: {
            minLength: 1,
            maxLength: 100,
        },
        province: {
            minLength: 1,
            maxLength: 100,
        },
        country: {
            required: true,
        },
        required: true,
    },
    school: {
        minLength: 1,
        maxLength: 200,
        required: false,
    },
    job: {
        minLength: 1,
        maxLength: 100,
        required: false,
    },
} as const;

// ============================================
// COUNTRY CODE OPTIONS
// ============================================

export interface CountryCodeOption {
    code: string;
    name: string;
    dialCode: string;
    flag: string;
}

/**
 * List of country codes with flags for phone number input
 * Sorted by common usage (Vietnam first, then alphabetically)
 */
export const COUNTRY_CODES: CountryCodeOption[] = [
    { code: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
    { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
    { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
    { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
    { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
    { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
    { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
    { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
    { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
    { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
    { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
    { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
    { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
    { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
    { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
];

/**
 * List of countries for address dropdown
 */
export const COUNTRIES: Array<{ code: string; name: string }> = [
    { code: 'VN', name: 'Vietnam' },
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AU', name: 'Australia' },
    { code: 'CA', name: 'Canada' },
    { code: 'CN', name: 'China' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'IN', name: 'India' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'JP', name: 'Japan' },
    { code: 'KR', name: 'South Korea' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'PH', name: 'Philippines' },
    { code: 'SG', name: 'Singapore' },
    { code: 'TH', name: 'Thailand' },
];

// ============================================
// DATE HELPERS
// ============================================

/**
 * Generate array of years for date of birth dropdown
 * @param minAge Minimum age (default: 5)
 * @param maxAge Maximum age (default: 100)
 */
export function generateYearOptions(minAge = 5, maxAge = 100): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];

    for (let i = minAge; i <= maxAge; i++) {
        years.push(currentYear - i);
    }

    return years;
}

/**
 * Generate array of months
 */
export const MONTHS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
] as const;

/**
 * Generate array of days (1-31)
 */
export function generateDayOptions(): number[] {
    return Array.from({ length: 31 }, (_, i) => i + 1);
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate date of birth and calculate age
 * @param dateOfBirth Date string in DD/MM/YYYY format
 * @returns Age in years or null if invalid
 */
export function calculateAge(dateOfBirth: string): number | null {
    const parts = dateOfBirth.split('/');
    if (parts.length !== 3) return null;

    const dayStr = parts[0];
    const monthStr = parts[1];
    const yearStr = parts[2];

    if (!dayStr || !monthStr || !yearStr) return null;

    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10) - 1; // JS months are 0-indexed
    const year = parseInt(yearStr, 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const birthDate = new Date(year, month, day);
    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
}

/**
 * Validate phone number format
 * @param number Phone number string
 * @returns True if valid
 */
export function isValidPhoneNumber(number: string): boolean {
    const { pattern, minLength, maxLength } = ProfileValidationRules.phone.number;

    if (!pattern.test(number)) return false;
    if (number.length < minLength || number.length > maxLength) return false;

    return true;
}
