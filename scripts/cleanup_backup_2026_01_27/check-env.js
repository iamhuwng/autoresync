// Environment Variable Checker
// Run with: node check-env.js

import { config } from 'dotenv';
import { readFileSync } from 'fs';

// Load .env file
config();

console.log('\n=== Environment Variables Check ===\n');

const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_DRIVE_CLIENT_ID',
  'VITE_GOOGLE_API_KEY'
];

const optionalVars = [
  'VITE_ADMIN_USERNAME',
  'VITE_ADMIN_PASSWORD'
];

let allGood = true;

console.log('✓ Required Variables (for Google Drive feature):');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value || value.startsWith('your_')) {
    console.log(`  ❌ ${varName}: NOT SET or using placeholder`);
    allGood = false;
  } else {
    // Mask sensitive values
    const maskedValue = value.length > 20 
      ? value.substring(0, 10) + '...' + value.substring(value.length - 5)
      : value.substring(0, 5) + '...';
    console.log(`  ✓ ${varName}: ${maskedValue}`);
  }
});

console.log('\n✓ Optional Variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    console.log(`  ⚠ ${varName}: NOT SET (optional)`);
  } else {
    console.log(`  ✓ ${varName}: ***`);
  }
});

console.log('\n=== Summary ===');
if (allGood) {
  console.log('✅ All required environment variables are configured!');
  console.log('✅ Ready to build and deploy.');
} else {
  console.log('❌ Some required variables are missing or using placeholders.');
  console.log('📝 Please update your .env file with actual values.');
  console.log('📖 See env.example.txt and documentation/GOOGLE_DRIVE_SETUP.md for setup instructions.');
}

console.log('\n');
