import fs from 'fs';

const data = fs.readFileSync('tests/IC20T1R.json', 'utf8');
try {
  const parsed = JSON.parse(data);
  console.log('✓ Valid JSON');
  console.log('Type:', Array.isArray(parsed) ? 'Array' : 'Object');
  
  if (Array.isArray(parsed)) {
    console.log('Array length:', parsed.length);
    parsed.forEach((quiz, i) => {
      console.log(`\nQuiz ${i + 1}:`);
      console.log('  Title:', quiz.title);
      console.log('  Has questions:', !!quiz.questions);
      console.log('  Question count:', quiz.questions ? quiz.questions.length : 0);
    });
  } else {
    console.log('Title:', parsed.title);
    console.log('Has questions:', !!parsed.questions);
  }
} catch (e) {
  console.log('✗ Invalid JSON:', e.message);
}
