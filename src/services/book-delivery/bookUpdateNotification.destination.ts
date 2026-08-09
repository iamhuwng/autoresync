import { buildRoute } from '../../constants/routes';
import type { BookUpdateNotificationPlan } from './bookUpdateNotification.types';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export const resolveBookUpdateNotificationDestination = (
  plan: Pick<BookUpdateNotificationPlan, 'homeworkId' | 'destinationView'>,
): string | null => {
  if (!SAFE_ID.test(plan.homeworkId)
    || (plan.destinationView !== 'updated-homework' && plan.destinationView !== 'previous-version')) return null;
  return buildRoute('STUDENT_HOMEWORK_DETAIL', { homeworkId: plan.homeworkId });
};
