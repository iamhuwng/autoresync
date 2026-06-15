import { get, ref, update } from 'firebase/database';
import { database } from '../firebase';
import {
  createReadingV2ReferenceUpdateRepository,
  type ReadingV2ReferenceUpdateRepository,
} from './readingV2ReferenceUpdateRepository.service';

export const createFirebaseReadingV2ReferenceUpdateRepository = (): ReadingV2ReferenceUpdateRepository =>
  createReadingV2ReferenceUpdateRepository({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.exists() ? snapshot.val() : null;
    },
    update: async (payload) => {
      await update(ref(database), payload);
    },
  });
