import type {
  BookActivityEvaluationRepository,
  BookActivityEvaluationRevision,
  BookActivityEvaluationTarget,
} from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import { BOOK_ACTIVITY_EVALUATION_MAX_HISTORY } from './repository.ts';
import { bookActivityEvaluationTargetsEqual } from './repository.ts';

export const readImmutableBookActivityEvaluationHistory = async (
  repository: BookActivityEvaluationRepository,
  input: {
    readonly target: BookActivityEvaluationTarget;
    readonly limit?: number;
  },
): Promise<readonly BookActivityEvaluationRevision[]> => {
  const limit = input.limit ?? BOOK_ACTIVITY_EVALUATION_MAX_HISTORY;
  const rows = await repository.listHistory({ target: input.target, limit });
  let previous = 0;
  for (const row of rows) {
    if (row.previousRevision !== row.revision - 1
      || row.revision <= previous
      || !bookActivityEvaluationTargetsEqual(row.target, input.target)) {
      throw new Error('evaluation_history_readback_invalid');
    }
    previous = row.revision;
  }
  return rows;
};
