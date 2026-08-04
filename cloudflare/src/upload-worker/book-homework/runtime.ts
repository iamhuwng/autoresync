import {
  BookHomeworkAssignmentSaga,
  type BookHomeworkSagaDependencies,
} from './saga.ts';

export interface BookHomeworkTrustedRuntimeEnv {
  readonly [key: string]: unknown;
}

export type BookHomeworkTrustedSaga = Pick<BookHomeworkAssignmentSaga, 'execute'>
  & Partial<Pick<
    BookHomeworkAssignmentSaga,
    | 'resolveStudentProjection'
    | 'resolveTeacherProjections'
    | 'readCommittedAssignment'
  >>;

export type BookHomeworkTrustedSagaFactory = (
  env: BookHomeworkTrustedRuntimeEnv,
) => BookHomeworkTrustedSaga | Promise<BookHomeworkTrustedSaga>;

export const createBookHomeworkTrustedSagaFactory = (options: {
  readonly resolveDependencies: (
    env: BookHomeworkTrustedRuntimeEnv,
  ) => BookHomeworkSagaDependencies
    | Promise<BookHomeworkSagaDependencies>;
}): BookHomeworkTrustedSagaFactory => async (env) => {
  const dependencies = await options.resolveDependencies(env);
  if (!dependencies
    || typeof dependencies !== 'object'
    || !dependencies.sagaRepository
    || !dependencies.authorityRepository
    || !dependencies.deliveryRepository
    || typeof dependencies.resolveCanonical !== 'function') {
    throw new Error('book_homework_runtime_dependencies_unavailable');
  }
  return new BookHomeworkAssignmentSaga(dependencies);
};
