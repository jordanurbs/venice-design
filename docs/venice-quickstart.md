# Venice quickstart

You have 60 seconds. Here's the path.

## Step 1: get a key

[venice.ai/settings/api](https://venice.ai/settings/api) → "Generate API Key" → copy.

Free tier is enough to try. Production cost reference (May 2026 pricing, subject to change):

| Surface | Approx cost per item |
|---|---|
| Chat (openai-gpt-55) | $0.005 per 1K input tokens, $0.015 per 1K output |
| Chat (qwen3-coder-480b-a35b-instruct-turbo) | $0.0006 per 1K tokens (open-source tier) |
| Image (gpt-image-2 @ 2K) | $0.04 per image |
| Image (venice-sd35) | $0.01 per image |
| Image edit (qwen-edit) | $0.04 per edit |
| Video (seedance-2-0-t2v, 5s, 720p) | $0.30–$0.50 per clip |
| Video (wan-2.6, 5s, 720p + audio) | $0.40–$0.70 per clip |
| TTS (tts-kokoro) | low-cost speech generation |

A typical "build me a pitch deck with hero illustrations and a 5-second intro" session costs <$1.

## Step 2: start the app

### Local

```bash
git clone https://github.com/jordanurbs/venice-design
cd venice-design
pnpm install
pnpm tools-dev   # daemon + web in dev mode on http://localhost:3000
```

### Vercel

Click the deploy button in the README. Paste your key when prompted. Done.

### Docker

```bash
docker run -e VENICE_API_KEY=… -p 3000:3000 ghcr.io/jordanurbs/venice-design
```

(Image not yet published — coming soon.)

### Existing Open Design install

If you already have upstream `nexu-io/open-design` running and just want to try Venice without switching forks: the Venice provider [is supported upstream as of PR #XXXX](https://github.com/nexu-io/open-design/pull/XXXX). Pick the **Venice** tab in Settings, paste your key, switch the chat protocol — you'll get the same media-tool functionality, just without the Venice-first onboarding defaults.

## Step 3: first project

1. Open `http://localhost:3000`. The welcome dialog opens with the **Venice tab pre-selected**.
2. Paste your API key. Accept the default model (`openai-gpt-55`).
3. Click "Get started".
4. The new-project picker appears. Pick a skill:
   - `magazine-web-ppt` — magazine-style slide deck
   - `prototype` — mobile app prototype frames
   - `editorial` — editorial landing page
   - `email-marketing` — branded HTML email
5. Type your brief. Hit submit.
6. Watch the agent:
   - Read the skill's `SKILL.md`
   - Lock the brief via the question form
   - Pick a visual direction
   - Stream a `TodoWrite` plan
   - Generate hero art via `generate_image` (renders into the project folder)
   - Generate the intro reel via `generate_video` (polls Venice for ~30-60s)
   - Generate narration via `generate_speech`
   - Compose the final HTML/PPTX/PDF artifact
7. Click the artifact to preview in the sandboxed iframe. Export to your format of choice.

## Step 4: pick the right model per task

The default `openai-gpt-55` works for everything, but you can squeeze more out of specific tasks by picking the right backend:

| Task | Best Venice model |
|---|---|
| Long-context design generation (200+ slide deck, complex prototype) | `claude-sonnet-4-5` (1M context) or `qwen3-coder-480b-a35b-instruct-turbo` (strong structured HTML output) |
| Code-heavy artifacts (interactive React prototype) | `qwen3-coder-480b-a35b-instruct-turbo` or `claude-opus-4-7` |
| Creative writing / brand voice | `claude-opus-4-7` |
| Cheap iteration during exploration | `openai-gpt-54-mini` or `qwen3-235b` |
| Image generation hero art | `gpt-image-2` @ 4K |
| Image generation infographic / chart | `nano-banana-pro` @ 2K |
| Image generation typography-heavy | `recraft-v4-pro` |
| Image generation photorealistic | `flux-2-pro` or `venice-sd35` |
| Image edit / inpaint | `qwen-edit` (default) or `nano-banana-pro-edit` (highest fidelity) |
| Video — text-to-video cinematic | `seedance-2-0-text-to-video` (15s + audio) |
| Video — image-to-video animation | `seedance-2-0-image-to-video` |
| Video — multi-character with elements | `seedance-2-0-reference-to-video` |
| Video — fast iteration | `seedance-2-0-fast-text-to-video` |
| Video — with native audio | `wan-2.6-text-to-video` or any seedance-2-0 |
| Video — privacy-conscious | `grok-imagine-text-to-video-private` |
| TTS | `tts-kokoro` (default) or `tts-minimax-speech-02-hd` (higher fidelity) |

You can switch models per-conversation in the chat composer, or set defaults in Settings.

## Step 5: smoke test (optional but recommended)

After your first project works, run the manual smoke test to verify all four surfaces actually round-trip through Venice on your specific account:

```bash
VENICE_API_KEY=your_key node tests/manual/venice-smoke.mjs
```

It will:
1. Run a chat completion against `openai-gpt-55`, `qwen3-coder-480b-a35b-instruct-turbo`, and `claude-opus-4-7` — proves tool-call accumulator handles OpenAI / open-source / Anthropic-translated streaming shapes.
2. Generate one image with `gpt-image-2` (resolution-tier sizing) and one with `venice-sd35` (pixel sizing).
3. Generate a 5-second video with `seedance-2-0-text-to-video` (proves async polling loop).
4. Generate one second of TTS with `tts-kokoro`.

Expected runtime: 2–4 minutes (mostly the video). Expected cost: ~$0.20.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Missing API key" in Settings | First-run welcome dialog dismissed without saving | Settings → Venice tab → paste key, click "Save". |
| "venice image 401: unauthorized" | Key was revoked or copied incorrectly | Generate a new key at venice.ai/settings/api and re-paste. |
| "venice image 402: insufficient_balance" | Out of credits | Top up at venice.ai/settings/api or via x402 wallet (see Venice docs). |
| Video polling times out at ~10 min | 1080p Wan 2.6 + audio job legitimately needs longer | Set `OD_VENICE_VIDEO_MAX_POLL_MS=1200000` (20 min) and restart the daemon. |
| Tool call returns "tool arguments were not valid JSON" | Open-source model emitted malformed JSON in `arguments` | Switch to `openai-gpt-55` or `claude-opus-4-7` for that turn; the proxy already recovers gracefully. |
| Chat works but `generate_image` doesn't fire | Model picker is set to a non-tool-calling Venice model | Switch to `openai-gpt-55`, `openai-gpt-54-mini`, `claude-opus-4-7`, or `qwen3-coder-480b-a35b-instruct-turbo`. `venice-uncensored` may not support function-calling. |
| The agent generates an image but won't embed it | Model misread the tool's instruction | The proxy's `tool_result` message already says "embed with ![](…) markdown"; re-prompt with "show me the image inline" if it still resists. |

## What's NOT yet ported

- Music generation (Suno / Udio / Lyria) — Venice's audio surface is TTS-focused today. Use the upstream Open Design's direct Suno/Udio providers if you need music.
- SFX (ElevenLabs SFX, AudioCraft) — same story.
- DALL·E 2 / DALL·E 3 — not on Venice. `gpt-image-2` is the modern replacement.

These keep working via the direct upstream providers if you configure them in Settings — Venice Design doesn't remove anything.
