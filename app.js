'use strict';

const GROQ_API_KEY = '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';
const GROQ_URL     = 'https://api.groq.com/openai/v1/audio/transcriptions';

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

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }

    const data = await res.json();
    transcript.value = (data.text || '').trim();
    setState('idle');

  } catch (err) {
    console.error('Transcription error:', err);
    if (!isRetry) {
      // Single automatic retry after 3 s
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
