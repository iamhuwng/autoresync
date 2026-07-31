import { describe, expect, it } from 'vitest';
import { ticket80HistoricalContextFixtures } from '../../../../scripts/qa/prd0062-ticket77-book-result-fixture.mjs';
import {
  validateBookResultAttemptDetail,
  validateBookResultGroupSummary,
} from './bookResultProjection.service';

describe('Ticket #80 browser fixture contract', () => {
  it('keeps the Student grouped response on the strict result wire contract', () => {
    expect(validateBookResultGroupSummary(ticket80HistoricalContextFixtures.group))
      .toEqual({ valid: true, errors: [] });
  });

  it.each([
    ticket80HistoricalContextFixtures.solo,
    ticket80HistoricalContextFixtures.homework,
  ])('keeps attempt detail $summary.attemptId on the strict result wire contract', (row) => {
    expect(validateBookResultAttemptDetail({
      ...row.summary,
      response: row.response,
    })).toEqual({ valid: true, errors: [] });
  });
});
