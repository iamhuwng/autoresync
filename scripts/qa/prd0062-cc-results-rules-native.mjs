import { readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, get, query, orderByChild, limitToLast, orderByKey, limitToFirst } from 'firebase/database';

// Shared emulator namespace; run only after the current native owner hands it over.
const env = await initializeTestEnvironment({ projectId: 'demo-prd0062-u-rules', database: { host: 'localhost', port: 9000, rules: readFileSync('output/prd0062-cc-results-rules/candidate.rules.json', 'utf8') } });
let passed = 0;
const claims = { book_result_read_service: true, book_result_read_contextKind: 'course', book_result_read_contextId: 'course-1', book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1', book_result_read_groupKey: 'g_test', book_result_read_resultId: 'result-1' };
const db = extra => env.authenticatedContext('result-service', { ...claims, ...extra }).database();
const root = 'book_result_read_models';
const course = `${root}/contexts/course/course-1/students/student-1/books/book-1`;
const detail = { schemaVersion: 1, resultId: 'result-1', surface: 'course', contextId: 'course-1', studentId: 'student-1', recipientId: 'student-1', bookId: 'book-1' };
const yes = async promise => { await assertSucceeds(promise); passed++; };
const no = async promise => { await assertFails(promise); passed++; };
try {
  await yes(set(ref(db(), `${course}/group_summaries/g_test`), { latestSubmittedAt: '2026-10-03', studentId: 'student-1' }));
  await yes(set(ref(db(), `${course}/group_attempts/g_test/result-1`), { resultId: 'result-1' }));
  await yes(set(ref(db(), `${root}/details/result-1`), detail));
  await yes(get(query(ref(db(), `${course}/group_summaries`), orderByChild('latestSubmittedAt'), limitToLast(25))));
  await yes(get(query(ref(db(), `${course}/group_attempts/g_test`), orderByKey(), limitToFirst(51))));
  await yes(get(ref(db(), `${root}/details/result-1`)));
  await yes(get(ref(db({ book_result_read_resultId: 'missing-result' }), `${root}/details/missing-result`)));
  await yes(get(ref(db(), `${course}/group_attempts/g_test/result-1`)));
  await no(get(ref(db(), course)));
  await no(get(ref(db(), `${course}/group_summaries`)));
  await no(get(query(ref(db(), `${course}/group_summaries`), orderByChild('latestSubmittedAt'), limitToLast(26))));
  await no(get(query(ref(db(), `${course}/group_attempts/g_test`), orderByKey(), limitToFirst(52))));
  for (const override of [{ book_result_read_contextKind: 'class' }, { book_result_read_contextId: 'course-other' }, { book_result_read_studentId: 'student-other' }, { book_result_read_bookId: 'book-other' }]) {
    await no(get(ref(db(override), `${root}/details/result-1`)));
    await no(set(ref(db(override), `${course}/group_summaries/g_test`), { latestSubmittedAt: 'evil' }));
  }
  await no(get(ref(env.authenticatedContext('old-service', { book_result_read_service: true, book_result_read_resultId: 'result-1' }).database(), `${root}/details/result-1`)));
  await no(set(ref(db(), `${root}/students/student-1/books/book-1/group_summaries/g_test`), { latestSubmittedAt: 'evil' }));
  await no(set(ref(db(), `${root}/details/result-1`), { ...detail, surface: 'solo' }));
  await no(set(ref(env.authenticatedContext('old-service', { book_result_read_service: true, book_result_read_resultId: 'result-1' }).database(), `${root}/details/result-1`), { ...detail, surface: 'solo' }));
  await no(set(ref(db(), `${root}/homework/homework-1/students/student-1/books/book-1/group_summaries/g_test`), { latestSubmittedAt: 'evil' }));
  await no(set(ref(db(), root), { details: { 'result-1': detail } }));
  await no(set(ref(db(), `${root}/details/result-1`), { ...detail, answerKey: 'private' }));
  await no(set(ref(db(), `${root}/details/result-1`), { ...detail, contextId: 'course-other' }));
  await no(set(ref(db(), `${root}/details/result-1`), { ...detail, recipientId: 'student-other' }));
  await no(get(ref(db({ book_result_read_groupKey: 'g_other' }), `${course}/group_attempts/g_test/result-1`)));
  await no(set(ref(db({ book_result_read_resultId: 'result-other' }), `${course}/group_attempts/g_test/result-1`), { resultId: 'result-1' }));
  await yes(set(ref(db({ book_result_read_contextKind: 'class', book_result_read_contextId: 'class-1', book_result_read_resultId: 'result-class' }), `${root}/details/result-class`), { ...detail, resultId: 'result-class', surface: 'class', contextId: 'class-1' }));
  await yes(set(ref(db({ book_result_read_contextKind: 'class', book_result_read_contextId: 'class-1' }), `${root}/contexts/class/class-1/students/student-1/books/book-1/group_summaries/g_test`), { latestSubmittedAt: '2026-10-03' }));
  await yes(set(ref(env.authenticatedContext('solo-service', { book_result_read_service: true, book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1', book_result_read_groupKey: 'g_test' }).database(), `${root}/students/student-1/books/book-1/group_summaries/g_test`), { latestSubmittedAt: '2026-10-03' }));
  const soloDetailDb = env.authenticatedContext('solo-service', { book_result_read_service: true, book_result_read_resultId: 'result-solo' }).database();
  await yes(set(ref(soloDetailDb, `${root}/details/result-solo`), { ...detail, resultId: 'result-solo', surface: 'solo', contextId: 'solo-1' }));
  await yes(get(ref(soloDetailDb, `${root}/details/result-solo`)));
  await no(get(ref(db({ book_result_read_resultId: 'result-solo' }), `${root}/details/result-solo`)));
  await no(set(ref(db({ book_result_read_resultId: 'result-solo' }), `${root}/details/result-solo`), { ...detail, resultId: 'result-solo' }));
  const homeworkDb = env.authenticatedContext('homework-service', { book_result_read_service: true, book_result_read_homeworkId: 'homework-1', book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1', book_result_read_groupKey: 'g_test' }).database();
  await yes(set(ref(homeworkDb, `${root}/homework/homework-1/students/student-1/books/book-1/group_summaries/g_test`), { latestSubmittedAt: '2026-10-03' }));
  await yes(get(query(ref(homeworkDb, `${root}/homework/homework-1/students/student-1/books/book-1/group_summaries`), orderByChild('latestSubmittedAt'), limitToLast(25))));
  await no(get(ref(env.unauthenticatedContext().database(), `${root}/details/result-1`)));
  await no(set(ref(db(), `${root}/details/result-1`), null));
  writeFileSync('output/prd0062-cc-results-rules/native-result.json', JSON.stringify({ passed, failed: 0, projectId: env.projectId }, null, 2));
  console.log(`${passed} native assertions passed`);
} finally { await env.cleanup(); }
