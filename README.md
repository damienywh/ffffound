# Private FFFFOUND

A minimal static site that sits above the Are.na FFFFOUND archive and learns your preferences from upvotes, downvotes, hides, opens, and seed words.

## What's included

- `public/index.html` — the app shell
- `public/styles.css` — the minimal Kinfolk-ish layout
- `public/app.js` — local ranking, pagination, voting, import/export, and data loading
- `cloudflare-worker/worker.js` — optional proxy for Are.na requests
- `cloudflare-worker/wrangler.toml` — Cloudflare Worker config starter

## How it works

The app stores your profile in `localStorage`.

Signals used for ranking:
- words extracted from titles/descriptions/domains
- domains you consistently upvote or downvote
- simple aspect/orientation bias (portrait / landscape / square)
- recency and exploration bonus for unseen items
- optional seed words you type in manually

## Deploy the front end

### GitHub Pages
1. Put the contents of `public/` into your repo root or docs folder.
2. Enable GitHub Pages for that branch/folder.
3. Open the site.
4. If direct Are.na requests fail in your browser, deploy the Cloudflare Worker and switch the app to `Cloudflare proxy` mode.

### Cloudflare Pages
1. Upload the `public/` folder as your static site.
2. Deploy.
3. Use direct mode or proxy mode.

## Deploy the proxy

The proxy is optional, but useful if you want a stable endpoint with caching or if direct browser requests to Are.na are blocked by CORS or rate limits.

### Cloudflare Worker
1. `cd cloudflare-worker`
2. `npm install -g wrangler` if needed.
3. `wrangler deploy`
4. Optional: `wrangler secret put ARENA_TOKEN`
5. Copy your worker URL.
6. In the app, choose `Cloudflare proxy` and paste the worker URL into `Proxy base URL`.

The app will call:

`YOUR_WORKER_URL/api/arena/channel?slug=ffffound-archive&page=1&per=36`

## Privacy notes

- Your votes and hidden items stay in your browser unless you export them.
- The included worker only proxies paginated requests. It does not scrape the full archive.

## Suggested next upgrades

- keyboard shortcuts (`j`, `k`, `o`, `↑`, `↓`)
- color and texture clustering using a tiny embedding or image palette extractor
- saved collections / moodboards
- multi-channel blending
- sign-in and synced private taste profiles
