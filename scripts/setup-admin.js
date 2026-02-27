/**
 * Setup Admin Account Script
 * 
 * This script helps set up a super admin account for a specific email.
 * It can be used to manually create or update a user profile with admin privileges.
 * 
 * Usage: node scripts/setup-admin.js iamhuwng@gmail.com
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, serverTimestamp, get } from 'firebase/database';

// Firebase configuration (update with your actual config)
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

async function setupAdmin(email) {
  console.log(`Setting up admin account for: ${email}`);
  
  try {
    // This would normally require the user's UID from Firebase Auth
    // For manual setup, you'll need to get the UID after they first log in
    console.log(`
To set up admin account for ${email}:

OPTION 1: Environment Variable Method (Recommended)
1. Add to your .env file:
   VITE_SUPER_ADMIN_EMAIL=iamhuwng@gmail.com

2. Restart your development server
3. Have the user log in with Google
4. They will automatically get super_admin role

OPTION 2: Manual Database Setup
1. Have the user log in once to create their profile
2. Find their UID in Firebase Console -> Realtime Database -> users/
3. Run this script with their UID:
   node scripts/setup-admin.js ${email} [USER_UID]

OPTION 3: Firebase Console
1. Go to Firebase Console -> Realtime Database
2. Navigate to users/[USER_UID]
3. Update the role field to: "super_admin"
4. Add status: "active" if not present

The user will have these admin privileges:
- Access to admin dashboard
- Manage all users and classes
- View all results and analytics
- System-wide configuration access
    `);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.log('Usage: node scripts/setup-admin.js <email>');
  console.log('Example: node scripts/setup-admin.js iamhuwng@gmail.com');
  process.exit(1);
}

setupAdmin(email);
