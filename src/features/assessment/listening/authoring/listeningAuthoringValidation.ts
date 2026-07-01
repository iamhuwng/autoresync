import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringIssue,
} from '../types/listeningAuthoring.types';

const emptyAnswer = (answer: string | string[] | Record<string, string>): boolean => {
  if (typeof answer === 'string') return answer.trim() === '';
  if (Array.isArray(answer)) return answer.length === 0;
  return Object.keys(answer).length === 0;
};

const audioIssues = (
  document: ListeningAuthoringDocumentV1,
  severity: ListeningAuthoringIssue['severity'],
): ListeningAuthoringIssue[] =>
  document.audioSections
    .filter(section => !section.audioUrl)
    .map(section => ({
      sectionNumber: section.number,
      field: 'audioUrl',
      severity,
      guidance: severity === 'warning'
        ? 'Add audio before publishing.'
        : 'Publish requires audio for every section.',
    }));

const imageCoversQuestion = (
  document: ListeningAuthoringDocumentV1,
  question: ListeningAuthoringDocumentV1['questions'][number],
): boolean => {
  if (document.displayMode !== 'image') return false;
  if (typeof question.imageUrl === 'string' && question.imageUrl.trim()) return true;

  const section = document.audioSections.find(audioSection =>
    audioSection.number === question.sectionNumber,
  );

  return (document.questionImages ?? []).some((image) => {
    if (!image.imageUrl.trim()) return false;
    if (image.sectionNumber !== question.sectionNumber) return false;

    const start = image.questionRange?.start ?? section?.startQuestion ?? question.number;
    const end = image.questionRange?.end ?? section?.endQuestion ?? question.number;
    return question.number >= start && question.number <= end;
  });
};

const questionIssues = (
  document: ListeningAuthoringDocumentV1,
  severity: ListeningAuthoringIssue['severity'],
): ListeningAuthoringIssue[] => {
  const issues: ListeningAuthoringIssue[] = [];
  document.questions.forEach((question) => {
    if (!question.question.trim() && !imageCoversQuestion(document, question)) {
      issues.push({
        questionNumber: question.number,
        field: document.displayMode === 'image' ? 'questionImage' : 'question',
        severity,
        guidance: document.displayMode === 'image'
          ? (severity === 'warning'
              ? 'Draft saved with missing question image coverage.'
              : 'Publish requires question image coverage or a typed prompt for every question.')
          : (severity === 'warning'
              ? 'Draft saved with an incomplete question.'
              : 'Publish requires every question prompt.'),
      });
    }
    if (emptyAnswer(question.answer)) {
      issues.push({
        questionNumber: question.number,
        field: 'answer',
        severity,
        guidance: severity === 'warning'
          ? 'Draft saved with a missing answer key.'
          : 'Publish requires every answer key.',
      });
    }
  });
  return issues;
};

export function validateListeningDraft(
  document: ListeningAuthoringDocumentV1,
): readonly ListeningAuthoringIssue[] {
  return [
    ...audioIssues(document, 'warning'),
    ...questionIssues(document, 'warning'),
  ];
}

export function validateListeningPublish(
  document: ListeningAuthoringDocumentV1,
): readonly ListeningAuthoringIssue[] {
  return [
    ...audioIssues(document, 'blocker'),
    ...questionIssues(document, 'blocker'),
  ];
}
