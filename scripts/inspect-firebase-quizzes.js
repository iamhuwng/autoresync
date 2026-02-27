/**
 * Firebase Quiz Database Inspector
 * 
 * This script connects to Firebase Realtime Database and displays
 * the structure and content of quizzes created via Create New Quiz page
 * (both Wizard and Single Document Input modes).
 * 
 * Usage: npm run inspect:quizzes
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Firebase config (from your existing app)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate config
const missingVars = [];
if (!firebaseConfig.apiKey) missingVars.push('VITE_FIREBASE_API_KEY');
if (!firebaseConfig.databaseURL) missingVars.push('VITE_FIREBASE_DATABASE_URL');
if (!firebaseConfig.projectId) missingVars.push('VITE_FIREBASE_PROJECT_ID');

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\n💡 Make sure your .env file exists and contains all Firebase credentials.');
  process.exit(1);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

/**
 * Fetch and display all quizzes
 */
async function inspectQuizzes() {
  console.log('🔍 Connecting to Firebase Realtime Database...\n');
  
  try {
    const quizzesRef = ref(database, 'quizzes');
    const snapshot = await get(quizzesRef);
    
    if (!snapshot.exists()) {
      console.log('❌ No quizzes found in database.\n');
      return;
    }
    
    const quizzes = snapshot.val();
    const quizIds = Object.keys(quizzes);
    
    console.log(`✅ Found ${quizIds.length} quiz(es) in database\n`);
    console.log('='.repeat(80));
    
    // Display each quiz
    quizIds.forEach((quizId, index) => {
      const quiz = quizzes[quizId];
      
      console.log(`\n📋 QUIZ #${index + 1}: ${quizId}`);
      console.log('='.repeat(80));
      
      // Basic Info
      console.log(`\n📌 Basic Information:`);
      console.log(`   Title: ${quiz.title || 'N/A'}`);
      console.log(`   Created: ${quiz.createdAt || 'N/A'}`);
      console.log(`   Source: ${quiz.metadata?.source || 'N/A'}`);
      console.log(`   Question Count: ${quiz.questionCount || quiz.questions?.length || 0}`);
      console.log(`   Passage Count: ${quiz.passageCount || quiz.passages?.length || 0}`);
      
      // Passages
      if (quiz.passages && quiz.passages.length > 0) {
        console.log(`\n📖 Passages (${quiz.passages.length}):`);
        quiz.passages.forEach((passage, pIndex) => {
          console.log(`\n   Passage ${pIndex + 1}:`);
          console.log(`      ID: ${passage.id}`);
          console.log(`      Title: ${passage.title}`);
          console.log(`      Type: ${passage.type}`);
          console.log(`      Word Count: ${passage.wordCount}`);
          console.log(`      Questions: ${passage.questionStart}-${passage.questionEnd}`);
          console.log(`      Has Image: ${passage.imageUrl ? 'Yes ✅' : 'No'}`);
          if (passage.imageUrl) {
            console.log(`      Image URL: ${passage.imageUrl}`);
          }
          console.log(`      Content Preview: ${passage.content?.substring(0, 100)}...`);
        });
      } else {
        console.log(`\n📖 Passages: None (questions without passages)`);
      }
      
      // Questions
      if (quiz.questions && quiz.questions.length > 0) {
        console.log(`\n❓ Questions (${quiz.questions.length}):`);
        
        // Show first 3 and specific problem questions (14-23, 31-35, 25-34)
        const questionsToShow = [0, 1, 2, 13, 14, 15, 18, 19, 20, 22, 24, 25, 30, 31, 32, 33, 34];
        
        questionsToShow.forEach((qIndex) => {
          if (qIndex >= quiz.questions.length) return;
          
          const question = quiz.questions[qIndex];
          const isMatching = question.type === 'matching';
          const isProblemArea = (qIndex >= 13 && qIndex <= 22) || (qIndex >= 30 && qIndex <= 34) || (qIndex >= 18 && qIndex <= 20) || (qIndex >= 24 && qIndex <= 33);
          
          if (isProblemArea) {
            console.log(`\n   ⚠️ Question ${qIndex + 1} ${isMatching ? '[MATCHING]' : ''}:`);
          } else {
            console.log(`\n   Question ${qIndex + 1}:`);
          }
          
          console.log(`      ID: ${question.id}`);
          console.log(`      Number: ${question.number}`);
          console.log(`      Type: ${question.type}`);
          console.log(`      Text: ${question.question?.substring(0, 80)}${question.question?.length > 80 ? '...' : ''}`);
          console.log(`      Has Passage: ${question.passage ? 'Yes (ID: ' + question.passage + ')' : 'No'}`);
          
          // Detailed matching question structure
          if (isMatching) {
            console.log(`      🔍 MATCHING QUESTION STRUCTURE:`);
            console.log(`         • items: ${question.items ? `✓ (${Array.isArray(question.items) ? question.items.length + ' items' : typeof question.items})` : '✗ MISSING'}`);
            console.log(`         • options: ${question.options ? `✓ (${Array.isArray(question.options) ? question.options.length + ' items' : typeof question.options})` : '✗ MISSING'}`);
            console.log(`         • answer: ${question.answer ? `✓ (${typeof question.answer}: "${question.answer}")` : '✗ MISSING'}`);
            console.log(`         • answers: ${question.answers ? `✓ (${typeof question.answers})` : '✗ MISSING'}`);
            
            if (question.items) {
              console.log(`         Items: ${JSON.stringify(question.items).substring(0, 100)}`);
            }
            if (question.options) {
              console.log(`         Options: ${JSON.stringify(question.options).substring(0, 100)}`);
            }
            if (question.answers) {
              console.log(`         Answers: ${JSON.stringify(question.answers).substring(0, 100)}`);
            }
          } else {
            console.log(`      Options Count: ${question.options?.length || 0}`);
            console.log(`      Answer: ${JSON.stringify(question.answer)}`);
          }
          
          console.log(`      Timer: ${question.timer}s`);
          console.log(`      Points: ${question.points}`);
          
          // Show options if available and not matching
          if (!isMatching && question.options && question.options.length > 0) {
            console.log(`      Options:`);
            question.options.slice(0, 3).forEach((opt, oIndex) => {
              const optText = typeof opt === 'string' ? opt : opt.text;
              console.log(`         ${String.fromCharCode(65 + oIndex)}) ${optText?.substring(0, 60)}${optText?.length > 60 ? '...' : ''}`);
            });
          }
        });
        
        if (quiz.questions.length > questionsToShow.length) {
          console.log(`\n   ... and ${quiz.questions.length - questionsToShow.filter(i => i < quiz.questions.length).length} more questions not shown`);
        }
      }
      
      console.log('\n' + '='.repeat(80));
    });
    
    // Summary
    console.log('\n\n📊 DATABASE STRUCTURE SUMMARY:');
    console.log('='.repeat(80));
    console.log(`
Firebase Path: /quizzes/{quizId}

Quiz Object Structure:
{
  title: string,
  createdAt: ISO8601 string,
  questionCount: number,
  passageCount: number,
  metadata: {
    createdAt: Date,
    source: "ai-parsed"
  },
  passages: [
    {
      id: string,
      title: string,
      content: string,
      type: "text" | "image",
      imageUrl: string | null,
      questionStart: number,
      questionEnd: number,
      wordCount: number,
      createdAt: ISO8601 string
    }
  ],
  questions: [
    {
      id: string,
      number: number,
      type: "multiple-choice" | "true-false" | "completion" | etc.,
      question: string,
      options: string[] | object[],
      answer: string | string[] | object,
      passage: string | null (passage ID),
      timer: number (seconds),
      points: number,
      context: string | null
    }
  ]
}
    `);
    
    console.log('✅ Inspection complete!\n');
    
  } catch (error) {
    console.error('❌ Error inspecting database:', error);
    console.error('   Message:', error.message);
  }
}

// Run inspection
inspectQuizzes().then(() => {
  console.log('👋 Exiting...');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
