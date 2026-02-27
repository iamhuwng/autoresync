import jsPDF from 'jspdf';
import { StudentResult } from '../services/resultsService';

/**
 * Generate a comprehensive PDF report for a class session
 */
export const generateClassReportPDF = (
    results: StudentResult[],
    testTitle: string,
    sessionCode: string
): void => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    // --- Header ---
    doc.setFillColor(102, 126, 234); // Primary Blue
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Performance Report', margin, 20);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Test: ${testTitle || 'Untitled Test'} `, margin, 32);
    doc.text(`Session: ${sessionCode} `, pageWidth - margin - 40, 32);

    // --- Summary Stats ---
    const totalStudents = results.length;
    const avgScore = totalStudents > 0
        ? results.reduce((acc, r) => acc + r.percentage, 0) / totalStudents
        : 0;
    const passedStudents = results.filter(r => r.percentage >= 60).length; // Assuming 60% pass
    const passRate = totalStudents > 0 ? (passedStudents / totalStudents) * 100 : 0;

    const avgBand = totalStudents > 0 && results[0].bandScore !== undefined
        ? (results.reduce((acc, r) => acc + (r.bandScore || 0), 0) / totalStudents).toFixed(1)
        : 'N/A';

    let yPos = 55;
    const cardWidth = (pageWidth - (margin * 2) - 15) / 4;
    const cardHeight = 25;

    const drawStatCard = (label: string, value: string, x: number) => {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'FD');

        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.text(label, x + 5, yPos + 10);

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(value, x + 5, yPos + 20);
    };

    drawStatCard('Total Students', totalStudents.toString(), margin);
    drawStatCard('Average Score', `${avgScore.toFixed(1)}% `, margin + cardWidth + 5);
    drawStatCard('Pass Rate', `${passRate.toFixed(1)}% `, margin + (cardWidth + 5) * 2);
    drawStatCard('Avg Band', avgBand.toString(), margin + (cardWidth + 5) * 3);

    // --- Table ---
    yPos += 40;

    const cols = [
        { header: 'Student Name', width: 50, key: 'studentName' },
        { header: 'Email', width: 50, key: 'studentEmail' },
        { header: 'Score', width: 20, key: 'score' },
        { header: '%', width: 20, key: 'percentage' },
        { header: 'Band', width: 15, key: 'bandScore' },
        { header: 'Time', width: 20, key: 'timeSpent' }
    ];

    // Header Row
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');

    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');

    let xOffset = margin + 2;
    cols.forEach(col => {
        doc.text(col.header, xOffset, yPos + 7);
        xOffset += col.width;
    });

    yPos += 10;

    // Data Rows
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);

    results.forEach((row, i) => {
        if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
        }

        xOffset = margin + 2;

        // Background for alternate rows
        if (i % 2 === 1) {
            doc.setFillColor(250, 250, 250);
            doc.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');
        }

        // Name
        doc.text(row.studentName.substring(0, 25) + (row.studentName.length > 25 ? '...' : ''), xOffset, yPos + 7);
        xOffset += cols[0].width;

        // Email
        const email = (row.studentEmail || '-').substring(0, 25);
        doc.text(email, xOffset, yPos + 7);
        xOffset += cols[1].width;

        // Score
        doc.text(`${row.score}/${row.totalQuestions}`, xOffset, yPos + 7);
        xOffset += cols[2].width;

        // Percentage
        const pct = row.percentage.toFixed(1) + '%';
        if (row.percentage < 50) doc.setTextColor(239, 68, 68);
        else if (row.percentage >= 80) doc.setTextColor(16, 185, 129);
        doc.text(pct, xOffset, yPos + 7);
        doc.setTextColor(51, 65, 85); // Reset
        xOffset += cols[3].width;

        // Band
        doc.text(row.bandScore ? row.bandScore.toString() : '-', xOffset, yPos + 7);
        xOffset += cols[4].width;

        // Time
        const mins = row.timeSpent ? Math.floor(row.timeSpent / 60000) + 'm' : '-';
        doc.text(mins, xOffset, yPos + 7);

        // Line
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, yPos + 10, pageWidth - margin, yPos + 10);

        yPos += 10;
    });

    // --- Footer ---
    const dateStr = new Date().toLocaleDateString();
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated on ${dateStr} by Homework App`, margin, pageHeight - 10);

    // Save
    const safeTitle = testTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${safeTitle}_report_${sessionCode}.pdf`);
};

/**
 * Generate a progress report for a student
 */
export const generateProgressReportPDF = (
    results: StudentResult[],
    studentName: string
): void => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    // --- Header ---
    doc.setFillColor(139, 92, 246); // Purple
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Progress Report', margin, 20);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${studentName}`, margin, 32);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin - 60, 32);

    // --- Stats ---
    const totalTests = results.length;
    const avgScore = totalTests > 0 ? results.reduce((a, b) => a + b.percentage, 0) / totalTests : 0;
    const avgBand = totalTests > 0 && results.some(r => r.bandScore)
        ? (results.reduce((a, b) => a + (b.bandScore || 0), 0) / totalTests).toFixed(1)
        : 'N/A';

    const bestResult = totalTests > 0
        ? results.reduce((best, curr) => (curr.percentage > best.percentage ? curr : best), results[0])
        : null;

    let yPos = 55;

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.text(`Total Tests Taken: ${totalTests}`, margin, yPos);
    doc.text(`Average Score: ${avgScore.toFixed(1)}% (Band ${avgBand})`, margin, yPos + 10);
    if (bestResult) {
        const title = (bestResult.testTitle || 'Untitled').substring(0, 30);
        doc.text(`Best Performance: ${bestResult.percentage}% (Band ${bestResult.bandScore || '-'}) - ${title}`, margin, yPos + 20);
    }

    yPos += 40;

    // --- Table ---
    const cols = [
        { header: 'Date', width: 40 },
        { header: 'Test Title', width: 70 },
        { header: 'Score', width: 25 },
        { header: 'Band', width: 20 },
        { header: 'Time', width: 25 }
    ];

    // Header
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');
    doc.setTextColor(55, 65, 81);
    doc.setFont('helvetica', 'bold');

    let x = margin + 2;
    cols.forEach(col => {
        doc.text(col.header, x, yPos + 7);
        x += col.width;
    });

    yPos += 10;
    doc.setFont('helvetica', 'normal');

    results.forEach((r, i) => {
        if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
        }

        if (i % 2 === 1) {
            doc.setFillColor(249, 250, 251);
            doc.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');
        }

        x = margin + 2;
        doc.setTextColor(31, 41, 55);

        doc.text(new Date(r.completedAt).toLocaleDateString(), x, yPos + 7);
        x += cols[0].width;

        const title = (r.testTitle || 'Untitled').substring(0, 30);
        doc.text(title, x, yPos + 7);
        x += cols[1].width;

        doc.text(`${r.percentage.toFixed(0)}%`, x, yPos + 7);
        x += cols[2].width;

        doc.text(r.bandScore ? r.bandScore.toString() : '-', x, yPos + 7);
        x += cols[3].width;

        const time = r.timeSpent ? Math.floor(r.timeSpent / 60000) + 'm' : '-';
        doc.text(time, x, yPos + 7);

        yPos += 10;
    });

    doc.save(`progress_report_${studentName.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};
