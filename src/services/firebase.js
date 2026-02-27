import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ========== DIAGNOSTIC LOGGING ==========
console.log('🔥 [Firebase] Initializing Firebase...');
console.log('🔥 [Firebase] Config check:');
console.log('   - apiKey:', firebaseConfig.apiKey ? '✅ Present' : '❌ MISSING');
console.log('   - authDomain:', firebaseConfig.authDomain ? '✅ Present' : '❌ MISSING');
console.log('   - databaseURL:', firebaseConfig.databaseURL ? `✅ ${firebaseConfig.databaseURL}` : '❌ MISSING');
console.log('   - projectId:', firebaseConfig.projectId ? `✅ ${firebaseConfig.projectId}` : '❌ MISSING');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
console.log('🔥 [Firebase] App initialized:', app.name);

// Firebase Realtime Database automatically enables offline persistence for web apps
// Data is cached locally and synced when connection is restored
// See: https://firebase.google.com/docs/database/web/offline-capabilities
const database = getDatabase(app);
console.log('🔥 [Firebase] Database instance created');

// Monitor connection state
const connectedRef = ref(database, '.info/connected');
onValue(connectedRef, (snap) => {
  if (snap.val() === true) {
    console.log('🔥 [Firebase] ✅ CONNECTED to Firebase Realtime Database');
  } else {
    console.log('🔥 [Firebase] ⚠️ DISCONNECTED from Firebase Realtime Database');
  }
});

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Force account selection and consent on every login
// This prevents auto-login with cached Google account
// 'consent' forces re-authentication even if previously authorized
googleProvider.setCustomParameters({
  prompt: 'consent'
});

// NOTE: Firebase Storage is NOT used for image uploads
// Images are uploaded to Google Drive using OAuth (see services/googleDrive.js)
// This avoids Firebase Storage quota limits and costs

// Initialize Firestore for permanent draft storage with new cache API
// Uses persistent local cache with multi-tab support (cross-device sync when online)
const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export { database, auth, firestore, googleProvider };