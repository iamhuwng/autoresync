import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import fs from 'fs';

const firebaseConfig = {
  apiKey: "AIzaSyC1v7bxLyD_mAj0kAx5UUKp9QCNr6azPcM",
  authDomain: "temp-a1437.firebaseapp.com",
  databaseURL: "https://temp-a1437-default-rtdb.firebaseio.com",
  projectId: "temp-a1437",
  storageBucket: "temp-a1437.firebasestorage.app",
  messagingSenderId: "910977280060",
  appId: "1:910977280060:web:cdf66c8ba19ec5f81ab67b"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function extractQuizzes() {
  try {
    const quizzesRef = ref(database, 'quizzes');
    const snapshot = await get(quizzesRef);
    
    if (snapshot.exists()) {
      const quizzes = snapshot.val();
      
      // Save to file
      fs.writeFileSync(
        'quiz-data-extracted.json',
        JSON.stringify(quizzes, null, 2)
      );
      
      console.log('✅ Quiz data extracted successfully');
      console.log(`Found ${Object.keys(quizzes).length} quiz(es)`);
      
      // Print summary
      Object.entries(quizzes).forEach(([id, quiz]) => {
        console.log(`\nQuiz ID: ${id}`);
        console.log(`Title: ${quiz.title}`);
        console.log(`Questions: ${quiz.questions?.length || 0}`);
        
        // Check for matching questions
        const matchingQuestions = quiz.questions?.filter(q => 
          q.type === 'matching' || 
          q.type === 'matching-headings' ||
          q.type === 'matching-information' ||
          q.type === 'matching-features' ||
          q.type === 'matching-sentence-endings'
        );
        
        if (matchingQuestions?.length > 0) {
          console.log(`Matching questions: ${matchingQuestions.length}`);
          matchingQuestions.forEach(q => {
            console.log(`  Q${q.number}: ${q.type}`);
            console.log(`    - has items: ${!!q.items}`);
            console.log(`    - has options: ${!!q.options} (${Array.isArray(q.options) ? q.options?.length : 'not array'})`);
            console.log(`    - has answer: ${!!q.answer}`);
            console.log(`    - has answers: ${!!q.answers}`);
          });
        }
      });
      
      process.exit(0);
    } else {
      console.log('No quiz data found');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error extracting quizzes:', error);
    process.exit(1);
  }
}

extractQuizzes();
