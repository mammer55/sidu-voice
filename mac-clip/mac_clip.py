"""
Mac menu bar clip listener.
Polls Supabase for clips with source='pc-to-mac' and copies them to clipboard.

Install: pip3 install rumps requests
Run:     python3 mac_clip.py
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


def _copy(text):
    subprocess.run(['pbcopy'], input=text.encode())


class ClipListener(rumps.App):
    def __init__(self):
        super().__init__('📋', quit_button=None)
        self.menu = [
            rumps.MenuItem('Fetch Now', callback=self._fetch_now),
            None,
            rumps.MenuItem('Quit', callback=lambda _: rumps.quit_application()),
        ]
        self._last_id = None
        threading.Thread(target=self._poll, daemon=True).start()

    def _poll(self):
        while True:
            row_id, content = _fetch()
            if content and row_id != self._last_id:
                self._last_id = row_id
                _copy(content)
                rumps.notification(
                    'Clip from PC', 'Copied to clipboard',
                    content[:80] + ('…' if len(content) > 80 else ''),
                )
            time.sleep(POLL_SEC)

    def _fetch_now(self, _):
        def _run():
            row_id, content = _fetch()
            if content:
                self._last_id = row_id
                _copy(content)
                rumps.notification(
                    'Clip from PC', 'Copied to clipboard',
                    content[:80] + ('…' if len(content) > 80 else ''),
                )
            else:
                rumps.notification('Clip Listener', '', 'Nothing waiting.')
        threading.Thread(target=_run, daemon=True).start()


if __name__ == '__main__':
    ClipListener().run()
