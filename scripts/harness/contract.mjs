export const HARNESS_CONTRACT = Object.freeze({
  name: 'luyentap-windows-arm64-harness',
  version: '3.1.0',
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
    playwright: Object.freeze({ runtime: 'windows-x64', sourceMode: 'snapshot', package: '@playwright/test', entry: '@playwright/test/cli.js', capabilities: [{ kind: 'browser', name: 'chromium', commands: ['test', 'show-report'] }] }),
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
  remediations: Object.freeze({
    HARNESS_CONTRACT_MISMATCH: { summary: 'Use the skill and every harness file from one checkout and commit lineage.', actions: ['Restore or integrate the complete .agents/skills/run-windows-arm64-tools and scripts/harness set; never copy one runner from another worktree.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    DISPATCH_PROTOCOL_MISSING: { summary: 'Enter through the repository dispatcher instead of invoking an internal runner.', actions: ['Use run-tool.mjs with the documented tool/project grammar; internal environment payloads are harness-owned.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    X64_NODE_PREREQUISITE_MISSING: { summary: 'Install a Windows x64 Node runtime outside the repository.', actions: ['Install or unpack official Windows x64 Node at %USERPROFILE%\\Tools\\node-x64\\node.exe, or set CODEX_X64_NODE to another x64 node.exe.'], verify: '& "$env:USERPROFILE\\Tools\\node-x64\\node.exe" -p "process.platform + \' \' + process.arch"' },
    X64_NODE_ARCH_MISMATCH: { summary: 'Point CODEX_X64_NODE at an x64 build, not the host ARM64 build.', actions: ['Inspect the configured executable with node -p process.arch and replace the path only when it reports something other than x64.'], verify: '& $env:CODEX_X64_NODE -p "process.arch"' },
    PROJECT_CONTEXT_INVALID: { summary: 'Select the package directory that owns both package.json and package-lock.json.', actions: ['Pass . for the root package or an explicit nested package path; do not guess from the tool name.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    PROJECT_DEPENDENCY_MISSING: { summary: 'Make the selected project own the tool it invokes.', actions: ['Confirm the package script is intended to use the tool, then deliberately add it to that project manifest and lockfile; do not borrow root dependencies.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    PROJECT_LOCK_ENTRY_MISSING: { summary: 'Repair the selected project lockfile from its manifest.', actions: ['Regenerate only that project lockfile with the approved npm version; review the lockfile diff before retrying.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NPM_UNAVAILABLE: { summary: 'Make npm from the selected x64 Node installation available.', actions: ['Check that npm-cli.js is present beside the configured x64 Node and that the x64 Node directory is first on PATH.'], verify: '& "$env:USERPROFILE\\Tools\\node-x64\\node.exe" "$env:USERPROFILE\\Tools\\node-x64\\node_modules\\npm\\bin\\npm-cli.js" --version' },
    DEPENDENCY_INSTALL_FAILED: { summary: 'Use the preserved npm output and staging directory to repair the declared dependency set.', actions: ['Inspect the evidence and npm error first; correct the manifest/lockfile only when they are inconsistent, otherwise retry with a fresh isolated cache root.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_CACHE_INCOMPLETE: { summary: 'Prove cache corruption with a fresh cache before removing anything.', actions: ['Set CODEX_HARNESS_ROOT to a new directory and rerun doctor; remove only the exact incomplete cache identity after validating its resolved path.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_CACHE_IDENTITY_MISMATCH: { summary: 'Stop using the stale cache entry and rebuild the exact identity.', actions: ['Rerun with a fresh CODEX_HARNESS_ROOT, then remove only the validated mismatched cache entry.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_LOCK_TIMEOUT: { summary: 'Determine whether another dependency installation is active or abandoned.', actions: ['Inspect running harness/npm processes and the exact lock directory; wait for an active owner, or validate the abandoned exact lock before removing it.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NATIVE_ESBUILD_MISSING: { summary: 'Rebuild the isolated x64 cache with the lockfile’s Windows x64 optional dependencies.', actions: ['Try a fresh cache first; if it still fails, inspect the selected lockfile for @esbuild/win32-x64 before changing dependencies.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NATIVE_ROLLDOWN_MISSING: { summary: 'Rebuild the isolated x64 cache with the Rolldown Windows x64 binding.', actions: ['Try a fresh cache first; if it still fails, inspect the selected lockfile for @rolldown/binding-win32-x64-msvc.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NATIVE_WORKERD_MISSING: { summary: 'Rebuild the selected project cache with the Windows x64 workerd package.', actions: ['Use the Cloudflare project as <project>, try a fresh cache, and inspect its lockfile for @cloudflare/workerd-windows-64 if the failure persists.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> vitest' },
    BROWSER_RUNTIME_MISSING: { summary: 'Install Chromium through the selected project’s isolated Playwright CLI.', actions: ['Run the harness install command; it is intentionally allowed before the browser capability exists.'], verify: 'node scripts/harness/run-tool.mjs playwright <project> install chromium' },
    JAVA_PREREQUISITE_MISSING: { summary: 'Install JDK 21 or newer and expose java on PATH.', actions: ['Obtain authorization before a machine-wide install, set JAVA_HOME/PATH for the current shell, and confirm the reported major version is at least 21.'], verify: 'java -version; node scripts/harness/run-tool.mjs --doctor <project> firebase' },
    WSL_PREREQUISITE_MISSING: { summary: 'Enable WSL and install a distribution before running Wrangler.', actions: ['Obtain authorization before wsl --install or other system changes; after any required reboot, confirm WSL Node is available.'], verify: 'wsl --status; wsl -- node -p "process.platform + \' \' + process.arch"' },
    LIVE_WORKLOAD_REQUIRES_CHECKOUT: { summary: 'Run watch or development commands against the active checkout.', actions: ['Use the repository dev/preview script for Vite, an explicit local watch command for Vitest, or the harness WSL path for Wrangler dev.'], verify: 'git rev-parse --show-toplevel' },
    LOCAL_DEPENDENCY_OUTSIDE_PROJECT: { summary: 'Keep file: dependencies inside the selected package boundary.', actions: ['Replace the escaping file dependency with a published/workspace dependency or select the package that actually owns it.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    EXECUTION_WORKSPACE_COLLISION: { summary: 'Retry in a new per-invocation workspace and preserve the collision evidence.', actions: ['Do not reuse or edit the collided workspace; rerun once, then treat recurrence as a harness defect.'], verify: 'node scripts/harness/run-tool.mjs <tool> <project> [...args]' },
    SOURCE_MIRROR_FAILED: { summary: 'Resolve the reported copy error without changing repository dependencies.', actions: ['Inspect the exact robocopy error, close locks on the per-run destination, and retry; keep the source checkout unchanged.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    TOOL_ENTRYPOINT_MISSING: { summary: 'Rebuild the isolated cache and verify the selected package lock entry.', actions: ['Use a fresh cache; if the entry remains absent, repair the selected manifest/lockfile rather than using repository node_modules.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    TOOL_UNSUPPORTED: { summary: 'Choose a tool declared by the executable harness contract.', actions: ['Read tools from --contract; add a new tool only as an intentional contract, runner, skill, and test change.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    OUTPUT_MISSING: { summary: 'Reconcile the successful build command with its declared output directory.', actions: ['Inspect the selected project build configuration and snapshot output; correct the contract only when the project intentionally writes elsewhere.'], verify: 'node scripts/harness/run-tool.mjs <tool> <project> [...args]' },
    OUTPUT_PATH_INVALID: { summary: 'Keep published build outputs inside the selected project.', actions: ['Correct the declarative output path; never publish a snapshot path that escapes the project root.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    TOOL_TIMEOUT: { summary: 'Narrow the command and determine whether startup, product work, or transport consumed the timeout.', actions: ['Read partial tool output and evidence, rerun the smallest affected file, and increase CODEX_HARNESS_TIMEOUT_MS only when the expected duration is understood.'], verify: 'node scripts/harness/run-tool.mjs <tool> <project> [...args]' },
    ZERO_TESTS_COLLECTED: { summary: 'Confirm the intended test path and runner configuration collect real tests.', actions: ['Run the smallest intended test file explicitly and inspect include/exclude/config rules; do not count definition-only success as test execution.'], verify: 'node scripts/harness/run-tool.mjs vitest <project> run <test-file>' },
    TOOL_STARTUP_FAILED: { summary: 'Repair the reported native or process startup condition before inspecting product assertions.', actions: ['Use doctor for the same project/tool, then rerun the smallest command after doctor passes.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
  }),
});

export const toolNames = Object.freeze(Object.keys(HARNESS_CONTRACT.tools));

export function remediationFor(code, project = '<project>', tool = '<tool>') {
  const remediation = HARNESS_CONTRACT.remediations[code];
  if (!remediation) return null;
  const replace = (value) => value.replaceAll('<project>', project).replaceAll('<tool>', tool);
  return { code, summary: replace(remediation.summary), actions: remediation.actions.map(replace), verify: replace(remediation.verify) };
}
