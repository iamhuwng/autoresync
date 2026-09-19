import { createHomeworkSubmissionNotificationWorker } from './src/upload-worker/notifications/homework-submission-worker.ts';

const worker = createHomeworkSubmissionNotificationWorker();

export default {
  fetch(request, env) {
    return worker.fetch(request, env);
  },
};
