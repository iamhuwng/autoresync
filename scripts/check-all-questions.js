/**
 * Check ALL Questions - Full Quiz Analysis
 * 
 * This script retrieves the latest quiz and shows ALL questions
 * to identify what happened to Q8-13.
 * 
 * Usage: node scripts/check-all-questions.js
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Firebase config
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

/**
 * Check if questionText contains word count limit patterns
 */
function hasWordCountLimit(text) {
  if (!text) return null;
  
  const patterns = [
    /ONE WORD ONLY/i,
    /NO MORE THAN TWO WORDS/i,
    /NO MORE THAN THREE WORDS AND\/OR A NUMBER/i,
    /NO MORE THAN THREE WORDS/i,
    /ONE WORD AND\/OR A NUMBER/i,
    /TWO WORDS ONLY/i,
    /THREE WORDS ONLY/i,
    /Choose.*NO MORE THAN/i,
    /Choose.*ONE WORD/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

/**
 * Fetch and analyze all questions
 */
async function checkAllQuestions() {
  console.log('🔍 Retrieving latest quiz from Firebase...\n');
  
  try {
    const quizzesRef = ref(database, 'quizzes');
    const snapshot = await get(quizzesRef);
    
    if (!snapshot.exists()) {
      console.log('❌ No quizzes found in database.\n');
      return;
    }
    
    const quizzes = snapshot.val();
    const quizIds = Object.keys(quizzes);
    
    // Get the most recent quiz (last in list)
    const latestQuizId = quizIds[quizIds.length - 1];
    const quiz = quizzes[latestQuizId];
    
    const quizDate = quiz.createdAt ? new Date(quiz.createdAt).toLocaleString() : 'Unknown';
    
    console.log(`📋 LATEST QUIZ ANALYSIS`);
    console.log('='.repeat(100));
    console.log(`   ID: ${latestQuizId}`);
    console.log(`   Title: ${quiz.title || 'N/A'}`);
    console.log(`   Created: ${quizDate}`);
    console.log(`   Source: ${quiz.metadata?.source || 'N/A'}`);
    console.log(`   Total Questions: ${quiz.questions?.length || 0}`);
    console.log('='.repeat(100));
    
    if (!quiz.questions || quiz.questions.length === 0) {
      console.log('   ⚠️ No questions found');
      return;
    }
    
    // Check Questions 1-13 (first passage)
    console.log(`\n\n🔍 PASSAGE 1 QUESTIONS (Q1-13):`);
    console.log('='.repeat(100));
    
    for (let i = 0; i < 13 && i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      const wordLimit = hasWordCountLimit(q.question);
      
      console.log(`\nQ${q.number} (${q.type}):`);
      console.log(`   Question: "${q.question.substring(0, 150)}${q.question.length > 150 ? '...' : ''}"`);
      console.log(`   Answer: ${JSON.stringify(q.answer)}`);
      console.log(`   Options: ${q.options && q.options.length > 0 ? q.options.length + ' options' : 'None'}`);
      
      if (wordLimit) {
        console.log(`   ✅ Word Limit: "${wordLimit}"`);
      } else {
        console.log(`   ❌ No word count limit detected`);
      }
      
      // Check if Q8-13 should be completion but aren't
      if (i >= 7 && i <= 12) { // Q8-13
        if (q.type !== 'completion') {
          console.log(`   ⚠️  EXPECTED TYPE: completion, ACTUAL TYPE: ${q.type}`);
        }
      }
    }
    
    // Check Questions 35-40 (third passage completion table)
    console.log(`\n\n🔍 PASSAGE 3 QUESTIONS (Q35-40):`);
    console.log('='.repeat(100));
    
    for (let i = 34; i < 40 && i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      const wordLimit = hasWordCountLimit(q.question);
      
      console.log(`\nQ${q.number} (${q.type}):`);
      console.log(`   Question: "${q.question.substring(0, 150)}${q.question.length > 150 ? '...' : ''}"`);
      console.log(`   Answer: ${JSON.stringify(q.answer)}`);
      console.log(`   Options: ${q.options && q.options.length > 0 ? q.options.length + ' options' : 'None'}`);
      
      if (wordLimit) {
        console.log(`   ✅ Word Limit: "${wordLimit}"`);
      } else {
        console.log(`   ❌ No word count limit detected`);
      }
    }
    
    // Summary by type
    console.log(`\n\n📊 QUESTION TYPE BREAKDOWN:`);
    console.log('='.repeat(100));
    
    const typeCount = {};
    quiz.questions.forEach(q => {
      typeCount[q.type] = (typeCount[q.type] || 0) + 1;
    });
    
    Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} question(s)`);
    });
    
    console.log('\n' + '='.repeat(100));
    console.log('\n✅ Analysis complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
  }
}

// Run check
checkAllQuestions().then(() => {
  console.log('👋 Exiting...\n');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
