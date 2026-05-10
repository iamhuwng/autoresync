export function isReadingAnswerEmpty(
  answer: string | string[] | Record<string, string> | null | undefined,
): boolean {
  if (answer === undefined || answer === null) {
    return true;
  }

  if (typeof answer === 'string') {
    return answer.trim().length === 0;
  }

  if (Array.isArray(answer)) {
    if (answer.length === 0) {
      return true;
    }

    return answer.every((entry) => entry.trim().length === 0);
  }

  const values = Object.values(answer);
  if (values.length === 0) {
    return true;
  }

  return values.every((value) => value.trim().length === 0);
}
