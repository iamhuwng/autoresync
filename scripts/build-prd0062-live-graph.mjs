import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outputArg = process.argv[2];
if (!outputArg) {
  throw new Error('usage: node scripts/build-prd0062-live-graph.mjs <output.json>');
}

const issues = JSON.parse(execFileSync('gh', [
  'issue', 'list', '--state', 'all', '--limit', '500',
  '--json', 'number,title,state,url,body',
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
  .filter((issue) => /^PRD0062\b/u.test(issue.title))
  .sort((left, right) => left.number - right.number);

const numbers = new Set(issues.map((issue) => issue.number));
const rawEdges = [];
const direct = new Map();
for (const issue of issues) {
  const blockedLine = issue.body.match(/\*\*Blocked by:\*\*([\s\S]*?)(?:\r?\n\r?\n|$)/u)?.[1] ?? '';
  const prerequisites = [];
  for (const match of blockedLine.matchAll(/\/issues\/(\d+)/gu)) {
    const prerequisite = Number(match[1]);
    rawEdges.push([prerequisite, issue.number]);
    prerequisites.push(prerequisite);
  }
  direct.set(issue.number, prerequisites);
}

const missingReferences = [...new Set(rawEdges
  .flatMap(([from, to]) => [from, to])
  .filter((number) => !numbers.has(number)))]
  .sort((left, right) => left - right);
const edgeKeys = rawEdges.map(([from, to]) => `${from}->${to}`);
const duplicateEdges = [...new Set(edgeKeys.filter((edge, index) => edgeKeys.indexOf(edge) !== index))];
const uniqueEdges = [...new Set(edgeKeys)].map((edge) => edge.split('->').map(Number));

const visitState = new Map();
const stack = [];
const cycles = [];
const visit = (number) => {
  if (visitState.get(number) === 2) return;
  if (visitState.get(number) === 1) {
    const start = stack.indexOf(number);
    cycles.push([...stack.slice(start), number]);
    return;
  }
  visitState.set(number, 1);
  stack.push(number);
  for (const prerequisite of direct.get(number) ?? []) {
    if (numbers.has(prerequisite)) visit(prerequisite);
  }
  stack.pop();
  visitState.set(number, 2);
};
for (const issue of issues) visit(issue.number);

const transitiveMemo = new Map();
const transitive = (number, active = new Set()) => {
  if (transitiveMemo.has(number)) return transitiveMemo.get(number);
  if (active.has(number)) return new Set();
  const nextActive = new Set(active).add(number);
  const result = new Set();
  for (const prerequisite of direct.get(number) ?? []) {
    result.add(prerequisite);
    for (const nested of transitive(prerequisite, nextActive)) result.add(nested);
  }
  transitiveMemo.set(number, result);
  return result;
};

const descendants = new Map(issues.map((issue) => [issue.number, new Set()]));
for (const issue of issues) {
  for (const prerequisite of transitive(issue.number)) {
    descendants.get(prerequisite)?.add(issue.number);
  }
}

const closed = new Set(issues.filter((issue) => issue.state === 'CLOSED').map((issue) => issue.number));
const records = issues.map((issue) => {
  const transitivePrerequisites = [...transitive(issue.number)].sort((left, right) => left - right);
  const openTransitivePrerequisites = transitivePrerequisites.filter((number) => !closed.has(number));
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.url,
    directPrerequisites: [...(direct.get(issue.number) ?? [])].sort((left, right) => left - right),
    transitivePrerequisites,
    openTransitivePrerequisites,
    graphClear: issue.state === 'OPEN' && openTransitivePrerequisites.length === 0,
    downstreamLeverage: descendants.get(issue.number)?.size ?? 0,
  };
});

const indegree = new Map(issues.map((issue) => [issue.number, 0]));
const outgoing = new Map(issues.map((issue) => [issue.number, []]));
for (const [from, to] of uniqueEdges) {
  if (!numbers.has(from) || !numbers.has(to)) continue;
  outgoing.get(from).push(to);
  indegree.set(to, indegree.get(to) + 1);
}
const queue = [...indegree].filter(([, degree]) => degree === 0).map(([number]) => number);
let topologicalCoverage = 0;
while (queue.length) {
  const number = queue.shift();
  topologicalCoverage += 1;
  for (const child of outgoing.get(number) ?? []) {
    indegree.set(child, indegree.get(child) - 1);
    if (indegree.get(child) === 0) queue.push(child);
  }
}

const issueHash = createHash('sha256').update(JSON.stringify(issues.map((issue) => ({
  number: issue.number,
  title: issue.title,
  state: issue.state,
  body: issue.body,
})))).digest('hex');
const output = {
  generatedAt: new Date().toISOString(),
  source: 'live GitHub issue bodies via gh issue list --state all --limit 500',
  issueHash,
  issueCount: issues.length,
  openCount: issues.filter((issue) => issue.state === 'OPEN').length,
  closedCount: issues.filter((issue) => issue.state === 'CLOSED').length,
  rawEdgeCount: rawEdges.length,
  uniqueEdgeCount: uniqueEdges.length,
  missingReferences,
  duplicateEdges,
  cycles,
  topologicalCoverage,
  graphClearFrontier: records.filter((record) => record.graphClear).map((record) => record.number),
  records,
};

writeFileSync(resolve(outputArg), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  output: resolve(outputArg),
  issueHash,
  issueCount: output.issueCount,
  openCount: output.openCount,
  closedCount: output.closedCount,
  rawEdgeCount: output.rawEdgeCount,
  uniqueEdgeCount: output.uniqueEdgeCount,
  missingReferences: missingReferences.length,
  duplicateEdges: duplicateEdges.length,
  cycles: cycles.length,
  topologicalCoverage,
  graphClearFrontier: output.graphClearFrontier,
}, null, 2));
