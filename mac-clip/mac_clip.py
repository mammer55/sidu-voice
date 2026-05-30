"""
Mac menu bar clip listener.
Polls Supabase for clips with source='pc-to-mac' and copies them to clipboard.

Install: pip3 install rumps requests py2app
Run:     python3 mac_clip.py
Bundle:  python3 setup.py py2app  →  dist/Clip Listener.app
"""
import subprocess, threading, time
import rumps, requests

SUPA_URL     = 'https://owcukwsouruowulhohyq.supabase.co'
SUPA_ANON    = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
                '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93Y3'
                'Vrd3NvdXJ1b3d1bGhvaHlxIiwicm9sZSI6ImFub24'
                'iLCJpYXQiOjE3NzE5ODgzNzMsImV4cCI6MjA4NzU2'
                'NDM3M30.3njPBQGD1LEQc-h_j4VhAhngNzEH2p2gpqtRplqan_E')
SUPA_HEADERS = {'apikey': SUPA_ANON, 'Authorization': f'Bearer {SUPA_ANON}'}
POLL_SEC     = 4


def _fetch():
    try:
        res = requests.get(
            f'{SUPA_URL}/rest/v1/clips',
            headers=SUPA_HEADERS,
            params={'select': 'id,content', 'source': 'eq.pc-to-mac',
                    'order': 'created_at.desc', 'limit': '1'},
            timeout=10,
        )
        if res.ok and res.json():
            row = res.json()[0]
            return row['id'], row['content']
    except Exception:
        pass
    return None, None


def _push(content):
    try:
        expires_at = time.strftime('%Y-%m-%dT%H:%M:%SZ',
                                   time.gmtime(time.time() + 24 * 3600))
        res = requests.post(
            f'{SUPA_URL}/rest/v1/clips',
            headers={**SUPA_HEADERS, 'Content-Type': 'application/json',
                     'Prefer': 'return=minimal'},
            json={'content': content, 'expires_at': expires_at, 'source': 'mac-to-pc'},
            timeout=10,
        )
        return res.ok
    except Exception:
        return False


def _copy(text):
    subprocess.run(['pbcopy'], input=text.encode())


def _notify(message):
    preview = message[:100].replace('\\', '\\\\').replace('"', '\\"')
    subprocess.run(['osascript', '-e',
        f'display notification "{preview}" with title "Clip from PC" '
        f'subtitle "Copied to clipboard"'])


class ClipListener(rumps.App):
    def __init__(self):
        super().__init__('Clip Listener', title='', quit_button=None)
        self._setup_icon()
        self.menu = [
            rumps.MenuItem('Send to PC',  callback=self._send_to_pc),
            rumps.MenuItem('Fetch Now',   callback=self._fetch_now),
            None,
            rumps.MenuItem('Quit', callback=lambda _: rumps.quit_application()),
        ]
        self._last_id = None
        threading.Thread(target=self._poll, daemon=True).start()

    def _setup_icon(self):
        try:
            from AppKit import NSImage
            img = NSImage.imageWithSystemSymbolName_accessibilityDescription_(
                'doc.on.clipboard', 'Clip'
            )
            img.setTemplate_(True)
            btn = self._status_item.button()
            btn.setImage_(img)
            btn.setTitle_('')
        except Exception:
            self.title = '📋'

    def _poll(self):
        while True:
            row_id, content = _fetch()
            if content and row_id != self._last_id:
                self._last_id = row_id
                _copy(content)
                _notify(content)
            time.sleep(POLL_SEC)

    def _fetch_now(self, _):
        def _run():
            row_id, content = _fetch()
            if content:
                self._last_id = row_id
                _copy(content)
                _notify(content)
            else:
                subprocess.run(['osascript', '-e',
                    'display notification "Nothing waiting." with title "Clip Listener"'])
        threading.Thread(target=_run, daemon=True).start()

    def _send_to_pc(self, _):
        win = rumps.Window(
            message='',
            title='Send to PC',
            default_text='',
            ok='Send',
            cancel='Cancel',
            dimensions=(340, 80),
        )
        response = win.run()
        if response.clicked and response.text.strip():
            text = response.text.strip()
            def _run():
                ok = _push(text)
                msg = 'Sent to PC.' if ok else 'Push failed.'
                subprocess.run(['osascript', '-e',
                    f'display notification "{msg}" with title "Clip Listener"'])
            threading.Thread(target=_run, daemon=True).start()


if __name__ == '__main__':
    ClipListener().run()
