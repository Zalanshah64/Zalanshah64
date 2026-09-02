# typing-svg

A Cloudflare Worker that returns an animated SVG of a phrase being typed out —
with occasional realistic typos that get backspaced and corrected. Each request
picks a random phrase and renders a fresh, uncached SVG.

## Embed

Using whatever you set as `WORKER_HOSTNAME`:

```markdown
![](https://<your-hostname>/)
```

With tuning params:

```markdown
![](https://<your-hostname>/?cps=14&errorRate=0.08&size=32&fg=%2358a6ff&bg=none)
```

Remember to URL-encode `#` in colors as `%23`.

## Phrases

The phrase list is the `PHRASES` array in [`src/config.ts`](src/config.ts).
Edit it there and redeploy — it is server-side only and not settable by query
string. Strings are typed verbatim.

## Options

Every default lives in `DEFAULTS` in [`src/config.ts`](src/config.ts) and is
overridable per-request via query string. Values are clamped in `src/index.ts`.

| Param       | Default                | Range / notes                          |
|-------------|------------------------|----------------------------------------|
| `cps`       | `11`                   | chars/sec, `1`–`60`                    |
| `variance`  | `0.45`                 | per-keystroke jitter, `0`–`1`          |
| `errorRate` | `0.06`                 | typo chance per char, `0`–`1`          |
| `font`      | `ui-monospace, …`      | font-family                            |
| `size`      | `26`                   | px, `8`–`160`                          |
| `fg`        | `#1f6feb`              | text color                             |
| `bg`        | `none`                 | background; `none`/`transparent` omits the rect |
| `caret`     | `true`                 | blinking caret; `0`/`false`/`no`/`off` to disable |
| `loop`      | `false`                | loop forever, else play once and freeze |

The defaults are picked for a GitHub profile README: a transparent background and
Primer blue 5 (`#1f6feb`), GitHub's own accent hue. Primer defines link blue
per-theme — `#0969da` light, `#58a6ff` dark — but a transparent SVG gets one
color for both, and blue 5 sits between them: 4.6:1 on light, 4.1:1 on dark,
clearing WCAG's 3:1 large-text threshold either way.

Width is estimated from the longest frame as `cells × size × 0.62`, which suits
the monospace default; emoji are counted as two cells. A wide proportional `font`
may still need a smaller `size` to avoid clipping.

## Develop

```sh
npm install
npm run dev        # http://localhost:8787
npm test
npm run test:watch
npm run typecheck
npm run deploy     # typecheck, test, upload, smoke test
npm run deploy:raw # no checks
```

Open `preview.html` in a browser while `npm run dev` is running to see the
animation in an `<img>` tag, the way GitHub renders it.

## Deploy

### One-time Cloudflare setup

1. **Create a Cloudflare account** at [dash.cloudflare.com](https://dash.cloudflare.com),
   with your domain added as a zone. The zone must be in the same account as
   the Worker, and Cloudflare must be authoritative for its DNS — a Workers
   custom domain cannot attach to a zone hosted elsewhere. The Worker itself
   fits in the free plan.
2. **Copy the Account ID.** Dash → *Workers & Pages*, right sidebar.
3. **Create an API token.** Dash → *My Profile* → *API Tokens* → *Create Token*
   → **Edit Cloudflare Workers** template, scoped to your account and to your
   zone. That template already covers the custom domain; a
   minimal hand-rolled token needs *Account* → *Workers Scripts* → *Edit*,
   plus *Zone* → *Workers Routes* → *Edit* and *Zone* → *DNS* → *Edit*. Copy
   it now; the dash never shows it again.
4. **Fill in `.env`:**

   ```sh
   cp .env.example .env
   ```

   `WORKER_HOSTNAME` is required. The two Cloudflare values are only needed for
   unattended deploys — to deploy from your own machine, leave them blank and
   run `npx wrangler login` once instead; `deploy.sh` falls back to that
   session. `.env` is gitignored.

No workers.dev subdomain is needed: `workers_dev = false`, so the Worker is
reachable only at the custom domain.

### Deploying

```sh
./deploy.sh              # typecheck, test, upload, then smoke test the URL
./deploy.sh --dry-run    # build only; needs no credentials at all
./deploy.sh --skip-tests # upload without the checks
```

The script loads `.env`, installs dependencies if `node_modules` is missing,
refuses to upload code that fails `npm run typecheck` or `npm test`, and after
uploading fetches `https://$WORKER_HOSTNAME/` to confirm it answers
`200 image/svg+xml`. A brand-new hostname waits on certificate issuance, so a
first deploy may warn on that last check and be fine minutes later.

It calls wrangler through `npx` rather than `./node_modules/.bin/wrangler`: on
WSL against a Windows Node install, the local shim execs a bare `node` that is
not on `PATH`, while `npx` resolves the same wrangler and hands off to
`node.exe`.

### Continuous deployment

`.github/workflows/deploy-typing-svg.yml` deploys on push to `main`, filtered
to `typing-svg/**` so profile-README edits do not trigger it. It needs two
repository *secrets* (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and one
repository *variable* (`WORKER_HOSTNAME`).

The workflow runs each phase as its own step — install, typecheck, test,
deploy, smoke test — rather than one call to `deploy.sh`. Each step is a
one-liner delegating to a project command, so nothing is duplicated between CI
and local use, but a failure names its own phase in the UI instead of
surfacing as a deploy that never happened. The deploy step passes
`--skip-tests --no-smoke`, since the steps on either side of it cover both.

Keeping the smoke test separate is what makes "uploaded but not serving"
visibly different from "failed to upload". It exits 0 with a `::warning::`
when the hostname does not answer at all, because a certificate still being
issued is a wait rather than a defect, and fails only on a wrong answer.

### Runtime configuration

There is none, deliberately — no secrets, no bindings, no `wrangler secret put`.
Every knob is a query param clamped in `src/index.ts`, and `PHRASES` is compiled
into the bundle from `src/config.ts`. Changing a phrase means editing that file
and redeploying. `.env` holds deploy credentials only and is never read by the
Worker; `.dev.vars`, wrangler's local-runtime file, stays unused.

### Where the URL lives

The hostname is defined once, as **`WORKER_HOSTNAME`**, and nothing else
hardcodes it:

| Context | Source |
|---------|--------|
| Local   | `WORKER_HOSTNAME` in `.env` |
| CI      | the `WORKER_HOSTNAME` Actions **variable** (Settings → Secrets and variables → Actions → *Variables*) |

`deploy.sh` passes it to `wrangler deploy --domain "$WORKER_HOSTNAME"` and
builds the smoke-test URL from the same value, so `wrangler.toml` carries no
`routes` block at all. Changing the hostname means changing one variable, in
one place, plus the `<img src>` in the profile README.

It is a *variable* rather than a secret in CI on purpose: the hostname is
public — it is in the README — and marking it secret would only mask it out of
the deploy logs, where you actually want to read it.

### Custom domain

`wrangler` creates the proxied DNS record, the route, and the certificate
request on deploy. Nothing about it is manual. Two caveats:

- **The first deploy to a new hostname is slow to answer.** Certificate
  issuance takes minutes, not seconds. `deploy.sh` retries five times and then
  warns rather than failing, because the upload has already succeeded. Watch
  *Workers* → *typing-svg* → *Settings* → *Domains* for it to go active.
- **Renaming leaves the old hostname attached.** Dropping a custom domain from
  the config does not reliably tear down the hostname or its DNS record. After
  a rename, check *Domains & Routes* in the dash and delete the stale entry,
  or two hostnames will serve the same Worker.

There is no workers.dev fallback (`workers_dev = false`), so during that first
certificate wait the Worker has no reachable URL at all. `./deploy.sh
--dry-run` still verifies the build offline.

## Tests

`test/e2e.spec.ts` drives the deployed worker through `SELF.fetch` under
[`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/),
so requests go through the same workerd build that serves production — the
response contract, cache headers, SVG structure, animation invariants, options
and input validation are all exercised end to end. The sharpest assertion is
that **exactly one frame is opaque at all 500 sampled moments** of the loop,
which is what makes the stacked-`<text>` trick correct.

`test/timeline.spec.ts` covers what randomness hides from an E2E test: passing a
stubbed `rng` to `buildTimeline` pins the typo expansion, hold durations and
keystroke timing to exact expected values.

Note `compatibility_date` in `wrangler.toml` must stay within what the test
pool's bundled workerd supports, which can lag the one `wrangler dev` uses.

## How it works

- `src/typewriter.ts` builds the timeline: an ordered list of `{ text, dur }`
  frames, each the full visible string at that moment. A typo inserts two extra
  frames inline — the wrong adjacent key, held 2–3× a keystroke, then a backspace.
- `src/keyboard.ts` is the QWERTY adjacency map that picks a plausible wrong key.
- `src/svg.ts` stacks one `<text>` per frame and toggles opacity with SMIL, since
  the text content of an SVG node can't be animated declaratively. Every frame is
  drawn from the same left `x`, so no glyph is individually positioned and any
  font works without width math.

## Caching

Responses set `Cache-Control: no-cache, no-store, must-revalidate, max-age=0`
plus `Pragma`/`Expires`, so the phrase rotates between loads. GitHub proxies
README images through Camo, which caches regardless; these headers minimize its
TTL, but a given viewer may still see the same phrase repeat for a short window.
The animation itself always replays — caching only affects how often the *phrase*
changes.
