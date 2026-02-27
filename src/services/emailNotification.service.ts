import { collection, addDoc } from 'firebase/firestore';
// @ts-ignore
import { firestore } from './firebase';
import { StudentResult } from './resultsService';

/**
 * Service to handle email notifications via Firebase Extension
 * (Trigger Email)
 */

export interface EmailMessage {
    to: string | string[];
    message: {
        subject: string;
        text?: string;
        html?: string;
    };
}

/**
 * Send a generic email
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
        if (!to) return;

        await addDoc(collection(firestore, 'mail'), {
            to: [to],
            message: {
                subject,
                html,
            }
        });
        console.log(`📧 Email queued for ${to}: ${subject}`);
    } catch (error) {
        console.warn('Failed to queue email notification:', error);
        // Don't throw, failing to send email shouldn't break the app flow
    }
}

/**
 * Send result summary to student
 */
export async function sendResultNotification(
    studentEmail: string,
    result: StudentResult,
    testTitle: string
): Promise<void> {
    if (!studentEmail) return;

    const subject = `Test Result: ${testTitle} - ${result.percentage.toFixed(1)}%`;

    const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #4f46e5;">Test Completed</h2>
      <p>Hi ${result.studentName},</p>
      <p>Here are your results for <strong>${testTitle}</strong>:</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Score:</strong> ${result.score}/${result.totalQuestions}</p>
        <p style="margin: 5px 0;"><strong>Percentage:</strong> ${result.percentage.toFixed(1)}%</p>
        <p style="margin: 5px 0;"><strong>Band Score:</strong> ${result.bandScore || 'N/A'}</p>
      </div>

      <p>You can view detailed results and your history on your dashboard.</p>
      
      <p>Best regards,<br>Homework App</p>
    </div>
  `;

    await sendEmail(studentEmail, subject, html);
}

/**
 * Send session completion summary to teacher
 */
export async function sendTeacherSessionComplete(
    teacherEmail: string,
    sessionCode: string,
    summary: {
        totalStudents: number;
        avgScore: number;
        passRate: number;
        testTitle: string;
    }
): Promise<void> {
    if (!teacherEmail) return;

    const subject = `Session Complete: ${summary.testTitle} (${sessionCode})`;

    const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #4f46e5;">Session Summary</h2>
      <p>All students have completed the test for session <strong>${sessionCode}</strong>.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Test:</strong> ${summary.testTitle}</p>
        <p style="margin: 5px 0;"><strong>Total Students:</strong> ${summary.totalStudents}</p>
        <p style="margin: 5px 0;"><strong>Average Score:</strong> ${summary.avgScore.toFixed(1)}%</p>
        <p style="margin: 5px 0;"><strong>Pass Rate:</strong> ${summary.passRate.toFixed(1)}%</p>
      </div>

      <p>View full detailed analysis on your dashboard.</p>
    </div>
  `;

    await sendEmail(teacherEmail, subject, html);
}
