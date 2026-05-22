<!--
  PR body for nexu-io/open-design.
  Submit with:
    gh pr create --repo nexu-io/open-design \
      --head jordanurbs:feat/venice-media-provider \
      --title "feat(media): add Venice as a unified BYOK provider for chat, image, video, and TTS" \
      --body-file PR_DESCRIPTION.md
-->

## Summary

Adds **Venice** (https://docs.venice.ai) as a first-class BYOK provider in Open Design. Venice is an OpenAI-compatible inference gateway that exposes text, image, video, audio, and embedding models behind a single API key — so a user pastes ONE key into Settings and unlocks:

| Surface | Examples |
|---|---|
| **Chat** (existing surface, new tab) | `openai-gpt-55`, `openai-gpt-54`, `openai-gpt-54-mini`, `openai-gpt-53-codex`, `openai-gpt-4o-2024-11-20`, `claude-opus-4-7`, `claude-opus-4-7-fast`, `claude-opus-4-6`, `claude-opus-4-5`, `claude-sonnet-4-6`, `claude-sonnet-4-5`, `qwen3-coder-480b`, `qwen3-235b`, `llama-3.1-405b`, `deepseek-v4-pro`, `deepseek-r1`, `grok-4`, `mistral-31-24b`, `zai-org-glm-5`, `venice-uncensored` (Venice uses period-stripped kebab-case for OpenAI versions: `openai-gpt-55` = GPT-5.5, `openai-gpt-54-mini` = 5.4 mini — verified live against Venice's `/v1/models` on 2026-05-22) |
| **Image** | `gpt-image-2`, `nano-banana-pro`, `nano-banana-2`, `qwen-image-2-pro/-2/-image`, `venice-sd35`, `flux-2-pro/-max`, `seedream-v4/-v5-lite`, `recraft-v4-pro`, `grok-imagine`, plus the `*-edit` family (`qwen-edit`, `gpt-image-2-edit`, `nano-banana-pro-edit`, `flux-2-max-edit`) |
| **Video** | `wan-2.6-{t2v,i2v}`, `wan-2.5-preview-*`, `seedance-2-0-{t2v,i2v,r2v}` + `*-fast-*`, `grok-imagine-{t2v,i2v}` + private variants, `topaz-video-upscale` |
| **Speech (TTS)** | `gpt-4o-mini-tts`, `tts-chatterbox-hd` (voice cloning) |

This means a user no longer needs to keep credentials for OpenAI + Anthropic + ByteDance + xAI + Google to get full Open Design coverage — one Venice key replaces all of them.

## Why Venice (not "yet another provider")

Open Design is **local-first, BYOK at every layer**. The README's pitch — "no checkout, no cloud lock-in, no proprietary inference layer" — needs a chat/media backend that matches that ethos. Venice is the only major commercial inference provider whose own product positioning aligns 1:1 with the project's:

| Open Design value | Venice's matching guarantee |
|---|---|
| Local-first, your machine, your data | **Zero data retention.** Venice's own positioning is "privacy-first, uncensored AI API platform … with zero data retention" (docs.venice.ai). The same language appears endpoint-by-endpoint — e.g. `/augment/text-parser`: *"Text parsing runs entirely in-memory on Venice's infrastructure with zero data retention. Documents are processed and immediately discarded — no content is stored or logged."* |
| BYOK at every layer; no proprietary inference | **OpenAI-compatible at `https://api.venice.ai/api/v1`.** Drop-in replacement for `api.openai.com`; the existing OD chat surface and skill-driven design loop work unchanged. |
| Sandboxed preview, no surveillance | **Optional TEE + E2EE.** Venice's `tee-*` model family runs inside Intel TDX / NVIDIA Confidential Computing enclaves with **cryptographic attestation** (`GET /tee/attestation?model=…` returns a verifiable report) — the model can't be inspected or modified, *not even by Venice*. `e2ee-*` adds **client-side encryption with ephemeral key pairs** on top of TEE: your prompts are encrypted on your machine before they leave; only the enclave can decrypt them. For an open-source local-first design studio handling client briefs and unreleased product designs, this is the strongest privacy posture available on any commercial inference API today. |
| Anonymous, no account required | **x402 wallet auth.** Top up credits with a USDC payment over an Ethereum wallet (`POST /x402/top-up`); no email, no account, no profile. Bearer-token API key auth still works for everyone else. |
| Composable, swappable, no vendor lock | **One key, ~230 multimodal models.** See the table below — chat (GPT-5.5 / 5.5-pro / 5.4 / 5.4-mini / 5.3-codex / 5.2, Claude Opus 4.7 + Sonnet 4.6, Qwen3-Coder 480B, Llama 3.1 405B, DeepSeek V4-Pro / R1, Grok-4, Mistral, GLM-5, `venice-uncensored`), image (`gpt-image-2`, `nano-banana-pro`, FLUX 2, Seedream v5, Recraft, Grok Imagine, `venice-sd35`), video (Wan 2.6, Seedance 2.0 with native audio, Grok Imagine, Topaz upscale), and OpenAI-compatible TTS — all behind one API key. Open Design users no longer need OpenAI + Anthropic + Volcengine + xAI + Google + ByteDance credentials to get the same coverage. |
| Web-aware design (browse → cite) | **Anonymized search + scrape.** Venice's `/augment/search` proxies through Brave (Zero Data Retention) or Google with anonymized queries (the search provider never sees who asked). Not yet surfaced in the OD UI — flagged as a follow-up. |

The "uncensored" angle isn't pure marketing either: design work routinely runs into overly-cautious refusals from frontier models on stylistic asks (*"draw a futuristic poster in the style of Frank Frazetta"* — boom, refused). Venice's default system prompts are tuned away from that without removing the safety floor (`safe_mode` still defaults to on for image gen).

## Why an explicit `venice` protocol (not just OpenAI-compat)

A user *can* already route Venice through the existing OpenAI proxy by typing `https://api.venice.ai/api/v1` into the OpenAI tab's Base URL. That works for chat-only. Three reasons this PR adds a dedicated protocol anyway:

- Venice has **native multimodal endpoints** that aren't OpenAI-compatible at all: `/image/generate` (Venice's richer image surface with `style_preset`, `safe_mode`, `cfg_scale`, `variants`, `negative_prompt`), `/video/queue` + `/video/retrieve` (the async polling protocol for Wan 2.6 / Seedance 2.0 / Grok Imagine), and `/audio/voices` (voice cloning handles). Routing these through Venice's own `venice/<slug>` catalogue ids means the design agent gets *more* capability, not less, vs. the OpenAI-compat fallback.
- Routing chat through a Venice-specific proxy lets the daemon **inject `generate_image` / `generate_video` / `generate_speech` tools** backed by Venice's own media endpoints — same pattern as the existing SenseAudio path. The LLM running on Venice's chat completions can render images and videos inline mid-conversation, on the same API key, with the rendered file persisted into the active project's folder.
- Avoids the failure mode where a user runs chat on Venice (via the OpenAI proxy with a custom `baseUrl`) but has to switch providers for media. Now the image / video / TTS surfaces all see Venice as a first-class provider.

## What's in the PR

### Daemon (`apps/daemon/src`)

- **`media-models.ts`** — register `venice` provider entry; add Venice models to `IMAGE_MODELS`, `VIDEO_MODELS`, and `AUDIO_MODELS_BY_KIND.speech`. Catalogue ids are namespaced as `venice/<wire-slug>` so they don't collide with the direct-OpenAI / direct-ByteDance entries.
- **`media-config.ts`** — pick up `VENICE_API_KEY` (Venice's canonical env) and `OD_VENICE_API_KEY` (project-reserved override) in `ENV_KEYS`.
- **`media.ts`** — three new render functions and dispatcher branches:
  - `renderVeniceImage` → `POST /image/generate` with per-model sizing (resolution-tier for `gpt-image-2` / `nano-banana-*`, aspect-ratio-only for `qwen-image-2` / `flux-2-*`, explicit pixel dims for `venice-sd35` / `qwen-image`). Routes `*-edit` models and reference-bearing requests to `/image/edit`.
  - `renderVeniceVideo` → `POST /video/queue` + poll `POST /video/retrieve`. Handles three response shapes: inline `video/mp4`, JSON `status:"COMPLETED"` pointing at the queue-time `download_url` (Grok Imagine Private variants), and `FAILED`/`EXPIRED`. SSRF-guards the private download URL via `assertExternalAssetUrl`. Carves out `seedance-2-0-image-to-video` which rejects `aspect_ratio` (output aspect derives from the input image).
  - `renderVeniceSpeech` → `POST /audio/speech` (OpenAI-compatible).
- **`byok-tools.ts`** — add Venice tool definitions (`BYOK_VENICE_TOOLS`) and executors (`executeVeniceGenerateImage` / `executeVeniceGenerateVideo` / `executeVeniceGenerateSpeech`). Same contract as the SenseAudio executors: persist the rendered bytes into `<projectsRoot>/<projectId>/byok-venice-*.{png,mp4,mp3}` and return a daemon-served URL the chat UI can embed inline.
- **`chat-routes.ts`** — register `POST /api/proxy/venice/stream`. Mirrors the SenseAudio proxy structure: chat completions to `/chat/completions`, Venice tools injected on every turn with `tool_choice: 'auto'`, tool-call loop bounded by `MAX_BYOK_TOOL_LOOPS`, BYOK key seeded into `media-config.venice` so the CLI-agent path (`od media generate --model venice/<slug> …`) picks it up automatically.
- **`connectionTest.ts`** + **`providerModels.ts`** — Venice rides the OpenAI-compatible call shape for the smoke-test and `GET /models` paths.

### Contracts (`packages/contracts/src`)

- **`api/connectionTest.ts`** — `ConnectionTestProtocol` includes `'venice'`.
- **`api/memory.ts`** — `MemoryExtractionProvider` includes `'venice'` (so the memory extractor can route through a Venice key).
- **`analytics/events.ts`** — `TrackingByokProviderId` and `apiProtocolToTracking()` map `venice` to its own analytics bucket so dashboards split it out.

### Web (`apps/web/src`)

- **`types.ts`** — extend `ApiProtocol` with `'venice'`.
- **`state/apiProtocols.ts`** — Venice tab metadata (suggested models, fast model `gpt-5-mini`, key placeholder, default base URL `https://api.venice.ai/api/v1`).
- **`state/config.ts`** — Venice quick-fill preset + `inferApiProtocol()` routes `api.venice.ai` hosts to the `venice` protocol.
- **`providers/venice-compatible.ts`** *(new)* — thin shim that streams through the daemon proxy.
- **`providers/anthropic.ts`** — route `cfg.apiProtocol === 'venice'` to the new streamer.
- **`media/models.ts`** — mirror the daemon's Venice provider + models for the NewProjectPanel picker and Settings dialog. `node scripts/verify-media-models.mjs` passes (TS + JS registries match).
- **`utils/apiProtocol.ts`** + **`components/SettingsDialog.tsx`** + **`components/home-hero/media-surfaces.ts`** — record-type completeness for the new protocol value; the "Get key" console link points at `https://venice.ai/settings/api`.

### Tests

- **`apps/daemon/tests/media-venice.test.ts`** *(new)* — 11 tests, all passing locally. Covers:
  - Resolution-tier sizing on `/image/generate` for `gpt-image-2` (assert `aspect_ratio` + `resolution`, no `width`/`height`).
  - Pixel sizing for `venice-sd35` (assert `width`/`height`, no `aspect_ratio`/`resolution`).
  - `/image/edit` routing for `*-edit` models with a reference image (assert `image` data URL + `output_format`).
  - `VENICE_API_KEY` env fallback.
  - HTTP-level failure surfacing (401 → `venice image 401: unauthorized`).
  - Video happy path: queue returns `queue_id`, retrieve polls JSON `PROCESSING` then inline `video/mp4`, bytes land on disk.
  - Grok Imagine Private path: COMPLETED JSON + queue-time `download_url` → fetch the private URL → bytes on disk.
  - `seedance-2-0-image-to-video` carve-out: assert `aspect_ratio` is omitted and `image_url` is forwarded as a data URL.
  - Video `FAILED` status surfacing.
  - TTS happy path: `POST /audio/speech` with OpenAI-compatible body, mp3 bytes persisted.
- **`apps/daemon/tests/proxy-routes.test.ts`** — add a Venice describe block (delta+end streaming, default base URL, missing-key/model/projectId rejection, tools array injection, upstream `redirect: 'error'`) and add `/api/proxy/venice/stream` to the plugin-context rejection sweep.

### Docs

- **`README.md`** — update the BYOK fallback / proxy / architecture tables to call out Venice and the unified-key benefit.

## Test results (verified locally on this branch)

```
pnpm -r --workspace-concurrency=4 --if-present run typecheck   → PASS
node scripts/verify-media-models.mjs                            → OK
pnpm --filter @open-design/daemon exec vitest run              → 162/162 pass
  ├─ tests/media-venice.test.ts                                → 11/11 pass (new)
  ├─ tests/proxy-routes.test.ts                                → 63/63 pass (incl. 6 new Venice)
  ├─ tests/media-senseaudio-image.test.ts                      → 16/16 pass (regression)
  ├─ tests/media-senseaudio.test.ts                            → 8/8 pass (regression)
  ├─ tests/byok-tools.test.ts                                  → 33/33 pass (regression)
  └─ tests/media-config.test.ts                                → 31/31 pass (regression)
```

## Backwards compatibility

No breaking changes:
- All existing `MediaProvider` entries, env vars, BYOK proxy routes, and model ids are **untouched**.
- The new `'venice'` value on `ApiProtocol` / `ConnectionTestProtocol` / `MemoryExtractionProvider` / `TrackingByokProviderId` is purely additive.
- Catalogue ids are namespaced (`venice/<slug>`), so they don't shadow any existing direct-provider entry.
- Existing `/api/proxy/openai/stream` continues to work against `https://api.venice.ai/api/v1` for users who only want chat — the new `/venice/stream` proxy is opt-in via the new Settings tab.

A user on `main` who never picks the Venice tab will see zero behaviour change.

## References

- Venice API spec: https://docs.venice.ai/api-reference/api-spec
- Image generation: https://docs.venice.ai/guides/media/image-generation
- Video generation: https://docs.venice.ai/guides/media/video-generation
- Seedance 2.0 guide (workflow taxonomy): https://docs.venice.ai/guides/media/seedance-2-0
- Venice OpenAI-compatible chat completions: https://docs.venice.ai/api-reference/endpoint/chat/completions

## Notes for the reviewer

1. **`apps/daemon/src/media.ts` + `apps/daemon/src/byok-tools.ts` carry duplicated sizing knowledge** for Venice (resolution-tier vs pixel vs aspect-only model sets). I left a TODO to extend `scripts/verify-media-models.mjs` to also enforce these stay in sync — happy to do that in a follow-up.
2. **`OD_VENICE_VIDEO_MAX_POLL_MS`** defaults to 10 min for the polling ceiling. Wan 2.6 1080p with audio can legitimately take 5–8 min; bumping the default would be a one-line change if telemetry says it's needed.
3. **Image-edit dispatch** today checks `wireSlug.endsWith('-edit')` OR a reference image on a non-resolution-tier model. That captures `qwen-edit` / `flux-2-max-edit` / `nano-banana-pro-edit` / `gpt-image-2-edit` cleanly; let me know if there's an edit slug I missed.
4. **No TTS/voice-cloning UI affordance yet** — `tts-chatterbox-hd` accepts a `vv_…` handle minted via `POST /audio/voices`, and the tool exposes it as a string passthrough on `voice`, but minting handles from inside Open Design's Settings is left for a follow-up.
5. **`venice-uncensored` is intentionally NOT the default chat model**, even though it's Venice's headline product — the design loop needs a strong coder-quality model. `gpt-5` is the listed default; `venice-uncensored` is in the dropdown for users who explicitly want it.

## Test plan (for the maintainer)

- [x] `node scripts/verify-media-models.mjs` (drift check between TS + daemon registries)
- [x] `pnpm -r run typecheck`
- [x] `pnpm --filter @open-design/daemon test`
- [ ] Manual: paste a Venice API key into Settings → Venice tab, send *"make me a 16:9 hero image of a Venice canal at blue hour"* → verify the `![image](…)` URL serves a real PNG from the project folder.
- [ ] Manual: from a Venice chat session, ask for *"a 5s video of the same scene with audio"* → daemon polls `/video/retrieve` until the mp4 lands, chat UI shows `[▶ Play video](…)`.
- [ ] Manual: `od media generate --surface image --model venice/gpt-image-2 --prompt "…" --output venice.png` against a workspace whose `media-config.json` was seeded by the chat proxy → image lands on disk.
- [ ] Layer-3 multi-LLM tool-injection sweep against real Venice key: see `tests/manual/venice-smoke.mjs` in the companion fork at `jordanurbs/venice-design` — runs the tool-injected chat against `gpt-5`, `claude-opus-4-5`, and `qwen3-coder-480b` to confirm Venice's translation layer produces parseable OpenAI-shape `tool_calls` for all three.
