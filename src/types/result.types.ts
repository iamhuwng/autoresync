/**
 * Standard result type for operations that can fail
 * Eliminates need for try/catch everywhere
 */
export type Result<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Type guard to check if result succeeded
 */
export const isSuccess = <T>(result: Result<T>): result is { success: true; data: T } => {
  return result.success;
};

/**
 * Type guard to check if result failed
 */
export const isFailure = <T>(result: Result<T>): result is { success: false; error: string } => {
  return !result.success;
};
