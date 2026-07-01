import { describe, expect, it } from 'vitest';

import { validateR2LifecycleConfig } from '../scripts/verify-r2-lifecycle-config.mjs';

describe('R2 temp lifecycle config verifier', () => {
  it('accepts only one-day expiration scoped to temp/ and rejects durable prefixes', () => {
    expect(validateR2LifecycleConfig({
      rules: [
        {
          id: 'expire-temp-prefix-after-one-day',
          enabled: true,
          conditions: { prefix: 'temp/' },
          deleteObjectsTransition: {
            condition: {
              type: 'Age',
              maxAge: 86400,
            },
          },
        },
      ],
    })).toEqual({
      ruleId: 'expire-temp-prefix-after-one-day',
      prefix: 'temp/',
      maxAge: 86400,
    });
  });

  it('rejects configs that include durable assessment asset prefixes', () => {
    expect(() => validateR2LifecycleConfig({
      rules: [
        {
          id: 'bad-durable-rule',
          enabled: true,
          conditions: { prefix: 'assessment-assets/' },
          deleteObjectsTransition: {
            condition: {
              type: 'Age',
              maxAge: 86400,
            },
          },
        },
      ],
    })).toThrow(/temp/);
  });
});
