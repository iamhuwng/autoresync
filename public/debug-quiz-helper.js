// Browser console helper to debug matching questions
// Open browser console and paste this code, then run: debugMatchingQuestions()

window.debugMatchingQuestions = function() {
  // Get Firebase database from global scope
  const database = window.database || window.__FIREBASE_DATABASE__;
  
  if (!database) {
    console.error('❌ Firebase database not found. Make sure you\'re on a page with Firebase initialized.');
    return;
  }
  
  console.log('🔍 Debugging matching questions...\n');
  
  // Get current URL to extract quiz ID if on teacher quiz page
  const urlParts = window.location.pathname.split('/');
  const gameSessionId = urlParts[urlParts.indexOf('teacher-quiz') + 1];
  
  if (!gameSessionId) {
    console.error('❌ Not on teacher quiz page. Navigate to /teacher-quiz/{gameSessionId} first.');
    return;
  }
  
  console.log(`📋 Game Session ID: ${gameSessionId}`);
  
  // Get quiz data from Firebase
  const { ref, get } = window.firebaseDatabase;
  
  get(ref(database, `game_sessions/${gameSessionId}`))
    .then(sessionSnapshot => {
      if (!sessionSnapshot.exists()) {
        console.error('❌ Game session not found');
        return;
      }
      
      const session = sessionSnapshot.val();
      const quizId = session.quizId;
      
      console.log(`📚 Quiz ID: ${quizId}\n`);
      
      return get(ref(database, `quizzes/${quizId}`));
    })
    .then(quizSnapshot => {
      if (!quizSnapshot.exists()) {
        console.error('❌ Quiz not found');
        return;
      }
      
      const quiz = quizSnapshot.val();
      console.log(`📖 Quiz Title: ${quiz.title}`);
      console.log(`📊 Total Questions: ${quiz.questions?.length || 0}\n`);
      console.log('='.repeat(80));
      
      // Check questions 14-23 and 31-35
      const questionsToCheck = [
        ...Array.from({length: 10}, (_, i) => i + 13), // 13-22 (Q14-23)
        ...Array.from({length: 5}, (_, i) => i + 30)   // 30-34 (Q31-35)
      ];
      
      let errorCount = 0;
      
      questionsToCheck.forEach(index => {
        const q = quiz.questions[index];
        
        if (!q || q.type !== 'matching') return;
        
        console.log(`\n📝 Question ${q.number || index + 1}: ${q.type}`);
        console.log('-'.repeat(80));
        console.log(`Text: ${q.question?.substring(0, 60)}...`);
        
        const hasItems = !!q.items;
        const hasOptions = !!q.options;
        const optionsIsArray = Array.isArray(q.options);
        const hasAnswer = !!q.answer;
        const hasAnswers = !!q.answers;
        
        console.log('\n📋 Structure Check:');
        console.log(`  items: ${hasItems ? '✓' : '✗'}`);
        console.log(`  options: ${hasOptions ? (optionsIsArray ? `✓ (array[${q.options.length}])` : '⚠️ (not array)') : '✗'}`);
        console.log(`  answer: ${hasAnswer ? `✓ (${typeof q.answer}: "${q.answer}")` : '✗'}`);
        console.log(`  answers: ${hasAnswers ? '✓' : '✗'}`);
        
        // Check format detection
        const isIndividual = !hasItems && optionsIsArray && q.options.length > 0 && hasAnswer;
        const isGrouped = hasItems && optionsIsArray && hasAnswers;
        
        console.log('\n✅ Format Detection:');
        console.log(`  Individual (IELTS): ${isIndividual ? '✅' : '❌'}`);
        console.log(`  Grouped: ${isGrouped ? '✅' : '❌'}`);
        
        if (!isIndividual && !isGrouped) {
          errorCount++;
          console.log('\n❌ ERROR: Will show "Invalid matching question: missing required fields"');
          
          // Detailed diagnosis
          console.log('\n🔧 Diagnosis:');
          if (!optionsIsArray) {
            console.log('  ⚠️  options is not an array');
            console.log('  💡 Fix: Ensure options is an array of strings');
          } else if (q.options.length === 0) {
            console.log('  ⚠️  options array is empty');
            console.log('  💡 Fix: Add option values to the array');
          }
          
          if (!hasAnswer) {
            console.log('  ⚠️  answer field is missing');
            console.log('  💡 Fix: Add answer field with correct option value');
          }
          
          console.log('\n📦 Raw Data:');
          console.log(JSON.stringify({
            type: q.type,
            options: q.options,
            answer: q.answer,
            items: q.items,
            answers: q.answers
          }, null, 2));
        } else {
          console.log('\n✅ OK: Question will render correctly');
        }
        
        console.log('='.repeat(80));
      });
      
      console.log(`\n\n📊 Summary: ${errorCount} matching question(s) with errors found`);
      
      if (errorCount > 0) {
        console.log('\n💡 Next Steps:');
        console.log('1. Check the raw data shown above');
        console.log('2. For individual format (IELTS), ensure:');
        console.log('   - options is an array of strings: ["A", "B", "C", "D"]');
        console.log('   - answer is a string: "B"');
        console.log('   - no items or answers fields');
        console.log('3. Re-upload the quiz or edit in Firebase');
      }
      
    })
    .catch(error => {
      console.error('❌ Error:', error);
    });
};

console.log('✅ Debug helper loaded!');
console.log('📝 Run: debugMatchingQuestions()');
