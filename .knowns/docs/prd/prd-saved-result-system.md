---
title: PRD Saved Result System
createdAt: '2026-02-27T15:27:38.070Z'
updatedAt: '2026-02-27T15:27:39.557Z'
description: Product requirements for enhanced saved result viewing system
tags:
  - prd
  - results
  - saved
---
# PRD: Enhanced Saved Result System

**Document Version:** 1.0  
**Created:** January 27, 2025  
**Status:** Draft  
**Author:** AI Assistant  

---

## 1. Introduction/Overview

### Problem Statement
The current test result system has a dual storage architecture where results are saved to both session storage (`game_sessions/`) and permanent storage (`test_results/`). However, the result display pages currently re-mark tests in real-time from session data instead of utilizing the permanent storage. This creates several issues:

1. **Data Loss Risk:** If session data is deleted, results are lost despite permanent storage existing
2. **Performance Overhead:** Tests are re-calculated on every page load instead of reading pre-computed results
3. **Limited History:** Students cannot view their complete test history across sessions
4. **No Progress Tracking:** No visualization of improvement over time
5. **Fragmented Guest Data:** Guest student results are not properly categorized or filterable
6. **No Export Capabilities:** Students and teachers cannot export results for external use

### Solution
Build a comprehensive, enhanced saved result system that:
- Fully utilizes the permanent `test_results/` storage for all result display
- Provides complete test history for students and teachers
- Enables progress tracking with visualizations
- Supports all 4 IELTS skills (Reading, Listening, Writing, Speaking)
- Properly categorizes and filters guest vs authenticated student results
- Integrates with existing class management and notification systems

---

## 2. Goals

### Primary Goals
1. **Data Persistence:** Ensure all test results persist beyond session lifecycle and are retrievable from permanent storage
2. **User Experience:** Provide intuitive result viewing interfaces for students and teachers
3. **Analytics & Insights:** Enable progress tracking, performance analysis, and data-driven insights

### Measurable Objectives
- 100% of submitted test results saved to permanent storage
- Results retrievable within 2 seconds of page load
- Support up to 1,000 results per student without performance degradation
- All 4 IELTS skills supported in data structure (auto-marking for Reading/Listening, manual-ready for Writing/Speaking)

---

## 3. User Stories

### Student User Stories

**US-S1:** As a student, I want to view my results from a specific test session so that I can review my performance immediately after completing a test.

**US-S2:** As a student, I want to view my complete test history across all sessions so that I can track all my past performances.

**US-S3:** As a student, I want to see my progress over time in charts so that I can visualize my improvement.

**US-S4:** As a student, I want to download my results as a PDF certificate/report so that I can share my achievements.

**US-S5:** As a student, I want to compare my performance across different tests so that I can identify my strengths and weaknesses.

**US-S6:** As a student, I want to see my IELTS band score progression with milestones so that I can track my path to my target score.

**US-S7:** As a student, I want to see a multi-skill radar chart so that I can understand my performance across Reading, Listening, Writing, and Speaking.

### Teacher User Stories

**US-T1:** As a teacher, I want to view all student results for a specific session so that I can assess class performance.

**US-T2:** As a teacher, I want to view individual student performance history so that I can provide personalized guidance.

**US-T3:** As a teacher, I want to see class-wide analytics and statistics so that I can identify common problem areas.

**US-T4:** As a teacher, I want to export class reports as PDF/CSV so that I can share with stakeholders.

**US-T5:** As a teacher, I want to see question-level difficulty analysis so that I can improve my teaching focus.

**US-T6:** As a teacher, I want to re-mark tests with history tracking so that I can correct any marking errors.

**US-T7:** As a teacher, I want to filter between guest and registered student results so that I can analyze them separately.

**US-T8:** As a teacher, I want to only see results from my own students/classes so that my data is private from other teachers.

### Guest Student User Stories

**US-G1:** As a guest student, I want my results saved anonymously so that I can still review my performance.

**US-G2:** As a guest student, I want my results to be separate from registered student results so that the data is organized.

---

## 4. Functional Requirements

### 4.1 Data Storage & Persistence

**FR-4.1.1:** The system MUST save all test results to permanent storage (`test_results/{resultId}`) upon submission.

**FR-4.1.2:** The system MUST create indexes for efficient querying:
- By session: `test_results_by_session/{sessionCode}/{resultId}`
- By student: `test_results_by_student/{studentId}/{resultId}`
- By teacher: `test_results_by_teacher/{teacherId}/{resultId}` (NEW)

**FR-4.1.3:** The system MUST store the following data for each result:
- Result metadata (resultId, sessionCode, testId, timestamps)
- Student information (studentId, studentName, isGuest flag, teacherId)
- Score data (totalScore, maxScore, percentage, bandScore)
- Question-level details (per-question results with student/correct answers)
- Test metadata (title, type, skill, duration)
- Time tracking (timeElapsed, submittedAt)

**FR-4.1.4:** The system MUST support all 4 IELTS skill types in the data structure:
- Reading (auto-marked)
- Listening (auto-marked)
- Writing (manual-marking ready - store submission, rubric scores placeholder)
- Speaking (manual-marking ready - store audio reference, rubric scores placeholder)

**FR-4.1.5:** The system MUST distinguish between guest and authenticated students with an `isGuest` boolean flag.

**FR-4.1.6:** The system MUST associate results with the teacher who created the session via `teacherId` field.

### 4.2 Student Result Viewing

**FR-4.2.1:** The system MUST provide a "My Results" page accessible from the student dashboard.

**FR-4.2.2:** The system MUST display a list of all past test results with:
- Test title and type
- Date completed
- Score and percentage
- Band score (for IELTS tests)
- Skill type indicator

**FR-4.2.3:** The system MUST allow students to click on any result to view detailed breakdown:
- Question-by-question review
- Student answer vs correct answer comparison
- Feedback per question
- Time spent per question (if available)

**FR-4.2.4:** The system MUST support pagination for result history (20 results per page).

**FR-4.2.5:** The system MUST allow filtering results by:
- Date range
- Test type (quiz/test)
- Skill type (Reading, Listening, Writing, Speaking)
- Score range

### 4.3 Student Progress Tracking

**FR-4.3.1:** The system MUST display a line chart showing score progression over time.

**FR-4.3.2:** The system MUST display a multi-skill radar chart showing performance across all 4 IELTS skills.

**FR-4.3.3:** The system MUST display IELTS band score progression with milestone markers (5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0).

**FR-4.3.4:** The system MUST calculate and display:
- Average score across all tests
- Best score achieved
- Most improved skill
- Total tests completed
- Study streak (consecutive days with test activity)

### 4.4 Student Export

**FR-4.4.1:** The system MUST allow students to download individual result as PDF certificate.

**FR-4.4.2:** The system MUST allow students to download a progress report PDF containing:
- Summary statistics
- Progress charts
- Recent test results

### 4.5 Teacher Result Viewing

**FR-4.5.1:** The system MUST provide a "Student Results" page accessible from the teacher dashboard.

**FR-4.5.2:** The system MUST only show results from students in the teacher's own classes/sessions.

**FR-4.5.3:** The system MUST display session-level results with:
- List of all students who completed the test
- Sortable by score, name, submission time
- Average class score
- Score distribution visualization

**FR-4.5.4:** The system MUST allow teachers to click on any student to view their:
- Result details for that session
- Complete test history (within teacher's classes only)
- Progress over time

**FR-4.5.5:** The system MUST provide question-level analytics:
- Correct/incorrect count per question
- Difficulty percentage (% of students who got it correct)
- Most commonly wrong answers

### 4.6 Teacher Filters

**FR-4.6.1:** The system MUST provide a toggle filter: "All Students" / "Registered Only" / "Guest Only".

**FR-4.6.2:** The system MUST provide detailed filters:
- Date range
- Test/session selection
- Skill type
- Score range
- Class selection

### 4.7 Teacher Export

**FR-4.7.1:** The system MUST allow teachers to export session results as CSV.

**FR-4.7.2:** The system MUST allow teachers to export session results as PDF report.

**FR-4.7.3:** The system MUST allow teachers to export individual student reports.

### 4.8 Re-Marking

**FR-4.8.1:** The system MUST allow teachers to manually adjust scores for any question.

**FR-4.8.2:** The system MUST track re-marking history:
- Original score
- New score
- Reason/comment
- Timestamp
- Teacher who made the change

**FR-4.8.3:** The system MUST recalculate totals after re-marking and update the stored result.

### 4.9 Email Notifications

**FR-4.9.1:** The system MUST send students an email with result summary after test completion.

**FR-4.9.2:** The system MUST send teachers an email when all students in a session have submitted.

**FR-4.9.3:** The system MUST allow users to opt-in/out of email notifications.

**FR-4.9.4:** The system MUST support scheduled weekly/monthly progress report emails for students.

### 4.10 Integration

**FR-4.10.1:** The system MUST integrate with the existing class management system (`classManager.ts`).

**FR-4.10.2:** The system MUST display results in the student account/profile page.

**FR-4.10.3:** The system MUST add a "Results" tab to the teacher dashboard.

**FR-4.10.4:** The system MUST update result pages to read from permanent storage instead of re-marking.

---

## 5. Non-Goals (Out of Scope)

1. **Parent/Admin Views:** Parent access to student results is deferred to future enhancement.
2. **Cross-Teacher Visibility:** Each teacher's data is isolated; no school admin role in this phase.
3. **Writing/Speaking Marking Workflow:** Only data structure for manual marking; actual rubric-based marking UI is future work.
4. **AI-Assisted Marking:** No AI marking for Writing/Speaking in this phase.
5. **Real-time Collaboration:** No live collaborative result review between teachers.
6. **Mobile App:** This PRD covers web only; mobile apps are separate.
7. **Offline Support:** Results require internet connectivity.

---

## 6. Design Considerations

### UI/UX Requirements

1. **Follow Design System:** All new pages MUST use the glassmorphic design system:
   - Card variants: `glass`, `lavender`, `sky`, `mint`
   - Button variants from `src/components/modern`
   - Gradient backgrounds
   - Backdrop blur effects

2. **Student Results Page:**
   - Clean list view with cards for each result
   - Expandable detail view
   - Progress charts prominently displayed
   - Quick filters accessible

3. **Teacher Results Page:**
   - Table view with sorting capabilities
   - Student search functionality
   - Bulk actions (export selected)
   - Analytics dashboard cards at top

4. **Progress Visualizations:**
   - Use Recharts or similar library for charts
   - Consistent color scheme with design system
   - Responsive sizing for different screens

### Existing Components to Reuse
- `Card`, `CardBody`, `Button` from `src/components/modern`
- `TestResultRecord` interface from `src/services/testResults.service.ts`
- PDF generation from `src/utils/pdfCertificate.ts`

---

## 7. Technical Considerations

### Database Structure

```
Firebase Realtime Database:

test_results/
  {resultId}/
    resultId: string
    sessionCode: string
    testId: string
    studentId: string
    studentName: string
    isGuest: boolean
    teacherId: string (NEW - for teacher filtering)
    testSkill: "reading" | "listening" | "writing" | "speaking"
    totalScore: number
    maxScore: number
    percentage: number
    bandScore: number
    questionResults: [...]
    submittedAt: number
    createdAt: number
    reMarkHistory: [...] (NEW)
    
test_results_by_session/{sessionCode}/{resultId}: lightweight index
test_results_by_student/{studentId}/{resultId}: lightweight index
test_results_by_teacher/{teacherId}/{resultId}: NEW lightweight index
```

### API Functions Needed

```typescript
// Enhanced existing functions
getStudentResults(studentId, filters?): TestResultRecord[]
getSessionResults(sessionCode): TestResultRecord[]
getTeacherResults(teacherId, filters?): TestResultRecord[]

// New functions
getStudentProgress(studentId): ProgressData
getQuestionAnalytics(sessionCode): QuestionAnalytics[]
updateResultScore(resultId, questionNumber, newScore, reason): void
getReMarkHistory(resultId): ReMarkEntry[]
exportResultsCSV(resultIds[]): Blob
exportResultsPDF(resultIds[]): Blob
```

### Dependencies
- Existing: Firebase, React, TypeScript
- Chart library: Recharts (already in project) or Chart.js
- PDF generation: jsPDF (already used)
- CSV generation: Built-in or simple utility

### Performance Considerations
- Implement pagination for large result sets
- Use Firebase indexes for efficient querying
- Cache frequently accessed results in React Query or similar
- Lazy load question details on expand

### Migration Plan
1. Add `teacherId` field to new results automatically
2. Backfill existing results with `teacherId` from session data
3. Update result pages to read from permanent storage
4. Deprecate re-marking from session data

---

## 8. Success Metrics

1. **Data Integrity:** 100% of submitted tests have permanent result records
2. **Performance:** Result pages load in <2 seconds for up to 1,000 results
3. **Adoption:** 80% of teachers use the new results dashboard within 1 month
4. **Export Usage:** 50% of teachers export at least one report per month
5. **Student Engagement:** 60% of students view their progress charts at least once per week
6. **Re-marking:** <5% of results require re-marking (indicates good auto-marking accuracy)

---

## 9. Open Questions

1. **Notification Provider:** Which email service to use? (SendGrid, Firebase Extensions, etc.)
2. **Chart Library:** Confirm Recharts is suitable or evaluate alternatives
3. **Storage Limits:** Should we implement result archiving after a certain period?
4. **Data Privacy:** Are there GDPR/privacy requirements for result data retention?
5. **Backup Strategy:** How should results be backed up beyond Firebase?

---

## 10. Implementation Phases

### Phase 1: Core Storage & Retrieval (Priority: High)
- Add `teacherId` to result records
- Create `test_results_by_teacher` index
- Update `saveTestResult` to include all new fields
- Modify StudentTestResultsPage to use permanent storage
- Modify TeacherTestResultsPage to use permanent storage

### Phase 2: Student History & Progress (Priority: High)
- Create Student Results History page
- Implement progress charts (line, radar, band score)
- Add filtering capabilities
- Implement PDF certificate export

### Phase 3: Teacher Analytics (Priority: Medium)
- Create enhanced Teacher Results dashboard
- Implement question-level analytics
- Add guest/registered filter
- Implement re-marking with history

### Phase 4: Export & Notifications (Priority: Medium)
- Implement CSV export
- Implement PDF report export
- Set up email notification system
- Create notification preferences UI

### Phase 5: Writing/Speaking Data Structure (Priority: Low)
- Extend result schema for manual marking
- Create placeholder UI for Writing/Speaking results
- Document rubric structure for future implementation

---

## Appendix A: Data Interfaces

```typescript
interface EnhancedTestResultRecord {
  resultId: string;
  sessionCode: string;
  testId: string;
  studentId: string;
  studentName: string;
  isGuest: boolean;
  teacherId: string;
  
  // Scores
  totalScore: number;
  maxScore: number;
  percentage: number;
  bandScore: number;
  
  // Test info
  testTitle: string;
  testType: 'quiz' | 'test';
  testSkill: 'reading' | 'listening' | 'writing' | 'speaking';
  testDuration: number;
  
  // Question details
  questionResults: QuestionResult[];
  
  // Summary
  correct: number;
  incorrect: number;
  partialCredit: number;
  totalQuestions: number;
  
  // Timestamps
  submittedAt: number;
  timeElapsed: number;
  createdAt: number;
  updatedAt?: number;
  
  // Re-marking
  reMarkHistory?: ReMarkEntry[];
  lastReMarkedAt?: number;
  lastReMarkedBy?: string;
}

interface QuestionResult {
  questionNumber: number;
  questionType: string;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  studentAnswer: any;
  correctAnswer: any;
  feedback: string;
  timeSpent?: number;
}

interface ReMarkEntry {
  questionNumber: number;
  originalScore: number;
  newScore: number;
  reason: string;
  remarkedBy: string;
  remarkedAt: number;
}

interface ProgressData {
  totalTests: number;
  averageScore: number;
  bestScore: number;
  recentScores: { date: number; score: number; skill: string }[];
  skillBreakdown: { skill: string; averageScore: number; testCount: number }[];
  bandScoreProgression: { date: number; bandScore: number }[];
  studyStreak: number;
}

interface QuestionAnalytics {
  questionNumber: number;
  correctCount: number;
  incorrectCount: number;
  partialCount: number;
  totalAttempts: number;
  difficultyPercent: number;
  commonWrongAnswers: { answer: string; count: number }[];
}

interface ResultFilters {
  dateFrom?: number;
  dateTo?: number;
  testType?: 'quiz' | 'test';
  skill?: 'reading' | 'listening' | 'writing' | 'speaking';
  scoreMin?: number;
  scoreMax?: number;
  isGuest?: boolean;
  classId?: string;
  sessionCode?: string;
}
```

---

**End of PRD**
