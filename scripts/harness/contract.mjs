export const HARNESS_CONTRACT = Object.freeze({
  name: 'luyentap-native-audit-harness',
  version: '5.0.0',
  protocolVersion: 7,
  dependencyCacheProtocolVersion: 3,
  defaultSnapshotTimeoutMs: 180000,
  grammar: 'node scripts/harness/run-tool.mjs --audit <tool> <project> [...args]',
  authority: Object.freeze({
    sourceAuthority: 'windows-checkout',
  }),
  resolutionOrder: Object.freeze(['discover', 'reuse', 'adapt', 'install', 'verify']),
  tools: Object.freeze({
    firebase: Object.freeze({
      runtime: 'windows-x64', auditSourceMode: 'snapshot', package: 'firebase-tools', entry: 'firebase-tools/lib/bin/firebase.js',
      capabilities: [{ kind: 'java', minimumMajor: 21, commands: ['emulators:exec', 'emulators:start'] }], rejectedCommands: ['emulators:start'],
      environmentDefaultsByCommand: { 'emulators:exec': {
        VITE_FIREBASE_API_KEY: 'harness-local-placeholder', VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
        VITE_FIREBASE_DATABASE_URL: 'http://localhost', VITE_FIREBASE_PROJECT_ID: 'harness-local',
        VITE_FIREBASE_STORAGE_BUCKET: 'harness-local', VITE_FIREBASE_MESSAGING_SENDER_ID: '0', VITE_FIREBASE_APP_ID: 'harness-local',
      } },
    }),
    playwright: Object.freeze({ runtime: 'windows-x64', auditSourceMode: 'snapshot', package: '@playwright/test', entry: '@playwright/test/cli.js', capabilities: [{ kind: 'browser', name: 'chromium', commands: ['test', 'show-report'] }] }),
    vite: Object.freeze({ runtime: 'windows-x64', auditSourceMode: 'snapshot', package: 'vite', entry: 'vite/bin/vite.js', rejectedCommands: ['dev', 'serve', 'preview'], rejectEmptyCommand: true, publishedOutputsByCommand: { build: ['dist'] } }),
    'vite-node': Object.freeze({ runtime: 'windows-x64', auditSourceMode: 'snapshot', package: 'vite-node', entry: 'vite-node/vite-node.mjs' }),
    vitest: Object.freeze({ runtime: 'windows-x64', auditSourceMode: 'snapshot', package: 'vitest', entry: 'vitest/vitest.mjs', requireOneShot: true }),
    wrangler: Object.freeze({ runtime: 'windows-x64', auditSourceMode: 'live', dependencySource: 'project', package: 'wrangler', entry: 'wrangler/bin/wrangler.js' }),
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
    HARNESS_CONTRACT_MISMATCH: { summary: 'Restore one coherent repository evidence harness generation.', actions: ['Keep dispatcher, adapters, contract, and evidence validation from the same repository generation; generic user skills are independent policy.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    DISPATCH_PROTOCOL_MISSING: { summary: 'Enter through the repository dispatcher instead of invoking an internal runner.', actions: ['Use run-tool.mjs with the documented tool/project grammar; internal environment payloads are harness-owned.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    DISPATCH_PROTOCOL_MISMATCH: { summary: 'The dispatcher and isolated runner are from different harness generations.', actions: ['Restore run-tool.mjs, run-isolated.mjs, contract.mjs, adapters, and tests from the same repository commit before retrying.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    X64_NODE_PREREQUISITE_MISSING: { summary: 'Run the audit with native Windows x64 Node.', actions: ['Use the repository-pinned Node version and verify the selected executable reports x64.'], verify: 'node -p process.arch' },
    X64_NODE_ARCH_MISMATCH: { summary: 'Select a native x64 Node executable for Windows audits.', actions: ['Check the pinned Node distribution and the executable selected by PATH.'], verify: 'node -p process.arch' },
    PROJECT_CONTEXT_INVALID: { summary: 'Select the package directory that owns both package.json and package-lock.json.', actions: ['Pass . for the root package or an explicit nested package path; do not guess from the tool name.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    PROJECT_DEPENDENCY_MISSING: { summary: 'Make the selected project own the tool it invokes.', actions: ['Confirm the package script is intended to use the tool, then deliberately add it to that project manifest and lockfile; do not borrow root dependencies.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    PROJECT_LOCK_ENTRY_MISSING: { summary: 'Repair the selected project lockfile from its manifest.', actions: ['Regenerate only that project lockfile with the approved npm version; review the lockfile diff before retrying.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_CACHE_MUTATED: { summary: 'The tool changed the shared immutable dependency cache through a per-run link.', discover: ['Inspect the recorded before/after cache fingerprints and identify the package or transient path that wrote to the cache.'], reuse: ['Do not reuse the mutated cache for product proof.'], adapt: ['Rerun with a fresh CODEX_HARNESS_ROOT after the writer is understood.'], install: [], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NPM_UNAVAILABLE: { summary: 'Use the npm bundled with the pinned native Node release.', actions: ['Verify the installed Node distribution includes npm and is first on PATH.'], verify: 'npm --version' },
    DEPENDENCY_INSTALL_FAILED: { summary: 'Use the preserved npm output and staging directory to diagnose the failed installation.', actions: ['Inspect the npm error and exact manifest/lockfile. For ordinary execution, use the stateless resolver and existing project dependencies. Retry an isolated audit installation only after resolving its cause and confirming provisioning authorization; preserve the failure evidence and retire abandoned staging through ownership-checked cleanup.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_CACHE_PUBLISH_FAILED: { summary: 'The completed staging cache could not be atomically published as its immutable cache entry.', discover: ['Read dependencyCachePublication.systemError and confirm whether another process, scanner, or filesystem condition blocked the exact staging-to-cache rename.'], reuse: ['For ordinary execution, use the stateless resolver and existing project dependencies. For a required isolated audit, reuse a complete matching cache if one exists.'], adapt: ['Keep the current CODEX_HARNESS_ROOT while diagnosing the exact failed publication; changing roots does not resolve its cause.'], install: ['Provision again only after resolving the cause and confirming authorization. Preserve the recorded failure details, then retire abandoned staging through ownership-checked cleanup.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_CACHE_INCOMPLETE: { summary: 'Prove cache corruption with a fresh cache before removing anything.', actions: ['Set CODEX_HARNESS_ROOT to a new directory and rerun doctor; remove only the exact incomplete cache identity after validating its resolved path.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_CACHE_IDENTITY_MISMATCH: { summary: 'Stop using the stale cache entry and rebuild the exact identity.', actions: ['Rerun with a fresh CODEX_HARNESS_ROOT, then remove only the validated mismatched cache entry.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    DEPENDENCY_LOCK_TIMEOUT: { summary: 'Determine whether another dependency installation is active or abandoned.', actions: ['Inspect running harness/npm processes and the exact lock directory; wait for an active owner, or validate the abandoned exact lock before removing it.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NATIVE_ESBUILD_MISSING: { summary: 'Rebuild the isolated x64 cache with the lockfile’s Windows x64 optional dependencies.', actions: ['Try a fresh cache first; if it still fails, inspect the selected lockfile for @esbuild/win32-x64 before changing dependencies.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NATIVE_ROLLDOWN_MISSING: { summary: 'Rebuild the isolated x64 cache with the Rolldown Windows x64 binding.', actions: ['Try a fresh cache first; if it still fails, inspect the selected lockfile for @rolldown/binding-win32-x64-msvc.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    NATIVE_WORKERD_MISSING: { summary: 'Rebuild the selected project cache with the Windows x64 workerd package.', actions: ['Use the Cloudflare project as <project>, try a fresh cache, and inspect its lockfile for @cloudflare/workerd-windows-64 if the failure persists.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> vitest' },
    BROWSER_RUNTIME_MISSING: { summary: 'Reuse Playwright’s compatible Chromium revision before downloading it.', discover: ['Inspect PLAYWRIGHT_BROWSERS_PATH and the selected Playwright package’s chromium.executablePath(); arbitrary system Chrome is not a compatible substitute.'], reuse: ['Use the discovered executable when its expected path exists.'], adapt: ['Preserve an existing PLAYWRIGHT_BROWSERS_PATH for the harness invocation.'], install: ['If the exact revision is absent, announce the user-cache download and run node scripts/harness/run-tool.mjs --audit playwright <project> install chromium.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> playwright' },
    JAVA_PREREQUISITE_MISSING: { summary: 'Find and reuse JDK 21+ before installing Java.', discover: ['Probe JAVA_HOME, every java on PATH, and standard user/system JDK directories; record executable and major version.'], reuse: ['Select the first discovered Java runtime with major version 21 or newer.'], adapt: ['Set JAVA_HOME and prepend its bin directory to the harness child PATH without changing the machine configuration.'], install: ['Only when no compatible runtime exists, obtain authorization and install JDK 21+ outside the repository.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> firebase' },
    LIVE_WORKLOAD_REQUIRES_CHECKOUT: { summary: 'Run watch or development commands against the active checkout.', actions: ['Use the repository dev/preview script or stateless exact-tool resolver for the selected live workload.'], verify: 'git rev-parse --show-toplevel' },
    LOCAL_DEPENDENCY_OUTSIDE_PROJECT: { summary: 'Keep file: dependencies inside the selected package boundary.', actions: ['Replace the escaping file dependency with a published/workspace dependency or select the package that actually owns it.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    EXECUTION_WORKSPACE_COLLISION: { summary: 'Retry in a new per-invocation workspace and preserve the collision evidence.', actions: ['Do not reuse or edit the collided workspace; rerun once, then treat recurrence as a harness defect.'], verify: 'node scripts/harness/run-tool.mjs --audit <tool> <project> [...args]' },
    LIVE_DEPENDENCY_OVERLAY_COLLISION: { summary: 'The selected project already has a node_modules installation that the x64 adapter will not replace.', actions: ['Use the project dependency installation directly when it is architecture-compatible, or move/remove it explicitly before asking the adapter to provide an x64 dependency view.'], verify: 'node scripts/harness/run-tool.mjs --audit <tool> <project> [...args]' },
    LIVE_DEPENDENCY_OVERLAY_BUSY: { summary: 'Another ordinary adapter invocation still owns this project dependency view.', actions: ['Wait for the active command to finish; a later invocation reclaims only an adapter-owned view whose recorded process is no longer active.'], verify: 'node scripts/harness/run-tool.mjs --audit <tool> <project> [...args]' },
    SOURCE_MIRROR_FAILED: { summary: 'Resolve the reported copy error without changing repository dependencies.', actions: ['Inspect the exact robocopy error, close locks on the per-run destination, and retry; keep the source checkout unchanged.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    SOURCE_PROVENANCE_UNAVAILABLE: { summary: 'Git could not establish the selected checkout commit or dirty fingerprint.', actions: ['Run the harness from a readable Git worktree with HEAD and status available; do not substitute a guessed commit or empty fingerprint.'], verify: 'git rev-parse HEAD; git status --porcelain=v1 -z --untracked-files=all' },
    TOOL_ENTRYPOINT_MISSING: { summary: 'Rebuild the isolated cache and verify the selected package lock entry.', actions: ['Use a fresh cache; if the entry remains absent, repair the selected manifest/lockfile rather than using repository node_modules.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
    TOOL_UNSUPPORTED: { summary: 'Choose a tool declared by the executable harness contract.', actions: ['Read tools from --contract; add a new tool only as an intentional contract, runner, skill, and test change.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    VITE_VERSION_MISMATCH: { summary: 'The installed Vite CLI version does not match the selected project lockfile.', actions: ['Inspect the selected project package-lock.json and resolved node_modules/vite package; repair the selected dependency context without borrowing another project dependency.'], verify: 'node scripts/harness/live-vite-doctor.mjs <project>' },
    OUTPUT_MISSING: { summary: 'Reconcile the successful build command with its declared output directory.', actions: ['Inspect the selected project build configuration and snapshot output; correct the contract only when the project intentionally writes elsewhere.'], verify: 'node scripts/harness/run-tool.mjs --audit <tool> <project> [...args]' },
    OUTPUT_PATH_INVALID: { summary: 'Keep published build outputs inside the selected project.', actions: ['Correct the declarative output path; never publish a snapshot path that escapes the project root.'], verify: 'node scripts/harness/run-tool.mjs --contract' },
    TOOL_TIMEOUT: { summary: 'Narrow the command and determine whether startup, product work, or transport consumed the timeout.', actions: ['Read partial tool output and evidence, rerun the smallest affected file, and increase CODEX_HARNESS_TIMEOUT_MS only when the expected duration is understood.'], verify: 'node scripts/harness/run-tool.mjs --audit <tool> <project> [...args]' },
    PROTECTED_STATE_CHANGED: { summary: 'The harness observed a change to protected selected-project dependency state.', actions: ['Inspect the sidecar protected-state before/after records. Do not accept the command as product evidence; restore or repair only after identifying the external writer.'], verify: 'node scripts/harness/validate-evidence.mjs --expect-commit <full-sha> <sidecar>' },
    ZERO_TESTS_COLLECTED: { summary: 'Confirm the intended test path and runner configuration collect real tests.', actions: ['Run the smallest intended test file explicitly and inspect include/exclude/config rules; do not count definition-only success as test execution.'], verify: 'node scripts/harness/run-tool.mjs --audit vitest <project> run <test-file>' },
    TOOL_STARTUP_FAILED: { summary: 'Repair the reported native or process startup condition before inspecting product assertions.', actions: ['Use doctor for the same project/tool, then rerun the smallest command after doctor passes.'], verify: 'node scripts/harness/run-tool.mjs --doctor <project> <tool>' },
  }),
});

export const toolNames = Object.freeze(Object.keys(HARNESS_CONTRACT.tools));

export function remediationFor(code, project = '<project>', tool = '<tool>') {
  const remediation = HARNESS_CONTRACT.remediations[code];
  if (!remediation) return null;
  const replace = (value) => value.replaceAll('<project>', project).replaceAll('<tool>', tool);
  const stages = {};
  for (const stage of HARNESS_CONTRACT.resolutionOrder) {
    const values = stage === 'verify' ? [remediation.verify] : (remediation[stage] ?? (stage === 'adapt' ? remediation.actions : []));
    stages[stage] = values.filter(Boolean).map(replace);
  }
  return { code, summary: replace(remediation.summary), stages };
}
