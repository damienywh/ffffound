# Private FFFFOUND

A minimal static site that sits above the Are.na FFFFOUND archive and learns your preferences from upvotes, downvotes, hides, opens, and seed words.

This version adds optional user accounts through Firebase Authentication and stores synced preferences in Cloud Firestore, so your taste profile can follow you across browsers.

## What's included

- `public/index.html` — the app shell
- `public/styles.css` — the minimal Kinfolk-ish layout
- `public/app.js` — local ranking, pagination, voting, import/export, Firebase auth, and sync
- `public/firebase-config.js` — local placeholder config file for browser-only mode
- `public/firebase-config.example.js` — copy this when you are ready to enable sign-in
- `cloudflare-worker/worker.js` — optional proxy for Are.na requests
- `cloudflare-worker/wrangler.toml` — Cloudflare Worker config starter
- `firestore.rules` — recommended Firestore security rules

## How it works

### Local-only mode

If you do nothing, the app stores your profile in `localStorage`.

Signals used for ranking:
- words extracted from titles and descriptions
- domains you consistently upvote or downvote
- simple aspect/orientation bias (portrait / landscape / square)
- recency and exploration bonus for unseen items
- optional seed words you type manually

### Signed-in mode

If you add Firebase config and sign in:
- Google sign-in works out of the box once enabled in Firebase
- Facebook sign-in can also be enabled if you supply provider credentials in Firebase and set `providers.facebook` to `true`
- settings are stored in `users/{uid}/private/profile`
- interactions are stored in `users/{uid}/interactions/{itemId}`
- local data and remote data are merged by most recent interaction timestamp

## Enable user accounts

### 1) Create a Firebase project

In Firebase:
1. Create a project.
2. Add a **Web app**.
3. Copy the Firebase config object.
4. Enable **Authentication**.
5. Enable **Cloud Firestore**.

### 2) Add your config file

Replace `public/firebase-config.js` with your real values, or copy `public/firebase-config.example.js` over it.

Example:

```js
window.FFFFOUND_FIREBASE = {
  enabled: true,
  config: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID'
  },
  providers: {
    google: true,
    facebook: false
  }
};
```

### 3) Enable sign-in providers

#### Google
Enable Google in Firebase Authentication.

#### Facebook
If you want Facebook as well:
1. Create a Facebook app.
2. Turn on Facebook Login.
3. Paste the Facebook App ID and App Secret into Firebase Authentication.
4. Set `providers.facebook` to `true` in `firebase-config.js`.

### 4) Add your deployed domain to Firebase Auth

Important when deploying to GitHub Pages, Cloudflare Pages, or a custom domain:
- add your site domain to Firebase Authentication **authorized domains**
- if you use a custom auth domain, make sure your `authDomain` in the Firebase config matches it

Examples:
- `yourname.github.io`
- `ffffound.yourdomain.com`
- `your-project.pages.dev`

### 5) Apply Firestore security rules

Use `firestore.rules`:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This keeps every user's synced taste profile private to that user's UID.

## Deploy the front end

### GitHub Pages
1. Put the contents of `public/` into your repo root or docs folder.
2. Enable GitHub Pages for that branch or folder.
3. Make sure the deployed domain is listed in Firebase Authentication authorized domains.
4. Open the site.
5. If direct Are.na requests fail in your browser, deploy the Cloudflare Worker and switch the app to `Cloudflare proxy` mode.

### Cloudflare Pages
1. Upload the `public/` folder as your static site.
2. Deploy.
3. Make sure the deployed domain is listed in Firebase Authentication authorized domains.
4. Use direct mode or proxy mode.

## Deploy the Are.na proxy

The proxy is optional, but useful if you want a stable endpoint with caching or if direct browser requests to Are.na are blocked by CORS or rate limits.

### Cloudflare Worker
1. `cd cloudflare-worker`
2. `npm install -g wrangler` if needed
3. `wrangler deploy`
4. Optional: `wrangler secret put ARENA_TOKEN`
5. Copy your worker URL
6. In the app, choose `Cloudflare proxy` and paste the worker URL into `Proxy base URL`

The app calls:

`YOUR_WORKER_URL/api/arena/channel?slug=ffffound-archive&page=1&per=36`

## Privacy notes

- In local-only mode, your votes and hidden items stay in your browser unless you export them.
- In signed-in mode, data is stored in your own Firebase project, not in a third-party backend I run.
- The included worker only proxies paginated requests. It does not scrape the full archive.

## Suggested next upgrades

- keyboard shortcuts (`j`, `k`, `o`, `↑`, `↓`)
- palette clustering or lightweight embeddings for stronger visual similarity
- saved collections / moodboards
- multi-channel blending
- friends-only sharing or invite-only accounts
