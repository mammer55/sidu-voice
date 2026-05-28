"""
Voice Transcriber - Windows system tray app
Left-click the tray icon to start recording.
A small window appears with a Stop button.
Click Stop -> transcript is copied to clipboard + toast notification appears.
"""
import io
import threading
import tkinter as tk
import requests
import pyperclip
import numpy as np
import sounddevice as sd
import soundfile as sf
from pystray import Icon, Menu, MenuItem
from PIL import Image, ImageDraw

WORKER_URL = 'https://sido-voice.mammergaming55.workers.dev'
SAMPLERATE = 16000

_recording  = False
_audio_data = []
_stream     = None
_icon       = None
_root       = None
_dialog     = None


# ── Tray icon ──────────────────────────────────────────────────────────────────

def _make_icon(state='idle'):
    colors = {'idle': '#1a7a6e', 'recording': '#c0392b', 'processing': '#e67e22'}
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    d.ellipse([2, 2, 62, 62], fill=colors.get(state, '#1a7a6e'))
    d.ellipse([22, 10, 42, 36], fill='white')
    d.rectangle([29, 36, 35, 46], fill='white')
    d.arc([18, 26, 46, 50], 0, 180, fill='white', width=3)
    d.rectangle([26, 49, 38, 52], fill='white')
    return img


# ── Toast notification ─────────────────────────────────────────────────────────

def _notify(text):
    def _show():
        toast = tk.Toplevel(_root)
        toast.overrideredirect(True)
        toast.attributes('-topmost', True)
        toast.configure(bg='#1c1c1e')

        preview = text[:90] + ('...' if len(text) > 90 else '')

        tk.Label(toast, text='Transcribed', font=('Segoe UI', 10, 'bold'),
                 fg='#1a7a6e', bg='#1c1c1e').pack(anchor='w', padx=14, pady=(12, 2))
        tk.Label(toast, text=preview, font=('Segoe UI', 10),
                 fg='white', bg='#1c1c1e', wraplength=280,
                 justify='left').pack(anchor='w', padx=14, pady=(0, 12))

        toast.update_idletasks()
        sw = toast.winfo_screenwidth()
        sh = toast.winfo_screenheight()
        w  = toast.winfo_width()
        h  = toast.winfo_height()
        toast.geometry(f'{w}x{h}+{sw - w - 20}+{sh - h - 60}')

        toast.after(4000, toast.destroy)

    _root.after(0, _show)


# ── Recording dialog ───────────────────────────────────────────────────────────

def _show_dialog():
    global _dialog
    if _dialog:
        return
    _dialog = tk.Toplevel(_root)
    w = _dialog
    w.title('Voice Transcriber')
    w.resizable(False, False)
    w.attributes('-topmost', True)
    w.configure(bg='#1c1c1e')
    sw = w.winfo_screenwidth()
    w.geometry(f'220x96+{sw - 244}+64')
    tk.Label(w, text='Recording...', font=('Segoe UI', 13),
             fg='#ff6b6b', bg='#1c1c1e').pack(pady=(16, 8))
    tk.Button(w, text='   Stop   ', font=('Segoe UI', 11, 'bold'),
              bg='#c0392b', fg='white', relief='flat',
              cursor='hand2', pady=4,
              command=_on_stop_clicked).pack()
    w.protocol('WM_DELETE_WINDOW', _on_stop_clicked)


def _close_dialog():
    global _dialog
    if _dialog:
        try:
            _dialog.destroy()
        except Exception:
            pass
        _dialog = None


# ── Audio recording ────────────────────────────────────────────────────────────

def _audio_callback(indata, frames, time, status):
    if _recording:
        _audio_data.append(indata.copy())


def _start():
    global _recording, _audio_data, _stream
    _recording  = True
    _audio_data = []
    _stream = sd.InputStream(
        samplerate=SAMPLERATE, channels=1,
        dtype='float32', callback=_audio_callback,
    )
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
        _icon.icon = _make_icon('idle')


# ── Transcription ──────────────────────────────────────────────────────────────

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
                _notify(text)
        else:
            _notify(f'Error {res.status_code}: check the Worker logs')
    except Exception as e:
        _notify(f'Failed: {e}')
    finally:
        _icon.icon = _make_icon('idle')


# ── Tray click / menu ──────────────────────────────────────────────────────────

def _on_click(icon, item=None):
    if not _recording:
        _start()
        _root.after(0, _show_dialog)


def _on_quit(icon, item):
    if _recording:
        _stop()
    icon.stop()
    _root.quit()


# ── Entry point ────────────────────────────────────────────────────────────────

_root = tk.Tk()
_root.withdraw()  # keep root window hidden

_icon = Icon(
    'VoiceTranscriber',
    _make_icon('idle'),
    'Voice Transcriber',
    menu=Menu(
        MenuItem('Start Recording', _on_click, default=True),
        MenuItem('Quit', _on_quit),
    ),
)

threading.Thread(target=_icon.run, daemon=True).start()
_root.mainloop()
