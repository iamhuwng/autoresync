import fs from 'fs';

const data = fs.readFileSync('tests/IC20T1R.json', 'utf8');

// Find the error position
const errorPos = 23600;
const start = Math.max(0, errorPos - 100);
const end = Math.min(data.length, errorPos + 100);

console.log('Characters around position', errorPos);
console.log('---');
console.log(data.substring(start, end));
console.log('---');
console.log('\nCharacter at error position:', data[errorPos]);
console.log('Character code:', data.charCodeAt(errorPos));
console.log('\nContext (10 chars before and after):');
for (let i = errorPos - 10; i <= errorPos + 10; i++) {
  const char = data[i];
  const code = data.charCodeAt(i);
  const marker = i === errorPos ? ' <-- ERROR' : '';
  console.log(`${i}: "${char}" (${code})${marker}`);
}
