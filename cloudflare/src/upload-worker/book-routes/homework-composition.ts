import {
  createBookHomeworkWorkerHandlers,
  type BookHomeworkWorkerHandlersOptions,
} from '../book-homework/worker.ts';
import {
  createBookHomeworkProductionRuntime,
  type BookHomeworkTrustedRuntimeEnv,
} from '../book-homework/runtime.ts';

/**
 * #59-owned canonical composition boundary. Authority and saga behavior stay
 * in the required #84/#85/#86 provider supplied through these options.
 */
export const createCanonicalBookHomeworkHandlers = (
  options: BookHomeworkWorkerHandlersOptions = {},
) => createBookHomeworkWorkerHandlers(
  options.saga || options.sagaFactory
    ? options
    : {
        ...options,
        sagaFactory: (env) => createBookHomeworkProductionRuntime(
          env as BookHomeworkTrustedRuntimeEnv,
        ),
      },
);
