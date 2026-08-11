export const HARNESS_CONTRACT = Object.freeze({
  name: 'luyentap-windows-arm64-harness',
  version: '3.0.2',
  protocolVersion: 1,
  defaultSnapshotTimeoutMs: 180000,
  grammar: 'node scripts/harness/run-tool.mjs <tool> <project> [...args]',
  tools: Object.freeze({
    firebase: Object.freeze({
      runtime: 'windows-x64', sourceMode: 'snapshot', package: 'firebase-tools', entry: 'firebase-tools/lib/bin/firebase.js',
      capabilities: [{ kind: 'java', minimumMajor: 21, commands: ['emulators:exec', 'emulators:start'] }], rejectedCommands: ['emulators:start'],
      environmentDefaultsByCommand: { 'emulators:exec': {
        VITE_FIREBASE_API_KEY: 'harness-local-placeholder', VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
        VITE_FIREBASE_DATABASE_URL: 'http://localhost', VITE_FIREBASE_PROJECT_ID: 'harness-local',
        VITE_FIREBASE_STORAGE_BUCKET: 'harness-local', VITE_FIREBASE_MESSAGING_SENDER_ID: '0', VITE_FIREBASE_APP_ID: 'harness-local',
      } },
    }),
    playwright: Object.freeze({ runtime: 'windows-x64', sourceMode: 'snapshot', package: '@playwright/test', entry: '@playwright/test/cli.js', capabilities: [{ kind: 'browser', name: 'chromium' }] }),
    vite: Object.freeze({ runtime: 'windows-x64', sourceMode: 'snapshot', package: 'vite', entry: 'vite/bin/vite.js', rejectedCommands: ['dev', 'serve', 'preview'], rejectEmptyCommand: true, publishedOutputsByCommand: { build: ['dist'] } }),
    'vite-node': Object.freeze({ runtime: 'windows-x64', sourceMode: 'snapshot', package: 'vite-node', entry: 'vite-node/vite-node.mjs' }),
    vitest: Object.freeze({ runtime: 'windows-x64', sourceMode: 'snapshot', package: 'vitest', entry: 'vitest/vitest.mjs', requireOneShot: true }),
    wrangler: Object.freeze({ runtime: 'wsl', sourceMode: 'live', package: 'wrangler', entry: 'wrangler/bin/wrangler.js' }),
  }),
  classifications: Object.freeze([
    'completed',
    'harness_preflight_failure',
    'harness_startup_failure',
    'harness_transport_failure',
    'zero_tests_collected',
    'product_failure',
  ]),
});

export const toolNames = Object.freeze(Object.keys(HARNESS_CONTRACT.tools));
