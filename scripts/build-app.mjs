import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBuildEnvironment, runNodeProgram } from './shared-build-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

prepareBuildEnvironment({ mode: 'production' });

runNodeProgram(path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), ['build']);
runNodeProgram(path.join(repoRoot, 'scripts', 'check-bundle-budget.mjs'));
