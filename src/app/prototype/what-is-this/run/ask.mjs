// PROTOTYPE: send every case in the manifest to one provider and keep the answers.
//   node src/app/prototype/what-is-this/run/ask.mjs gemini [model]
//   node src/app/prototype/what-is-this/run/ask.mjs muse [model] [effort]
//   node src/app/prototype/what-is-this/run/ask.mjs codex [model] [effort]
// Resumable: a case already answered without an error is skipped.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../../../../artifacts/what-is-this/v2/', import.meta.url).pathname;
const [provider, modelArg, effortArg] = process.argv.slice(2);
const DEFAULT_MODEL = {
  gemini: 'gemini-3.5-flash-lite',
  muse: 'muse-spark-1.3-contributor',
  codex: 'gpt-6-luna',
};
const model = modelArg ?? DEFAULT_MODEL[provider];
const effort = effortArg ?? 'medium';
const QUESTION = 'What is this?';
const { cases } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const outDir = join(root, 'answers', `${provider}__${model}`);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The JSON object inside a reply, tolerating a code fence or a sentence around it. */
function parseReply(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return { parseError: 'no JSON object in reply' };
  try {
    return { parsed: JSON.parse(text.slice(start, end + 1)) };
  } catch (error) {
    return { parseError: String(error) };
  }
}

async function askGemini(entry) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in this shell');
  const parts = [{ text: QUESTION }];
  if (entry.image) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: readFileSync(join(root, entry.image)).toString('base64'),
      },
    });
  }
  // latencyMs: the successful attempt, body included. waitMs: everything a
  // student would have waited, retries and back-off included.
  const firstStarted = Date.now();
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: readFileSync(join(root, entry.prompt), 'utf8') }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      }
    );
    const bodyText = await response.text();
    const latencyMs = Date.now() - started;
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      const hinted = /retry in ([\d.]+)s/i.exec(bodyText)?.[1];
      await sleep(hinted ? parseFloat(hinted) * 1000 + 1000 : 5000 * attempt);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status}: ${bodyText.slice(0, 400)}`);
    const body = JSON.parse(bodyText);
    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    const usage = body.usageMetadata ?? {};
    return {
      text,
      latencyMs,
      waitMs: Date.now() - firstStarted,
      attempts: attempt,
      finishReason: candidate?.finishReason,
      usage: {
        input: usage.promptTokenCount,
        output: usage.candidatesTokenCount,
        reasoning: usage.thoughtsTokenCount ?? 0,
        promptTokens: usage.promptTokenCount,
      },
    };
  }
}

const museCwd = join(root, 'muse-cwd');
mkdirSync(museCwd, { recursive: true });

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Muse's own session log is the only place its token usage is written. */
function museUsage(sessionId) {
  const base = join(homedir(), '.local/share/muse/sessions');
  for (const year of readdirSync(base).filter((d) => /^\d{4}$/.test(d))) {
    for (const month of readdirSync(join(base, year))) {
      for (const day of readdirSync(join(base, year, month))) {
        const file = join(base, year, month, day, sessionId, 'session.jsonl');
        if (!existsSync(file)) continue;
        const totals = { input: 0, output: 0, reasoning: 0, cached: 0, calls: 0 };
        for (const line of readFileSync(file, 'utf8').split('\n')) {
          const match = line.includes('"model_completed"') && /"usage":\s*(\{[^}]*\})/.exec(line);
          if (!match) continue;
          const u = JSON.parse(match[1]);
          totals.input += u.input_tokens;
          totals.output += u.output_tokens;
          totals.reasoning += u.reasoning_tokens ?? 0;
          totals.cached += u.cached_tokens ?? 0;
          totals.calls++;
        }
        return totals;
      }
    }
  }
  return undefined;
}

async function askMuse(entry) {
  const promptFile = join(museCwd, `${entry.key}.txt`);
  writeFileSync(
    promptFile,
    `${readFileSync(join(root, entry.prompt), 'utf8')}\n\nThe student asks: ${QUESTION}\n`
  );
  const args = [
    'exec',
    '--json',
    '--model',
    model,
    '--reasoning-effort',
    effort,
    '--disable-shell',
    '--disable-write',
    '--disable-web-tools',
    '--no-foreign-personal-context',
    '--approval-judge',
    'off',
    '--max-model-steps',
    '1',
    '--prompt-file',
    promptFile,
  ];
  if (entry.image) args.push('--image', join(root, entry.image));
  const started = Date.now();
  const { stdout, stderr, code } = await run('muse', args, museCwd);
  const latencyMs = Date.now() - started;
  let text;
  let failure;
  let sessionId;
  for (const line of stdout.split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!sessionId && event.stream?.kind === 'session') sessionId = event.stream.id;
    if (event.payload_type === 'run.terminal.completed') text = event.payload.text;
    if (event.payload_type === 'run.terminal.failed') failure = event.payload.reason;
  }
  if (text === undefined) throw new Error(failure ?? `muse exited ${code}: ${stderr.slice(-400)}`);
  const usage = sessionId ? museUsage(sessionId) : undefined;
  // Our prompt is roughly what Gemini counted for the same case; the rest of
  // Muse's input is its own agent instructions and tool list.
  return { text: text.trim(), latencyMs, attempts: 1, usage, sessionId };
}

// Outside the repository: Codex reads AGENTS.md from the directory it runs in
// and every parent, which would fold this project's instructions into the prompt.
const codexCwd = join(process.env.TMPDIR ?? '/tmp', 'pmks-what-is-this-codex');
mkdirSync(codexCwd, { recursive: true });

async function askCodex(entry) {
  const args = [
    'exec',
    '-m',
    model,
    '-c',
    `model_reasoning_effort="${effort}"`,
    '-s',
    'read-only',
    '--skip-git-repo-check',
    '--ephemeral',
    '--json',
  ];
  if (entry.image) args.push('-i', join(root, entry.image));
  const prompt = `${readFileSync(join(root, entry.prompt), 'utf8')}\n\nThe student asks: ${QUESTION}\n`;
  const started = Date.now();
  const { stdout, stderr, code } = await new Promise((resolve) => {
    const child = spawn('codex', args, { cwd: codexCwd });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (exit) => resolve({ stdout: out, stderr: err, code: exit }));
    child.stdin.end(prompt);
  });
  const latencyMs = Date.now() - started;
  let text;
  let usage;
  let failure;
  for (const line of stdout.split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'item.completed' && event.item?.type === 'agent_message')
      text = event.item.text;
    if (event.type === 'turn.completed') {
      const u = event.usage;
      usage = {
        input: u.input_tokens,
        cached: u.cached_input_tokens,
        output: u.output_tokens,
        reasoning: u.reasoning_output_tokens ?? 0,
      };
    }
    if (event.type === 'turn.failed') failure = event.error?.message;
  }
  if (text === undefined) throw new Error(failure ?? `codex exited ${code}: ${stderr.slice(-400)}`);
  return { text: text.trim(), latencyMs, attempts: 1, usage };
}

const todo = cases.filter((entry) => {
  if (process.env.ONLY && !entry.key.includes(process.env.ONLY)) return false;
  const file = join(outDir, `${entry.key}.json`);
  return !existsSync(file) || JSON.parse(readFileSync(file, 'utf8')).error;
});
console.log(`${provider} ${model}: ${todo.length} of ${cases.length} cases to ask`);

async function handle(entry) {
  const result = {
    key: entry.key,
    provider,
    model,
    effort: provider === 'gemini' ? undefined : effort,
  };
  try {
    const ask = { gemini: askGemini, muse: askMuse, codex: askCodex }[provider];
    Object.assign(result, await ask(entry));
    Object.assign(result, parseReply(result.text));
  } catch (error) {
    result.error = String(error).slice(0, 600);
  }
  writeFileSync(join(outDir, `${entry.key}.json`), JSON.stringify(result, null, 2));
  console.log(
    `${entry.key}: ${result.error ? 'ERROR ' + result.error.slice(0, 120) : `${result.latencyMs} ms, ${result.parsed ? 'json ok' : result.parseError}`}`
  );
}

if (provider === 'gemini') {
  for (const entry of todo) {
    await handle(entry);
    // 15 requests a minute on Flash-Lite's free tier; PACE_MS=13000 for 5 a minute.
    await sleep(Number(process.env.PACE_MS ?? 4500));
  }
} else {
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) await handle(queue.shift());
    })
  );
}
