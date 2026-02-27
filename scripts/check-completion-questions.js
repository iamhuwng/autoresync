/**
 * Check Completion Questions - Word Count Limit Verification
 * 
 * This script retrieves quizzes and specifically checks completion questions
 * to verify if word count limits are properly preserved in questionText.
 * 
 * Usage: node scripts/check-completion-questions.js
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
 * Fetch and analyze completion questions
 */
async function checkCompletionQuestions() {
  console.log('🔍 Retrieving quizzes from Firebase...\n');
  
  try {
    const quizzesRef = ref(database, 'quizzes');
    const snapshot = await get(quizzesRef);
    
    if (!snapshot.exists()) {
      console.log('❌ No quizzes found in database.\n');
      return;
    }
    
    const quizzes = snapshot.val();
    const quizIds = Object.keys(quizzes);
    
    console.log(`✅ Found ${quizIds.length} quiz(es)\n`);
    console.log('='.repeat(100));
    
    let totalCompletion = 0;
    let completionWithLimits = 0;
    let completionWithoutLimits = 0;
    
    // Analyze each quiz
    quizIds.forEach((quizId, index) => {
      const quiz = quizzes[quizId];
      const quizDate = quiz.createdAt ? new Date(quiz.createdAt).toLocaleString() : 'Unknown';
      
      console.log(`\n📋 QUIZ #${index + 1}`);
      console.log(`   ID: ${quizId}`);
      console.log(`   Title: ${quiz.title || 'N/A'}`);
      console.log(`   Created: ${quizDate}`);
      console.log(`   Source: ${quiz.metadata?.source || 'N/A'}`);
      console.log(`   Total Questions: ${quiz.questions?.length || 0}`);
      
      if (!quiz.questions || quiz.questions.length === 0) {
        console.log('   ⚠️ No questions found');
        return;
      }
      
      // Find completion questions
      const completionQuestions = quiz.questions.filter(q => q.type === 'completion');
      
      if (completionQuestions.length === 0) {
        console.log('   ℹ️ No completion questions in this quiz');
        console.log('='.repeat(100));
        return;
      }
      
      console.log(`\n   🎯 Found ${completionQuestions.length} COMPLETION question(s):`);
      console.log('   ' + '-'.repeat(96));
      
      completionQuestions.forEach((question, qIndex) => {
        totalCompletion++;
        const wordLimit = hasWordCountLimit(question.question);
        
        if (wordLimit) {
          completionWithLimits++;
          console.log(`\n   ✅ Q${question.number} - HAS word count limit`);
        } else {
          completionWithoutLimits++;
          console.log(`\n   ❌ Q${question.number} - MISSING word count limit`);
        }
        
        console.log(`      Type: ${question.type}`);
        console.log(`      Full Question Text:`);
        console.log(`      "${question.question}"`);
        
        if (wordLimit) {
          console.log(`      ✓ Detected Limit: "${wordLimit}"`);
        } else {
          console.log(`      ✗ No word count limit found in text`);
        }
        
        console.log(`      Answer: ${JSON.stringify(question.answer)}`);
        console.log(`      Has Options: ${question.options && question.options.length > 0 ? 'Yes' : 'No'}`);
        
        if (question.context) {
          console.log(`      Has Context: Yes`);
          const contextLimit = hasWordCountLimit(JSON.stringify(question.context));
          if (contextLimit) {
            console.log(`      ✓ Context has limit: "${contextLimit}"`);
          }
        }
      });
      
      console.log('\n' + '='.repeat(100));
    });
    
    // Summary
    console.log('\n\n📊 COMPLETION QUESTIONS SUMMARY:');
    console.log('='.repeat(100));
    console.log(`\n   Total Completion Questions: ${totalCompletion}`);
    console.log(`   ✅ With Word Count Limits: ${completionWithLimits} (${totalCompletion > 0 ? Math.round(completionWithLimits/totalCompletion*100) : 0}%)`);
    console.log(`   ❌ Without Word Count Limits: ${completionWithoutLimits} (${totalCompletion > 0 ? Math.round(completionWithoutLimits/totalCompletion*100) : 0}%)`);
    
    if (completionWithoutLimits > 0) {
      console.log(`\n   ⚠️  WARNING: ${completionWithoutLimits} completion question(s) missing word count limits!`);
      console.log(`   These questions were likely created BEFORE the word count preservation fix.`);
      console.log(`   To fix: Create a new quiz using the same source file.`);
    } else if (totalCompletion > 0) {
      console.log(`\n   🎉 All completion questions have word count limits properly preserved!`);
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('\n✅ Analysis complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
  }
}

// Run check
checkCompletionQuestions().then(() => {
  console.log('👋 Exiting...\n');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
