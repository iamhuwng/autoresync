import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  buildRetiredMaterialInventory,
  type ReadOnlyDatabase,
} from './lib/retiredMaterialInventory';

const execFileAsync = promisify(execFile);
const firebaseBinary = resolve('node_modules/firebase-tools/lib/bin/firebase.js');

export interface RetiredMaterialInventoryCliOptions {
  readonly projectId: string;
  readonly outputPath: string;
  readonly help: boolean;
}

const requireValue = (
  argv: readonly string[],
  index: number,
  option: string,
): string => {
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
};

export const parseRetiredMaterialInventoryArgs = (
  argv: readonly string[],
): RetiredMaterialInventoryCliOptions => {
  let projectId = '';
  let outputPath = '';
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    switch (argument) {
      case '--project':
        projectId = requireValue(argv, index, argument);
        index += 1;
        break;
      case '--out':
        outputPath = requireValue(argv, index, argument);
        index += 1;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      case '--apply':
        throw new Error('Read-only inspection does not accept --apply.');
      default:
        if (argument.startsWith('--project=')) {
          projectId = argument.slice('--project='.length).trim();
          break;
        }
        if (argument.startsWith('--out=')) {
          outputPath = argument.slice('--out='.length).trim();
          break;
        }
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!help && !projectId) {
    throw new Error('--project is required.');
  }
  if (!help && !outputPath) {
    throw new Error('--out is required.');
  }

  return { projectId, outputPath, help };
};

const normalizeDatabasePath = (path: string): string =>
  path.startsWith('/') ? path : `/${path}`;

export const createFirebaseCliReadOnlyDatabase = (
  projectId: string,
): ReadOnlyDatabase => ({
  read: async (path) => {
    const { stdout } = await execFileAsync(process.execPath, [
      firebaseBinary,
      'database:get',
      normalizeDatabasePath(path),
      '--project',
      projectId,
    ], {
      cwd: process.cwd(),
      maxBuffer: 100 * 1024 * 1024,
    });
    const output = stdout.trim();
    return output && output !== 'null' ? JSON.parse(output) : null;
  },
});

const readSourceRevision = async (): Promise<string> => {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
  });
  return stdout.trim();
};

const printUsage = (): void => {
  console.log(`Usage:
  npm run materials:inspect-retired -- --project <projectId> --out <manifestPath>

Read-only Phase 1 inventory. This command rejects --apply and emits no source payloads.`);
};

export const runRetiredMaterialInventoryCli = async (
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> => {
  const options = parseRetiredMaterialInventoryArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }

  const report = await buildRetiredMaterialInventory(
    createFirebaseCliReadOnlyDatabase(options.projectId),
    {
      projectId: options.projectId,
      sourceRevision: await readSourceRevision(),
      generatedAt: new Date().toISOString(),
    },
  );
  const outputPath = resolve(options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    projectId: report.projectId,
    mode: 'read-only',
    outputPath,
    rootCount: Object.keys(report.roots).length,
    readFailureCount: report.readFailures.length,
    driveUrlFieldPathCount: report.driveUrlFieldPaths.length,
    explicitReadingV2PayloadCount:
      report.routingMetadata.explicitReadingV2PayloadCount,
    legacyReadingSchemaEvidenceCount:
      report.legacyReadingSchemaEvidence.recordPaths.length,
  }, null, 2));

  return report.readFailures.length === 0 ? 0 : 2;
};

const isDirectExecution = (): boolean => {
  if (process.env.VITEST_WORKER_ID) {
    return false;
  }
  if (
    process.env.npm_lifecycle_event === 'materials:inspect-retired'
    || process.env.npm_lifecycle_script?.includes('inspect-retired-materials.ts')
  ) {
    return true;
  }

  const currentFile = fileURLToPath(import.meta.url);
  return process.argv.slice(1).some((argument) =>
    Boolean(argument)
    && !argument.startsWith('-')
    && resolve(argument) === currentFile);
};

if (isDirectExecution()) {
  runRetiredMaterialInventoryCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
