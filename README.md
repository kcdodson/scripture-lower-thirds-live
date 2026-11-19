# Scripture Slides — Live

Full-screen scripture slides for **A Heart For Healing** (Rev. AdaRa Walton),
built for OBS. Not a lower third — the slide fills almost the whole 1920×1080 frame.

## How it works

- **Dock / studio** — open the site normally. Type a reference, paste the verse
  text (George Lamsa translation — verse text is left blank, nothing is invented),
  hit **SHOW**. The dock saves the state to Vercel Blob via `POST /api/state`.
- **Overlay** — add a Browser Source in OBS with the overlay link (the dock
  shows it, auto-filled) at 1920×1080, e.g. `https://<your-app>.vercel.app/?mode=overlay`.
  The overlay polls `GET /api/state` about once a second. Paste the link **once** —
  changing the verse, SHOW/HIDE, size or background in the dock updates the
  overlay live, with slide/fade in, slide/fade out, and a cross-fade on verse change.
- No Muse sign-in is needed to use the Vercel URL.

## Setup

1. Push this repo to GitHub and connect it to a Vercel project.
2. Create a Vercel Blob store and link it to the project, so `BLOB_READ_WRITE_TOKEN`
   is set on the project (production + preview).
3. Redeploy. Open the site, confirm the dock loads and the status says “Live sync ready”.

## Files

- `index.html` — the whole app: dock view (default) and overlay view (`?mode=overlay`).
- `api/state.js` — `GET`/`POST /api/state`, backed by Vercel Blob (`state.json`).
- `package.json` / `vercel.json` — `@vercel/blob` dependency and function config.

Scripture presets (Colossians 4:2 and 3:15) load only the reference — the verse
text stays blank for Kacey to paste from the Lamsa translation.
