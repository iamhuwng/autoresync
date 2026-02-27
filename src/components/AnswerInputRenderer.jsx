import React, { useState } from 'react';

const DiagramLabelingInput = ({ question, onAnswerSubmit }) => {
  const [answers, setAnswers] = useState({});

  const handleInputChange = (labelId, value) => {
    setAnswers((prev) => ({ ...prev, [labelId]: value }));
  };

  const handleSubmit = () => {
    if (Object.keys(answers).length === question.labels.length) {
      onAnswerSubmit(answers);
    }
  };

  const allLabelsAnswered = Object.keys(answers).length === question.labels.length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold text-center">{question.question}</p>
      <div className="space-y-4">
        {question.labels.map((label, index) => (
          <div key={label.id} className="flex flex-col gap-2 p-4 border rounded-lg bg-white">
            <label className="text-base font-medium text-gray-700">
              {index + 1}. {label.sentence}
            </label>
            {label.inputType === 'mcq' ? (
              <select
                value={answers[label.id] || ''}
                onChange={(e) => handleInputChange(label.id, e.target.value)}
                className="select select-bordered w-full text-base"
              >
                <option value="" disabled>Select an option</option>
                {label.options.map((option, optIndex) => (
                  <option key={optIndex} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={answers[label.id] || ''}
                onChange={(e) => handleInputChange(label.id, e.target.value)}
                className="input input-bordered w-full"
                placeholder="Type your answer"
              />
            )}
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={!allLabelsAnswered}
        className="btn btn-primary h-16 text-xl mt-4"
      >
        Submit
      </button>
    </div>
  );
};

const CompletionInput = ({ question, onAnswerSubmit }) => {
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedWord, setSelectedWord] = useState(null);

  const hasWordBank = question.wordBank && question.wordBank.length > 0;

  const handleWordClick = (word) => {
    setSelectedWord(word);
    onAnswerSubmit(word);
  };

  if (hasWordBank) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold text-center">{question.question}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {question.wordBank.map((word, index) => (
            <button
              key={index}
              className={`btn ${selectedWord === word ? 'btn-success' : 'btn-outline'}`}
              onClick={() => handleWordClick(word)}
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold text-center">{question.question}</p>
        <input
          type="text"
          value={typedAnswer}
          onChange={(e) => setTypedAnswer(e.target.value)}
          className="input input-bordered w-full"
          placeholder="Type your answer"
        />
        <button
          onClick={handleSubmit}
          disabled={typedAnswer.trim() === ''}
          className="btn btn-primary h-16 text-xl mt-4"
        >
          Submit
        </button>
      </div>
    );
  }
};

const MatchingInput = ({ question, onAnswerSubmit }) => {
  const [matches, setMatches] = useState({});

  const handleSelectChange = (itemId, selectedOptionId) => {
    setMatches((prev) => ({
      ...prev,
      [itemId]: selectedOptionId
    }));
  };

  const handleSubmit = () => {
    // Only submit if all items have been matched
    if (Object.keys(matches).length === question.items.length) {
      onAnswerSubmit(matches);
    }
  };

  const allItemsMatched = Object.keys(matches).length === question.items.length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold text-center">{question.question}</p>

      <div className="space-y-4">
        {question.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 p-4 border rounded-lg bg-white">
            <label className="text-base font-medium text-gray-700">
              {item.text}
            </label>
            <select
              value={matches[item.id] || ''}
              onChange={(e) => handleSelectChange(item.id, e.target.value)}
              className="select select-bordered w-full text-base"
            >
              <option value="" disabled>Select an option</option>
              {question.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.text}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!allItemsMatched}
        className="btn btn-primary h-16 text-xl mt-4"
      >
        Submit {`(${Object.keys(matches).length}/${question.items.length} matched)`}
      </button>
    </div>
  );
};

const MultipleChoiceInput = ({ question, onAnswerSubmit }) => {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const colors = ['btn-primary', 'btn-secondary', 'btn-accent', 'btn-info'];

  const handleSelect = (option) => {
    setSelectedAnswer(option);
    onAnswerSubmit(option);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {question.options.map((option, index) => (
        <button
          key={index}
          className={`btn h-32 text-2xl ${selectedAnswer === option ? 'btn-success' : colors[index % colors.length]}`}
          onClick={() => handleSelect(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
};

const MultipleSelectInput = ({ question, onAnswerSubmit }) => {
  const [selectedAnswers, setSelectedAnswers] = useState([]);

  const handleCheckboxChange = (option) => {
    setSelectedAnswers((prev) => {
      if (prev.includes(option)) {
        return prev.filter((item) => item !== option);
      } else {
        return [...prev, option];
      }
    });
  };

  const handleSubmit = () => {
    if (selectedAnswers.length > 0) {
      onAnswerSubmit(selectedAnswers);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold text-center">Select all that apply</p>
      <div className="space-y-3">
        {question.options.map((option, index) => (
          <label
            key={index}
            className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedAnswers.includes(option)}
              onChange={() => handleCheckboxChange(option)}
              value={option}
              className="w-5 h-5"
            />
            <span className="text-lg">{option}</span>
          </label>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={selectedAnswers.length === 0}
        className="btn btn-primary h-16 text-xl mt-4"
      >
        Submit ({selectedAnswers.length} selected)
      </button>
    </div>
  );
};

const AnswerInputRenderer = ({ question, onAnswerSubmit }) => {
  if (!question) {
    return <p>Waiting for question...</p>;
  }

  switch (question.type) {
    case 'multiple-select':
      return <MultipleSelectInput question={question} onAnswerSubmit={onAnswerSubmit} />;
    case 'matching':
      return <MatchingInput question={question} onAnswerSubmit={onAnswerSubmit} />;
    case 'completion':
      return <CompletionInput question={question} onAnswerSubmit={onAnswerSubmit} />;
    case 'diagram-labeling':
      return <DiagramLabelingInput question={question} onAnswerSubmit={onAnswerSubmit} />;
    case 'multiple-choice':
    default:
      return <MultipleChoiceInput question={question} onAnswerSubmit={onAnswerSubmit} />;
  }
};

export default AnswerInputRenderer;
