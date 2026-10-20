import worker from './worker.js';
export * from './worker.js';

// Pack connection settings to fit the free binding limit while keeping every role secret separate.
export default {
  fetch(request, env, ctx) {
    const b2 = env.BOOK_SOURCE_B2_CONFIGURATION;
    return worker.fetch(request, {
      ...env,
      BOOK_SOURCE_B2_ENDPOINT: b2?.endpoint,
      BOOK_SOURCE_B2_REGION: b2?.region,
      BOOK_SOURCE_B2_STORAGE_LOCATION_ID: b2?.storageLocationId,
      BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: b2?.privateBucketName,
      BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: b2?.objectKeyPrefix,
    }, ctx);
  },
};
