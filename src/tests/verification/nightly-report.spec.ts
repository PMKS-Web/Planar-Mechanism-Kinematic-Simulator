import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * The nightly's reporting step, run.
 *
 * It lives inside `e2e-nightly.yml` as a `github-script` body, and a scheduled
 * workflow is read off the default branch — so that file cannot execute at all
 * until a release carries it to `main`. Three defects hid in it for exactly that
 * reason: it filed under a label the repository did not have, it called a run
 * green when every failure had merely passed on the retry, and it named the
 * commit the workflow was read from rather than the one the shards were run
 * against. All three were invisible to every check in this repository.
 *
 * So the script is lifted out and run here against fakes. The lifting is by
 * string offset and will break if the step is renamed or re-indented; it fails
 * loudly when it cannot find the body, rather than passing on an empty string.
 */

const ROOT = resolve(__dirname, '../../..');
const MARKER = '          script: |\n';

/** The `github-script` body, dedented. */
function reportScript(): string {
  const yaml = readFileSync(resolve(ROOT, '.github/workflows/e2e-nightly.yml'), 'utf8');
  const at = yaml.indexOf(MARKER);
  expect(at, 'e2e-nightly.yml no longer has a `script: |` block to lift').toBeGreaterThan(-1);
  const lines: string[] = [];
  for (const line of yaml.slice(at + MARKER.length).split('\n')) {
    if (line.trim() !== '' && !line.startsWith('            ')) break;
    lines.push(line.slice(12));
  }
  const body = lines.join('\n');
  expect(body).toContain('issues.create');
  return body;
}

type Result = { name: string; code: number; seconds: number; flaky: boolean };
type Call = { what: string; name?: string; body?: string; state?: string };

/**
 * The script must take everything through the environment and nothing through
 * `${{ }}`. GitHub pastes an expression in as raw text, so a branch called
 * `fix/o'hare` — a name whoever opens a pull request chooses — would close the
 * string it landed in and the step would not parse. A test that filled these in
 * with `JSON.stringify` would escape that apostrophe and hide exactly the
 * defect, so this fills nothing in: it refuses a script with an expression in it.
 */
function assertNoInterpolation(source: string) {
  expect(
    source.includes('${{'),
    'this script takes a workflow expression directly; pass it through `env:` instead'
  ).toBe(false);
}

const passed: Result = { name: 'a', code: 0, seconds: 4, flaky: false };
const failed: Result = { name: 'b', code: 1, seconds: 9, flaky: false };
const flaked: Result = { name: 'c', code: 0, seconds: 9, flaky: true };

const MAIN_SHA = 'aaaaaaaaaaaaaaaa';
const STAGING_SHA = 'bbbbbbbbbbbbbbbb';

/** Run the step, and report what it tried to do to the issue tracker. */
async function report(options: {
  results?: Result[];
  issueOpen?: boolean;
  shards?: string;
  lane?: string;
  ref?: string;
  shardsReporting?: number;
}): Promise<Call[]> {
  const dir = resolve(tmpdir(), `nightly-report-${Math.random().toString(36).slice(2)}`);
  // A real run writes one report per shard. `shardsReporting` is how many of the
  // eight actually made it back, so a partial artifact download can be staged.
  const of = 8;
  const reporting = options.shardsReporting ?? of;
  for (let shard = 1; shard <= reporting && options.results; shard++) {
    mkdirSync(resolve(dir, `collected/e2e-nightly-${shard}`), { recursive: true });
    writeFileSync(
      resolve(dir, `collected/e2e-nightly-${shard}/report-${shard}-of-${of}.json`),
      JSON.stringify({
        lane: 'nightly',
        shardIndex: shard,
        shardCount: of,
        // Only the first shard carries the scenario; the rest are quietly green,
        // so what any test is about is the one shard it described.
        results: shard === 1 ? options.results : [passed],
      })
    );
  }
  mkdirSync(resolve(dir, 'collected'), { recursive: true });

  const calls: Call[] = [];
  const record =
    (what: string) =>
    async (args: Record<string, unknown>): Promise<{ data: unknown }> => {
      calls.push({ what, ...(args as object) } as Call);
      return { data: {} };
    };
  const github = {
    rest: {
      issues: {
        listForRepo: async () => ({ data: options.issueOpen ? [{ number: 7 }] : [] }),
        // The repository has no such label until the step makes one.
        getLabel: async () => {
          throw Object.assign(new Error('Not Found'), { status: 404 });
        },
        createLabel: record('createLabel'),
        create: record('createIssue'),
        update: record('updateIssue'),
        createComment: record('comment'),
      },
    },
  };
  const context = {
    repo: { owner: 'o', repo: 'r' },
    sha: MAIN_SHA,
    runId: 1,
    serverUrl: 'https://github.com',
  };

  const summary: string[] = [];
  const core = {
    notice: () => undefined,
    summary: {
      addRaw: (text: string) => {
        summary.push(text);
        return core.summary;
      },
      write: async () => undefined,
    },
  };

  const source = reportScript();
  assertNoInterpolation(source);
  const env: Record<string, string> = {
    SHARD_RESULT: options.shards ?? 'success',
    TESTED_SHA: STAGING_SHA,
    LANE: options.lane ?? 'nightly',
    REF: options.ref ?? 'staging',
  };

  const was = process.cwd();
  const restore = { ...process.env };
  Object.assign(process.env, env);
  process.chdir(dir);
  try {
    // Reached through a string, because the test build downlevels a literal
    // `async () => {}` into something whose constructor is plain `Function` --
    // and the lifted script has top-level `await` in it, which that cannot parse.
    const AsyncFunction = new Function(
      'return Object.getPrototypeOf(async function () {}).constructor'
    )();
    await new AsyncFunction('github', 'context', 'core', 'require', source)(
      github,
      context,
      core,
      (name: string) => (name === 'fs' ? nodeFs : nodePath)
    );
    calls.push(...summary.map((text) => ({ what: 'summary', body: text })));
  } finally {
    process.chdir(was);
    for (const key of Object.keys(env)) delete process.env[key];
    Object.assign(process.env, restore);
    rmSync(dir, { recursive: true, force: true });
  }
  return calls;
}

const did = (calls: Call[], what: string) => calls.filter((call) => call.what === what);
const bodyOf = (calls: Call[]) => calls.map((call) => call.body ?? '').join('\n');

describe('the nightly e2e report', () => {
  // A branch name is chosen by whoever opens the pull request, so it may not be
  // pasted into the script as text. Its own check, because it reads as a style
  // point and is the one thing here that stops a run parsing at all.
  it('takes nothing through a workflow expression', () => {
    assertNoInterpolation(reportScript());
  });

  it('survives a branch name with an apostrophe in it', async () => {
    const calls = await report({ results: [failed], shards: 'failure', ref: "fix/o'hare" });
    expect(bodyOf(did(calls, 'summary'))).toContain('**Failed (1)**');
  });

  it('files nothing when every suite passed and nothing was open', async () => {
    const calls = await report({ results: [passed, passed] });
    // It still says so on its own run page; what it must not do is raise anything.
    expect(calls.filter((call) => call.what !== 'summary')).toEqual([]);
    expect(bodyOf(did(calls, 'summary'))).toContain('passed');
  });

  it('closes the open issue when the batch comes back green', async () => {
    const calls = await report({ results: [passed], issueOpen: true });
    expect(did(calls, 'comment')).toHaveLength(1);
    expect(did(calls, 'updateIssue')[0].state).toBe('closed');
  });

  it('makes the label it files under, because the repository has none', async () => {
    const calls = await report({ results: [passed, failed], shards: 'failure' });
    expect(did(calls, 'createLabel')[0].name).toBe('nightly-e2e');
    // And in that order: an issue cannot carry a label that does not exist yet.
    expect(calls.findIndex((c) => c.what === 'createLabel')).toBeLessThan(
      calls.findIndex((c) => c.what === 'createIssue')
    );
  });

  // The retry exists to tell a break from a flake. A run whose every failure
  // passed second time has nothing red in it and is precisely what the retry was
  // added to name -- reporting it as green throws away the only record of it.
  it('does not call a run green when every failure passed on the retry', async () => {
    const calls = await report({ results: [passed, flaked] });
    expect(did(calls, 'createIssue')).toHaveLength(1);
    expect(bodyOf(calls)).toContain('**Flaky (1)**');
    expect(did(calls, 'updateIssue')).toEqual([]);
  });

  it('updates the standing issue rather than filing a second one', async () => {
    const calls = await report({ results: [flaked], issueOpen: true });
    expect(did(calls, 'createIssue')).toEqual([]);
    expect(did(calls, 'updateIssue')).toHaveLength(1);
  });

  it('names the commit the shards ran against, not the one the schedule read', async () => {
    const failing = bodyOf(await report({ results: [failed], shards: 'failure' }));
    const closing = bodyOf(await report({ results: [passed], issueOpen: true }));
    for (const body of [failing, closing]) {
      expect(body).toContain(STAGING_SHA.slice(0, 8));
      expect(body).not.toContain(MAIN_SHA.slice(0, 8));
    }
  });

  // `workflow_dispatch` takes a lane and a branch. The issue stands for the whole
  // batch on staging, so a run of something else has not tested what it is about.
  it('leaves the standing issue alone when dispatched with the gate lane', async () => {
    const calls = await report({ results: [failed], shards: 'failure', lane: 'gate' });
    expect(did(calls, 'createIssue')).toEqual([]);
    expect(did(calls, 'updateIssue')).toEqual([]);
    expect(bodyOf(did(calls, 'summary'))).toContain('**Failed (1)**');
  });

  it('does not close the standing issue from a green run of another branch', async () => {
    const calls = await report({ results: [passed], issueOpen: true, ref: 'some-branch' });
    expect(did(calls, 'comment')).toEqual([]);
    expect(did(calls, 'updateIssue')).toEqual([]);
  });

  // Collecting the artifacts is `continue-on-error`, so half a batch arrives
  // looking like a small clean one. A shard exiting zero does not mean it held
  // no flake, so its silence cannot be read as good news.
  it('will not call a half-collected batch clean', async () => {
    const calls = await report({ results: [passed], issueOpen: true, shardsReporting: 3 });
    expect(did(calls, 'updateIssue')[0]?.state).not.toBe('closed');
    expect(bodyOf(calls)).toContain('not the whole batch');
    expect(bodyOf(calls)).toContain('3 of 8');
  });

  it('names the shards it never heard from', async () => {
    const calls = await report({ results: [passed], shardsReporting: 6 });
    expect(bodyOf(calls)).toContain('nothing from 7, 8');
  });

  it('says so when no shard reported at all, rather than claiming a clean sweep', async () => {
    const calls = await report({ shards: 'failure' });
    expect(bodyOf(calls)).toContain('No shard reported');
  });
});
