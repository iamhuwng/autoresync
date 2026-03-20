import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase, onValue, ref } from "firebase/database";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const isTestEnvironment = import.meta.env.MODE === "test";
const shouldLogFirebaseBootstrap = import.meta.env.DEV && !isTestEnvironment;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (shouldLogFirebaseBootstrap) {
  console.log("[Firebase] Initializing Firebase...");
  console.log("[Firebase] Config check:");
  console.log("   - apiKey:", firebaseConfig.apiKey ? "present" : "missing");
  console.log("   - authDomain:", firebaseConfig.authDomain ? "present" : "missing");
  console.log("   - databaseURL:", firebaseConfig.databaseURL ?? "missing");
  console.log("   - projectId:", firebaseConfig.projectId ?? "missing");
}

const app = initializeApp(firebaseConfig);

if (shouldLogFirebaseBootstrap) {
  console.log("[Firebase] App initialized:", app.name);
}

// Firebase Realtime Database automatically enables offline persistence for web apps.
const database = getDatabase(app);

if (shouldLogFirebaseBootstrap) {
  console.log("[Firebase] Database instance created");

  const connectedRef = ref(database, ".info/connected");
  onValue(connectedRef, (snap) => {
    console.log(
      snap.val() === true
        ? "[Firebase] Connected to Realtime Database"
        : "[Firebase] Disconnected from Realtime Database"
    );
  });
}

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "consent",
});

const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

let analytics = null;

if (!isTestEnvironment && typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);

    if (shouldLogFirebaseBootstrap) {
      console.log("[Firebase] Analytics initialized");
    }
  } catch (error) {
    if (shouldLogFirebaseBootstrap) {
      console.warn(
        "[Firebase] Analytics initialization failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

export { analytics, auth, database, firestore, googleProvider };
