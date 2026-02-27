/**
 * CSV Export Utility
 * Generates CSV files from test results
 * 
 * Features:
 * - Export class results to CSV
 * - Export individual student results
 * - Customizable column selection
 * - Browser download functionality
 */

import { TestResultRecord } from '../services/testResults.service';

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data: any[], headers: string[]): string {
  // Create header row
  const headerRow = headers.join(',');
  
  // Create data rows
  const dataRows = data.map((row) => {
    return headers.map((header) => {
      const value = row[header];
      
      // Handle different value types
      if (value === null || value === undefined) {
        return '';
      }
      
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Trigger browser download of CSV file
 */
function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if ((navigator as any).msSaveBlob) {
    // IE 10+
    (navigator as any).msSaveBlob(blob, filename);
  } else {
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Export class results to CSV
 * Includes student names, scores, percentages, and band scores
 */
export function exportClassResultsToCSV(
  results: TestResultRecord[],
  sessionCode: string,
  testTitle: string
): void {
  if (results.length === 0) {
    alert('No results to export');
    return;
  }
  
  // Prepare data for CSV
  const csvData = results.map((result) => ({
    'Student Name': result.studentName,
    'Student ID': result.studentId,
    'Total Score': result.totalScore,
    'Max Score': result.maxScore,
    'Percentage': `${result.percentage.toFixed(2)}%`,
    'Band Score': result.bandScore.toFixed(1),
    'Correct': result.correct,
    'Partial Credit': result.partialCredit,
    'Incorrect': result.incorrect,
    'Total Questions': result.totalQuestions,
    'Time Elapsed (min)': (result.timeElapsed / 60000).toFixed(1),
    'Submitted At': new Date(result.submittedAt).toLocaleString(),
  }));
  
  // Define column headers
  const headers = [
    'Student Name',
    'Student ID',
    'Total Score',
    'Max Score',
    'Percentage',
    'Band Score',
    'Correct',
    'Partial Credit',
    'Incorrect',
    'Total Questions',
    'Time Elapsed (min)',
    'Submitted At',
  ];
  
  // Generate CSV
  const csvContent = arrayToCSV(csvData, headers);
  
  // Generate filename
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${testTitle.replace(/[^a-z0-9]/gi, '_')}_${sessionCode}_${timestamp}.csv`;
  
  // Download
  downloadCSV(csvContent, filename);
  
  console.log(`📊 Exported ${results.length} student results to CSV`);
}

/**
 * Export detailed results with question-by-question breakdown
 */
export function exportDetailedResultsToCSV(
  results: TestResultRecord[],
  sessionCode: string,
  testTitle: string
): void {
  if (results.length === 0) {
    alert('No results to export');
    return;
  }
  
  const csvData: any[] = [];
  
  // For each student
  results.forEach((result) => {
    // For each question
    result.questionResults.forEach((qr) => {
      csvData.push({
        'Student Name': result.studentName,
        'Student ID': result.studentId,
        'Question Number': qr.questionNumber,
        'Question Type': qr.questionType,
        'Correct': qr.isCorrect ? 'Yes' : 'No',
        'Score': qr.score,
        'Max Score': qr.maxScore,
        'Student Answer': typeof qr.studentAnswer === 'object' 
          ? JSON.stringify(qr.studentAnswer) 
          : String(qr.studentAnswer),
        'Correct Answer': typeof qr.correctAnswer === 'object' 
          ? JSON.stringify(qr.correctAnswer) 
          : String(qr.correctAnswer),
        'Feedback': qr.feedback,
      });
    });
  });
  
  const headers = [
    'Student Name',
    'Student ID',
    'Question Number',
    'Question Type',
    'Correct',
    'Score',
    'Max Score',
    'Student Answer',
    'Correct Answer',
    'Feedback',
  ];
  
  const csvContent = arrayToCSV(csvData, headers);
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${testTitle.replace(/[^a-z0-9]/gi, '_')}_${sessionCode}_detailed_${timestamp}.csv`;
  
  downloadCSV(csvContent, filename);
  
  console.log(`📊 Exported detailed results to CSV (${csvData.length} rows)`);
}

/**
 * Export question difficulty analysis to CSV
 */
export function exportQuestionAnalysisToCSV(
  questionAnalytics: Array<{
    questionNumber: number;
    correctCount: number;
    incorrectCount: number;
    partialCount: number;
    totalAttempts: number;
    difficultyPercent: number;
  }>,
  testTitle: string,
  sessionCode: string
): void {
  if (questionAnalytics.length === 0) {
    alert('No analytics to export');
    return;
  }
  
  const csvData = questionAnalytics.map((q) => ({
    'Question Number': q.questionNumber,
    'Correct Count': q.correctCount,
    'Partial Credit Count': q.partialCount,
    'Incorrect Count': q.incorrectCount,
    'Total Attempts': q.totalAttempts,
    'Success Rate': `${q.difficultyPercent.toFixed(1)}%`,
    'Difficulty Level': q.difficultyPercent >= 75 ? 'Easy' : q.difficultyPercent >= 50 ? 'Medium' : 'Hard',
  }));
  
  const headers = [
    'Question Number',
    'Correct Count',
    'Partial Credit Count',
    'Incorrect Count',
    'Total Attempts',
    'Success Rate',
    'Difficulty Level',
  ];
  
  const csvContent = arrayToCSV(csvData, headers);
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${testTitle.replace(/[^a-z0-9]/gi, '_')}_${sessionCode}_analysis_${timestamp}.csv`;
  
  downloadCSV(csvContent, filename);
  
  console.log(`📊 Exported question analysis to CSV`);
}

/**
 * Export individual student result to CSV
 */
export function exportStudentResultToCSV(result: TestResultRecord): void {
  // Summary section
  const summaryData = [{
    'Student Name': result.studentName,
    'Test Title': result.testTitle,
    'Session Code': result.sessionCode,
    'Total Score': result.totalScore,
    'Max Score': result.maxScore,
    'Percentage': `${result.percentage.toFixed(2)}%`,
    'Band Score': result.bandScore.toFixed(1),
    'Correct': result.correct,
    'Partial Credit': result.partialCredit,
    'Incorrect': result.incorrect,
    'Time Elapsed (min)': (result.timeElapsed / 60000).toFixed(1),
    'Submitted At': new Date(result.submittedAt).toLocaleString(),
  }];
  
  const summaryHeaders = summaryData[0] ? Object.keys(summaryData[0]) : [];
  const summaryCSV = arrayToCSV(summaryData, summaryHeaders);
  
  // Question results section
  const questionData = result.questionResults.map((qr) => ({
    'Question': qr.questionNumber,
    'Type': qr.questionType,
    'Correct': qr.isCorrect ? 'Yes' : 'No',
    'Score': `${qr.score}/${qr.maxScore}`,
    'Student Answer': typeof qr.studentAnswer === 'object' 
      ? JSON.stringify(qr.studentAnswer) 
      : String(qr.studentAnswer),
    'Correct Answer': typeof qr.correctAnswer === 'object' 
      ? JSON.stringify(qr.correctAnswer) 
      : String(qr.correctAnswer),
    'Feedback': qr.feedback,
  }));
  
  const questionHeaders = ['Question', 'Type', 'Correct', 'Score', 'Student Answer', 'Correct Answer', 'Feedback'];
  const questionCSV = arrayToCSV(questionData, questionHeaders);
  
  // Combine both sections
  const fullCSV = `Summary\n${summaryCSV}\n\nQuestion Results\n${questionCSV}`;
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${result.studentName.replace(/[^a-z0-9]/gi, '_')}_${result.sessionCode}_${timestamp}.csv`;
  
  downloadCSV(fullCSV, filename);
  
  console.log(`📊 Exported student result to CSV: ${result.studentName}`);
}
