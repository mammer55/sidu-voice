'use strict';

const GROQ_API_KEY    = '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';
const GROQ_URL        = 'https://api.groq.com/openai/v1/audio/transcriptions';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbynRnOepcTh1LnJATtqS1Jb-3gSitCUXBNrVrtwUoCrh03KXxIf36MULAI0lOAhjvKa/exec';

let mediaRecorder  = null;
let audioChunks    = [];
let audioBlob      = null;
let appState       = 'idle'; // 'idle' | 'recording' | 'processing'
let currentMode    = 'accurate'; // 'accurate' | 'live'

const LS_TEXT_KEY = 'sidu-voice-text';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const body            = document.body;
const btnRecord       = document.getElementById('btn-record');
const btnLabel        = document.getElementById('btn-label');
const btnIcon         = btnRecord.querySelector('.btn-icon');
const btnRetry        = document.getElementById('btn-retry');
const btnCopy         = document.getElementById('btn-copy');
const copyLabel       = document.getElementById('copy-label');
const transcript      = document.getElementById('transcript');
const liveTranscript  = document.getElementById('live-transcript');
const errorBox        = document.getElementById('error-box');
const errorText       = document.getElementById('error-text');

// ── Mode toggle ───────────────────────────────────────────────────────────────
function setMode(mode) {
  if (appState !== 'idle') return; // don't switch while recording

  currentMode = mode;

  document.getElementById('mode-accurate').classList.toggle('mode-pill--active', mode === 'accurate');
  document.getElementById('mode-live').classList.toggle('mode-pill--active', mode === 'live');

  // Textarea is shown in both modes now — live mode writes into it directly.
  transcript.hidden     = false;
  liveTranscript.hidden = true;

  hideError();
  hideRetry();
  setState('idle');
}

// ── localStorage autosave ─────────────────────────────────────────────────────
function loadSavedText() {
  try {
    const saved = localStorage.getItem(LS_TEXT_KEY);
    if (saved) transcript.value = saved;
  } catch { /* silent */ }
}

function saveText() {
  try { localStorage.setItem(LS_TEXT_KEY, transcript.value); } catch { /* silent */ }
}

transcript.addEventListener('input', saveText);
loadSavedText();

// ── Overwrite confirmation ────────────────────────────────────────────────────
let confirmResolver = null;

function confirmOverwriteIfNeeded() {
  if (!transcript.value.trim()) return Promise.resolve(true);
  return new Promise((resolve) => {
    confirmResolver = resolve;
    document.getElementById('confirm-overlay').hidden = false;
  });
}

function resolveConfirm(proceed) {
  document.getElementById('confirm-overlay').hidden = true;
  if (confirmResolver) {
    const r = confirmResolver;
    confirmResolver = null;
    r(proceed);
  }
}

// ── State machine ─────────────────────────────────────────────────────────────
function setState(s) {
  appState = s;
  body.dataset.state = s;

  if (s === 'idle') {
    btnIcon.textContent  = '🎙️';
    btnLabel.textContent = 'وقف';
    btnRecord.disabled   = false;
  } else if (s === 'recording') {
    btnIcon.textContent  = '⏹';
    btnLabel.textContent = 'ابدء';
    btnRecord.disabled   = false;
  } else if (s === 'processing') {
    btnIcon.textContent  = '⏳';
    btnLabel.textContent = 'انتظر';
    btnRecord.disabled   = true;
  }
}

// ── Button handler — routes to correct mode ───────────────────────────────────
async function handleRecordBtn() {
  // If starting a new recording while text exists, confirm first.
  if (appState === 'idle') {
    const ok = await confirmOverwriteIfNeeded();
    if (!ok) return;
  }
  if (currentMode === 'accurate') {
    toggleRecording();
  } else {
    toggleLive();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ACCURATE MODE — Groq Whisper
// ══════════════════════════════════════════════════════════════════════════════

async function toggleRecording() {
  if (appState === 'idle') {
    await startRecording();
  } else if (appState === 'recording') {
    stopRecording();
  }
}

async function startRecording() {
  hideError();
  hideRetry();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showError('لا يمكن الوصول إلى الميكروفون. يرجى السماح بذلك من الإعدادات.');
    return;
  }

  audioChunks = [];
  const mimeType = bestMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const type = mediaRecorder.mimeType || 'audio/webm';
    audioBlob = new Blob(audioChunks, { type });
    transcribe(false);
  };

  mediaRecorder.start(200);
  setState('recording');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    setState('processing');
    mediaRecorder.stop();
  }
}

async function transcribe(isRetry) {
  setState('processing');
  hideError();
  hideRetry();

  try {
    const ext      = extFromMime(audioBlob.type);
    const formData = new FormData();
    formData.append('file',     audioBlob, `audio.${ext}`);
    formData.append('model',    'whisper-large-v3-turbo');
    formData.append('language', 'ar');

    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body:    formData,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    const data = await res.json();
    transcript.value = (data.text || '').trim();
    transcript.dispatchEvent(new Event('input'));
    setState('idle');

  } catch (err) {
    console.error('Transcription error:', err);
    if (!isRetry) {
      setTimeout(() => transcribe(true), 3000);
    } else {
      setState('idle');
      showError('حدث خطأ. اضغط الزر مرة أخرى من فضلك.');
      showRetry();
      alertMustafa(err);
    }
  }
}

function manualRetry() {
  if (audioBlob) transcribe(false);
}

// ══════════════════════════════════════════════════════════════════════════════
// LIVE MODE — Web Speech API
// ══════════════════════════════════════════════════════════════════════════════

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition     = null;
let liveFinalized   = ''; // accumulated final text

function toggleLive() {
  if (appState === 'idle') {
    startLive();
  } else if (appState === 'recording') {
    stopLive();
  }
}

async function startLive() {
  if (!SpeechRecognition) {
    showError('المتصفح لا يدعم الوضع الفوري. استخدم الوضع الدقيق ✅ بدلاً منه.');
    return;
  }

  // Request mic permission first — avoids immediate 'network' error in Chrome
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
  } catch {
    showError('لا يمكن الوصول إلى الميكروفون. يرجى السماح بذلك من الإعدادات.');
    return;
  }

  hideError();

  // Append to existing text rather than overwrite. Start liveFinalized from
  // whatever is already in the textarea (with a trailing space separator).
  const existing = transcript.value;
  liveFinalized = existing && !/\s$/.test(existing) ? existing + ' ' : existing;

  recognition = new SpeechRecognition();
  recognition.lang            = 'ar';
  recognition.continuous      = true;
  recognition.interimResults  = true;

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        liveFinalized += t;
      } else {
        interim += t;
      }
    }
    transcript.value = liveFinalized + interim;
    transcript.dispatchEvent(new Event('input'));
  };

  recognition.onerror = (e) => {
    console.error('SpeechRecognition error:', e.error);
    if (e.error === 'not-allowed' || e.error === 'audio-capture') {
      showError('لا يمكن الوصول إلى الميكروفون. يرجى السماح بذلك من الإعدادات.');
      setState('idle');
    } else if (e.error === 'network' || e.error === 'service-not-allowed') {
      showError('الوضع الفوري غير متاح على هذا الجهاز. استخدم الوضع الدقيق ✅ بدلاً منه.');
      setState('idle');
    } else if (e.error !== 'no-speech') {
      showError('حدث خطأ: ' + e.error);
      setState('idle');
    }
  };

  recognition.onend = () => {
    if (appState === 'recording') setState('idle');
  };

  recognition.start();
  setState('recording');
}

function stopLive() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  // flush any trailing interim as final
  transcript.value = liveFinalized;
  transcript.dispatchEvent(new Event('input'));
  setState('idle');
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Copy (works for both modes) ───────────────────────────────────────────────
async function copyTranscript() {
  const text = transcript.value.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    transcript.select();
    document.execCommand('copy');
  }

  btnCopy.classList.add('copied');
  copyLabel.textContent = 'تم النسخ!';
  setTimeout(() => {
    btnCopy.classList.remove('copied');
    copyLabel.textContent = 'انسخ';
  }, 2000);
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function showError(msg) {
  errorText.textContent = msg;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
  errorText.textContent = '';
}

function showRetry() { btnRetry.hidden = false; }
function hideRetry() { btnRetry.hidden = true; }

// ── alertMustafa ──────────────────────────────────────────────────────────────
async function alertMustafa(err) {
  try {
    const details = [
      `Error: ${err.message}`,
      `Time: ${new Date().toISOString()}`,
      `UserAgent: ${navigator.userAgent}`,
      `Key prefix: ${GROQ_API_KEY.slice(0, 8)}...`,
    ].join('\n');
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode:   'no-cors',
      body:   JSON.stringify({ type: 'email', message: `🚨 Transcription failed on grandpa's device:\n\n${details}` }),
    });
  } catch { /* silent */ }
}

// ── MIME helpers ──────────────────────────────────────────────────────────────
function bestMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function extFromMime(mime) {
  if (!mime)                  return 'webm';
  if (mime.includes('webm'))  return 'webm';
  if (mime.includes('ogg'))   return 'ogg';
  if (mime.includes('mp4'))   return 'mp4';
  if (mime.includes('wav'))   return 'wav';
  return 'webm';
}

// ── Service worker registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
  // When a new SW takes over, reload so the fresh files are used immediately
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// ── Contact widget (grandpa → Mustafa) ───────────────────────────────────────

let contactOpen = false;
const toggleBtn = document.querySelector('.contact-toggle');

function toggleContact() {
  contactOpen = !contactOpen;
  document.getElementById('contact-panel').hidden = !contactOpen;
}

async function sendMessage() {
  const msgEl   = document.getElementById('contact-msg');
  const sendBtn = document.getElementById('contact-send');
  const text    = msgEl.value.trim();
  if (!text) return;

  sendBtn.disabled    = true;
  sendBtn.textContent = 'جارٍ الإرسال…';

  let succeeded = false;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode:   'no-cors',
      body:   JSON.stringify({ type: 'email', message: text }),
    });
    succeeded = true;
  } catch (err) {
    console.error('Send error:', err);
  }

  sendBtn.disabled    = false;
  sendBtn.textContent = 'إرسال';

  if (succeeded) {
    msgEl.value = '';
    contactOpen = false;
    document.getElementById('contact-panel').hidden = true;
    toggleBtn.innerHTML = '<span>✅</span><span>تم الإرسال!</span>';
    setTimeout(() => {
      toggleBtn.innerHTML = '<span>💬</span><span>مشكلة؟ تواصل مع مصطفى</span>';
    }, 4000);
  } else {
    const errEl = document.getElementById('contact-error');
    errEl.hidden = false;
    setTimeout(() => { errEl.hidden = true; }, 5000);
  }
}

// ── Letter from Mustafa ───────────────────────────────────────────────────────

async function checkForLetter() {
  try {
    const res    = await fetch(APPS_SCRIPT_URL);
    const letter = await res.json();
    if (!letter || !letter.text) return showBadge(false);

    const dismissedId = localStorage.getItem('dismissed_letter_id');
    showBadge(letter.id !== dismissedId, letter);
  } catch (err) {
    console.warn('Letter poll failed:', err);
  }
}

function showBadge(show, letter = null) {
  const badge = document.getElementById('letter-badge');
  badge.hidden = !show;
  if (show && letter) badge._letter = letter;
}

function openLetter() {
  const letter = document.getElementById('letter-badge')._letter;
  if (!letter) return;
  document.getElementById('letter-date').textContent = letter.date;
  document.getElementById('letter-text').textContent = letter.text;
  document.getElementById('letter-panel').hidden = false;
}

function closeLetter() {
  const letter = document.getElementById('letter-badge')._letter;
  if (letter) localStorage.setItem('dismissed_letter_id', letter.id);
  document.getElementById('letter-panel').hidden = true;
  document.getElementById('letter-badge').hidden = true;
}

checkForLetter();
setInterval(checkForLetter, 2 * 60 * 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForLetter();
});
