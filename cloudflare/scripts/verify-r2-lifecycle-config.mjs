import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const durablePrefixes = [
  'assessment-assets/',
  'assessment-assets/listening/',
  'audio/',
  'images/',
  'avatars/',
  'book-covers/',
  'announcements/',
];

export function validateR2LifecycleConfig(config) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.rules)) {
    throw new Error('R2 lifecycle config must contain rules array');
  }
  const enabledRules = config.rules.filter((rule) => rule?.enabled === true);
  if (enabledRules.length !== 1) {
    throw new Error('R2 lifecycle config must contain exactly one enabled temp/ rule');
  }
  const [rule] = enabledRules;
  const prefix = rule.conditions?.prefix;
  const maxAge = rule.deleteObjectsTransition?.condition?.maxAge;
  const conditionType = rule.deleteObjectsTransition?.condition?.type;
  if (prefix !== 'temp/' || conditionType !== 'Age' || maxAge !== 86400) {
    throw new Error('R2 lifecycle config must expire only temp/ after 86400 seconds');
  }
  for (const candidate of config.rules) {
    const candidatePrefix = candidate?.conditions?.prefix;
    if (durablePrefixes.includes(candidatePrefix)) {
      throw new Error(`R2 lifecycle config must not target durable prefix ${candidatePrefix}`);
    }
  }
  return {
    ruleId: rule.id,
    prefix,
    maxAge,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configPath = process.argv[2] ?? 'cloudflare/r2-lifecycle.temp-24h.json';
  const parsed = JSON.parse(readFileSync(resolve(configPath), 'utf8'));
  const result = validateR2LifecycleConfig(parsed);
  console.log(`R2 lifecycle config OK: ${result.ruleId} ${result.prefix} ${result.maxAge}s`);
}
