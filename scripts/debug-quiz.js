// Quick script to inspect quiz data structure for matching questions
// Run with: node scripts/debug-quiz.js

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
const serviceAccount = {
  type: "service_account",
  project_id: process.env.VITE_FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL
});

const db = admin.database();

// Fetch and inspect the most recent quiz
async function inspectQuizzes() {
  try {
    console.log('Fetching quizzes...\n');
    
    const snapshot = await db.ref('quizzes').once('value');
    const quizzes = snapshot.val();
    
    if (!quizzes) {
      console.log('No quizzes found in database.');
      return;
    }
    
    // Get the most recent quiz (last one in the object)
    const quizIds = Object.keys(quizzes);
    const latestQuizId = quizIds[quizIds.length - 1];
    const latestQuiz = quizzes[latestQuizId];
    
    console.log(`Latest Quiz ID: ${latestQuizId}`);
    console.log(`Title: ${latestQuiz.title}`);
    console.log(`Total Questions: ${latestQuiz.questions?.length || 0}\n`);
    
    // Inspect questions 14-23 and 31-35 (indices 13-22 and 30-34)
    const questionsToCheck = [
      ...Array.from({length: 10}, (_, i) => i + 13), // 13-22 (Q14-23)
      ...Array.from({length: 5}, (_, i) => i + 30)   // 30-34 (Q31-35)
    ];
    
    console.log('Inspecting matching questions (14-23 and 31-35):\n');
    console.log('='.repeat(80));
    
    for (const index of questionsToCheck) {
      if (!latestQuiz.questions[index]) {
        console.log(`\nQuestion ${index + 1}: NOT FOUND`);
        continue;
      }
      
      const q = latestQuiz.questions[index];
      
      if (q.type === 'matching') {
        console.log(`\n📝 Question ${q.number || index + 1}: ${q.type}`);
        console.log('-'.repeat(80));
        console.log(`Question Text: ${q.question?.substring(0, 80)}...`);
        console.log(`\nData Structure:`);
        console.log(`  - has items: ${!!q.items} ${q.items ? `(length: ${q.items.length})` : ''}`);
        console.log(`  - has options: ${!!q.options} ${q.options ? `(length: ${q.options.length})` : ''}`);
        console.log(`  - has answer: ${!!q.answer} ${q.answer ? `(value: "${q.answer}")` : ''}`);
        console.log(`  - has answers: ${!!q.answers} ${q.answers ? `(type: ${typeof q.answers})` : ''}`);
        
        console.log(`\nOptions array content:`);
        if (q.options) {
          console.log(JSON.stringify(q.options, null, 2));
        } else {
          console.log('  (none)');
        }
        
        console.log(`\nAnswer field:`);
        if (q.answer) {
          console.log(`  "${q.answer}"`);
        } else {
          console.log('  (none)');
        }
        
        // Check format
        const isIndividual = !q.items && q.options && q.answer;
        const isGrouped = q.items && q.options && q.answers;
        
        console.log(`\n✅ Format Detection:`);
        console.log(`  - Individual format (IELTS): ${isIndividual ? '✅ YES' : '❌ NO'}`);
        console.log(`  - Grouped format: ${isGrouped ? '✅ YES' : '❌ NO'}`);
        
        if (!isIndividual && !isGrouped) {
          console.log(`  ⚠️  WILL SHOW ERROR: "Invalid matching question: missing required fields"`);
        }
        
        console.log('='.repeat(80));
      }
    }
    
    console.log('\n✅ Inspection complete');
    process.exit(0);
    
  } catch (error) {
    console.error('Error inspecting quizzes:', error);
    process.exit(1);
  }
}

inspectQuizzes();
