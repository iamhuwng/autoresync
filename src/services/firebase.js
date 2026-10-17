import { getAnalytics } from "firebase/analytics";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import {
  app,
  acceptanceEmulatorPorts,
  auth,
  database,
  googleProvider,
  isTestEnvironment,
  shouldLogFirebaseBootstrap,
} from "./firebaseCore";

const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

if (acceptanceEmulatorPorts) {
  connectFirestoreEmulator(firestore, 'localhost', acceptanceEmulatorPorts.FIRESTORE);
}

let analytics = null;

if (!isTestEnvironment && !acceptanceEmulatorPorts && typeof window !== "undefined") {
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
