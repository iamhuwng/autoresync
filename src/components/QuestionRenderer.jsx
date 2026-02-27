import React from 'react';
import MultipleChoiceView from './questions/MultipleChoiceView';
import MultipleSelectView from './questions/MultipleSelectView';
import CompletionView from './questions/CompletionView';
import MatchingView from './questions/MatchingView';
import DiagramLabelingView from './questions/DiagramLabelingView';
import TrueFalseNotGivenView from './questions/TrueFalseNotGivenView';
import YesNoNotGivenView from './questions/YesNoNotGivenView';

const QuestionRenderer = ({ question, isPassageOpen = false }) => {
  switch (question.type) {
    case 'multiple-choice':
      return <MultipleChoiceView question={question} isPassageOpen={isPassageOpen} />;
    case 'multiple-select':
      return <MultipleSelectView question={question} isPassageOpen={isPassageOpen} />;
    case 'completion':
      return <CompletionView question={question} isPassageOpen={isPassageOpen} />;
    case 'matching':
    case 'matching-information':
    case 'matching-features':
    case 'matching-sentence-endings':
    case 'matching-headings':
      return <MatchingView question={question} isPassageOpen={isPassageOpen} />;
    case 'diagram-labeling':
      return <DiagramLabelingView question={question} isPassageOpen={isPassageOpen} />;
    case 'true-false-not-given':
      return <TrueFalseNotGivenView question={question} isPassageOpen={isPassageOpen} />;
    case 'yes-no-not-given':
      return <YesNoNotGivenView question={question} isPassageOpen={isPassageOpen} />;
    default:
      console.error('❌ Unsupported question type:', question.type, 'Question:', question);
      return <div>Unsupported question type: {question.type}</div>;
  }
};

export default QuestionRenderer;