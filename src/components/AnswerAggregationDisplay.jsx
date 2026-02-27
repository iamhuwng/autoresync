import React from 'react';
import PropTypes from 'prop-types';
import {
  aggregateMultipleChoice,
  aggregateMultipleSelect,
  aggregateCompletion,
  aggregateMatching,
  aggregateDiagramLabeling,
  getTotalSubmissions,
  getPendingStudents
} from '../utils/answerAggregation';

/**
 * AnswerAggregationDisplay Component
 *
 * Displays aggregated student answers on the teacher screen.
 * Shows counts per choice instead of individual student answers.
 */
const AnswerAggregationDisplay = ({ players, questionIndex, question }) => {
  if (!players || !question) {
    return (
      <div style={{ padding: '15px', textAlign: 'center', color: '#999' }}>
        <p>No answers submitted yet</p>
      </div>
    );
  }

  const totalSubmissions = getTotalSubmissions(players, questionIndex);
  const totalStudents = Object.keys(players).length;
  const pendingStudents = getPendingStudents(players, questionIndex);

  // Render header with submission stats
  const renderHeader = () => (
    <div style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #e0e0e0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: '1em', color: '#333' }}>Live Student Answers</h4>
        <span style={{ fontSize: '0.9em', color: '#666', fontWeight: '500' }}>
          {totalSubmissions}/{totalStudents} submitted
        </span>
      </div>
      {pendingStudents.length > 0 && pendingStudents.length <= 5 && (
        <div style={{ marginTop: '8px', fontSize: '0.85em', color: '#999' }}>
          Waiting for: {pendingStudents.join(', ')}
        </div>
      )}
    </div>
  );

  // Render aggregated multiple-choice answers
  const renderMultipleChoice = () => {
    const aggregated = aggregateMultipleChoice(players, questionIndex, question.options);
    const maxCount = Math.max(...Object.values(aggregated), 1);

    return (
      <div>
        {renderHeader()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Object.entries(aggregated).map(([option, count]) => {
            const percentage = totalSubmissions > 0 ? (count / totalSubmissions) * 100 : 0;
            const barWidth = totalSubmissions > 0 ? (count / maxCount) * 100 : 0;

            return (
              <div key={option} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{
                  minWidth: '30px',
                  fontWeight: 'bold',
                  fontSize: '0.95em',
                  color: '#333'
                }}>
                  {option}:
                </div>
                <div style={{ flex: 1, position: 'relative', height: '28px' }}>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${barWidth}%`,
                    backgroundColor: count > 0 ? '#4CAF50' : '#f0f0f0',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }} />
                  <div style={{
                    position: 'relative',
                    padding: '5px 10px',
                    fontSize: '0.9em',
                    color: count > 0 ? '#fff' : '#999',
                    fontWeight: '500',
                    mixBlendMode: count > 0 ? 'normal' : 'normal'
                  }}>
                    {count} {count === 1 ? 'student' : 'students'} ({percentage.toFixed(0)}%)
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render aggregated multiple-select answers
  const renderMultipleSelect = () => {
    const aggregated = aggregateMultipleSelect(players, questionIndex, question.options);
    const maxCount = Math.max(...Object.values(aggregated), 1);

    return (
      <div>
        {renderHeader()}
        <div style={{ marginBottom: '10px', fontSize: '0.85em', color: '#666', fontStyle: 'italic' }}>
          Students can select multiple options
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Object.entries(aggregated).map(([option, count]) => {
            const percentage = totalSubmissions > 0 ? (count / totalSubmissions) * 100 : 0;
            const barWidth = totalSubmissions > 0 ? (count / maxCount) * 100 : 0;

            return (
              <div key={option} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{
                  minWidth: '80px',
                  fontWeight: '500',
                  fontSize: '0.9em',
                  color: '#333',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {option}:
                </div>
                <div style={{ flex: 1, position: 'relative', height: '28px' }}>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${barWidth}%`,
                    backgroundColor: count > 0 ? '#2196F3' : '#f0f0f0',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }} />
                  <div style={{
                    position: 'relative',
                    padding: '5px 10px',
                    fontSize: '0.9em',
                    color: count > 0 ? '#fff' : '#999',
                    fontWeight: '500'
                  }}>
                    {count} ({percentage.toFixed(0)}%)
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render aggregated completion answers
  const renderCompletion = () => {
    const aggregated = aggregateCompletion(players, questionIndex);

    if (aggregated.length === 0) {
      return (
        <div>
          {renderHeader()}
          <p style={{ textAlign: 'center', color: '#999', fontSize: '0.9em' }}>No answers yet</p>
        </div>
      );
    }

    return (
      <div>
        {renderHeader()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {aggregated.map(({ answer, count, isCorrect }, index) => (
            <div key={index} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              backgroundColor: isCorrect ? '#e8f5e9' : '#fff3e0',
              border: `1px solid ${isCorrect ? '#4CAF50' : '#FF9800'}`,
              borderRadius: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{
                  fontSize: '1.2em',
                  color: isCorrect ? '#4CAF50' : '#FF9800'
                }}>
                  {isCorrect ? '✓' : '○'}
                </span>
                <span style={{
                  fontSize: '0.95em',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  "{answer}"
                </span>
              </div>
              <div style={{
                fontSize: '0.9em',
                fontWeight: 'bold',
                color: '#666',
                minWidth: '80px',
                textAlign: 'right'
              }}>
                {count} {count === 1 ? 'student' : 'students'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render aggregated matching answers
  const renderMatching = () => {
    const aggregated = aggregateMatching(players, questionIndex);

    if (aggregated.length === 0) {
      return (
        <div>
          {renderHeader()}
          <p style={{ textAlign: 'center', color: '#999', fontSize: '0.9em' }}>No answers yet</p>
        </div>
      );
    }

    return (
      <div>
        {renderHeader()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {aggregated.slice(0, 5).map((item, index) => (
            <div key={index} style={{
              padding: '10px 12px',
              backgroundColor: item.isCorrect ? '#e8f5e9' : '#f5f5f5',
              border: `1px solid ${item.isCorrect ? '#4CAF50' : '#e0e0e0'}`,
              borderRadius: '6px',
              fontSize: '0.9em'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontWeight: 'bold', color: '#666' }}>
                  {item.count} {item.count === 1 ? 'student' : 'students'}
                </span>
                {item.isCorrect && (
                  <span style={{ color: '#4CAF50', fontSize: '1.1em' }}>✓</span>
                )}
              </div>
              <div style={{ color: '#999', fontSize: '0.85em' }}>
                {typeof item.answer === 'object' ? JSON.stringify(item.answer) : item.answer}
              </div>
            </div>
          ))}
          {aggregated.length > 5 && (
            <div style={{ textAlign: 'center', color: '#999', fontSize: '0.85em', marginTop: '5px' }}>
              ... and {aggregated.length - 5} more unique answers
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render aggregated diagram-labeling answers
  const renderDiagramLabeling = () => {
    const labelStats = aggregateDiagramLabeling(players, questionIndex, question.labels);

    if (labelStats.length === 0) {
      return (
        <div>
          {renderHeader()}
          <p style={{ textAlign: 'center', color: '#999', fontSize: '0.9em' }}>No labels to display</p>
        </div>
      );
    }

    return (
      <div>
        {renderHeader()}
        <div style={{ marginBottom: '10px', fontSize: '0.85em', color: '#666', fontStyle: 'italic' }}>
          Statistics per label
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {labelStats.map((stat, index) => {
            const totalResponses = stat.correctCount + stat.incorrectCount;
            const correctPercentage = totalResponses > 0 ? (stat.correctCount / totalResponses) * 100 : 0;
            const incorrectPercentage = totalResponses > 0 ? (stat.incorrectCount / totalResponses) * 100 : 0;

            return (
              <div key={stat.labelId} style={{
                padding: '12px',
                backgroundColor: '#f9f9f9',
                border: '1px solid #e0e0e0',
                borderRadius: '6px'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', color: '#333', fontSize: '0.95em' }}>
                    Label {index + 1}:
                  </span>
                  <span style={{ marginLeft: '8px', color: '#666' }}>
                    {stat.sentence}
                  </span>
                </div>
                <div style={{ fontSize: '0.85em', color: '#999', marginBottom: '8px' }}>
                  Correct answer: <strong>{stat.correctAnswer}</strong>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.85em', color: '#4CAF50' }}>✓ Correct</span>
                      <span style={{ fontSize: '0.85em', fontWeight: '500' }}>
                        {stat.correctCount} ({correctPercentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div style={{
                      height: '8px',
                      backgroundColor: '#e0e0e0',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${correctPercentage}%`,
                        backgroundColor: '#4CAF50',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.85em', color: '#f44336' }}>✗ Incorrect</span>
                      <span style={{ fontSize: '0.85em', fontWeight: '500' }}>
                        {stat.incorrectCount} ({incorrectPercentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div style={{
                      height: '8px',
                      backgroundColor: '#e0e0e0',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${incorrectPercentage}%`,
                        backgroundColor: '#f44336',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.8em', color: '#999', textAlign: 'right' }}>
                  {stat.totalSubmissions} {stat.totalSubmissions === 1 ? 'response' : 'responses'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Route to appropriate renderer based on question type
  switch (question.type) {
    case 'multiple-choice':
      return renderMultipleChoice();
    case 'multiple-select':
      return renderMultipleSelect();
    case 'completion':
      return renderCompletion();
    case 'matching':
      return renderMatching();
    case 'diagram-labeling':
      return renderDiagramLabeling();
    default:
      return (
        <div>
          {renderHeader()}
          <p style={{ color: '#999', fontSize: '0.9em' }}>
            Answer aggregation not supported for this question type
          </p>
        </div>
      );
  }
};

AnswerAggregationDisplay.propTypes = {
  players: PropTypes.object,
  questionIndex: PropTypes.number.isRequired,
  question: PropTypes.shape({
    type: PropTypes.string.isRequired,
    options: PropTypes.array
  }).isRequired
};

export default AnswerAggregationDisplay;
