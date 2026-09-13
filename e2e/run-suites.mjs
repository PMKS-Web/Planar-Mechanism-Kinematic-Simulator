/**
 * Runs a lane of e2e suites, in shards, and says what happened.
 *
 * There is no test runner here: each suite is a standalone Node script that
 * prints PASS/FAIL lines and exits non-zero. That is fine to run one at a time
 * by hand and useless to a CI job, which needs to split about ninety of them
 * across several machines, keep the logs apart, and report once at the end.
 * This is that missing piece, and nothing more — it starts no browser and knows
 * nothing about the app.
 *
 * Which suites exist, and which lane each belongs to, is `suites.mjs`.
 *
 *   node e2e/run-suites.mjs --lane gate
 *   node e2e/run-suites.mjs --lane nightly --shard 3/8
 *   node e2e/run-suites.mjs --only playback --retries 1
 *   node e2e/run-suites.mjs --list --lane nightly
 *
 * Shards are balanced by each suite's recorded `seconds`, longest first, so
 * eight shards finish at about the same time rather than seven finishing in two
 * minutes and the eighth carrying `mobile.mjs` alone. A recorded number that
 * has gone stale costs balance, never correctness — and the run says so, so the
 * number can be corrected.
 *
 * Retries are opt-in and default to none. A gate that retries until it is green
 * reports the same thing whether the app works or not; the nightly lane passes
 * `--retries 1` so it can tell "broken" from "flaky" and name which.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { SUITES, lanesOf } from './suites.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (argv[at + 1] ?? fallback);
};
const has = (name) => argv.includes(`--${name}`);

const lane = flag('lane', 'gate');
const only = flag('only', '');
const retries = Number(flag('retries', 0));
const [shardIndex, shardCount] = flag('shard', '1/1').split('/').map(Number);
const outDir = flag('out', 'artifacts/e2e-run');

if (!lanesOf().includes(lane)) {
  console.error(`Unknown lane "${lane}". Lanes: ${lanesOf().join(', ')}`);
  process.exit(2);
}
if (!(shardIndex >= 1 && shardIndex <= shardCount)) {
  console.error(`--shard wants i/N with 1 <= i <= N, got ${shardIndex}/${shardCount}`);
  process.exit(2);
}

/** Longest first, each suite to whichever shard is least loaded so far. */
function shard(suites, index, count) {
  const bins = Array.from({ length: count }, () => ({ load: 0, suites: [] }));
  for (const suite of [...suites].sort((a, b) => b.seconds - a.seconds)) {
    const lightest = bins.reduce((a, b) => (b.load < a.load ? b : a));
    lightest.suites.push(suite);
    lightest.load += suite.seconds;
  }
  return bins[index - 1];
}

const wanted = SUITES.filter((suite) => suite.lanes.includes(lane)).filter(
  (suite) => !only || only.split(',').some((part) => suite.name.includes(part.trim()))
);
// Nothing to run and a clean exit look the same from outside, and a `--only`
// that matches nothing is a typo, not a pass.
if (wanted.length === 0) {
  console.error(`Nothing in lane "${lane}"${only ? ` matches --only ${only}` : ''}.`);
  process.exit(2);
}
const mine = shard(wanted, shardIndex, shardCount);

if (has('list')) {
  for (const suite of mine.suites)
    console.log(`${suite.name}\t${suite.seconds}s\t${suite.note ?? ''}`);
  console.log(`\n${mine.suites.length} suites, about ${Math.round(mine.load / 60)} minutes`);
  process.exit(0);
}

await mkdir(outDir, { recursive: true });

const label = shardCount > 1 ? `shard ${shardIndex}/${shardCount} of ${lane}` : `lane ${lane}`;
console.log(
  `${label}: ${mine.suites.length} suites, about ${Math.round(mine.load / 60)} minutes\n`
);

/** One attempt. Resolves with the exit code; the log is on disk either way. */
function attempt(suite, logPath, append) {
  return new Promise((resolve) => {
    const log = createWriteStream(logPath, { flags: append ? 'a' : 'w' });
    const child = spawn(process.execPath, [path.join('e2e', `${suite.name}.mjs`)], {
      env: { ...process.env, ...suite.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // `end: false` on both, or whichever stream finishes first closes the file
    // under the other one and the run loses half its own log.
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('close', (code) => log.end(() => resolve(code ?? 1)));
  });
}

const results = [];
for (const suite of mine.suites) {
  const logPath = path.join(outDir, `${suite.name}.log`);
  const started = Date.now();
  // Said before it starts, not only after: the slowest suite here is a quarter
  // of an hour, and a CI log that has printed nothing for that long reads as
  // hung to whoever is watching it.
  console.log(`      ${suite.name} (about ${suite.seconds}s)`);
  let code = await attempt(suite, logPath, false);
  let flaky = false;
  for (let left = retries; left > 0 && code !== 0; left--) {
    console.log(`  retrying ${suite.name}`);
    code = await attempt(suite, logPath, true);
    flaky = code === 0;
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ name: suite.name, code, seconds, flaky, expected: suite.seconds });
  const verdict = code === 0 ? (flaky ? 'FLAKY' : 'ok   ') : 'FAILED';
  console.log(`${verdict}  ${suite.name}  ${seconds}s`);
}

const failed = results.filter((r) => r.code !== 0);
const flaky = results.filter((r) => r.flaky);
// A recorded estimate that has drifted only unbalances the shards, so it is
// worth saying out loud and not worth failing over.
const drifted = results.filter((r) => r.seconds > Math.max(30, r.expected * 2));

await writeFile(
  path.join(outDir, `report-${shardIndex}-of-${shardCount}.json`),
  JSON.stringify({ lane, shardIndex, shardCount, results }, null, 2)
);

console.log(`\n${results.length - failed.length}/${results.length} suites passed`);
if (flaky.length) console.log(`flaky (passed on a retry): ${flaky.map((r) => r.name).join(', ')}`);
if (failed.length) console.log(`failed: ${failed.map((r) => r.name).join(', ')}`);
if (drifted.length) {
  console.log(
    `\nslower than suites.mjs records, so the shards were unbalanced — update the numbers:\n` +
      drifted.map((r) => `  ${r.name}: ${r.expected}s recorded, ${r.seconds}s measured`).join('\n')
  );
}

// Set rather than exited on: `process.exit` can cut a pipe mid-write, and the
// last thing written here is the summary someone has to read.
process.exitCode = failed.length ? 1 : 0;
