import fs from 'fs';

console.log('Reading file...');
let data = fs.readFileSync('tests/IC20T1R.json', 'utf8');

console.log('Fixing escape sequences...');
// Fix \n\A -> \n\nA (and other similar patterns)
data = data.replace(/\\n\\([A-Z])/g, '\\n\\n$1');

console.log('Writing fixed file...');
fs.writeFileSync('tests/IC20T1R.json', data, 'utf8');

console.log('Validating...');
try {
  const parsed = JSON.parse(data);
  console.log('✓ JSON is now valid!');
  console.log('Type:', Array.isArray(parsed) ? 'Array' : 'Object');
  if (Array.isArray(parsed)) {
    console.log('Array length:', parsed.length);
    parsed.forEach((quiz, i) => {
      console.log(`Quiz ${i + 1}: ${quiz.title}`);
    });
  }
} catch (e) {
  console.log('✗ Still invalid:', e.message);
}
