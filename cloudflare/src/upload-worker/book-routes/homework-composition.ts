import {
  createBookHomeworkWorkerHandlers,
  type BookHomeworkWorkerHandlersOptions,
} from '../book-homework/worker.ts';
import {
  createBookHomeworkProductionContextResolver,
  createBookHomeworkProductionRuntime,
  type BookHomeworkTrustedRuntimeEnv,
} from '../book-homework/runtime.ts';

/**
 * #59-owned canonical composition boundary. Authority and saga behavior stay
 * in the required #84/#85/#86 provider supplied through these options.
 */
export const createCanonicalBookHomeworkHandlers = (
  options: BookHomeworkWorkerHandlersOptions = {},
) => createBookHomeworkWorkerHandlers({
  ...options,
  ...(options.saga || options.sagaFactory ? {} : {
    sagaFactory: (env) => createBookHomeworkProductionRuntime(
      env as BookHomeworkTrustedRuntimeEnv,
    ),
  }),
  ...(options.contextResolver || options.contextResolverFactory ? {} : {
    contextResolverFactory: (env) => createBookHomeworkProductionContextResolver(
      env as BookHomeworkTrustedRuntimeEnv,
    ),
  }),
});
