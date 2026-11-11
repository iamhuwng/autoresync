import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { normalizeChangeIds } from './releaseChangelog.mjs';

export const masterPath = 'documentation/architecture/master_changelog.md';
const directory = 'documentation/architecture/changelog/';
const git = (cwd, args, allowEmpty = false) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error || (result.status !== 0 && !(allowEmpty && result.status === 1))) {
    throw new Error(`Change records: ${result.error?.message || result.stderr?.trim() || 'Git failed'}`);
  }
  return result.stdout;
};

export function readChangeRecords(cwd, revision) {
  const read = file => revision ? git(cwd, ['show', `${revision}:${file}`]) : readFileSync(path.join(cwd, file), 'utf8');
  const master = read(masterPath);
  const headers = revision
    ? git(cwd, ['grep', '-n', '^Changelog ID:', revision, '--', directory, `:(exclude)${directory}README.md`], true).split(/\r?\n/u).filter(Boolean)
      .map(line => {
        const match = line.match(/^[^:]+:(.+):\d+:Changelog ID:\s*`([^`]+)`/u);
        if (!match) throw new Error('Change records: malformed source header');
        return [match[1], match[2]];
      })
    : readdirSync(path.join(cwd, directory)).filter(file => file.endsWith('.md') && file !== 'README.md').map(file => {
      const target = directory + file, matches = [...read(target).matchAll(/^Changelog ID:\s*`([^`]+)`/gmu)];
      if (matches.length !== 1) throw new Error(`Change records: ${target} needs one CL header`);
      return [target, matches[0][1]];
    });
  const records = new Map();
  if (revision) {
    const files = git(cwd, ['ls-tree', '-r', '--name-only', revision, '--', directory]).trim().split(/\r?\n/u)
      .filter(file => file.endsWith('.md') && file !== `${directory}README.md`);
    if (files.length !== headers.length || new Set(headers.map(([file]) => file)).size !== files.length) {
      throw new Error('Change records: every source detail needs one CL header');
    }
  }
  for (const [file, id] of headers) {
    normalizeChangeIds([id]);
    if (records.has(id)) throw new Error(`Change records: duplicate ${id}`);
    records.set(id, { id, path: file });
  }
  const indexed = new Set();
  for (const match of master.matchAll(/\[`(CL-[^`]+)`\]\((changelog\/[^)]+)\)/gu)) {
    const [, id, relative] = match;
    if (indexed.has(id) || records.get(id)?.path !== `documentation/architecture/${relative}`) {
      throw new Error(`Change records: duplicate, missing or mismatched Master entry ${id}`);
    }
    indexed.add(id);
    const end = master.indexOf('\n', match.index);
    records.get(id).summary = master.slice(match.index, end < 0 ? master.length : end).split('|').at(-2)?.trim() || id;
  }
  if (indexed.size !== records.size) throw new Error('Change records: every CL detail needs one Master entry');
  return records;
}

export function validateSourceChanges(cwd, revision, ids) {
  const selected = normalizeChangeIds(ids), records = readChangeRecords(cwd, revision);
  for (const id of selected) if (!records.has(id)) throw new Error(`Change records: unknown ${id} at source ${revision}`);
  return selected;
}

export function reviewedChanges(cwd, revision, review, required = false) {
  if (review?.changeIds === undefined) {
    if (required) throw new Error('Release scope needs changeIds in the existing exact-source compatibility review; use [] with changelogNotApplicable for non-meaningful changes.');
    return undefined;
  }
  const changeIds = validateSourceChanges(cwd, revision, review.changeIds);
  const reason = review.changelogNotApplicable;
  if (!changeIds.length && (typeof reason !== 'string' || !reason.trim() || reason.length > 1000)) {
    throw new Error('Empty changeIds require a concise changelogNotApplicable reason');
  }
  if (changeIds.length && reason !== undefined) throw new Error('Select changeIds or changelogNotApplicable, not both');
  return { changeIds, ...(reason === undefined ? {} : { changelogNotApplicable: reason }) };
}

export function suggestChanges(cwd, base, revision) {
  const records = readChangeRecords(cwd, revision);
  const changed = new Set(git(cwd, ['diff', '--name-only', '--no-renames', base, revision, '--', directory]).trim().split(/\r?\n/u));
  return [...records.values()].filter(record => changed.has(record.path));
}
