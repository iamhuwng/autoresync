import {
  createTrustedBookActivityEvaluationService,
  type BookActivityEvaluationDependencies,
} from '../../../../src/services/book-activity/activityEvaluation.service.ts';
import type {
  BookActivityEvaluationActor,
  BookActivityEvaluationCommand,
  BookActivityEvaluationCommandResult,
} from '../../../../src/services/book-activity/activityEvaluation.types.ts';

/**
 * Ticket #89's fixed grading seam. Ticket #59 owns top-level Worker assembly.
 */
export const createBookActivityEvaluationCommandHandler = (
  dependencies: BookActivityEvaluationDependencies,
): ((command: BookActivityEvaluationCommand, actor: BookActivityEvaluationActor) =>
Promise<BookActivityEvaluationCommandResult>) => {
  const service = createTrustedBookActivityEvaluationService(dependencies);
  return (command, actor) => service.applyEvaluationCommand(command, actor);
};
