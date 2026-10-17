import { getAnalytics } from "firebase/analytics";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import {
  app,
  auth,
  database,
  googleProvider,
  isAcceptanceEmulatorBuild,
  isLocalDevelopment,
  isTestEnvironment,
  parseEmulatorHost,
  shouldLogFirebaseBootstrap,
} from "./firebaseCore";

const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

const firestoreEmulatorHost = import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST;

if (isLocalDevelopment && !firestoreEmulatorHost) {
  throw new Error(
    '[Firebase] Local development requires VITE_FIREBASE_FIRESTORE_EMULATOR_HOST.'
  );
}

if (firestoreEmulatorHost && (import.meta.env.DEV || isTestEnvironment || isAcceptanceEmulatorBuild)) {
  const { host, port } = parseEmulatorHost(firestoreEmulatorHost, 8080, 'VITE_FIREBASE_FIRESTORE_EMULATOR_HOST');
  if (host && port) {
    connectFirestoreEmulator(firestore, host, port);

    if (shouldLogFirebaseBootstrap) {
      console.log(`[Firebase] Firestore emulator connected at ${host}:${port}`);
    }
  }
}

let analytics = null;

if (!isTestEnvironment && !isLocalDevelopment && !isAcceptanceEmulatorBuild && typeof window !== "undefined") {
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
