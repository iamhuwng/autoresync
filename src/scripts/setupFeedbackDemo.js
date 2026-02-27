/**
 * Setup script for Feedback Components Demo
 * 
 * This script creates the necessary mock data in Firebase for testing
 * the feedback components on the demo page.
 * 
 * Run this script once to set up the demo data:
 * node src/scripts/setupFeedbackDemo.js
 */

import { ref, set } from 'firebase/database';
import { database } from '../services/firebase.js';

const DEMO_RESULT_ID = 'demo-result-123';
const DEMO_STUDENT_ID = 'student-456';
const DEMO_COURSE_ID = 'demo-course-789';

async function setupDemoData() {
    console.log('🚀 Setting up Feedback Demo data...\n');

    try {
        // Note: The teacherId will be the actual logged-in user's UID
        // So we create a course without a specific createdBy, which allows any teacher

        // Create a demo course (without createdBy so any teacher can access)
        const courseData = {
            id: DEMO_COURSE_ID,
            name: 'Demo Course - IELTS Preparation',
            code: 'DEMO-IELTS-001',
            description: 'Demo course for testing feedback components',
            type: 'public',
            visibility: 'public',
            createdAt: Date.now(),
            // No createdBy field - this allows any teacher to edit feedback
        };

        await set(ref(database, `courses/${DEMO_COURSE_ID}`), courseData);
        console.log('✅ Created demo course:', DEMO_COURSE_ID);

        // Create a demo test result
        const resultData = {
            id: DEMO_RESULT_ID,
            studentId: DEMO_STUDENT_ID,
            studentName: 'John Doe',
            courseId: DEMO_COURSE_ID, // Link to the course
            testName: 'IELTS Reading Practice Test 1',
            score: 75,
            totalQuestions: 3,
            correctAnswers: 2,
            completedAt: Date.now(),
            answers: {
                q1: {
                    questionId: 'q1',
                    answer: 'B',
                    isCorrect: true,
                    points: 1
                },
                q2: {
                    questionId: 'q2',
                    answer: 'greenhouse gases, deforestation',
                    isCorrect: false,
                    points: 0
                },
                q3: {
                    questionId: 'q3',
                    answer: 'C',
                    isCorrect: true,
                    points: 1
                }
            }
        };

        await set(ref(database, `test_results/${DEMO_RESULT_ID}`), resultData);
        console.log('✅ Created demo test result:', DEMO_RESULT_ID);

        console.log('\n🎉 Demo data setup complete!');
        console.log('\n📝 Next steps:');
        console.log('1. Make sure you are logged in to the app');
        console.log('2. Navigate to http://localhost:5173/demo/feedback');
        console.log('3. You should now be able to add feedback as a teacher');
        console.log('\n💡 Note: Since the course has no createdBy field, any logged-in teacher can add feedback.');

    } catch (error) {
        console.error('❌ Error setting up demo data:', error);
        throw error;
    }
}

// Run the setup
setupDemoData()
    .then(() => {
        console.log('\n✨ Setup script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Setup script failed:', error);
        process.exit(1);
    });
