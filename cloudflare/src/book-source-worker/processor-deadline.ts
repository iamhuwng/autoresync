const timedOut = (): Error => new Error('book_source_processor_timed_out');

/** Runs one processor step against the shared absolute job deadline. */
export const runBookSourceProcessorBeforeDeadline = async <T>(
  deadlineAt: number,
  operation: (remainingMs: number) => Promise<T>,
): Promise<T> => {
  const initialRemainingMs = Math.floor(deadlineAt - Date.now());
  if (!Number.isSafeInteger(deadlineAt) || initialRemainingMs <= 0) throw timedOut();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(timedOut()), initialRemainingMs);
    });
    const operationPromise = Promise.resolve().then(async () => {
      const remainingMs = Math.floor(deadlineAt - Date.now());
      if (remainingMs <= 0) throw timedOut();
      const result = await operation(remainingMs);
      if (Date.now() >= deadlineAt) throw timedOut();
      return result;
    });
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

/** Stops a renderer source stream at the same absolute processing deadline. */
export const bindBookSourceProcessorStreamToDeadline = (
  body: ReadableStream<Uint8Array>,
  deadlineAt: number,
): ReadableStream<Uint8Array> => {
  const reader = body.getReader();
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      try {
        const next = await runBookSourceProcessorBeforeDeadline(deadlineAt, async () => reader.read());
        if (Date.now() >= deadlineAt) throw timedOut();
        if (next.done) {
          finished = true;
          reader.releaseLock();
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        finished = true;
        controller.error(error);
        void reader.cancel(error).catch(() => undefined).finally(() => {
          try { reader.releaseLock(); } catch { /* stream already released */ }
        });
      }
    },
    cancel(reason) {
      if (finished) return;
      finished = true;
      void reader.cancel(reason).catch(() => undefined).finally(() => {
        try { reader.releaseLock(); } catch { /* stream already released */ }
      });
    },
  });
};
