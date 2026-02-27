import { Database } from 'firebase/database';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';

declare const database: Database;
declare const auth: Auth;
declare const firestore: Firestore;

export { database, auth, firestore };
