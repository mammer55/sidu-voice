# مسجّل الصوت — Voice Transcriber: Executive Report

**Prepared:** May 25, 2026  
**Project:** Arabic Voice Transcription PWA  
**Author:** Mustafa Albaree

---

## Executive Summary

مسجّل الصوت ("Voice Recorder") is a zero-infrastructure, installable web application that converts spoken Arabic into written text in seconds. Built specifically for elderly Arabic-speaking users, it combines state-of-the-art AI speech recognition with a large-button, right-to-left interface designed for people who are uncomfortable with complex technology. The entire application runs as a static website — no servers, no app stores, no downloads required.

---

## The Problem Being Solved

Typing Arabic is difficult. The script is complex, keyboards are confusing, and software keyboards on phones are particularly unforgiving for older users. For elderly Arabic speakers who want to communicate digitally — whether writing messages, taking notes, or composing longer documents — the barrier to entry is prohibitively high.

Existing voice-to-text solutions (Siri, Google Assistant, phone keyboards) either:
- Produce poor Arabic transcription quality
- Require navigating complex settings menus
- Are buried inside other apps, not a dedicated focused tool
- Do not work well for formal or classical Arabic pronunciation patterns common among older speakers

---

## Consumer Use Cases

### Primary: The Elderly Grandparent
The app was built for a specific person: an elderly Arabic-speaking grandfather. The use case is simple — press one large button, speak, press stop, receive text. The entire interface is in Arabic, displays right-to-left, and uses large readable fonts. No account needed, no password, no app store.

**Day-to-day scenarios:**
- Dictating a message to send via WhatsApp or email
- Writing notes without needing to type
- Composing longer letters or documents
- Preserving spoken stories or memories as text

### Secondary: Any Arabic-First User Who Prefers Speaking Over Typing
Arabic speakers of any age who find typing cumbersome — whether due to motor difficulties, low digital literacy, or simple preference — benefit from the same core experience.

### Tertiary: Journalists, Researchers, and Interviewers
The **Continuous Mode (مستمر)** enables real-time transcription of extended speech, making it suitable for:
- Recording and transcribing interviews
- Live note-taking during meetings
- Dictating long-form content without stopping

---

## Key Features

| Feature | User Benefit |
|---|---|
| One-button recording | Zero learning curve — intuitive for non-technical users |
| Full Arabic RTL interface | Native, comfortable experience for Arabic speakers |
| Accurate Mode | Record, then receive a clean polished transcript |
| Continuous Mode (مستمر) | Real-time transcription that builds up as you speak |
| Overwrite warning | Prevents accidental loss of already-typed text |
| Auto-save to device | Text is never lost between sessions |
| Installable on iPhone/Android | Works like a native app from the home screen |
| Offline shell | App opens even without internet; only transcription requires connectivity |
| Contact button | User can message the developer directly from within the app |
| Letter from Mustafa | Developer can send personal messages that appear as notifications inside the app |

---

## Marketing Narrative

### Positioning
> "The simplest way for an Arabic speaker to turn their voice into text — no typing, no complexity, no accounts."

### Target Audiences and Messages

**For families with elderly Arabic-speaking relatives:**
> "Give your grandparent a voice. مسجّل الصوت lets them speak and see their words appear instantly — no typing, no setup, just speak."

**For elderly users directly:**
> "اضغط زراً واحداً، تكلّم، وشاهد كلامك يتحوّل إلى نص فوراً."  
> ("Press one button, speak, and watch your words turn into text instantly.")

**For professionals and power users:**
> "Real-time Arabic speech-to-text with production-grade Whisper AI — runs in your browser, installs on any device, zero infrastructure."

### Distribution
Because this is a Progressive Web App (PWA), distribution requires no app store approval, no developer accounts, and no installation friction:
1. Share a single URL
2. User visits in Safari or Chrome
3. User taps "Add to Home Screen"
4. Icon appears on home screen; opens full-screen like a native app

This means the app can be shared via WhatsApp, SMS, or any messaging platform with a single link.

---

## Technical Architecture

### Stack
- **Frontend:** Vanilla HTML/CSS/JavaScript — no framework, no build step
- **AI Transcription:** [Groq API](https://groq.com) with OpenAI Whisper models
- **Hosting:** GitHub Pages (free, HTTPS, CDN-backed)
- **Offline Support:** Service Worker caches the app shell
- **Persistence:** Browser localStorage for text autosave
- **Alerting:** Google Apps Script webhook for error notifications and the letter/contact system

### Why Groq + Whisper
Groq runs Whisper inference on custom LPU (Language Processing Unit) hardware, delivering transcription latency in the 300–800ms range for a 5-second audio chunk — significantly faster than comparable cloud alternatives. The `whisper-large-v3-turbo` model is used by default, balancing speed and Arabic accuracy. The `whisper-large-v3` model is available via the developer panel for higher accuracy when needed.

### Two Recording Modes

**Accurate Mode**
- User records an entire passage, then stops
- The complete audio blob is sent to Groq Whisper in one request
- Best for short to medium dictations where final polish matters
- Includes automatic retry on failure (one silent retry, then manual retry option)

**Continuous Mode (مستمر)**
- Audio is recorded in rolling chunks (default: 5 seconds each)
- Each chunk is transcribed independently and appended to the text area in real time
- A rate-limiter prevents exceeding Groq's API quota (capped at 18 requests/minute, safely below the 20/min limit)
- If rate-limited (HTTP 429), the app pauses with a visible countdown and resumes automatically
- Best for extended dictation sessions, interviews, or live transcription

### Rate Limiting and Reliability
The continuous mode implements a sliding-window rate limiter:
- Maintains a rolling 60-second timestamp log of outbound requests
- Pauses sending when within 2 requests of the API limit
- Queues all unprocessed chunks and drains the queue automatically when capacity resumes
- Applies an exponential-style 429 cooldown (default: 30 seconds) to recover gracefully from quota errors

### Error Handling and Remote Alerting
When transcription fails after retries, the app silently fires a webhook to a Google Apps Script endpoint, which emails the developer with:
- The error message
- Device user-agent
- Timestamp
- API key prefix (for triage)

This gives the developer visibility into failures on a remote device (e.g., the grandparent's iPad) without needing the user to report anything.

### Developer Mode
A hidden panel (activated via `Ctrl+Shift+D` on desktop, or 5 rapid taps on the title on mobile) exposes live controls:

| Control | Purpose |
|---|---|
| Chunk Duration slider | Tune latency vs. queue buildup |
| Max Req/Min slider | Adjust rate limit ceiling |
| 429 Cooldown slider | Set recovery pause duration |
| Whisper Model selector | Switch between turbo, large-v3, or English-only |
| Live stats dashboard | Rolling RPM, queue depth, avg latency, blob size |
| Request log with CSV export | Audit every API call with status and latency |
| Simulate 429 button | Test rate-limit handling without hitting the API |

### PWA and Offline
`manifest.json` declares the app as installable with a green microphone icon, full-screen display mode, and Arabic (`ar`) language. The service worker pre-caches all static assets at install time. Subsequent loads are instant and work without a network connection — only the Whisper API calls require internet.

### Security Posture
The Groq API key is embedded in the JavaScript source. This is an intentional trade-off for a zero-infrastructure single-user deployment:
- The app has no server to hold secrets
- The key can be scoped or rate-limited at the Groq console level
- For a production multi-user deployment, a lightweight proxy (Cloudflare Worker, Vercel Function) would move the key server-side in under an hour of work

---

## Deployment

The app requires no build tools, no Node.js, and no configuration:

```
git push → GitHub Pages → live in ~60 seconds
```

A GitHub Actions workflow (`deploy.yml`) is included for automated deploys on push to `main`.

---

## Browser Compatibility

| Browser | Supported |
|---|---|
| Safari (iOS 14.5+) | Yes |
| Chrome (Android, Desktop) | Yes |
| Firefox | Yes |
| Edge | Yes |

Microphone access requires HTTPS. GitHub Pages provides this automatically.

---

## Potential Growth Paths

1. **Multi-user / SaaS:** Add a serverless proxy to hide the API key, implement user accounts, and offer this as a subscription service for Arabic-speaking families or accessibility-focused organizations.

2. **Dialect support:** Whisper supports dialect detection. An explicit dialect selector (Egyptian, Gulf, Levantine, Moroccan) could improve accuracy for regional users.

3. **Export options:** Add PDF export, direct WhatsApp share, or email composition from the transcript box.

4. **Translation mode:** A toggle to transcribe Arabic speech and simultaneously translate to English (or vice versa) would open the app to Arabic learners and bilingual households.

5. **Accessibility expansion:** The same architecture applies to any language with a strong Whisper model — Urdu, Farsi, Turkish — serving similarly underserved elderly populations.

---

## Summary

مسجّل الصوت is a tightly scoped, production-quality tool that solves a real and underserved problem: making digital text accessible to elderly Arabic speakers who cannot type comfortably. It is deployed today, costs nothing to host, requires no maintenance infrastructure, and was built and iterated entirely in a browser-native stack. The core insight — that a single large button and AI-grade speech recognition can replace the entire Arabic keyboard for a target user — is what makes it both technically elegant and genuinely useful.
