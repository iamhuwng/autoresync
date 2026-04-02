import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBuildEnvironment, runNodeProgram } from './shared-build-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

prepareBuildEnvironment({ mode: 'production' });

const args = process.argv.slice(2);
const deployArgs = args.length > 0 ? args : ['deploy', '--only', 'hosting:kahut1'];

runNodeProgram(path.join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'), deployArgs);
