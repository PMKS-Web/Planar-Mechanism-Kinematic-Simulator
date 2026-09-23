/**
 * PROTOTYPE -- a bare Gemini REST call, for running headlessly from Node.
 *
 * A browser build must never hold this key: a real feature calls through a
 * server-side function (see "Service and rollout" in the plan).
 */
const API = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiReply {
  model: string;
  text: string;
  finishReason: string;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
}

/** The stable, full-size Flash models the key can call, newest first. */
export async function flashModelsNewestFirst(key: string): Promise<string[]> {
  const response = await fetch(`${API}/models?pageSize=1000`, {
    headers: { 'x-goog-api-key': key },
  });
  if (!response.ok)
    throw new Error(`listing models failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as {
    models: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const flash = body.models
    .map((m) => ({
      id: m.name.replace(/^models\//, ''),
      methods: m.supportedGenerationMethods ?? [],
    }))
    .filter((m) => m.methods.includes('generateContent') && /^gemini-[\d.]+-flash$/.test(m.id))
    .map((m) => m.id)
    .sort((a, b) => parseFloat(b.slice(7)) - parseFloat(a.slice(7)));
  if (!flash.length) {
    throw new Error(
      `no stable gemini-N-flash model offered: ${body.models.map((m) => m.name).join(', ')}`
    );
  }
  return flash;
}

export async function askGemini(
  key: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<GeminiReply> {
  const started = Date.now();
  const response = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    }),
  });
  const latencyMs = Date.now() - started;
  if (!response.ok)
    throw new Error(`${model} answered ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const candidate = body.candidates?.[0];
  return {
    model,
    text: (candidate?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim(),
    finishReason: candidate?.finishReason ?? 'none',
    latencyMs,
    promptTokens: body.usageMetadata?.promptTokenCount,
    outputTokens: body.usageMetadata?.candidatesTokenCount,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The free tier allows a handful of requests a minute and answers 503 when the
 * model is busy, so a run of ten has to wait its turn: a 429 is retried after
 * the delay Google names, a 503 after a growing back-off.
 */
export async function askGeminiPatiently(
  key: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  attempts = 8
): Promise<GeminiReply & { attempts: number; waitedMs: number }> {
  let waitedMs = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      return {
        ...(await askGemini(key, model, systemPrompt, userMessage)),
        attempts: attempt,
        waitedMs,
      };
    } catch (error) {
      const message = String(error);
      const status = /answered (\d{3})/.exec(message)?.[1];
      if (attempt >= attempts || (status !== '429' && status !== '503' && status !== '500'))
        throw error;
      const hinted = /retry in ([\d.]+)s/i.exec(message)?.[1];
      const wait = hinted
        ? Math.ceil(parseFloat(hinted) * 1000) + 1000
        : Math.min(60000, 4000 * 2 ** (attempt - 1));
      waitedMs += wait;
      await sleep(wait);
    }
  }
}

/**
 * The newest Flash first; when it stays busy or out of quota, the next newest.
 * Each Gemini model has its own free-tier quota and its own load.
 */
export async function askFirstAvailable(
  key: string,
  models: string[],
  systemPrompt: string,
  userMessage: string
): Promise<GeminiReply & { attempts: number; waitedMs: number; skipped: string[] }> {
  const skipped: string[] = [];
  for (const model of models) {
    try {
      return { ...(await askGeminiPatiently(key, model, systemPrompt, userMessage, 3)), skipped };
    } catch (error) {
      skipped.push(
        `${model}: ${String(error).match(/answered (\d{3})/)?.[1] ?? String(error).slice(0, 80)}`
      );
    }
  }
  throw new Error(`every model refused -- ${skipped.join('; ')}`);
}
