# Clipboard Sync System — Project Reference

## What this is

A universal clipboard sync system across three devices: Windows PC, Mac, and iPhone. Text copied or transcribed on any device can be pushed to the others via Supabase as a temporary mailbox. Push notifications route to the right device based on a `source` field.

---

## Repos

| Repo | Local path | Purpose |
|------|-----------|---------|
| `mammer55/sidu-voice` | `/Users/mustafaalbaree/voice-transcriber/` | PC tray app, Mac menu bar app |
| `mammer55/QR-Bridge` | `/Users/mustafaalbaree/Code/qr-bridge/` | Web-based Clip UI (PC browser) |

---

## Files that matter

### `/Users/mustafaalbaree/voice-transcriber/windows-tray/transcriber.pyw`
Windows system tray app (Python). Runs on the PC.
- Left-click → record audio → Groq Whisper → transcript → clipboard + push to Supabase as `source: 'pc'`
- Right-click menu: Auto ON/OFF (polls for incoming clips), Fetch Now, Send to iPhone, Send to Mac, Quit
- Auto mode starts **ON** by default, polls every 4s for `source` in `(null, ios, mac-to-pc)`
- "Send to iPhone" pushes `source: 'pc'` → triggers Bark notification to iPhone
- "Send to Mac" pushes `source: 'pc-to-mac'` → Mac menu bar app picks it up
- Toast notifications: green = recorded, blue = received from iPhone, orange = received from Mac or sent to Mac
- Groq transcription goes through a Cloudflare Worker proxy at `https://sido-voice.mammergaming55.workers.dev`

### `/Users/mustafaalbaree/voice-transcriber/mac-clip/mac_clip.py`
Mac menu bar app (Python + rumps). Runs on the Mac.
- Polls Supabase every 4s for `source: 'pc-to-mac'` clips → auto-copies to clipboard → macOS notification
- Right-click menu: Send to PC (opens dialog, pushes `source: 'mac-to-pc'`), Fetch Now, Quit
- Icon: SF Symbol `doc.on.clipboard` rendered to a temp PNG at startup so rumps picks it up as a template image (auto dark/light mode). If AppKit fails it falls back to 📋 emoji.
- Notifications use `osascript` (more reliable than `rumps.notification` on modern macOS)
- `Send to PC` dialog: calls `NSApp.activateIgnoringOtherApps_(True)` before `win.run()` so it appears on top

### `/Users/mustafaalbaree/voice-transcriber/mac-clip/setup.py`
py2app config. Builds `mac_clip.py` into a standalone `.app`.
- `LSUIElement: True` — app lives only in menu bar, no dock icon while running (but can be dragged to dock as launcher)
- Build: `cd mac-clip && .venv/bin/python3 setup.py py2app` → output at `dist/Clip Listener.app`
- Only rebuild when done with a batch of changes. For quick iteration, run the script directly via the venv.

### `/Users/mustafaalbaree/voice-transcriber/mac-clip/.venv/`
Virtual environment for the Mac app. Not committed.
- Install deps: `python3 -m venv .venv && .venv/bin/pip install rumps requests py2app`
- Run directly: `.venv/bin/python3 mac_clip.py`

### `/Users/mustafaalbaree/Code/qr-bridge/index.html`
Single-file web app (no build step). Open in browser on PC or any device.
- Push panel: inserts to Supabase `clips` table with `source: 'pc'`
- Pull panel: Supabase Realtime WebSocket subscription for instant delivery + 15s fallback poll
- "Auto" toggle: auto-copies new incoming clips to OS clipboard
- Hosted on GitHub Pages at `mammer55/QR-Bridge`

---

## Supabase project

- **Project ID / URL**: `https://owcukwsouruowulhohyq.supabase.co`
- **Anon key**: hardcoded in all three client files above (same key in all three)
- **Table**: `clips` — columns: `id`, `content`, `expires_at`, `created_at`, `source`

### `source` field routing

| Value | Set by | Picked up by |
|-------|--------|-------------|
| `'pc'` | transcriber.pyw, qr-bridge index.html | iPhone (via Bark notification → Shortcut) |
| `'pc-to-mac'` | transcriber.pyw "Send to Mac" | mac_clip.py (polls for this) |
| `'mac-to-pc'` | mac_clip.py "Send to PC" | transcriber.pyw auto-poll |
| `'ios'` | iPhone Shortcut (explicit) | transcriber.pyw auto-poll |
| `null` | iPhone Shortcut (legacy, no source field) | transcriber.pyw auto-poll |

### Database trigger (live in Supabase)

Function: `on_clip_insert()` — fires `AFTER INSERT` on `clips`.
Two responsibilities:
1. **Rolling buffer**: deletes rows beyond the 50 most recent on every insert
2. **Bark notification**: if `new.source = 'pc'`, calls Bark API via `pg_net.http_post` to notify iPhone

Bark webhook URL hardcoded in the trigger: `https://api.day.app/push` with device key `YRgCuJo3M5FhPEyamXBjBH`.

To view or edit the trigger: Supabase dashboard → Database → Functions → `on_clip_insert`, or SQL editor.

To update the trigger, re-run the `CREATE OR REPLACE FUNCTION` block in the SQL editor — no need to drop and recreate the trigger itself.

The `pg_net` extension must be enabled (`create extension if not exists pg_net`). Check Supabase → Database → Extensions.

---

## iPhone workflow (Shortcuts-based, not in any repo)

All iPhone-side logic lives in iOS Shortcuts — there is no iPhone app or code file.

**Shortcut: "PC Transcribe"**
- Fetches latest `source=eq.pc` clip from Supabase REST API
- URL: `https://owcukwsouruowulhohyq.supabase.co/rest/v1/clips?select=content&source=eq.pc&order=created_at.desc&limit=1`
- Header: `apikey: <anon key>`
- Gets first item → gets `content` value → copies to clipboard → shows notification

**Bark app** (installed on iPhone, device key: `YRgCuJo3M5FhPEyamXBjBH`)
- Receives push notification from Supabase trigger when `source='pc'` clip is inserted
- Notification `url` field is set to `shortcuts://run-shortcut?name=PC%20Transcribe`
- Tapping the notification launches the Shortcut which fetches and copies the clip

**Action button / voice transcription Shortcut**
- Action button triggers a Shortcut that records audio → sends to Groq Whisper → transcript → clipboard → pushes to Supabase with no `source` field (arrives as `null`)
- This does NOT trigger a Bark notification (trigger only fires for `source='pc'`)

---

## Push notification flow (PC → iPhone)

```
transcriber.pyw or qr-bridge
  → INSERT into clips (source='pc')
    → Postgres trigger on_clip_insert fires
      → net.http_post to https://api.day.app/push
        → Bark app on iPhone shows notification
          → user taps → shortcuts://run-shortcut?name=PC%20Transcribe
            → Shortcut fetches latest clip from Supabase → copies to clipboard
```

---

## Mac app rebuild workflow

```bash
cd /Users/mustafaalbaree/voice-transcriber/mac-clip
rm -rf build dist
.venv/bin/python3 setup.py py2app
# output: dist/Clip Listener.app
# drag to /Applications, then to dock
```

Kill the old app first (menu bar → Quit) before replacing it in /Applications.

---

## Known quirks

- `expires_at` is set to +24h on every insert but rows get deleted by the 50-row trigger long before they expire. The field is still filtered in the PC fetch query but it's largely redundant now.
- The Supabase anon key is the same in all three clients and is hardcoded. If rotated, update `transcriber.pyw`, `mac_clip.py`, and `qr-bridge/index.html`.
- Auto-copy on iPhone notification is not possible on iOS 14.5+ — tapping the Bark notification to run the Shortcut is the minimum required interaction.
- The Mac "Send to PC" dialog uses `NSApp.activateIgnoringOtherApps_(True)` to bring itself to front. Without this it appears behind all windows.
- transcriber.pyw starts with auto mode ON. The menu item toggles it off/on.
