export interface ParsedListeningQuestion {
  id: string;
  number: number;
  questionNumber: number;
  question: string;
  questionText: string;
  type: 'short-answer';
  answer: string;
  options: string[];
  confidence: number;
}

export interface ListeningQuestionParseResult {
  success: boolean;
  confidence: number;
  questions: ParsedListeningQuestion[];
  error?: string;
}

export function parseListeningQuestionText(text: string): ListeningQuestionParseResult {
  if (!text.trim()) {
    return { success: false, confidence: 0, questions: [], error: 'No text provided' };
  }

  const questions: ParsedListeningQuestion[] = [];
  const questionPattern = /(\d+)\.\s*(.+?)(?=\n\d+\.|$)/gs;
  let match: RegExpExecArray | null;

  while ((match = questionPattern.exec(text)) !== null) {
    const number = Number.parseInt(match[1]!, 10);
    const question = match[2]!.trim();
    questions.push({
      id: `listening-question-${number}`,
      number,
      questionNumber: number,
      question,
      questionText: question,
      type: 'short-answer',
      answer: '',
      options: [],
      confidence: 0.5,
    });
  }

  return questions.length > 0
    ? { success: true, confidence: 50, questions }
    : { success: false, confidence: 0, questions, error: 'No questions detected. Please check the format.' };
}
