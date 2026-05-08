import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, onValue, ref } from 'firebase/database';

export const isTestEnvironment = import.meta.env.MODE === 'test';
export const shouldLogFirebaseBootstrap = import.meta.env.DEV && !isTestEnvironment;

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value || !String(value).trim())
  .map(([key]) => key);

if (missingFirebaseConfigKeys.length > 0) {
  throw new Error(
    '[Firebase] Missing web config: '
    + missingFirebaseConfigKeys.join(', ')
    + '. This build was created without the required VITE_FIREBASE_* environment variables.'
  );
}

if (shouldLogFirebaseBootstrap) {
  console.log('[Firebase] Initializing Firebase...');
  console.log('[Firebase] Config check:');
  console.log('   - apiKey:', firebaseConfig.apiKey ? 'present' : 'missing');
  console.log('   - authDomain:', firebaseConfig.authDomain ? 'present' : 'missing');
  console.log('   - databaseURL:', firebaseConfig.databaseURL ?? 'missing');
  console.log('   - projectId:', firebaseConfig.projectId ?? 'missing');
}

export const app = initializeApp(firebaseConfig);

if (shouldLogFirebaseBootstrap) {
  console.log('[Firebase] App initialized:', app.name);
}

export const database = getDatabase(app);

if (shouldLogFirebaseBootstrap) {
  console.log('[Firebase] Database instance created');

  const connectedRef = ref(database, '.info/connected');
  onValue(connectedRef, (snap) => {
    console.log(
      snap.val() === true
        ? '[Firebase] Connected to Realtime Database'
        : '[Firebase] Disconnected from Realtime Database'
    );
  });
}

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'consent',
});
