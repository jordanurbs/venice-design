# Venice Design

> **Venice Design** is a Venice-first, local-first design studio. One [Venice API key](https://venice.ai/settings/api) drives chat, image, video, and speech generation through a single OpenAI-compatible gateway — no juggling six API keys, no provider switching, no Anthropic/ByteDance/xAI accounts required.

> This is a fork of [nexu-io/open-design](https://github.com/nexu-io/open-design) (Apache-2.0). The upstream README is preserved at [`README.upstream.md`](./README.upstream.md). All Venice-specific changes are documented below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjordanurbs%2Fvenice-design&env=VENICE_API_KEY&envDescription=Get%20your%20key%20at%20venice.ai%2Fsettings%2Fapi&envLink=https%3A%2F%2Fvenice.ai%2Fsettings%2Fapi&project-name=venice-design&repository-name=venice-design)

## What it does

Type **"design a magazine-style pitch deck for our seed round with custom hero illustrations and a 5-second intro reel"** and watch:

1. An interactive question form locks the brief (audience, tone, brand context) before the model writes a pixel.
2. Five curated visual directions appear — pick one (Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm) and you get a deterministic palette + font stack.
3. A live `TodoWrite` plan streams into the UI.
4. The agent generates HTML/CSS slides into a real on-disk project folder.
5. **Inline media generation**: the agent calls `generate_image` for the hero art (Venice → `gpt-image-2` at 4K), `generate_video` for the intro reel (Venice → `seedance-2-0-text-to-video` with native audio), and `generate_speech` for narration (Venice → `gpt-4o-mini-tts`). All four happen in one conversation, on one API key.
6. The sandboxed iframe shows the rendered artifact within seconds; one click exports to HTML, PDF, PPTX, ZIP, or MP4.

## Why a Venice fork?

The upstream Open Design supports 21 providers — including Venice as of [this PR](https://github.com/nexu-io/open-design/pull/XXXX) — but the onboarding still walks new users through a multi-provider matrix. **Venice Design** trims that down:

- **Venice is the default and pre-selected** chat protocol on first run.
- **Settings → BYOK** opens on the Venice tab.
- **Default model is `gpt-5`** (best general-purpose Venice-hosted model); `venice-uncensored`, Claude Opus, Qwen3-Coder, Llama 3.1 405B, DeepSeek-V4-Pro all available in the dropdown.
- **Media tabs (image / video / audio) default to Venice models** — `gpt-image-2` for image, `seedance-2-0-text-to-video` for video, `gpt-4o-mini-tts` for speech.
- **One-click Vercel deploy** with `VENICE_API_KEY` baked into the env-var prompt.
- **Other 20 providers are still here** — just demoted from the headline. Users who need OpenAI direct, Volcengine, or Grok subscription billing can still configure them.

The full daemon + skill engine + 71 design systems + sandboxed iframe preview from upstream Open Design is unchanged. The diff is intentionally small (~10 files of UX defaults + branding) so we can pull from upstream weekly.

## Quickstart

1. Get a Venice API key at [venice.ai/settings/api](https://venice.ai/settings/api). The free tier is enough to try; production usage is metered.
2. Either:
   - **Local**: `git clone https://github.com/jordanurbs/venice-design && cd venice-design && pnpm install && pnpm tools-dev`
   - **Vercel**: click the deploy button above. Paste your key into the `VENICE_API_KEY` env var prompt.
   - **Self-hosted Docker** (coming soon): `docker run -e VENICE_API_KEY=… -p 3000:3000 ghcr.io/jordanurbs/venice-design`
3. Open `http://localhost:3000` (or your Vercel URL).
4. The welcome dialog opens with the **Venice tab pre-selected**. Paste your key, accept the default model (`gpt-5`), close the dialog.
5. Type a brief. Watch it render.

## Model catalogue (via Venice)

| Surface | Models you get with one Venice key |
|---|---|
| **Chat** | `gpt-5`, `gpt-5-mini`, `gpt-4o`, `claude-opus-4-5`, `claude-sonnet-4-5`, `qwen3-coder-480b`, `qwen3-235b`, `llama-3.1-405b`, `deepseek-v4-pro`, `deepseek-r1`, `grok-4`, `mistral-31-24b`, `zai-org-glm-5`, `venice-uncensored` |
| **Image (generate)** | `gpt-image-2`, `nano-banana-pro`, `nano-banana-2`, `qwen-image-2-pro`, `qwen-image-2`, `qwen-image`, `venice-sd35`, `flux-2-pro`, `flux-2-max`, `recraft-v4-pro`, `seedream-v5-lite`, `seedream-v4`, `grok-imagine` |
| **Image (edit/inpaint)** | `qwen-edit`, `flux-2-max-edit`, `nano-banana-pro-edit`, `gpt-image-2-edit` |
| **Video** | `wan-2.6-{t2v,i2v}`, `wan-2.5-preview-*`, `seedance-2-0-{t2v,i2v,r2v}` + `-fast-*`, `grok-imagine-{t2v,i2v}` + private variants, `topaz-video-upscale` |
| **Speech (TTS)** | `gpt-4o-mini-tts`, `tts-chatterbox-hd` (voice cloning) |
| **Web search + scrape** | Available via Venice; not yet surfaced in the UI (planned). |

## Configuration

| Env var | Default | What it does |
|---|---|---|
| `VENICE_API_KEY` | (none) | Your Venice key. Read by the daemon at startup; also accepted via the Settings dialog. |
| `OD_VENICE_API_KEY` | (none) | Project-reserved override; wins over `VENICE_API_KEY` and stored Settings keys. |
| `OD_VENICE_VIDEO_MAX_POLL_MS` | `600000` (10 min) | Maximum time the daemon will poll `/video/retrieve` before timing out. Bump for 1080p Wan 2.6 + audio jobs that genuinely need longer. |

All upstream Open Design env vars (`OD_DATA_DIR`, `OD_BIND_HOST`, `OD_ALLOWED_ORIGINS`, etc.) still work — see [`README.upstream.md`](./README.upstream.md).

## Tracking upstream

This fork pulls from `nexu-io/open-design` weekly. Conflicts are rare because the diff is localised:

- `apps/web/src/state/config.ts` — `DEFAULT_CONFIG` defaults
- `apps/web/src/state/apiProtocols.ts` — tab order
- `package.json` — name + description
- `README.md` (this file)
- `docs/venice-quickstart.md`

Everything else — daemon, skills, design systems, sandboxed preview, plugins — pulls cleanly from upstream. Apply the upstream Venice provider PR (in this fork as commit `c217176`) to your own fork and you'll have the same starting point.

## Smoke test

Once you've started the dev server with a real Venice key, run:

```bash
node tests/manual/venice-smoke.mjs
```

This exercises:
1. `/chat/completions` against `gpt-5`, `qwen3-coder-480b`, and `claude-opus-4-5` to verify tool-call accumulator handles OpenAI / open-source / Anthropic-translated streaming shapes.
2. `/image/generate` against `gpt-image-2` (resolution-tier) and `venice-sd35` (pixel) to confirm both sizing dispatches.
3. `/video/queue` + `/video/retrieve` against `seedance-2-0-text-to-video` to confirm the async polling loop completes end-to-end against the real Venice API.
4. `/audio/speech` against `gpt-4o-mini-tts`.

Estimated cost: ~$0.20 in Venice credits per full smoke run.

## Contributing

The fork specifically welcomes:

- Venice-tested prompt templates for the `prompt-templates/` gallery.
- Venice brand-system entries for the `design-systems/` catalogue.
- Bug reports against the Venice integration (please tag `[venice]`).
- Anything that improves the Venice-first onboarding (welcome copy, model recommendations, default base URL behaviour).

Upstream-relevant changes (new providers, daemon refactors, skill protocol changes) should be filed against [nexu-io/open-design](https://github.com/nexu-io/open-design) directly — they will land here on the next upstream pull.

## License

Apache-2.0, same as upstream Open Design. See [`LICENSE`](./LICENSE) and the original copyright in [`README.upstream.md`](./README.upstream.md).

Venice and the Venice logo are trademarks of Venice. Using this fork does not imply endorsement by Venice; we maintain the fork specifically to make Venice-first usage of Open Design frictionless.
