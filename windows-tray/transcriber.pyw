"""
Voice Transcriber + Clip Bridge — Windows system tray app

Left-click  : start recording  (dialog appears)
              click Stop       -> transcribe -> clipboard + notification
Right-click : Auto ON/OFF      -> polls iPhone clips every 4s
              Fetch Now        -> one-shot fetch from iPhone
              Quit
"""
import io, time, threading
import tkinter as tk
import requests, pyperclip, numpy as np
import sounddevice as sd, soundfile as sf
from pystray import Icon, Menu, MenuItem
from PIL import Image, ImageDraw

# ── Config ─────────────────────────────────────────────────────────────────────
WORKER_URL   = 'https://sido-voice.mammergaming55.workers.dev'
SUPA_URL     = 'https://owcukwsouruowulhohyq.supabase.co'
SUPA_ANON    = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
                '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93Y3'
                'Vrd3NvdXJ1b3d1bGhvaHlxIiwicm9sZSI6ImFub24'
                'iLCJpYXQiOjE3NzE5ODgzNzMsImV4cCI6MjA4NzU2'
                'NDM3M30.3njPBQGD1LEQc-h_j4VhAhngNzEH2p2gpqtRplqan_E')
SUPA_HEADERS = {'apikey': SUPA_ANON, 'Authorization': f'Bearer {SUPA_ANON}'}
SAMPLERATE   = 16000
POLL_SEC     = 4

# ── Palette ────────────────────────────────────────────────────────────────────
BG      = '#1c1c1e'
SURFACE = '#2c2c2e'
WHITE   = '#ffffff'
MUTED   = '#8e8e93'
GREEN   = '#30d158'
RED     = '#ff453a'
ORANGE  = '#ff9f0a'
BLUE    = '#0a84ff'

# ── State ──────────────────────────────────────────────────────────────────────
_recording    = False
_audio_data   = []
_stream       = None
_icon         = None
_root         = None
_dialog       = None
_push_dialog  = None
_auto_mode    = False
_last_seen_id = None
_poll_stop    = threading.Event()


# ── Tray icon ──────────────────────────────────────────────────────────────────

def _make_icon(state='idle'):
    color = {'idle': '#1a7a6e', 'recording': '#c0392b',
             'processing': '#e67e22', 'auto': '#0a6ebd'}[state]
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    d.ellipse([2, 2, 62, 62], fill=color)
    d.ellipse([22, 10, 42, 36], fill='white')
    d.rectangle([29, 36, 35, 46], fill='white')
    d.arc([18, 26, 46, 50], 0, 180, fill='white', width=3)
    d.rectangle([26, 49, 38, 52], fill='white')
    return img


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_destroy(w):
    try:
        w.destroy()
    except Exception:
        pass

def _idle_icon():
    return _make_icon('auto' if _auto_mode else 'idle')


# ── Toast notification ─────────────────────────────────────────────────────────

def _notify(text, source='recorded'):
    """
    source: 'recorded'  - transcribed on this PC
            'fetched'   - received from iPhone
            'nothing'   - nothing new found
    """
    def _show():
        W = 300

        toast = tk.Toplevel(_root)
        toast.overrideredirect(True)
        toast.attributes('-topmost', True)
        toast.configure(bg=BG)

        tag, color = {
            'recorded': ('Recorded on PC',       GREEN),
            'fetched':  ('Received from iPhone', BLUE),
            'sent':     ('Sent to iPhone',       GREEN),
            'nothing':  ('Nothing new',          MUTED),
        }.get(source, ('Done', GREEN))

        # Accent bar
        tk.Frame(toast, bg=color, height=3).pack(fill='x')

        body = tk.Frame(toast, bg=BG, padx=14, pady=10)
        body.pack(fill='both', expand=True)

        # Header: label + dismiss
        row = tk.Frame(body, bg=BG)
        row.pack(fill='x', pady=(0, 5))
        tk.Label(row, text=tag, font=('Segoe UI', 9, 'bold'),
                 fg=color, bg=BG).pack(side='left')
        x_btn = tk.Label(row, text='✕', font=('Segoe UI', 9),
                         fg=MUTED, bg=BG, cursor='hand2')
        x_btn.pack(side='right')

        # Preview
        if text:
            preview = text[:100] + ('...' if len(text) > 100 else '')
            tk.Label(body, text=preview, font=('Segoe UI', 10),
                     fg=WHITE, bg=BG, wraplength=W - 32,
                     justify='left').pack(anchor='w')

        toast.update_idletasks()
        sw = toast.winfo_screenwidth()
        sh = toast.winfo_screenheight()
        h  = toast.winfo_height()
        toast.geometry(f'{W}x{h}+{sw - W - 14}+{sh - h - 54}')

        x_btn.bind('<Button-1>', lambda e: _safe_destroy(toast))
        toast.after(4500, lambda: _safe_destroy(toast))

    _root.after(0, _show)


# ── Recording dialog ───────────────────────────────────────────────────────────

def _show_dialog():
    global _dialog
    if _dialog:
        return

    _dialog = tk.Toplevel(_root)
    w = _dialog
    w.overrideredirect(True)
    w.attributes('-topmost', True)
    w.configure(bg=BG)

    sw = w.winfo_screenwidth()
    w.geometry(f'230x108+{sw - 246}+20')

    # Red accent bar
    tk.Frame(w, bg=RED, height=3).pack(fill='x')

    body = tk.Frame(w, bg=BG, padx=16, pady=10)
    body.pack(fill='both', expand=True)

    # Top row: pulsing dot + label + timer
    top = tk.Frame(body, bg=BG)
    top.pack(fill='x', pady=(0, 9))

    dot = tk.Canvas(top, width=10, height=10, bg=BG, highlightthickness=0)
    dot.pack(side='left', padx=(0, 8), pady=2)
    dot_id = dot.create_oval(1, 1, 9, 9, fill=RED, outline='')

    tk.Label(top, text='Recording', font=('Segoe UI', 11, 'bold'),
             fg=WHITE, bg=BG).pack(side='left')

    timer_var = tk.StringVar(value='0:00')
    tk.Label(top, textvariable=timer_var, font=('Segoe UI', 9),
             fg=MUTED, bg=BG).pack(side='right')

    # Stop button
    tk.Button(body, text='Stop', font=('Segoe UI', 10, 'bold'),
              bg=RED, fg=WHITE, relief='flat', activebackground='#cc2200',
              activeforeground=WHITE, cursor='hand2', pady=5, bd=0,
              command=_on_stop_clicked).pack(fill='x')

    # Pulse dot + tick timer
    t0 = time.time()
    vis = [True]

    def _tick():
        if not _dialog:
            return
        vis[0] = not vis[0]
        dot.itemconfig(dot_id, fill=RED if vis[0] else BG)
        elapsed = int(time.time() - t0)
        timer_var.set(f'{elapsed // 60}:{elapsed % 60:02d}')
        w.after(500, _tick)

    _tick()
    w.protocol('WM_DELETE_WINDOW', _on_stop_clicked)


def _close_dialog():
    global _dialog
    if _dialog:
        _safe_destroy(_dialog)
        _dialog = None


# ── Audio ──────────────────────────────────────────────────────────────────────

def _audio_callback(indata, frames, time_info, status):
    if _recording:
        _audio_data.append(indata.copy())


def _start():
    global _recording, _audio_data, _stream
    _recording  = True
    _audio_data = []
    _stream = sd.InputStream(samplerate=SAMPLERATE, channels=1,
                              dtype='float32', callback=_audio_callback)
    _stream.start()
    _icon.icon = _make_icon('recording')


def _stop():
    global _recording, _stream
    if not _recording:
        return
    _recording = False
    if _stream:
        _stream.stop()
        _stream.close()
        _stream = None
    _icon.icon = _make_icon('processing')


def _on_stop_clicked():
    _root.after(0, _close_dialog)
    _stop()
    if _audio_data:
        data = np.concatenate(_audio_data, axis=0)
        threading.Thread(target=_transcribe, args=(data,), daemon=True).start()
    else:
        _icon.icon = _idle_icon()


def _transcribe(audio):
    buf = io.BytesIO()
    sf.write(buf, audio, SAMPLERATE, format='WAV', subtype='PCM_16')
    buf.seek(0)
    try:
        res = requests.post(
            WORKER_URL,
            files={'file': ('audio.wav', buf, 'audio/wav')},
            data={'model': 'whisper-large-v3-turbo', 'language': 'en'},
            timeout=30,
        )
        if res.ok:
            text = res.json().get('text', '').strip()
            if text:
                pyperclip.copy(text)
                _push_supabase(text)   # makes it fetchable on iPhone
                _notify(text, source='recorded')
            else:
                _notify('', source='nothing')
        else:
            _notify(f'Error {res.status_code}', source='nothing')
    except Exception as e:
        _notify(str(e), source='nothing')
    finally:
        _icon.icon = _idle_icon()


# ── Supabase ───────────────────────────────────────────────────────────────────

def _fetch_supabase():
    """Returns (id, content) or (None, None)."""
    try:
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        res = requests.get(
            f'{SUPA_URL}/rest/v1/clips',
            headers=SUPA_HEADERS,
            params={'select': 'id,content', 'expires_at': f'gt.{now}',
                    'order': 'created_at.desc', 'limit': '1'},
            timeout=10,
        )
        if res.ok:
            data = res.json()
            if data:
                return data[0]['id'], data[0]['content']
    except Exception:
        pass
    return None, None


def _push_supabase(content):
    """Push content to Supabase clips table. Returns True on success."""
    try:
        expires_at = time.strftime('%Y-%m-%dT%H:%M:%SZ',
                                   time.gmtime(time.time() + 24 * 3600))
        res = requests.post(
            f'{SUPA_URL}/rest/v1/clips',
            headers={**SUPA_HEADERS,
                     'Content-Type': 'application/json',
                     'Prefer': 'return=minimal'},
            json={'content': content, 'expires_at': expires_at},
            timeout=10,
        )
        return res.ok
    except Exception:
        return False


def _fetch_now(icon=None, item=None):
    def _run():
        global _last_seen_id
        row_id, content = _fetch_supabase()
        if content:
            _last_seen_id = row_id
            pyperclip.copy(content)
            _notify(content, source='fetched')
        else:
            _notify('', source='nothing')
    threading.Thread(target=_run, daemon=True).start()


# ── Auto polling ───────────────────────────────────────────────────────────────

def _poll_loop():
    global _last_seen_id
    while not _poll_stop.is_set():
        row_id, content = _fetch_supabase()
        if content and row_id != _last_seen_id:
            _last_seen_id = row_id
            pyperclip.copy(content)
            _notify(content, source='fetched')
        _poll_stop.wait(POLL_SEC)


def _toggle_auto(icon=None, item=None):
    global _auto_mode, _poll_stop
    _auto_mode = not _auto_mode
    if _auto_mode:
        _poll_stop = threading.Event()
        # _poll_loop fetches immediately on first iteration before waiting
        threading.Thread(target=_poll_loop, daemon=True).start()
        _icon.icon = _make_icon('auto')
    else:
        _poll_stop.set()
        _icon.icon = _make_icon('idle')


# ── Send to iPhone dialog ──────────────────────────────────────────────────────

def _show_push_dialog():
    global _push_dialog
    if _push_dialog:
        try:
            _push_dialog.lift()
        except Exception:
            pass
        return

    _push_dialog = tk.Toplevel(_root)
    w = _push_dialog
    w.overrideredirect(True)
    w.attributes('-topmost', True)
    w.configure(bg=BG)

    sw = w.winfo_screenwidth()
    sh = w.winfo_screenheight()
    W, H = 300, 190
    w.geometry(f'{W}x{H}+{(sw - W) // 2}+{(sh - H) // 2}')

    # Blue accent bar
    tk.Frame(w, bg=BLUE, height=3).pack(fill='x')

    body = tk.Frame(w, bg=BG, padx=14, pady=10)
    body.pack(fill='both', expand=True)

    # Header
    hdr = tk.Frame(body, bg=BG)
    hdr.pack(fill='x', pady=(0, 8))
    tk.Label(hdr, text='Send to iPhone', font=('Segoe UI', 10, 'bold'),
             fg=BLUE, bg=BG).pack(side='left')
    x = tk.Label(hdr, text='✕', font=('Segoe UI', 10),
                 fg=MUTED, bg=BG, cursor='hand2')
    x.pack(side='right')
    x.bind('<Button-1>', lambda e: _close_push_dialog())

    # Text area
    txt = tk.Text(w, font=('Segoe UI', 10), bg=SURFACE, fg=WHITE,
                  relief='flat', wrap='word', insertbackground=WHITE,
                  height=5, bd=0, padx=8, pady=6,
                  highlightthickness=1, highlightbackground=SURFACE,
                  highlightcolor=BLUE)
    txt.pack(fill='both', expand=True, padx=14, pady=(0, 8))
    txt.focus_set()

    # Buttons
    btn_row = tk.Frame(body, bg=BG)
    btn_row.pack(fill='x')

    def _do_send():
        text = txt.get('1.0', 'end').strip()
        if not text:
            return
        _close_push_dialog()
        def _run():
            ok = _push_supabase(text)
            _notify(text if ok else 'Push failed', source='sent' if ok else 'nothing')
        threading.Thread(target=_run, daemon=True).start()

    def _do_paste():
        try:
            txt.delete('1.0', 'end')
            txt.insert('1.0', pyperclip.paste())
        except Exception:
            pass

    tk.Button(btn_row, text='Paste', font=('Segoe UI', 9),
              bg=SURFACE, fg=WHITE, relief='flat', bd=0,
              cursor='hand2', padx=10, pady=4,
              command=_do_paste).pack(side='left')
    tk.Button(btn_row, text='Send', font=('Segoe UI', 9, 'bold'),
              bg=BLUE, fg=WHITE, relief='flat', bd=0,
              cursor='hand2', padx=16, pady=4,
              command=_do_send).pack(side='right')

    w.bind('<Return>', lambda e: _do_send())
    w.protocol('WM_DELETE_WINDOW', _close_push_dialog)


def _close_push_dialog():
    global _push_dialog
    if _push_dialog:
        _safe_destroy(_push_dialog)
        _push_dialog = None


# ── Tray ───────────────────────────────────────────────────────────────────────

def _on_click(icon=None, item=None):
    if not _recording:
        _start()
        _root.after(0, _show_dialog)


def _on_quit(icon=None, item=None):
    if _recording:
        _stop()
    _poll_stop.set()
    _icon.stop()
    _root.quit()


# ── Entry point ────────────────────────────────────────────────────────────────

_root = tk.Tk()
_root.withdraw()

_icon = Icon(
    'VoiceTranscriber',
    _make_icon('idle'),
    'Voice Transcriber',
    menu=Menu(
        MenuItem('Start Recording', _on_click, default=True),
        MenuItem(lambda item: f'Auto: {"ON  " if _auto_mode else "OFF"}', _toggle_auto),
        MenuItem('Fetch Now', _fetch_now),
        MenuItem('Send to iPhone', lambda icon, item: _root.after(0, _show_push_dialog)),
        Menu.SEPARATOR,
        MenuItem('Quit', _on_quit),
    ),
)

threading.Thread(target=_icon.run, daemon=True).start()
_root.mainloop()
