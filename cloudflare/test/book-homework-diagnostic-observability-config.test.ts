import { describe, expect, it } from 'vitest';

import source from '../wrangler.prd0062-bridge-m1-activation.jsonc?raw';

describe('PRD0062 Milestone-1 diagnostic activation observability', () => {
  it('retains invocation logs and outbound traces at full diagnostic sampling', () => {
    expect(source).toContain('"invocation_logs": true');
    expect(source).toMatch(/"logs"\s*:\s*\{[^}]*"enabled"\s*:\s*true[^}]*"head_sampling_rate"\s*:\s*1[^}]*"persist"\s*:\s*true/su);
    expect(source).toMatch(/"traces"\s*:\s*\{[^}]*"enabled"\s*:\s*true[^}]*"head_sampling_rate"\s*:\s*1[^}]*"persist"\s*:\s*true/su);
  });
});
