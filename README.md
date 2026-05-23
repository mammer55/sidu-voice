# مسجّل الصوت — Voice Transcriber

A single-page PWA for elderly Arabic-speaking users. Press **سجّل**, speak, press **أوقف**, and the transcribed Arabic text appears instantly. Tap **انسخ** to copy.

## Deploy to GitHub Pages (no build step)

1. **Create a new GitHub repository** (public or private).

2. **Push all files to the `main` branch:**
   ```bash
   cd voice-transcriber
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

3. **Enable GitHub Pages:**
   - Go to the repository on GitHub.
   - Click **Settings → Pages**.
   - Under *Branch*, select `main` and folder `/` (root).
   - Click **Save**.

4. **Wait ~60 seconds**, then visit `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

That's it — no build tools, no Node.js, no configuration.

## Add to Home Screen (iPad / iPhone)

1. Open the GitHub Pages URL in Safari.
2. Tap the **Share** button (box with arrow).
3. Tap **"Add to Home Screen"**.
4. The app icon (green microphone) will appear on the home screen and opens full-screen.

## Add to Home Screen (Android)

1. Open the URL in Chrome.
2. Tap the three-dot menu → **"Add to Home screen"**.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell and markup |
| `style.css` | All styling |
| `app.js` | Recording, Groq API, retry logic |
| `manifest.json` | PWA metadata (name, icon, theme) |
| `sw.js` | Service worker — caches shell for offline |
| `icon.svg` | App icon (green microphone) |

## Security note

The Groq API key is embedded in `app.js` and visible in the browser's source. This is intentional for a zero-infrastructure static deployment. If you need to keep the key private in the future, add a small serverless proxy (e.g. a Cloudflare Worker or Vercel function) that holds the key server-side.

## Browser support

Works in Chrome, Safari (iOS 14.5+), Firefox, and Edge. Microphone access requires HTTPS — GitHub Pages provides this automatically.
