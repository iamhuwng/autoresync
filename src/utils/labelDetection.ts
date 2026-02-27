/**
 * Shared label detection utility for IELTS option strings.
 *
 * Determines whether an option string already carries its own sequential
 * label prefix (e.g. "A.", "i.", "(B)") so components can avoid adding a
 * duplicate prefix when rendering.
 *
 * Context-aware: checks whether the prefix matches the *expected* sequential
 * position (`index`), not just any letter/numeral at the start of the string.
 */

const ROMAN_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii'] as const;

/**
 * Returns `true` if `text` already starts with the label expected at `index`.
 *
 * Supported formats: `"A. text"`, `"A text"`, `"A) text"`, `"(A) text"`,
 * `"a. text"`, `"i. text"`, `"ii) text"` etc.
 *
 * @param text  The raw option string from the database.
 * @param index Zero-based position of the option in its list.
 */
export const hasExistingLabel = (text: string, index: number): boolean => {
    if (!text) return false;
    const trimmed = text.trim();

    const expectedLetter = String.fromCharCode(65 + index); // 'A', 'B', 'C'...
    const expectedLower = expectedLetter.toLowerCase();

    // Single bare letter match
    if (trimmed === expectedLetter || trimmed === expectedLower) return true;

    // Uppercase letter with separator
    if (
        trimmed.startsWith(expectedLetter + '.') ||
        trimmed.startsWith(expectedLetter + ' ') ||
        trimmed.startsWith(expectedLetter + ')') ||
        trimmed.startsWith('(' + expectedLetter + ')')
    ) return true;

    // Lowercase letter with separator
    if (
        trimmed.startsWith(expectedLower + '.') ||
        trimmed.startsWith(expectedLower + ' ') ||
        trimmed.startsWith(expectedLower + ')') ||
        trimmed.startsWith('(' + expectedLower + ')')
    ) return true;

    // Roman numeral prefix
    if (index < ROMAN_NUMERALS.length) {
        const expectedRoman = ROMAN_NUMERALS[index]!;
        const lower = trimmed.toLowerCase();
        if (
            lower.startsWith(expectedRoman + '.') ||
            lower.startsWith(expectedRoman + ' ') ||
            lower.startsWith(expectedRoman + ')')
        ) return true;
    }

    return false;
};

/**
 * Convert a 1-based number to a lowercase Roman numeral string.
 * Supports up to 13 (xiii).
 */
export const toRoman = (num: number): string => {
    const romanMap: [number, string][] = [
        [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
    ];
    let result = '';
    let n = num;
    for (const [val, char] of romanMap) {
        while (n >= val) {
            result += char;
            n -= val;
        }
    }
    return result;
};

/**
 * Convert a 0-based index to an uppercase letter (0 → 'A', 1 → 'B', …).
 */
export const indexToLetter = (index: number): string =>
    String.fromCharCode(65 + index);
