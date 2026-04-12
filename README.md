# ffffound

A minimal, private, taste-learning image browser over the Are.na FFFFOUND archive.

Infinite scroll. No titles. No clutter. Just images that learn what you like.

## How it works

- **Masonry feed** pulls pages from the `ffffound-archive` channel on Are.na
- **Infinite scroll** loads and ranks images continuously
- **Click any image** to open the fullscreen viewer
- **Like / Dislike** teaches the algorithm your taste — liked content floats up, disliked content disappears
- **Save to collections** to organize images into personal folders
- **Dark mode** toggle in the top bar

### Ranking algorithm

The feed learns from your votes using:

- **Token similarity** — words from titles/descriptions of liked images boost similar content
- **Domain affinity** — if you consistently like images from certain sources, more appear
- **Aspect preference** — portrait/landscape/square bias learned from your votes
- **Recency weighting** — recent votes matter more than old ones
- **Domain diversity** — prevents the feed from clustering around one source
- **Serendipity noise** — random factor to keep discovery alive

Downvotes strongly suppress content. The feed re-ranks on every scroll cycle.

### Keyboard shortcuts (in viewer)

| Key | Action |
|-----|--------|
| `f` | Like |
| `x` | Dislike |
| `s` | Save to collection |
| `o` | Open original |
| `←` / `k` | Previous |
| `→` / `j` | Next |
| `Esc` | Close |

### Collections

- Create named collections from the save modal
- Browse collections from the ⊞ panel
- Toggle images in/out of collections
- "All liked" virtual collection auto-generated

### Persistence

Everything is stored in `localStorage` by default. Use **export** to back up your profile (interactions + folders) and **import** to restore it.

## Optional: Firebase cloud sync

Enable sign-in to sync your taste profile across browsers and devices.

### 1. Create a Firebase project

1. Create a project in [Firebase Console](https://console.firebase.google.com)
2. Add a Web app
3. Copy the config object
4. Enable Authentication (Google provider)
5. Enable Cloud Firestore

### 2. Add your config

Edit `public/firebase-config.js`:

```js
window.FFFFOUND_FIREBASE = {
  enabled: true,
  config: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
  },
  providers: {
    google: true,
    facebook: false
  }
};
```

### 3. Apply Firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4. Add your domain to Firebase Auth

Add your deployed domain to Firebase Authentication → Authorized domains.

## Optional: Are.na proxy

If direct Are.na API calls fail (CORS/rate limits), deploy the Cloudflare Worker:

```
cd cloudflare-worker
wrangler deploy
```

Then modify the `CHANNEL` fetch URL in `app.js` to point to your worker.

## Deploy

Upload the `public/` folder to any static host:
- Cloudflare Pages
- GitHub Pages
- Netlify
- Vercel
- Any web server

## Files

```
public/
  index.html            — app shell
  styles.css            — editorial dark/light theme
  app.js                — feed engine, ranking, viewer, folders, Firebase
  firebase-config.js    — placeholder config (edit to enable sync)
cloudflare-worker/
  worker.js             — optional Are.na API proxy
  wrangler.toml         — Cloudflare Worker config
firestore.rules         — recommended Firestore security rules
```
