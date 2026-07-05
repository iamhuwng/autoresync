import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ACTIVE_STATUSES = new Set(['waiting', 'in-progress', 'active']);

const parseArgs = (argv) => {
  const apply = argv.includes('--apply');
  const projectIndex = argv.indexOf('--project');
  const project = projectIndex >= 0 ? argv[projectIndex + 1] : null;

  if (projectIndex >= 0 && !project) {
    throw new Error('--project requires a Firebase project ID.');
  }

  return { apply, project };
};

const readDefaultProject = () => {
  const config = JSON.parse(readFileSync('.firebaserc', 'utf8'));
  const project = config?.projects?.default;

  if (typeof project !== 'string' || project.trim() === '') {
    throw new Error('No default Firebase project found in .firebaserc.');
  }

  return project;
};

const resolveNpxCli = () => {
  const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');

  if (!existsSync(npxCli)) {
    throw new Error(`Could not find npx CLI beside Node.js: ${npxCli}`);
  }

  return npxCli;
};

const runFirebase = (args) => {
  const result = spawnSync(
    process.execPath,
    [resolveNpxCli(), 'firebase-tools', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim()
      || result.stdout?.trim()
      || 'Firebase CLI command failed.',
    );
  }

  return result.stdout?.trim() ?? '';
};

export const findActiveSessions = (sessions) =>
  Object.entries(sessions ?? {})
    .filter(([, session]) => ACTIVE_STATUSES.has(String(session?.status ?? '').toLowerCase()))
    .map(([sessionCode, session]) => ({
      sessionCode,
      status: String(session.status).toLowerCase(),
      mode: session.mode ?? null,
      testId: session.testId ?? null,
      linkedClassId: session.linkedClassId ?? null,
      playerCount: Object.keys(session.players ?? {}).length,
      reviewReleaseState: session.reviewReleaseState ?? null,
    }))
    .sort((left, right) => left.sessionCode.localeCompare(right.sessionCode));

export const buildClosureUpdate = (session, now) => ({
  status: 'completed',
  completedAt: now,
  lastTestCompletedAt: now,
  ...(session.testId ? { lastTestId: session.testId } : {}),
  reviewReleaseState:
    session.reviewReleaseState === 'feedback-released'
      ? 'feedback-released'
      : 'review-released',
  reviewReleaseStateUpdatedAt: now,
  updatedAt: now,
});

const summarize = (sessions) =>
  sessions.map(({ sessionCode, status, mode, testId, playerCount }) => ({
    sessionCode,
    status,
    mode,
    hasTestId: Boolean(testId),
    playerCount,
  }));

const main = () => {
  const { apply, project: requestedProject } = parseArgs(process.argv.slice(2));
  const project = requestedProject ?? readDefaultProject();
  const raw = runFirebase(['database:get', '/game_sessions', '--project', project]);
  const sessions = findActiveSessions(raw === 'null' || raw === '' ? {} : JSON.parse(raw));

  console.log(JSON.stringify({
    project,
    mode: apply ? 'apply' : 'dry-run',
    activeSessionCount: sessions.length,
    sessions: summarize(sessions),
  }, null, 2));

  if (sessions.length === 0) {
    console.log('No active sessions found.');
    return;
  }

  const sessionsWithPlayers = sessions.filter((session) => session.playerCount > 0);
  if (sessionsWithPlayers.length > 0) {
    throw new Error(
      `Refusing to close sessions with active players: ${sessionsWithPlayers
        .map((session) => `${session.sessionCode} (${session.playerCount})`)
        .join(', ')}`,
    );
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to close listed sessions.');
    return;
  }

  for (const session of sessions) {
    const now = Date.now();
    runFirebase([
      'database:update',
      `/game_sessions/${session.sessionCode}`,
      '--project',
      project,
      '--data',
      JSON.stringify(buildClosureUpdate(session, now)),
      '--force',
    ]);

    if (session.linkedClassId) {
      runFirebase([
        'database:update',
        `/classes/${session.linkedClassId}/activeSessions`,
        '--project',
        project,
        '--data',
        JSON.stringify({ [session.sessionCode]: null }),
        '--force',
      ]);
    }
  }

  const readbackRaw = runFirebase(['database:get', '/game_sessions', '--project', project]);
  const remaining = findActiveSessions(
    readbackRaw === 'null' || readbackRaw === '' ? {} : JSON.parse(readbackRaw),
  );

  if (remaining.length > 0) {
    throw new Error(
      `Closure readback failed; active sessions remain: ${remaining
        .map((session) => session.sessionCode)
        .join(', ')}`,
    );
  }

  console.log(`Closed ${sessions.length} active session(s). Readback confirms zero active sessions.`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
