export interface ListeningQuestionContext {
  readonly sectionHeading?: string;
  readonly subsectionLabel?: string;
  readonly contextLines?: readonly string[];
  readonly currentLineIndex?: number;
}

interface ContextQuestion {
  number: number;
  question: string;
  type?: string;
  sectionNumber?: number;
  sectionId?: string;
  context?: ListeningQuestionContext;
}

export interface ListeningBlank {
  index: number;
  text: string;
  number?: number;
}

/** Only source numbers or an explicit currentLineIndex identify an answer. */
export function listeningBlanks(text: string): ListeningBlank[] {
  const pattern = /(\d+)\s*[_\.]{2,}|_{2,}(?:\s*\(?(\d+)\)?\s*_*)?|\(\s*(\d+)\s*\)|\[\s*(\d+)\s*\]/gu;
  return Array.from(text.matchAll(pattern), match => {
    const number = match[1] ?? match[2] ?? match[3] ?? match[4];
    return { index: match.index!, text: match[0], ...(number ? { number: Number(number) } : {}) };
  });
}

export function listeningContextKey(question: ContextQuestion): string | undefined {
  const context = question.context;
  if (!context?.contextLines?.length) return undefined;
  return JSON.stringify([question.type, question.sectionNumber ?? question.sectionId,
    context.sectionHeading ?? '', context.subsectionLabel ?? '', context.contextLines]);
}

export function listeningContextLineIndex(question: ContextQuestion): number | undefined {
  const lines = question.context?.contextLines;
  if (!lines?.length) return undefined;
  const numberedLines = lines.flatMap((line, index) =>
    listeningBlanks(line).filter(blank => blank.number === question.number).map(() => index));
  if (numberedLines.length === 1) return numberedLines[0];
  if (numberedLines.length > 1) return undefined;
  const index = question.context?.currentLineIndex;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= lines.length) return undefined;
  const blanks = listeningBlanks(lines[index]!);
  return blanks.length === 0 || (blanks.length === 1 && blanks[0]!.number === undefined) ? index : undefined;
}

export function syncListeningQuestionUpdate<T extends ContextQuestion>(questions: readonly T[], previous: ContextQuestion, updated: T): T[] {
  const key = listeningContextKey(previous);
  let context = updated.context;
  if (key && context && previous.question !== updated.question
    && JSON.stringify(previous.context?.contextLines) === JSON.stringify(context.contextLines)) {
    const lineIndex = listeningContextLineIndex(previous);
    if (lineIndex !== undefined) {
      const contextLines = [...context.contextLines!];
      contextLines[lineIndex] = updated.question;
      context = { ...context, contextLines };
    }
  }
  return questions.map(question => {
    const selected = question.number === previous.number;
    const next = selected ? updated : question;
    if (!key || !context || listeningContextKey(question) !== key) return next;
    const { currentLineIndex: _selectedLine, ...sharedContext } = context;
    const memberContext = { ...sharedContext, ...(question.context?.currentLineIndex !== undefined
      ? { currentLineIndex: question.context.currentLineIndex } : {}) };
    const lineIndex = listeningContextLineIndex({ ...next, context: memberContext });
    return { ...next, context: { ...memberContext, ...(lineIndex !== undefined ? { currentLineIndex: lineIndex } : {}) },
      ...(lineIndex !== undefined ? { question: context.contextLines![lineIndex]! } : {}) };
  });
}

export function renumberListeningContextQuestions<T extends ContextQuestion>(questions: readonly T[]): T[] {
  if (questions.every((question, index) => question.number === index + 1)) return [...questions];
  const numbers = new Map(questions.map((question, index) => [question.number, index + 1]));
  const renumber = (text: string) => {
    let result = text;
    for (const blank of listeningBlanks(text).reverse()) {
      if (blank.number === undefined) continue;
      const number = numbers.get(blank.number);
      result = result.slice(0, blank.index) + (number === undefined ? '____' : `[${number}]`)
        + result.slice(blank.index + blank.text.length);
    }
    return result;
  };
  return questions.map((question, index) => ({ ...question, number: index + 1,
    question: renumber(question.question),
    ...(question.context?.contextLines ? { context: { ...question.context,
      contextLines: question.context.contextLines.map(renumber) } } : {}) }));
}
