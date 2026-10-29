import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { beginRelease, readRelease, selectDescription, settleRelease, resolveStoreDir } from './lib/releaseChangelog.mjs';

const readJson = file => JSON.parse(readFileSync(path.resolve(file), 'utf8'));

export async function executeRecordedOperation(request, { execute, observe, storeDir } = {}) {
  const selected = selectDescription({ description: request.description,
    targets: request.targets.map(({ id, binding }) => ({ id, binding })) }, storeDir);
  const record = beginRelease({ ...(request.id ? { id: request.id } : {}), description: selected.description,
    targets: request.targets, evidenceRefs: request.evidenceRefs }, storeDir, { requireNew: true });
  console.log(`[Changelog] ${record.id}: ${path.join(storeDir ?? resolveStoreDir(), 'state.json')}`);
  let commandError;
  try { await execute(record); } catch (error) { commandError = error; }
  let evidence;
  let observationError;
  try { evidence = await observe?.(record, commandError); } catch (error) { observationError = error; }
  const result = evidence ? settleRelease(record.id, evidence, storeDir) : readRelease(record.id, storeDir);
  const states = result.targets.map(target => `${target.id}: ${target.publication}, verification ${target.verification}`).join('; ');
  if (commandError || observationError || result.targets.some(target => target.publication === 'unconfirmed' || target.verification === 'failed')) {
    throw new Error(`Release ${result.id}: ${states}. ${commandError?.message || observationError?.message || 'Publication requires provider evidence; finish this recorded intent after the existing readback.'}`);
  }
  return result;
}

export function main(args = process.argv.slice(2), storeDir) {
  if (args[0] === '--finish' && args.length === 4 && args[2] === '--evidence') {
    return settleRelease(args[1], readJson(args[3]), storeDir);
  }
  if (args[0] === '--intent' && args.length === 2) {
    const request = readJson(args[1]);
    const description = request.retrospective ? request.description : selectDescription({ description: request.description,
      targets: request.targets.map(({ id, binding }) => ({ id, binding })) }, storeDir).description;
    return beginRelease({ id: request.id, description, targets: request.targets, evidenceRefs: request.evidenceRefs, retrospective: request.retrospective }, storeDir);
  }
  throw new Error('Use --intent request.json or --finish <id> --evidence outcomes.json. This command records releases; use the existing provider deployment route.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify({ ...main(), entryFile: path.join(resolveStoreDir(), 'state.json') }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
