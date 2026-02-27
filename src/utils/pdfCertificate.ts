/**
 * PDF Certificate Generator
 * Creates professional IELTS-style test result certificates
 * 
 * Features:
 * - Professional certificate layout
 * - IELTS band score display
 * - Detailed score breakdown
 * - Downloadable PDF format
 * 
 * Note: Requires jsPDF library
 * Install with: npm install jspdf
 */

import { TestResultRecord } from '../services/testResults.service';

/**
 * Generate a PDF certificate for a student's test result
 * Uses browser-based PDF generation (no server required)
 */
export async function generateCertificatePDF(result: TestResultRecord): Promise<void> {
  try {
    // Dynamically import jsPDF (allows for code splitting)
    const { jsPDF } = await import('jspdf');
    
    // Create new PDF document (A4 size, portrait orientation)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Add decorative border
    doc.setDrawColor(139, 92, 246); // Purple
    doc.setLineWidth(1);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
    
    doc.setDrawColor(6, 182, 212); // Cyan
    doc.setLineWidth(0.5);
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24);
    
    // Title
    doc.setFontSize(32);
    doc.setTextColor(139, 92, 246);
    doc.text('TEST RESULT CERTIFICATE', pageWidth / 2, 30, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(14);
    doc.setTextColor(148, 163, 184);
    doc.text('This certifies that', pageWidth / 2, 42, { align: 'center' });
    
    // Student Name (large and prominent)
    doc.setFontSize(28);
    doc.setTextColor(30, 41, 59);
    doc.text(result.studentName, pageWidth / 2, 58, { align: 'center' });
    
    // Achievement text
    doc.setFontSize(13);
    doc.setTextColor(100, 116, 139);
    doc.text('has successfully completed', pageWidth / 2, 70, { align: 'center' });
    
    // Test title
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(result.testTitle, pageWidth / 2, 82, { align: 'center' });
    
    // Test type and skill
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text(`${result.testType} - ${result.testSkill}`, pageWidth / 2, 90, { align: 'center' });
    
    // Divider line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(40, 98, pageWidth - 40, 98);
    
    // Score section
    const leftCol = 60;
    const middleCol = pageWidth / 2;
    const rightCol = pageWidth - 60;
    const scoreY = 115;
    
    // Band Score (center, large)
    doc.setFontSize(48);
    doc.setTextColor(16, 185, 129); // Green
    doc.text(result.bandScore.toFixed(1), middleCol, scoreY, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('IELTS Band Score', middleCol, scoreY + 8, { align: 'center' });
    
    // Total Score (left)
    doc.setFontSize(24);
    doc.setTextColor(139, 92, 246);
    doc.text(`${result.totalScore}/${result.maxScore}`, leftCol, scoreY, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Total Score', leftCol, scoreY + 8, { align: 'center' });
    
    // Percentage (right)
    doc.setFontSize(24);
    doc.setTextColor(6, 182, 212);
    doc.text(`${result.percentage.toFixed(1)}%`, rightCol, scoreY, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Percentage', rightCol, scoreY + 8, { align: 'center' });
    
    // Performance breakdown
    const breakdownY = 140;
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Performance Breakdown', pageWidth / 2, breakdownY, { align: 'center' });
    
    // Stats grid
    const statsY = 150;
    const statSpacing = (pageWidth - 80) / 4;
    
    // Correct
    doc.setFontSize(20);
    doc.setTextColor(16, 185, 129);
    doc.text(result.correct.toString(), 40 + statSpacing * 0.5, statsY, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Correct', 40 + statSpacing * 0.5, statsY + 7, { align: 'center' });
    
    // Partial Credit
    doc.setFontSize(20);
    doc.setTextColor(245, 158, 11);
    doc.text(result.partialCredit.toString(), 40 + statSpacing * 1.5, statsY, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Partial', 40 + statSpacing * 1.5, statsY + 7, { align: 'center' });
    
    // Incorrect
    doc.setFontSize(20);
    doc.setTextColor(239, 68, 68);
    doc.text(result.incorrect.toString(), 40 + statSpacing * 2.5, statsY, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Incorrect', 40 + statSpacing * 2.5, statsY + 7, { align: 'center' });
    
    // Total Questions
    doc.setFontSize(20);
    doc.setTextColor(100, 116, 139);
    doc.text(result.totalQuestions.toString(), 40 + statSpacing * 3.5, statsY, { align: 'center' });
    doc.setFontSize(9);
    doc.text('Total', 40 + statSpacing * 3.5, statsY + 7, { align: 'center' });
    
    // Bottom section
    const bottomY = pageHeight - 35;
    
    // Date and session info
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    const dateStr = new Date(result.submittedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    doc.text(`Completed on: ${dateStr}`, 20, bottomY);
    doc.text(`Session: ${result.sessionCode}`, 20, bottomY + 6);
    
    // Time elapsed
    const timeMinutes = (result.timeElapsed / 60000).toFixed(0);
    doc.text(`Time Taken: ${timeMinutes} minutes`, pageWidth - 20, bottomY, { align: 'right' });
    doc.text(`Duration: ${result.testDuration} minutes`, pageWidth - 20, bottomY + 6, { align: 'right' });
    
    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'This certificate is automatically generated and serves as official documentation of test completion.',
      pageWidth / 2,
      pageHeight - 18,
      { align: 'center' }
    );
    
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${result.studentName.replace(/[^a-z0-9]/gi, '_')}_Certificate_${timestamp}.pdf`;
    
    // Save PDF
    doc.save(filename);
    
    console.log(`📄 Certificate generated: ${filename}`);
  } catch (error) {
    console.error('Error generating certificate:', error);
    alert('Failed to generate certificate. Please ensure jsPDF is installed.');
    throw error;
  }
}

/**
 * Simple certificate for quick downloads (lighter design)
 */
export async function generateSimpleCertificatePDF(result: TestResultRecord): Promise<void> {
  try {
    const { jsPDF } = await import('jspdf');
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Border
    doc.setDrawColor(139, 92, 246);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, pageWidth - 20, 277);
    
    // Title
    doc.setFontSize(24);
    doc.setTextColor(139, 92, 246);
    doc.text('Test Result', pageWidth / 2, 30, { align: 'center' });
    
    // Content
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    
    let yPos = 50;
    const lineHeight = 10;
    
    doc.text(`Student: ${result.studentName}`, 20, yPos);
    yPos += lineHeight;
    
    doc.text(`Test: ${result.testTitle}`, 20, yPos);
    yPos += lineHeight;
    
    doc.text(`Type: ${result.testType} - ${result.testSkill}`, 20, yPos);
    yPos += lineHeight * 1.5;
    
    doc.setFontSize(18);
    doc.setTextColor(16, 185, 129);
    doc.text(`Band Score: ${result.bandScore.toFixed(1)}`, 20, yPos);
    yPos += lineHeight * 1.5;
    
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(`Score: ${result.totalScore}/${result.maxScore} (${result.percentage.toFixed(1)}%)`, 20, yPos);
    yPos += lineHeight;
    
    doc.text(`Correct: ${result.correct} | Partial: ${result.partialCredit} | Incorrect: ${result.incorrect}`, 20, yPos);
    yPos += lineHeight * 1.5;
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text(`Completed: ${new Date(result.submittedAt).toLocaleString()}`, 20, yPos);
    yPos += lineHeight;
    
    doc.text(`Session: ${result.sessionCode}`, 20, yPos);
    
    const filename = `${result.studentName.replace(/[^a-z0-9]/gi, '_')}_Result.pdf`;
    doc.save(filename);
    
    console.log(`📄 Simple certificate generated: ${filename}`);
  } catch (error) {
    console.error('Error generating simple certificate:', error);
    throw error;
  }
}

/**
 * Check if jsPDF is available
 */
export async function isPDFGenerationAvailable(): Promise<boolean> {
  try {
    await import('jspdf');
    return true;
  } catch {
    return false;
  }
}
