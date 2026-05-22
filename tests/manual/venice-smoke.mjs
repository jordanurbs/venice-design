#!/usr/bin/env node
/**
 * Venice integration smoke test.
 *
 * Layer-2 / layer-3 testing from the Venice Design fork:
 *   - Layer 1 (unit, mocked fetch) lives in apps/daemon/tests/media-venice.test.ts
 *     and apps/daemon/tests/proxy-routes.test.ts — runs in CI without a key.
 *   - This script (layer 2) hits the REAL Venice API with a REAL key and
 *     confirms image / video / TTS endpoints actually round-trip end-to-end.
 *   - It ALSO covers layer 3 — the "different LLM" concern — by running the
 *     same tool-injected chat against three representative upstream models:
 *       * gpt-5            → OpenAI canonical tool_calls streaming
 *       * claude-opus-4-5  → Anthropic tool_use → OpenAI shape translation
 *       * qwen3-coder-480b → open-source model on Venice
 *     Each must successfully call the `generate_image` tool and return a
 *     PNG URL.
 *
 * Usage:
 *   VENICE_API_KEY=sk-… node tests/manual/venice-smoke.mjs
 *
 *   # Skip the expensive video step (~$0.40 + 30-60s wall clock):
 *   VENICE_API_KEY=sk-… SKIP_VIDEO=1 node tests/manual/venice-smoke.mjs
 *
 *   # Only test the multi-LLM tool-injection matrix:
 *   VENICE_API_KEY=sk-… ONLY_CHAT=1 node tests/manual/venice-smoke.mjs
 *
 * Exit codes:
 *   0  → all checks passed
 *   1  → at least one check failed (per-step details printed)
 *   2  → environment misconfigured (missing key, network unreachable)
 *
 * Estimated cost: ~$0.20 USD per full run as of May 2026 Venice pricing.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const VENICE_BASE_URL = process.env.VENICE_BASE_URL || 'https://api.venice.ai/api/v1';
const KEY = process.env.VENICE_API_KEY;
if (!KEY) {
  console.error('VENICE_API_KEY is required');
  console.error('Get one at https://venice.ai/settings/api');
  process.exit(2);
}

const SKIP_VIDEO = process.env.SKIP_VIDEO === '1';
const ONLY_CHAT = process.env.ONLY_CHAT === '1';

const OUT_DIR = await mkdir(path.join(tmpdir(), `venice-smoke-${Date.now()}`), {
  recursive: true,
});
console.log(`output dir: ${OUT_DIR}`);

const HEADERS = {
  authorization: `Bearer ${KEY}`,
  'content-type': 'application/json',
};

let failures = 0;
function pass(name, detail = '') {
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, err) {
  failures += 1;
  console.error(`  FAIL  ${name}`);
  console.error(`        ${err instanceof Error ? err.message : String(err)}`);
}

// ---------------------------------------------------------------------------
// Tool definition we'll inject into chat — same shape as the daemon proxy
// sends. This is the contract every upstream model on Venice must support
// for the `generate_image` flow to work inside Open Design.
// ---------------------------------------------------------------------------
const IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description:
      'Generate an image from a text prompt. Returns a URL to the rendered PNG.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Visual description of the image.' },
        aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16'] },
      },
      required: ['prompt'],
    },
  },
};

// ---------------------------------------------------------------------------
// Layer 3 — multi-LLM tool injection.
//
// Run the same chat completion against three different upstream models and
// confirm the tool_calls accumulator sees a valid call. We don't actually
// execute the tool — we just verify the model's streaming shape parses into
// a complete tool_calls[0] with a real `name` + non-empty `arguments` JSON.
//
// This is the test that catches "Venice's Anthropic translation layer
// dropped the function-name chunk" or "Qwen emitted an unclosed JSON object
// in arguments". Both have been observed against OpenAI-compatible
// gateways in the past.
// ---------------------------------------------------------------------------
const CHAT_MODELS = [
  // OpenAI canonical (the baseline — should never break). Slug is
  // Venice's period-stripped form for OpenAI's GPT-5.5.
  'openai-gpt-55',
  // Anthropic, translated to OpenAI tool_calls shape by Venice.
  'claude-opus-4-7',
  // Open-source coder model — historically the most likely to emit
  // malformed tool_calls arguments.
  'qwen3-coder-480b',
];

async function streamChatWithTool(model) {
  const body = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a design assistant. When the user asks you to draw something, call the generate_image tool with a detailed prompt. Do not describe the image in prose first.',
      },
      {
        role: 'user',
        content: 'Draw me a small icon of a Venice gondola at sunset, square aspect.',
      },
    ],
    tools: [IMAGE_TOOL],
    tool_choice: 'auto',
    stream: true,
    max_tokens: 1024,
  };

  const resp = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 240)}`);
  }

  // Accumulator that mirrors apps/daemon/src/chat-routes.ts.
  const accum = {};
  let finishReason = '';
  let textOut = '';

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index === undefined) break;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = json?.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (typeof delta.content === 'string') textOut += delta.content;
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc?.index ?? 0;
            if (!accum[idx]) accum[idx] = { id: '', name: '', arguments: '' };
            if (typeof tc.id === 'string' && tc.id) accum[idx].id = tc.id;
            if (typeof tc.function?.name === 'string' && tc.function.name) {
              accum[idx].name = tc.function.name;
            }
            if (typeof tc.function?.arguments === 'string') {
              accum[idx].arguments += tc.function.arguments;
            }
          }
        }
        if (typeof choice.finish_reason === 'string') {
          finishReason = choice.finish_reason;
        }
      }
    }
  }

  const slot = accum[0];
  if (!slot) {
    throw new Error(
      `no tool_calls emitted (finish_reason=${finishReason || 'none'}, text="${textOut.slice(0, 80)}")`,
    );
  }
  if (slot.name !== 'generate_image') {
    throw new Error(`wrong tool called: ${slot.name || '(empty)'}`);
  }
  let args;
  try {
    args = JSON.parse(slot.arguments);
  } catch (err) {
    throw new Error(
      `tool arguments not valid JSON: ${slot.arguments.slice(0, 120)} — ${err.message}`,
    );
  }
  if (typeof args.prompt !== 'string' || !args.prompt.trim()) {
    throw new Error(`tool args missing prompt`);
  }
  return { promptLen: args.prompt.length, finishReason, textPreview: textOut.slice(0, 60) };
}

async function runChatMatrix() {
  console.log('\n=== Layer 3: multi-LLM tool-injection ===');
  for (const model of CHAT_MODELS) {
    try {
      const t0 = Date.now();
      const result = await streamChatWithTool(model);
      const ms = Date.now() - t0;
      pass(
        `tool-call via ${model}`,
        `${ms}ms, ${result.promptLen}-char prompt, finish=${result.finishReason}`,
      );
    } catch (err) {
      fail(`tool-call via ${model}`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 2 — real Venice image generation, both sizing paths.
// ---------------------------------------------------------------------------

async function generateImage({ model, body, suffix }) {
  const t0 = Date.now();
  const resp = await fetch(`${VENICE_BASE_URL}/image/generate`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ model, ...body, format: 'png' }),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
  }
  const data = await resp.json();
  const b64 = Array.isArray(data?.images) ? data.images[0] : '';
  if (!b64) throw new Error('response missing images[0]');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length === 0) throw new Error('decoded zero bytes');
  const file = path.join(OUT_DIR, `venice-${suffix}.png`);
  await writeFile(file, bytes);
  return { ms: Date.now() - t0, bytes: bytes.length, file };
}

async function runImageMatrix() {
  console.log('\n=== Layer 2: image generation ===');
  try {
    const r = await generateImage({
      model: 'gpt-image-2',
      body: { prompt: 'A small icon of a Venice gondola at sunset.', aspect_ratio: '1:1', resolution: '1K' },
      suffix: 'gpt-image-2',
    });
    pass(`image via gpt-image-2 (resolution-tier)`, `${r.ms}ms, ${r.bytes} bytes → ${r.file}`);
  } catch (err) {
    fail('image via gpt-image-2', err);
  }
  try {
    const r = await generateImage({
      model: 'venice-sd35',
      body: { prompt: 'A small icon of a Venice gondola at sunset.', width: 512, height: 512 },
      suffix: 'venice-sd35',
    });
    pass(`image via venice-sd35 (pixel)`, `${r.ms}ms, ${r.bytes} bytes → ${r.file}`);
  } catch (err) {
    fail('image via venice-sd35', err);
  }
}

// ---------------------------------------------------------------------------
// Layer 2 — real Venice video generation. The expensive one ($0.30–$0.50,
// 30–60s wall clock). Skip with SKIP_VIDEO=1.
// ---------------------------------------------------------------------------

async function runVideo() {
  if (SKIP_VIDEO || ONLY_CHAT) {
    console.log('\n=== Layer 2: video generation — SKIPPED ===');
    return;
  }
  console.log('\n=== Layer 2: video generation (this can take 30–60s) ===');
  try {
    const t0 = Date.now();
    const queue = await fetch(`${VENICE_BASE_URL}/video/queue`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        model: 'seedance-2-0-text-to-video',
        prompt: 'A gondola gliding through a narrow Venice canal at sunset.',
        duration: '5s',
        resolution: '720p',
        aspect_ratio: '16:9',
        audio: false,
      }),
    });
    if (!queue.ok) {
      throw new Error(`queue HTTP ${queue.status}: ${(await queue.text()).slice(0, 240)}`);
    }
    const queueData = await queue.json();
    const queueId = queueData?.queue_id;
    if (!queueId) throw new Error('queue response missing queue_id');
    console.log(`  queued: ${queueId}`);

    // Poll
    const maxMs = 5 * 60 * 1000; // 5 min ceiling for the smoke test
    while (Date.now() - t0 < maxMs) {
      await new Promise((r) => setTimeout(r, 5000));
      const poll = await fetch(`${VENICE_BASE_URL}/video/retrieve`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ model: 'seedance-2-0-text-to-video', queue_id: queueId }),
      });
      if (!poll.ok) {
        throw new Error(`poll HTTP ${poll.status}: ${(await poll.text()).slice(0, 240)}`);
      }
      const ct = (poll.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('video/mp4')) {
        const bytes = Buffer.from(await poll.arrayBuffer());
        const file = path.join(OUT_DIR, 'venice-seedance.mp4');
        await writeFile(file, bytes);
        pass(
          `video via seedance-2-0-text-to-video`,
          `${Date.now() - t0}ms, ${bytes.length} bytes → ${file}`,
        );
        return;
      }
      const data = await poll.json();
      const status = String(data?.status || '').toUpperCase();
      process.stdout.write(`  poll: status=${status || 'PROCESSING'} (${Math.round((Date.now() - t0) / 1000)}s)\n`);
      if (status === 'FAILED' || status === 'EXPIRED') {
        throw new Error(`upstream ${status.toLowerCase()}: ${JSON.stringify(data?.error || data?.message || data)}`);
      }
    }
    throw new Error(`timed out after ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (err) {
    fail('video via seedance-2-0-text-to-video', err);
  }
}

// ---------------------------------------------------------------------------
// Layer 2 — real Venice TTS (OpenAI-compatible /audio/speech).
// ---------------------------------------------------------------------------

async function runTTS() {
  if (ONLY_CHAT) {
    console.log('\n=== Layer 2: TTS — SKIPPED (ONLY_CHAT) ===');
    return;
  }
  console.log('\n=== Layer 2: TTS ===');
  try {
    const t0 = Date.now();
    const resp = await fetch(`${VENICE_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: 'Welcome to Venice Design.',
        voice: 'alloy',
        response_format: 'mp3',
      }),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
    }
    const bytes = Buffer.from(await resp.arrayBuffer());
    if (bytes.length === 0) throw new Error('zero bytes');
    const file = path.join(OUT_DIR, 'venice-tts.mp3');
    await writeFile(file, bytes);
    pass(`tts via gpt-4o-mini-tts`, `${Date.now() - t0}ms, ${bytes.length} bytes → ${file}`);
  } catch (err) {
    fail('tts via gpt-4o-mini-tts', err);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('venice-smoke: starting against', VENICE_BASE_URL);
console.log('              flags:', { SKIP_VIDEO, ONLY_CHAT });
await runChatMatrix();
if (!ONLY_CHAT) {
  await runImageMatrix();
  await runVideo();
  await runTTS();
}

console.log(`\nDone. ${failures} failure(s).`);
console.log(`Artifacts in ${OUT_DIR}`);
process.exit(failures > 0 ? 1 : 0);
