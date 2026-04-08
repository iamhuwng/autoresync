/**
 * @deprecated Tests split into individual files (LOW-1 cleanup):
 *   - MobileReadingHeader.test.tsx
 *   - MobilePassageTabs.test.tsx
 *   - MobileQuestionsFab.test.tsx
 *   - MobileQuestionSheet.test.tsx
 *
 * This file is kept to avoid vitest "no suite" errors.
 * Remove once the split files are confirmed stable.
 *
 * @see PRD-0043 Task 3.5
 */

import { describe, it } from 'vitest';

describe('MobileShellComponents (deprecated)', () => {
  it('tests moved to per-component files', () => {
    // See individual test files listed above
  });
});
