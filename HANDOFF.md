# Handoff — Venice provider PR + Venice Design fork

Single file you can read top-to-bottom to ship both tracks. Two-track summary:

| Track | Branch | Where it goes | When |
|---|---|---|---|
| **PR upstream** | `feat/venice-media-provider` | nexu-io/open-design (via fork at `jordanurbs/open-design`) | when you're confident |
| **Venice Design fork** | `fork/venice-design` (builds on the PR branch) | `jordanurbs/venice-design` | as soon as you want it public |

The fork sits on top of the PR. If the PR merges upstream, the fork's diff against upstream shrinks from "provider + UX" to just "UX layer".

---

## Pre-flight (one-time)

Make sure `gh` is logged in:

```bash
gh auth status
# If not authed:
gh auth login
```

Confirm the local branches:

```bash
cd /Users/jordanurbs/JAYEYE/opendesign-test/open-design
git branch -vv
# Should show:
#   feat/venice-media-provider   <commit>  Venice provider added
# * fork/venice-design           <commit>  Venice-first UX + smoke script
#   main                         <commit>  upstream pin
```

---

## Track 1: PR upstream

### 1.1 Fork upstream into your account

```bash
cd /Users/jordanurbs/JAYEYE/opendesign-test/open-design

# Create a fork of nexu-io/open-design at jordanurbs/open-design.
# This is the *PR head* fork — distinct from the Venice Design product fork.
gh repo fork nexu-io/open-design --clone=false --remote-name=fork
```

This adds a `fork` remote pointing at `git@github.com:jordanurbs/open-design.git`.

### 1.2 Push the PR branch

```bash
git push -u fork feat/venice-media-provider
```

### 1.3 Open the PR

```bash
gh pr create --repo nexu-io/open-design \
  --head jordanurbs:feat/venice-media-provider \
  --title "feat(media): add Venice as a unified BYOK provider for chat, image, video, and TTS" \
  --body-file PR_DESCRIPTION.md
```

The body comes from `PR_DESCRIPTION.md` in this repo.

After it opens, copy the PR URL into the fork's README (see step 2.5 below) so users know it exists.

---

## Track 2: Venice Design fork

### 2.1 Create the public repo

```bash
gh repo create jordanurbs/venice-design --public \
  --description "Venice-first, local-first design studio. Fork of nexu-io/open-design with Venice as the default provider for chat, image, video, and TTS." \
  --homepage "https://venice.ai"
```

### 2.2 Add the remote

```bash
cd /Users/jordanurbs/JAYEYE/opendesign-test/open-design
git remote add venice git@github.com:jordanurbs/venice-design.git
```

### 2.3 Push the fork branch as `main`

```bash
# The fork branch carries: PR commits + UX overlay + smoke script + README + workflows.
git push venice fork/venice-design:main
```

### 2.4 Track upstream open-design for weekly syncs

```bash
git remote add upstream-opendesign https://github.com/nexu-io/open-design.git
git fetch upstream-opendesign
```

Weekly sync routine:

```bash
git checkout fork/venice-design
git fetch upstream-opendesign
git merge upstream-opendesign/main
# Fix any conflicts (rare — the fork diff is localised to ~10 files).
git push venice fork/venice-design:main
```

### 2.5 Wire up the upstream-PR link

Once the PR has a URL, edit the fork's README to replace the placeholder
`PR #XXXX` references. They appear in two places:

- `README.md` — "supported upstream as of [this PR](…)" line
- `docs/venice-quickstart.md` — "PR #XXXX" reference

Sed it:

```bash
PR_URL="https://github.com/nexu-io/open-design/pull/XXXX"   # ← real number
sed -i '' "s|PR #XXXX|PR ${PR_URL##*/pull/}|g; s|this PR|this PR (${PR_URL})|g" README.md docs/venice-quickstart.md
git commit -am "fork(readme): pin upstream PR URL"
git push venice fork/venice-design:main
```

### 2.6 Configure secrets for the optional smoke workflow

The fork includes `.github/workflows/venice-smoke.yml`, which is `workflow_dispatch`-only and burns ~$0.20 in Venice credits per run. To enable:

```bash
# Set the secret (one-time):
gh secret set VENICE_API_KEY --repo jordanurbs/venice-design

# Manually trigger a smoke run (cheap mode — chat + image + TTS, no video):
gh workflow run venice-smoke.yml --repo jordanurbs/venice-design \
  -f include_video=false -f only_chat=false

# Or the full matrix incl. video (~60s, ~$0.40):
gh workflow run venice-smoke.yml --repo jordanurbs/venice-design \
  -f include_video=true -f only_chat=false

# Or just the multi-LLM tool injection (cheapest, ~$0.02):
gh workflow run venice-smoke.yml --repo jordanurbs/venice-design \
  -f include_video=false -f only_chat=true

# Watch the run:
gh run watch --repo jordanurbs/venice-design
```

### 2.7 Optional: deploy to Vercel

The fork's README already has a one-click deploy button pointing at `https://github.com/jordanurbs/venice-design`. To pre-deploy a reference instance you can link from venice.ai:

```bash
# From a clone of jordanurbs/venice-design
vercel --prod
# When prompted, set the VENICE_API_KEY env var.
```

---

## Local testing (BEFORE pushing either branch)

Two layers — both worth running before you push.

### Layer 1: unit tests (mock fetch, no key needed)

```bash
cd /Users/jordanurbs/JAYEYE/opendesign-test/open-design
git checkout feat/venice-media-provider   # or fork/venice-design

# Rebuild native sqlite if it errors (only needed if pnpm install ran with --ignore-scripts):
pnpm rebuild better-sqlite3

# All Venice tests + regression sweep:
pnpm --filter @open-design/daemon exec vitest run \
  tests/media-venice.test.ts \
  tests/proxy-routes.test.ts \
  tests/media-senseaudio-image.test.ts \
  tests/media-senseaudio.test.ts \
  tests/byok-tools.test.ts \
  tests/media-config.test.ts

# Drift check (must be OK):
node scripts/verify-media-models.mjs

# Full monorepo typecheck:
pnpm -r --workspace-concurrency=4 --if-present run typecheck
```

Expected: **162/162 pass, drift OK, typecheck PASS**.

### Layer 2 + 3: real Venice API smoke

Only available on the fork branch (the script lives at `tests/manual/venice-smoke.mjs`):

```bash
git checkout fork/venice-design
export VENICE_API_KEY=your_key_here

# Cheapest: just the multi-LLM tool-injection matrix (~$0.02, ~10s):
ONLY_CHAT=1 node tests/manual/venice-smoke.mjs

# Mid: chat matrix + image + TTS (~$0.05, ~60s):
SKIP_VIDEO=1 node tests/manual/venice-smoke.mjs

# Full: everything incl. one 5s video (~$0.20, ~3 min):
node tests/manual/venice-smoke.mjs
```

If any Layer-3 model fails (e.g. `qwen3-coder-480b-a35b-instruct-turbo` emits malformed JSON), you'll see exactly what was returned and can decide whether to drop it from the recommended-models list.

### Manual UI walkthrough

After running `pnpm tools-dev` (daemon + web on port 3000):

1. Open `http://localhost:3000`. Welcome dialog should pop up.
2. **PR branch**: defaults to Anthropic tab. Click into Settings → API → **Venice tab**.
   **Fork branch**: defaults to **Venice tab** already.
3. Paste your Venice key. Pick model `gpt-5`. Save.
4. Start a project with the **`magazine-web-ppt`** skill.
5. Brief: *"design a magazine-style pitch deck for our seed round with a 16:9 hero image of a Venice canal at blue hour and a 5-second intro reel"*.
6. Watch the agent:
   - Lock the brief via question form
   - Pick a visual direction
   - Stream TodoWrite plan
   - Call `generate_image` → PNG renders into project folder, embeds as `![image](…)`
   - Call `generate_video` → daemon polls Venice for ~60s, embeds as `[▶ Play video](…)`
   - Compose the final deck
7. Click the artifact preview. Export to PPTX. Done.

If any of those steps stall:
- Check the daemon log for `[proxy:venice] …` lines — they show every upstream call.
- `OD_VENICE_VIDEO_MAX_POLL_MS=1200000 pnpm tools-dev` bumps the video poll ceiling to 20 min for slow 1080p jobs.

---

## After both tracks ship

| Thing | Where |
|---|---|
| The PR | https://github.com/nexu-io/open-design/pull/XXXX |
| The fork | https://github.com/jordanurbs/venice-design |
| Vercel-deployed reference | (if you `vercel --prod`) — note URL in fork README |
| Hosted instance for venice.ai | optional — `design.venice.ai` would be the obvious subdomain if Venice wants to host it themselves |

If the upstream PR merges:

1. Pull upstream into the fork as usual (`git merge upstream-opendesign/main`).
2. Conflict resolution: the Venice provider code is now in upstream, so `git` will report no conflicts and the fork's diff against upstream automatically shrinks to just the UX layer.
3. Optionally delete the provider commits from the fork's history (`git rebase -i upstream-opendesign/main` and drop the two `feat(media):` commits) — but it's safer to leave them as a defensive overlay.

If the upstream PR is rejected or stalls:

1. The fork keeps the provider commits as part of its diff against upstream — nothing breaks.
2. Iterate on the fork's UX layer independently.
