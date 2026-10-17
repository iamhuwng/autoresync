import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const FIXTURE = 'http://localhost:8792';
const CLASS_PROOF_PATH = 'output/prd0062-homework-class-provisioning.json';

test('published Book is assigned through production authority and submitted in the student Runtime', async ({ page, request }, testInfo) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  const classProof = JSON.parse(await readFile(CLASS_PROOF_PATH, 'utf8')) as {
    evidenceClass: string;
    fixtureOrigin: string;
    classId: string;
    ownerId: string;
    studentId: string;
    producers: string[];
    canonical: Record<string, unknown>;
    membershipFacts: { active: string[]; pending: string[]; removed: string[]; intermediatePending: string };
    sha256: string;
    classPath: string;
    rosterPath: string;
  };
  expect(classProof).toMatchObject({
    fixtureOrigin: FIXTURE,
    ownerId: 'teacher-1',
    studentId: 'student-1',
    classPath: `classes/${classProof.classId}`,
    rosterPath: `classes/${classProof.classId}/students/student-1`,
  });
  expect(classProof.producers).toEqual(expect.arrayContaining([
    'classManager.createClass', 'classManager.enrollStudent', 'classManager.approveClassStudent',
  ]));
  expect(classProof.membershipFacts).toEqual({
    active: ['student-1'], pending: [], removed: [], intermediatePending: 'pending_approval',
  });
  expect(createHash('sha256').update(JSON.stringify(classProof.canonical)).digest('hex')).toBe(classProof.sha256);

  const publicationResponse = await request.post(`${FIXTURE}/__homework-production/bootstrap-publication`);
  const publicationBody = await publicationResponse.text();
  await testInfo.attach('bootstrap-publication-response.json', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ status: publicationResponse.status(), body: publicationBody }, null, 2)),
  });
  expect(publicationResponse.status()).toBe(200);
  const publication = JSON.parse(publicationBody) as {
    bookId: string;
    unitKey: string;
    publicationId: string;
    manifestVersionId: string;
    status: string;
    diagnostics: {
      publicationCreatedByWorker: boolean;
      homeworkAuthorityEmpty: boolean;
      runtimeTerminalEmpty: boolean;
      evaluationEmpty: boolean;
    };
  };
  expect(publication.status).toBe('published');
  expect(publication.diagnostics.publicationCreatedByWorker).toBe(true);
  expect(publication.diagnostics).toMatchObject({
    homeworkAuthorityEmpty: true,
    runtimeTerminalEmpty: true,
    evaluationEmpty: true,
  });

  const classPath = classProof.classPath;
  const classResponse = await request.post(`${FIXTURE}/__homework-production/storage`, {
    data: { method: 'read', path: classPath },
  });
  expect(classResponse.ok()).toBe(true);
  const classSnapshot = await classResponse.json() as {
    id?: string;
    classCode?: string;
    createdBy?: string;
    status?: string;
    students?: Record<string, { id?: string; uid?: string; status?: string }>;
  };
  expect(classSnapshot).toMatchObject({ createdBy: 'teacher-1', status: 'active' });
  expect(classSnapshot.students?.['student-1']).toMatchObject({ id: 'student-1', uid: 'student-1', status: 'active' });
  expect(classSnapshot).toEqual(classProof.canonical);
  expect(createHash('sha256').update(JSON.stringify(classSnapshot)).digest('hex')).toBe(classProof.sha256);
  const roster = Object.entries(classSnapshot.students ?? {}).map(([id, member]) => ({
    id,
    uid: member.uid ?? null,
    status: member.status ?? 'active',
  }));
  await testInfo.attach('external-class-prerequisite.json', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({
      origin: 'localhost:8792 in-memory RTDB transport',
      classPath,
      studentPath: `${classPath}/students/student-1`,
      classId: classSnapshot.id ?? classSnapshot.classCode ?? classProof.classId,
      ownerId: classSnapshot.createdBy,
      classStatus: classSnapshot.status,
      roster,
      sha256: createHash('sha256').update(JSON.stringify(classSnapshot)).digest('hex'),
      provisioningMethod: classProof.producers,
      evidenceClass: classProof.evidenceClass,
      sourceSha256: classProof.sha256,
    }, null, 2)),
  });

  const authResponse = await request.get(`${FIXTURE}/__homework-production/auth-response?uid=teacher-1`);
  expect(authResponse.ok()).toBe(true);
  const { idToken } = await authResponse.json() as { idToken: string };

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  const assignment = await page.evaluate(async ({ bookId, unitKey, classId, idToken }) => {
    const { createBookHomeworkPreviewSource, createBookHomeworkAssignmentViaWorker } =
      await import('../src/services/homeworkAssignmentClient');
    const { createBookHomeworkManifest } = await import('../src/services/book-homework/bookHomeworkManifest.service');
    const { buildBookHomeworkPreview, createDefaultBookHomeworkPolicy } =
      await import('../src/services/book-homework/bookHomeworkPreview.service');
    const { createBookHomeworkAssignmentIntent } =
      await import('../src/services/book-homework/bookHomeworkAssignmentIntent');

    const assignmentResponses: Array<{ status: number; request: unknown; response: unknown }> = [];
    const options = {
      workerOrigin: 'http://localhost:8792',
      getIdToken: async () => idToken,
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(input, init);
        if (String(input).includes('/book-homework/assignments/')) {
          assignmentResponses.push({
            status: response.status,
            request: init?.body ? JSON.parse(String(init.body)) : null,
            response: await response.clone().json().catch(() => null),
          });
        }
        return response;
      },
    };
    const source = await createBookHomeworkPreviewSource({
      bookId,
      target: { kind: 'unit', bookId, nodeKey: unitKey },
      classId,
      selectedRecipientIds: ['student-1'],
      title: 'PRD0062 production Homework proof',
    }, options);
    const manifest = createBookHomeworkManifest({
      resolution: { delivery: source.delivery },
      target: source.initialTarget!,
      manifestVersionId: source.identity.manifestVersionId,
      ownerId: source.identity.ownerId,
      createdByCommandId: source.identity.createdByCommandId,
      createdAt: source.identity.createdAt,
      bindingRevision: source.identity.bindingRevision,
      studentDocument: source.studentDocument,
      targetPreview: source.targetPreview,
    });
    const defaultPolicy = createDefaultBookHomeworkPolicy(manifest, 'accountable');
    const preview = buildBookHomeworkPreview({
      source,
      manifest,
      policy: {
        ...defaultPolicy,
        activityPolicies: defaultPolicy.activityPolicies.map((policy) => ({
          ...policy,
          feedbackRelease: 'manual',
          maxAttempts: 1,
        })),
      },
    });
    const now = Date.now();
    const isoLocal = (time: number) => {
      const date = new Date(time);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        + `T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };
    const command = createBookHomeworkAssignmentIntent({
      source,
      selectedRecipientIds: ['student-1'],
      draft: {
        manifest: preview.manifest,
        policy: preview.policy,
        schedule: {
          availableFrom: isoLocal(now - 60_000),
          dueDate: isoLocal(now + 24 * 60 * 60_000),
          scheduleRules: [],
        },
        deadlineMutationIntents: [],
        warnings: preview.warnings,
      },
    });
    let first;
    let firstError: { name: string; message: string; code?: string; status?: number } | undefined;
    try {
      first = await createBookHomeworkAssignmentViaWorker(command, options);
    } catch (error) {
      const failure = error as Error & { code?: string; status?: number };
      firstError = { name: failure.name, message: failure.message, code: failure.code, status: failure.status };
    }
    if (firstError) {
      return {
        assignmentId: command.assignmentId,
        first,
        firstError,
        assignmentResponses,
        selectedRecipients: command.selectedRecipientIds,
        publication: command.intent.expectedPublication,
      };
    }
    const replay = await createBookHomeworkAssignmentViaWorker(command, options);
    return {
      assignmentId: command.assignmentId,
      first,
      assignmentResponses,
      replay,
      selectedRecipients: command.selectedRecipientIds,
      publication: command.intent.expectedPublication,
      policy: {
        intent: preview.policy.intent,
        integrityCapture: preview.policy.integrityCapture,
        integrityOverride: preview.policy.integrityOverride,
      },
    };
  }, { bookId: publication.bookId, unitKey: publication.unitKey, classId: classProof.classId, idToken });

  if (assignment.firstError) {
    const rootResponse = await request.post(`${FIXTURE}/__homework-production/storage`, {
      data: { method: 'read', path: `book_homework/operations/${assignment.assignmentId}` },
    });
    const rootValue = rootResponse.ok()
      ? await rootResponse.json() as Record<string, unknown>
      : null;
    const recipients = rootValue?.recipients && typeof rootValue.recipients === 'object'
      ? Object.fromEntries(Object.entries(rootValue.recipients as Record<string, { state?: string }>).map(([id, recipient]) => [id, recipient.state]))
      : undefined;
    const evidence = {
      capturedAt: new Date().toISOString(),
      assignmentId: assignment.assignmentId,
      error: assignment.firstError,
      responses: assignment.assignmentResponses.map(({ status, response }) => ({ status, response })),
      rootReadStatus: rootResponse.status(),
      root: rootValue ? {
        state: rootValue.state,
        visibility: rootValue.visibility,
        revision: rootValue.revision,
        recipientCount: rootValue.recipientCount,
        committedRecipientCount: rootValue.committedRecipientCount,
        recipients,
        lastError: rootValue.lastError,
        fingerprintLength: typeof rootValue.fingerprint === 'string' ? rootValue.fingerprint.length : null,
        requestFingerprintLength: typeof rootValue.requestFingerprint === 'string' ? rootValue.requestFingerprint.length : null,
      } : null,
    };
    const serializedEvidence = JSON.stringify(evidence, null, 2);
    await mkdir('output', { recursive: true });
    await writeFile('output/prd0062-homework-assignment-failure.json', serializedEvidence, 'utf8');
    await testInfo.attach('failed-homework-assignment-evidence.json', {
      contentType: 'application/json',
      body: Buffer.from(serializedEvidence),
    });
    throw new Error(`Homework assignment failed (${assignment.firstError.code ?? assignment.firstError.name}, HTTP ${assignment.firstError.status ?? 'unknown'}). Evidence: output/prd0062-homework-assignment-failure.json\n${serializedEvidence}`);
  }

  expect(assignment.first).toMatchObject({
    assignmentId: assignment.assignmentId,
    state: 'committed',
    visibility: 'committed',
    recipientCount: 1,
    committedRecipientCount: 1,
  });
  expect(assignment.replay).toMatchObject({
    assignmentId: assignment.assignmentId,
    operationId: assignment.first.operationId,
    state: 'committed',
    visibility: 'committed',
    recipientCount: 1,
    committedRecipientCount: 1,
  });
  expect(assignment.selectedRecipients).toEqual(['student-1']);
  expect(assignment.publication).toMatchObject({
    publicationId: publication.publicationId,
    manifestVersionId: publication.manifestVersionId,
  });
  expect(assignment.policy).toEqual({
    intent: 'accountable',
    integrityCapture: true,
    integrityOverride: false,
  });

  const runtimeCommands: string[] = [];
  const integritySignalBodies: string[] = [];
  page.on('request', (outgoing) => {
    if (outgoing.url().includes('/book-runtime/commands')) runtimeCommands.push(outgoing.url());
    if (outgoing.url().includes('/book-integrity/') && outgoing.method() === 'POST') {
      integritySignalBodies.push(outgoing.postData() ?? '');
    }
  });
  await page.goto(
    `http://localhost:5174/__smoke/book-runtime?fixture=homework-production&actor=student-1&view=runtime&homeworkId=${encodeURIComponent(assignment.assignmentId)}`,
    { waitUntil: 'domcontentloaded', timeout: 60_000 },
  );
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.book-pdf-viewer__canvas-host[data-render-state="ready"] canvas')).toBeVisible({ timeout: 60_000 });
  const timerDisclosure = page.getByLabel('Personal countdown timer');
  await timerDisclosure.click();
  await expect(page.getByRole('button', { name: 'Finish timer' })).toBeVisible();
  await timerDisclosure.click();
  await expect(page.getByRole('button', { name: 'Finish timer' })).not.toBeVisible();
  await expect(page.getByRole('radio').first()).toBeEnabled({ timeout: 30_000 });
  await mkdir('output/prd0062-h-runtime-browser', { recursive: true });
  for (const [width, height] of [[1440, 900], [980, 820], [760, 820], [375, 812], [320, 568], [375, 400]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
    await expect(page.locator('.book-pdf-viewer__canvas-host')).toHaveAttribute('data-render-state', 'ready');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width <= 760) {
      await page.getByRole('tab', { name: 'Book Page', exact: true }).click();
      await page.getByRole('navigation', { name: 'Activity and question navigator' })
        .getByRole('button', { name: /Source-assisted choice, question/u }).click();
      await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('radio').first()).toBeFocused();
    }
    await testInfo.attach(`runtime-${width}x${height}.png`, {
      body: await page.screenshot({ path: `output/prd0062-h-runtime-browser/runtime-${width}x${height}.png` }),
      contentType: 'image/png',
    });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach('runtime-enlarged-text.png', {
    body: await page.screenshot({ path: 'output/prd0062-h-runtime-browser/runtime-enlarged-text.png' }),
    contentType: 'image/png',
  });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 1440, height: 900 });
  const splitter = page.getByRole('separator', { name: 'Resize Book and Activity panels' });
  await splitter.focus();
  const previousRatio = Number(await splitter.getAttribute('aria-valuenow'));
  await splitter.press('ArrowRight');
  await expect(splitter).toHaveAttribute('aria-valuenow', String(previousRatio + 2));
  await page.getByRole('button', { name: 'Only book', exact: true }).click();
  await page.getByRole('navigation', { name: 'Activity and question navigator' })
    .getByRole('button', { name: /Source-assisted choice, question/u }).click();
  await expect(page.getByTestId('book-runtime-shell')).toHaveAttribute('data-desktop-view', 'split');
  await expect(page.getByRole('radio').first()).toBeFocused();
  await expect(page.getByRole('radio')).toHaveCount(2);
  const objectiveCard = page.locator('article[data-book-activity]').filter({
    has: page.getByRole('heading', { name: 'Source-assisted choice', exact: true }),
  });
  const subjectiveCard = page.locator('article[data-book-activity]').filter({
    has: page.getByRole('heading', { name: 'Source-assisted long response', exact: true }),
  });
  await expect(objectiveCard).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('paste', { bubbles: true })));
  await expect.poll(() => integritySignalBodies.some((body) => {
    try { return (JSON.parse(body) as { signal?: string }).signal === 'paste'; }
    catch { return false; }
  }), { timeout: 30_000 }).toBe(true);
  await expect(page.getByRole('status').filter({
    hasText: 'An integrity signal was recorded. You can continue this Activity and submit normally.',
  })).toBeVisible({ timeout: 30_000 });
  await objectiveCard.getByRole('radio').first().check();
  const submit = objectiveCard.getByTestId('book-runtime-submit');
  await expect(submit).toBeEnabled();
  await submit.click();
  const objectiveConfirmation = objectiveCard.getByRole('dialog');
  await expect(objectiveConfirmation).toBeVisible();
  await objectiveConfirmation.getByRole('button', { name: 'Confirm submission' }).click();
  await expect.poll(() => runtimeCommands.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(submit).toHaveText('Activity submitted', { timeout: 30_000 });

  await page.locator('.book-runtime-shell__outline > summary').click();
  await page.getByRole('navigation', { name: 'Book page groups' })
    .getByRole('button', { name: /^Page Group 2 ·/u }).click();
  await page.getByRole('navigation', { name: 'Activity and question navigator' })
    .getByRole('button', { name: /Source-assisted long response, question/u }).click();
  await expect(subjectiveCard).toBeVisible();
  await expect(subjectiveCard.getByRole('textbox')).toBeVisible();
  await subjectiveCard.getByRole('textbox').fill('The source supports this interpretation.');
  const subjectiveSubmit = subjectiveCard.getByTestId('book-runtime-submit');
  await expect(subjectiveSubmit).toBeEnabled();
  await subjectiveSubmit.click();
  const subjectiveConfirmation = subjectiveCard.getByRole('dialog');
  await expect(subjectiveConfirmation).toBeVisible();
  await subjectiveConfirmation.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(subjectiveSubmit).toHaveText('Submitted for review', { timeout: 30_000 });

  const commandsBeforeReadOnlyReload = runtimeCommands.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.book-pdf-viewer__canvas-host[data-render-state="ready"] canvas')).toBeVisible({ timeout: 60_000 });
  await expect(objectiveCard.getByRole('radio').first()).toBeChecked();
  await expect(objectiveCard.getByRole('radio').first()).toBeDisabled();
  await expect(submit).toHaveText('Activity submitted');
  await expect(submit).toBeDisabled();
  await expect(objectiveCard).toContainText('1 of 1 answered');
  await expect(page.locator('.book-runtime-shell__footer-summary')).toContainText('1 / 1 answered');
  await objectiveCard.getByRole('radio').last().click({ force: true });
  await expect(objectiveCard.getByRole('radio').first()).toBeChecked();
  await page.locator('.book-runtime-shell__outline > summary').click();
  await page.getByRole('navigation', { name: 'Book page groups' })
    .getByRole('button', { name: /^Page Group 2 ·/u }).click();
  await page.getByRole('navigation', { name: 'Activity and question navigator' })
    .getByRole('button', { name: /Source-assisted long response, question/u }).click();
  const savedResponse = subjectiveCard.getByRole('textbox');
  await expect(savedResponse).toHaveValue('The source supports this interpretation.');
  await expect(savedResponse).toHaveAttribute('readonly', '');
  await expect(subjectiveSubmit).toHaveText('Submitted for review');
  await expect(subjectiveSubmit).toBeDisabled();
  await expect(subjectiveCard).toContainText('1 of 1 answered');
  await expect(page.locator('.book-runtime-shell__footer-summary')).toContainText('1 / 1 answered');
  await savedResponse.click();
  await savedResponse.press('End');
  await savedResponse.press('X');
  await expect(savedResponse).toHaveValue('The source supports this interpretation.');
  await page.waitForTimeout(1_500);
  expect(runtimeCommands.length).toBe(commandsBeforeReadOnlyReload);
  await writeFile('output/prd0062-homework-readonly-reload-proof.json', JSON.stringify({
    capturedAt: new Date().toISOString(), assignmentId: assignment.assignmentId,
    maxAttempts: 1, objectiveAnswerHydrated: true, subjectiveAnswerHydrated: true,
    submittedTerminalsHydrated: true, commandsBeforeReadOnlyReload,
    objectiveAnsweredCount: 1, subjectiveAnsweredCount: 1, footerAnsweredCount: 1,
    commandsAfterReadOnlyInteraction: runtimeCommands.length,
    readOnlySaveSubmitRequests: runtimeCommands.length - commandsBeforeReadOnlyReload,
  }, null, 2));
  await page.screenshot({ path: 'output/prd0062-homework-readonly-reload.png' });

  const resultTargets = await page.evaluate(async (homeworkId) => {
    const { auth } = await import('../src/services/firebase.js');
    const getIdToken = (refresh = false) => auth.currentUser?.getIdToken(refresh) ?? Promise.resolve(null);
    const token = await getIdToken();
    if (!token || !auth.currentUser) throw new Error('homework_student_auth_unavailable');
    const { createBookHomeworkPlacementBrowserClient } =
      await import('../src/services/book-delivery/bookPlacementLaunch.browser');
    const { createBookActivityLaunchBrowserClient } =
      await import('../src/services/book-activity/activityLaunch.browser');
    const { createBookRuntimeClient } = await import('../src/services/book-activity/activityRuntime.browser');
    const { createBookResultBrowserClient, createBookResultRouteHandle } =
      await import('../src/services/bookResult.browser');
    const { bookResultGroupKey } = await import('../src/services/book-activity/results/bookResult.types');
    const origin = 'http://localhost:8792';
    const current = createBookHomeworkPlacementBrowserClient({ baseUrl: origin, getCurrentUserId: () => auth.currentUser?.uid,
      getIdToken });
    const projection = await current.current(homeworkId);
    const activityLaunch = createBookActivityLaunchBrowserClient({ baseUrl: origin, getIdToken });
    const activities = await activityLaunch.readHomeworkActivities({
      assignmentId: homeworkId,
      placements: projection.activities.map((activity) => ({
        placementId: activity.placementId,
        activityId: activity.activityId,
        activityVersionId: activity.activityVersionId,
      })),
    });
    const runtime = createBookRuntimeClient({ baseUrl: origin, getIdToken });
    const results = createBookResultBrowserClient({ baseUrl: origin, getIdToken });
    const targets = await Promise.all(activities.map(async (activity) => {
      const placement = projection.activities.find((item) => item.activityId === activity.activityId);
      if (!placement) throw new Error('homework_runtime_placement_unavailable');
      const interactionId = activity.projection.interactions[0]?.interactionId;
      if (!interactionId) throw new Error('homework_runtime_interaction_unavailable');
      const terminal = await runtime.readTerminal({
        bindingId: projection.bindingId,
        bindingRevision: projection.bindingRevision,
        contextId: projection.context.contextId,
        placementId: placement.placementId,
        activityId: activity.activityId,
        activityVersion: placement.activityVersion,
        interactionId,
      });
      if (terminal.status !== 'present') throw new Error('homework_runtime_terminal_unavailable');
      const resultAddress = {
        bookId: projection.book.bookId,
        studentId: auth.currentUser.uid,
        groupKey: bookResultGroupKey(auth.currentUser.uid, activity.activityId),
        homeworkId: projection.context.contextId,
      };
      const group = await results.readGroup(resultAddress);
      const attempt = group.attempts.find((row) => row.attemptId === terminal.attemptId);
      if (!attempt) throw new Error('homework_runtime_attempt_not_in_results');
      const detail = await results.readDetail(resultAddress, attempt.resultId);
      return {
        routeHandle: createBookResultRouteHandle(resultAddress),
        resultId: detail.resultId,
        locator: {
          bookId: projection.book.bookId,
          studentId: detail.studentId,
          contextKind: 'homework',
          contextId: detail.contextId,
          placementId: detail.placementId,
          activityId: detail.activityId,
          activityVersionId: detail.activityVersionId,
          attemptId: detail.attemptId,
        },
        feedbackPolicy: detail.feedbackPolicy,
        terminalLate: detail.terminalLate,
        integrityTerminalId: `${terminal.attemptId}:completion`,
        integrityEnabled: placement.integrityCapture?.enabled,
        integrityEffective: placement.integrityCapture?.frozenPolicy.enabled,
        title: activity.projection.title,
      };
    }));
    return {
      objective: targets.find((target) => target.title.includes('choice')),
      subjective: targets.find((target) => target.title.includes('long response')),
    };
  }, assignment.assignmentId);
  const objectiveTarget = resultTargets.objective!;
  const resultTarget = resultTargets.subjective!;
  expect(objectiveTarget.feedbackPolicy).toBe('manual');
  expect(objectiveTarget.terminalLate).toMatchObject({ late: false });
  expect(objectiveTarget).toMatchObject({ integrityEnabled: true, integrityEffective: true });
  expect(resultTarget.feedbackPolicy).toBe('manual');
  expect(resultTarget.terminalLate).toMatchObject({ late: false });

  await page.goto(
    `http://localhost:5173/__smoke/book-runtime?fixture=homework-production&actor=teacher-1&view=result&routeHandle=${encodeURIComponent(objectiveTarget.routeHandle)}`,
    { waitUntil: 'domcontentloaded' },
  );
  const objectiveRelease = page.getByRole('button', { name: 'Release feedback for this attempt' });
  await expect(objectiveRelease).toBeVisible({ timeout: 60_000 });
  const integrityReport = await page.evaluate(async ({ bookId, terminalId }) => {
    const { auth } = await import('../src/services/firebase.js');
    if (!auth.currentUser) throw new Error('homework_teacher_auth_unavailable');
    const { createBookIntegrityReportBrowserClient } =
      await import('../src/services/book-activity/bookIntegrityReport.browser');
    return createBookIntegrityReportBrowserClient({ baseUrl: 'http://localhost:8792' }).readTeacherReport({
      bookId,
      terminalId,
    });
  }, { bookId: publication.bookId, terminalId: objectiveTarget.integrityTerminalId });
  expect(integrityReport).toMatchObject({
    status: 'sealed',
    visibility: 'teacher-only',
    terminal: { contextKind: 'homework', recipientId: 'student-1' },
  });
  expect(integrityReport.counts.paste).toBeGreaterThan(0);

  await objectiveRelease.click();
  await expect(page.getByRole('status').filter({ hasText: 'Feedback released for this attempt.' })).toBeVisible({ timeout: 30_000 });
  await page.goto(
    `http://localhost:5174/__smoke/book-runtime?fixture=homework-production&actor=student-1&view=result&routeHandle=${encodeURIComponent(objectiveTarget.routeHandle)}`,
    { waitUntil: 'domcontentloaded' },
  );
  await expect(page.getByText('1.00 / 1.00')).toBeVisible({ timeout: 60_000 });

  await page.goto(
    `http://localhost:5173/__smoke/book-runtime?fixture=homework-production&actor=teacher-1&view=grade&locator=${encodeURIComponent(JSON.stringify(resultTarget.locator))}`,
    { waitUntil: 'domcontentloaded' },
  );
  const gradePanel = page.getByRole('region').filter({ has: page.getByLabel('Earned score') });
  await expect(gradePanel).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Earned score').fill('1.5');
  await page.getByLabel('Maximum score').fill('2');
  await page.getByLabel('Feedback').fill('Clear evidence-based reasoning.');
  await page.getByRole('button', { name: 'Save grade' }).click();
  await expect(page.getByText('Revision 1', { exact: true })).toBeVisible({ timeout: 30_000 });

  const teacherResultUrl = `http://localhost:5173/__smoke/book-runtime?fixture=homework-production&actor=teacher-1&view=result&routeHandle=${encodeURIComponent(resultTarget.routeHandle)}`;
  await page.goto(teacherResultUrl, { waitUntil: 'domcontentloaded' });
  const release = page.getByRole('button', { name: 'Release feedback for this attempt' });
  await expect(release).toBeVisible({ timeout: 60_000 });
  await release.click();
  await expect(page.getByRole('status').filter({ hasText: 'Feedback released for this attempt.' })).toBeVisible({ timeout: 30_000 });

  await page.goto(
    `http://localhost:5174/__smoke/book-runtime?fixture=homework-production&actor=student-1&view=result&routeHandle=${encodeURIComponent(resultTarget.routeHandle)}`,
    { waitUntil: 'domcontentloaded' },
  );
  await expect(page.getByText('Clear evidence-based reasoning.')).toBeVisible({ timeout: 60_000 });

  await page.goto(
    `http://localhost:5173/__smoke/book-runtime?fixture=homework-production&actor=teacher-1&view=grade&locator=${encodeURIComponent(JSON.stringify(resultTarget.locator))}`,
    { waitUntil: 'domcontentloaded' },
  );
  await expect(page.getByText('Revision 1 · Current')).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Earned score').fill('2');
  await page.getByLabel('Correction note').fill('The evidence supports full credit.');
  await page.getByRole('button', { name: 'Save regrade' }).click();
  await expect(page.getByText('Revision 2 · Current')).toBeVisible({ timeout: 30_000 });

  await page.goto(
    `http://localhost:5174/__smoke/book-runtime?fixture=homework-production&actor=student-1&view=result&routeHandle=${encodeURIComponent(resultTarget.routeHandle)}`,
    { waitUntil: 'domcontentloaded' },
  );
  await expect(page.getByText('2.00 / 2.00')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('The evidence supports full credit.')).toBeVisible();

  const policyCases = await page.evaluate(async ({ bookId, unitKey, classId, idToken }) => {
    const { createBookHomeworkPreviewSource, createBookHomeworkAssignmentViaWorker } =
      await import('../src/services/homeworkAssignmentClient');
    const { createBookHomeworkManifest } = await import('../src/services/book-homework/bookHomeworkManifest.service');
    const { buildBookHomeworkPreview, createDefaultBookHomeworkPolicy } =
      await import('../src/services/book-homework/bookHomeworkPreview.service');
    const { createBookHomeworkAssignmentIntent } =
      await import('../src/services/book-homework/bookHomeworkAssignmentIntent');
    const modes = ['immediate', 'after_completion', 'after_deadline', 'never'] as const;
    const options = { workerOrigin: 'http://localhost:8792', getIdToken: async () => idToken };
    const wholeBookSource = await createBookHomeworkPreviewSource({
      bookId,
      target: { kind: 'unit', bookId, nodeKey: unitKey },
      classId,
      selectedRecipientIds: ['student-1'],
      title: 'PRD0062 objective feedback policy proof',
    }, options);
    const objective = wholeBookSource.delivery.activities[0];
    if (!objective) throw new Error('homework_objective_activity_unavailable');
    const target = {
      kind: 'activity' as const,
      bookId,
      activityId: objective.activityId,
      placementId: objective.placementId,
    };
    const isoLocal = (time: number) => {
      const date = new Date(time);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        + `T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };
    const results = [];
    for (const mode of modes) {
      const source = await createBookHomeworkPreviewSource({
        bookId, target, classId, selectedRecipientIds: ['student-1'],
        title: `PRD0062 ${mode} feedback policy`,
      }, options);
      const manifest = createBookHomeworkManifest({
        resolution: { delivery: source.delivery },
        target: source.initialTarget!,
        manifestVersionId: source.identity.manifestVersionId,
        ownerId: source.identity.ownerId,
        createdByCommandId: source.identity.createdByCommandId,
        createdAt: source.identity.createdAt,
        bindingRevision: source.identity.bindingRevision,
        studentDocument: source.studentDocument,
        targetPreview: source.targetPreview,
      });
      const defaultPolicy = createDefaultBookHomeworkPolicy(manifest, 'practice');
      const preview = buildBookHomeworkPreview({
        source,
        manifest,
        policy: {
          ...defaultPolicy,
          activityPolicies: defaultPolicy.activityPolicies.map((policy) => ({
            ...policy,
            feedbackRelease: mode,
            lateSubmissionAllowed: mode === 'after_deadline',
          })),
        },
      });
      const now = Date.now();
      const dueDate = mode === 'after_deadline' ? now - 60_000 : now + 24 * 60 * 60_000;
      const command = createBookHomeworkAssignmentIntent({
        source,
        selectedRecipientIds: ['student-1'],
        draft: {
          manifest: preview.manifest,
          policy: preview.policy,
          schedule: { availableFrom: isoLocal(now - 5 * 60_000), dueDate: isoLocal(dueDate), scheduleRules: [] },
          deadlineMutationIntents: [],
          warnings: preview.warnings,
        },
      });
      const committed = await createBookHomeworkAssignmentViaWorker(command, options);
      results.push({
        mode,
        assignmentId: command.assignmentId,
        status: committed.state,
        visibility: committed.visibility,
        publication: command.intent.expectedPublication,
      });
    }
    return results;
  }, { bookId: publication.bookId, unitKey: publication.unitKey, classId: classProof.classId, idToken });

  for (const policyCase of policyCases) {
    expect(policyCase.status).toBe('committed');
    expect(policyCase.visibility).toBe('committed');
    expect(policyCase.publication).toMatchObject({
      publicationId: publication.publicationId,
      manifestVersionId: publication.manifestVersionId,
    });
    await page.goto(
      `http://localhost:5174/__smoke/book-runtime?fixture=homework-production&actor=student-1&view=runtime&homeworkId=${encodeURIComponent(policyCase.assignmentId)}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(page.getByTestId('book-runtime-shell')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('radio')).toHaveCount(2);
    const policyObjectiveCard = page.locator('article[data-book-activity]').filter({
      has: page.getByRole('heading', { name: 'Source-assisted choice', exact: true }),
    });
    await expect(policyObjectiveCard).toBeVisible();
    await policyObjectiveCard.getByRole('radio').first().check();
    const policySubmit = policyObjectiveCard.getByTestId('book-runtime-submit');
    await expect(policySubmit).toBeEnabled();
    await policySubmit.click();
    const policyConfirmation = policyObjectiveCard.getByRole('dialog');
    await expect(policyConfirmation).toBeVisible();
    await policyConfirmation.getByRole('button', { name: 'Confirm submission' }).click();
    await expect(policySubmit).toHaveText('Activity submitted', { timeout: 30_000 });

    const policyResult = await page.evaluate(async (homeworkId) => {
      const { auth } = await import('../src/services/firebase.js');
      const getIdToken = (refresh = false) => auth.currentUser?.getIdToken(refresh) ?? Promise.resolve(null);
      if (!auth.currentUser) throw new Error('homework_student_auth_unavailable');
      const { createBookHomeworkPlacementBrowserClient } =
        await import('../src/services/book-delivery/bookPlacementLaunch.browser');
      const { createBookActivityLaunchBrowserClient } =
        await import('../src/services/book-activity/activityLaunch.browser');
      const { createBookRuntimeClient } = await import('../src/services/book-activity/activityRuntime.browser');
      const { createBookResultBrowserClient, createBookResultRouteHandle } =
        await import('../src/services/bookResult.browser');
      const { bookResultGroupKey } = await import('../src/services/book-activity/results/bookResult.types');
      const origin = 'http://localhost:8792';
      const projection = await createBookHomeworkPlacementBrowserClient({ baseUrl: origin,
        getCurrentUserId: () => auth.currentUser?.uid, getIdToken }).current(homeworkId);
      const activity = projection.activities[0];
      if (!activity) throw new Error('homework_objective_placement_unavailable');
      const launch = await createBookActivityLaunchBrowserClient({ baseUrl: origin, getIdToken }).readHomeworkActivities({
        assignmentId: homeworkId,
        placements: [{ placementId: activity.placementId, activityId: activity.activityId,
          activityVersionId: activity.activityVersionId }],
      });
      const interactionId = launch[0]?.projection.interactions[0]?.interactionId;
      if (!interactionId) throw new Error('homework_objective_interaction_unavailable');
      const terminal = await createBookRuntimeClient({ baseUrl: origin, getIdToken }).readTerminal({
        bindingId: projection.bindingId,
        bindingRevision: projection.bindingRevision,
        contextId: projection.context.contextId,
        placementId: activity.placementId,
        activityId: activity.activityId,
        activityVersion: activity.activityVersion,
        interactionId,
      });
      if (terminal.status !== 'present') throw new Error('homework_objective_terminal_unavailable');
      const address = { bookId: projection.book.bookId, studentId: auth.currentUser.uid,
        groupKey: bookResultGroupKey(auth.currentUser.uid, activity.activityId), homeworkId: projection.context.contextId };
      const resultClient = createBookResultBrowserClient({ baseUrl: origin, getIdToken });
      const group = await resultClient.readGroup(address);
      const attempt = group.attempts.find((row) => row.attemptId === terminal.attemptId);
      if (!attempt) throw new Error('homework_objective_attempt_not_in_results');
      const detail = await resultClient.readDetail(address, attempt.resultId);
      return {
        routeHandle: createBookResultRouteHandle(address),
        feedbackPolicy: detail.feedbackPolicy,
        studentFeedbackRelease: detail.studentFeedbackRelease,
        terminalLate: detail.terminalLate,
      };
    }, policyCase.assignmentId);
    expect(policyResult.feedbackPolicy).toBe(policyCase.mode);
    expect(policyResult.studentFeedbackRelease).toBe(
      policyCase.mode === 'never' ? 'withheld' : 'released',
    );
    expect(policyResult.terminalLate).toMatchObject({ late: policyCase.mode === 'after_deadline' });
    await page.goto(
      `http://localhost:5174/__smoke/book-runtime?fixture=homework-production&actor=student-1&view=result&routeHandle=${encodeURIComponent(policyResult.routeHandle)}`,
      { waitUntil: 'domcontentloaded' },
    );
    if (policyCase.mode === 'never') {
      await expect(page.getByText('Feedback is not available yet')).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('body')).not.toContainText('1.00 / 1.00');
    } else {
      await expect(page.getByText('1.00 / 1.00')).toBeVisible({ timeout: 60_000 });
    }
  }

  const diagnosticsResponse = await request.get(`${FIXTURE}/__homework-production/diagnostics`);
  expect(diagnosticsResponse.ok()).toBe(true);
  const diagnostics = await diagnosticsResponse.json() as {
    homework: unknown;
    runtimeTerminal: unknown;
    notifications: Record<string, Record<string, Record<string, unknown>>> | null;
    reporting: { errors?: Record<string, Record<string, Record<string, unknown>>> };
    trace: string[];
  };
  expect(diagnostics.homework).toBeTruthy();
  expect(diagnostics.runtimeTerminal).toBeTruthy();
  expect(diagnostics.trace.some((entry) => entry.includes('POST /book-runtime/commands 200'))).toBe(true);
  const assignmentNotices = Object.values(diagnostics.notifications?.['student-1'] ?? {}).filter((notice) => {
    const metadata = notice.metadata as { contextId?: unknown; updateActionId?: unknown } | undefined;
    return metadata?.contextId === assignment.assignmentId && metadata.updateActionId === assignment.first.operationId;
  });
  expect(assignmentNotices).toHaveLength(1);
  const assignmentNotification = assignmentNotices[0];
  const reportingFailures = Object.values(diagnostics.reporting.errors ?? {}).flatMap((daily) => Object.values(daily))
    .filter((entry) => {
      const contextData = entry.contextData as { eventId?: unknown } | undefined;
      return contextData?.eventId === assignment.first.operationId;
    });
  const notificationEvidence = {
    assignmentId: assignment.assignmentId,
    operationId: assignment.first.operationId,
    notification: assignmentNotification,
    reportingFailures,
    notificationTrace: diagnostics.trace.filter((entry) => (
      entry.includes(`notifications/student-1/${assignmentNotification.id}`)
      || entry.includes('reports/errors/')
    )),
  };
  await testInfo.attach('homework-assignment-notification-evidence.json', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(notificationEvidence, null, 2)),
  });
  expect(assignmentNotification).toMatchObject({
    type: 'info',
    title: 'New Book homework',
    read: false,
    metadata: {
      schemaVersion: 1,
      contextType: 'book-homework',
      contextId: assignment.assignmentId,
      updateActionId: assignment.first.operationId,
    },
  });
  expect(reportingFailures).toEqual([]);
  expect(assignmentNotification.id).toEqual(expect.any(String));
});
