import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { beginRelease, readRelease, selectDescription, settleRelease, resolveStoreDir } from './lib/releaseChangelog.mjs';

const readJson = file => JSON.parse(readFileSync(path.resolve(file), 'utf8'));
const selectRequest = (request, storeDir) => {
  const selected = selectDescription({ description: request.description,
    targets: request.targets.map(target => ({ id: target.id, binding: target.binding,
      ...(target.changeIds === undefined ? {} : { changeIds: target.changeIds }) })) }, storeDir);
  if (selected.targets.some(target => target.changeIds !== undefined
    && request.targets.find(requested => requested.id === target.id).changeIds === undefined)) {
    throw new Error('Release intent must explicitly include the selected target changeIds; preserve that request for retries.');
  }
  return { ...request, description: selected.description };
};

export async function executeRecordedOperation(request, { prepare, execute, observe, storeDir } = {}) {
  const record = beginRelease(selectRequest(request, storeDir), storeDir, { requireNew: true });
  console.log(`[Changelog] ${record.id}: ${path.join(storeDir ?? resolveStoreDir(), 'state.json')}`);
  await prepare?.(record);
  let commandError;
  try { await execute(record); } catch (error) { commandError = error; }
  let evidence;
  let observationError;
  try { evidence = await observe?.(record, commandError); } catch (error) { observationError = error; }
  const result = evidence ? settleRelease(record.id, evidence, storeDir) : readRelease(record.id, storeDir);
  const states = result.targets.map(target => `${target.id}: ${target.publication}, verification ${target.verification}`).join('; ');
  if (commandError || observationError || result.targets.some(target => target.publication !== 'published' || target.verification !== 'passed')) {
    throw new Error(`Release ${result.id}: ${states}. ${commandError?.message || observationError?.message || 'Resume verification of this operation; do not repeat publication.'}`);
  }
  return result;
}

export function main(args = process.argv.slice(2), storeDir) {
  if (args[0] === '--finish' && args.length === 4 && args[2] === '--evidence') {
    return settleRelease(args[1], readJson(args[3]), storeDir);
  }
  if (args[0] === '--intent' && args.length === 2) {
    const request = readJson(args[1]);
    if (request.id && readRelease(request.id, storeDir)) return beginRelease(request, storeDir);
    return beginRelease(request.retrospective ? request : selectRequest(request, storeDir), storeDir);
  }
  throw new Error('Use --intent request.json or --finish <id> --evidence outcomes.json. This command records releases; use the existing provider deployment route.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify({ ...main(), entryFile: path.join(resolveStoreDir(), 'state.json') }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
