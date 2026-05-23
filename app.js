'use strict';

const GROQ_API_KEY    = '__GROQ_API_KEY__';
const GROQ_URL        = 'https://api.groq.com/openai/v1/audio/transcriptions';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbynRnOepcTh1LnJATtqS1Jb-3gSitCUXBNrVrtwUoCrh03KXxIf36MULAI0lOAhjvKa/exec';

let mediaRecorder = null;
let audioChunks   = [];
let audioBlob     = null;
let appState      = 'idle'; // 'idle' | 'recording' | 'processing'

// ── DOM refs ──────────────────────────────────────────────────────────────────
const body        = document.body;
const btnRecord   = document.getElementById('btn-record');
const btnLabel    = document.getElementById('btn-label');
const btnIcon     = btnRecord.querySelector('.btn-icon');
const btnRetry    = document.getElementById('btn-retry');
const btnCopy     = document.getElementById('btn-copy');
const copyLabel   = document.getElementById('copy-label');
const transcript  = document.getElementById('transcript');
const errorBox    = document.getElementById('error-box');
const errorText   = document.getElementById('error-text');

// ── State machine ─────────────────────────────────────────────────────────────
function setState(s) {
  appState = s;
  body.dataset.state = s;

  if (s === 'idle') {
    btnIcon.textContent  = '🎙️';
    btnLabel.textContent = 'سجّل';
    btnRecord.disabled   = false;
  } else if (s === 'recording') {
    btnIcon.textContent  = '⏹';
    btnLabel.textContent = 'أوقف';
    btnRecord.disabled   = false;
  } else if (s === 'processing') {
    btnIcon.textContent  = '⏳';
    btnLabel.textContent = 'انتظر';
    btnRecord.disabled   = true;
  }
}

// ── Record / Stop toggle ──────────────────────────────────────────────────────
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

// ── Transcription ─────────────────────────────────────────────────────────────

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

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    transcript.value = (data.text || '').trim();
    setState('idle');

  } catch (err) {
    console.error('Transcription error:', err);
    if (!isRetry) {
      setTimeout(() => transcribe(true), 3000);
    } else {
      setState('idle');
      showError('تعذّر الاتصال بالخادم. تحقّق من الإنترنت وحاول مرة أخرى.');
      showRetry();
    }
  }
}

function manualRetry() {
  if (audioBlob) transcribe(false);
}

// ── Copy ──────────────────────────────────────────────────────────────────────
async function copyTranscript() {
  const text = transcript.value.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older browsers / non-HTTPS
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

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Service worker registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
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
    // no-cors: browser can't read the response but the request reaches Apps Script fine
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
    // Collapse panel and show "Sent!" on the toggle button
    contactOpen = false;
    document.getElementById('contact-panel').hidden = true;
    toggleBtn.innerHTML = '<span>✅</span><span>تم الإرسال!</span>';
    setTimeout(() => {
      toggleBtn.innerHTML = '<span>💬</span><span>مشكلة؟ تواصل مع مصطفى</span>';
    }, 4000);
  } else {
    // Show clear error inside the panel
    const errEl = document.getElementById('contact-error');
    errEl.hidden = false;
    setTimeout(() => { errEl.hidden = true; }, 5000);
  }
}

// ── Letter from Mustafa — server-side polling ─────────────────────────────────
// Add ?debug to the URL for 5-second polling (normal = 30 minutes)
const DEBUG_MODE     = new URLSearchParams(window.location.search).has('debug');
const POLL_INTERVAL  = DEBUG_MODE ? 5_000 : 30 * 60 * 1000;

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
setInterval(checkForLetter, POLL_INTERVAL);
