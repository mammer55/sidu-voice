'use strict';

const GROQ_URL        = 'https://sido-voice.mammergaming55.workers.dev';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbynRnOepcTh1LnJATtqS1Jb-3gSitCUXBNrVrtwUoCrh03KXxIf36MULAI0lOAhjvKa/exec';

let mediaRecorder  = null;
let audioChunks    = [];
let audioBlob      = null;
let appState       = 'idle'; // 'idle' | 'recording' | 'processing'
let currentMode    = 'accurate'; // 'accurate' | 'live'

const LS_TEXT_KEY = 'sidu-voice-text';
const LS_LANG_KEY = 'sidu-voice-lang';

const UI_TEXT = {
  ar: {
    pageTitle:           'مسجّل الصوت',
    appTitle:            'مسجّل الصوت',
    modeAccurate:        'دقيق ✅',
    modeLive:            'مستمر 🎙',
    btnIdle:             'وقف',
    btnRecording:        'ابدء',
    btnProcessing:       'انتظر',
    processing:          'جارٍ المعالجة…',
    btnRetry:            'حاول مرة أخرى',
    transcriptLabel:     'النص المكتوب',
    transcriptPlaceholder: 'سيظهر النص هنا بعد التسجيل…',
    rateBannerPrefix:    'يرجى الانتظار لحظة قبل المتابعة... (',
    rateBannerSuffix:    ' ث)',
    copyBtn:             'انسخ',
    copiedBtn:           'تم النسخ!',
    confirmText:         'تحذير: يوجد نص في المربع. هل تريد المتابعة؟ سيتم مسح النص الحالي.',
    confirmCancel:       'تراجع',
    confirmProceed:      'متابعة',
    contactHeader:       '📩 راسل مصطفى',
    contactDesc:         'إذا واجهتك أي مشكلة في التطبيق، اكتب رسالة هنا واضغط «إرسال». سيتلقّاها مصطفى ويساعدك في أقرب وقت.',
    contactPlaceholder:  'اكتب رسالتك هنا…',
    contactSend:         'إرسال',
    contactSending:      'جارٍ الإرسال…',
    contactSent:         'تم الإرسال!',
    contactError:        '❌ لم تصل الرسالة. تحقّق من الإنترنت وحاول مرة أخرى.',
    contactToggle:       'مشكلة؟ تواصل مع مصطفى',
    letterBadge:         'رسالة جديدة من مصطفى',
    letterFrom:          'من مصطفى ❤️',
    letterClose:         'حسناً، شكراً',
    errMic:              'لا يمكن الوصول إلى الميكروفون. يرجى السماح بذلك من الإعدادات.',
    errTranscribe:       'حدث خطأ. اضغط الزر مرة أخرى من فضلك.',
  },
  en: {
    pageTitle:           'Voice Recorder',
    appTitle:            'Voice Recorder',
    modeAccurate:        'Accurate ✅',
    modeLive:            'Live 🎙',
    btnIdle:             'Start',
    btnRecording:        'Stop',
    btnProcessing:       'Wait',
    processing:          'Processing…',
    btnRetry:            'Try again',
    transcriptLabel:     'Transcript',
    transcriptPlaceholder: 'Transcript will appear here',
    rateBannerPrefix:    'Please wait before continuing... (',
    rateBannerSuffix:    ' s)',
    copyBtn:             'Copy',
    copiedBtn:           'Copied!',
    confirmText:         'Warning: There is text in the box. Do you want to continue? The current text will be cleared.',
    confirmCancel:       'Cancel',
    confirmProceed:      'Continue',
    contactHeader:       '📩 Message Mustafa',
    contactDesc:         'If you encounter any issue with the app, write a message here and press "Send". Mustafa will receive it and help you as soon as possible.',
    contactPlaceholder:  'Write your message here…',
    contactSend:         'Send',
    contactSending:      'Sending…',
    contactSent:         'Sent!',
    contactError:        '❌ Message not sent. Check your internet connection and try again.',
    contactToggle:       'Problem? Contact Mustafa',
    letterBadge:         'New message from Mustafa',
    letterFrom:          'From Mustafa ❤️',
    letterClose:         'OK, Thanks',
    errMic:              'Cannot access the microphone. Please allow it in your settings.',
    errTranscribe:       'An error occurred. Please press the button again.',
  },
};

let currentLang = (() => {
  try { return localStorage.getItem(LS_LANG_KEY) || 'ar'; } catch { return 'ar'; }
})();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const body            = document.body;
const btnRecord       = document.getElementById('btn-record');
const btnLabel        = document.getElementById('btn-label');
const btnIcon         = btnRecord.querySelector('.btn-icon');
const btnRetry        = document.getElementById('btn-retry');
const btnCopy         = document.getElementById('btn-copy');
const copyLabel       = document.getElementById('copy-label');
const transcript      = document.getElementById('transcript');
const errorBox        = document.getElementById('error-box');
const errorText       = document.getElementById('error-text');

// ── Language UI ───────────────────────────────────────────────────────────────
function applyLang() {
  const t   = UI_TEXT[currentLang] || UI_TEXT.ar;
  const isEn = currentLang === 'en';
  const g   = (id) => document.getElementById(id);

  document.title = t.pageTitle;
  const metaTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (metaTitle) metaTitle.content = t.pageTitle;

  document.documentElement.lang = isEn ? 'en' : 'ar';
  document.documentElement.dir  = isEn ? 'ltr' : 'rtl';

  document.querySelector('.app-title').textContent = t.appTitle;
  g('mode-accurate').textContent = t.modeAccurate;
  g('mode-live').textContent     = t.modeLive;

  if (appState === 'idle')           btnLabel.textContent = t.btnIdle;
  else if (appState === 'recording') btnLabel.textContent = t.btnRecording;
  else if (appState === 'processing') btnLabel.textContent = t.btnProcessing;

  const procText = g('processing-text');
  if (procText) procText.textContent = t.processing;

  g('btn-retry').textContent = t.btnRetry;

  const txLabel = g('transcript-label');
  if (txLabel) txLabel.textContent = t.transcriptLabel;

  transcript.placeholder = t.transcriptPlaceholder;
  transcript.dir = isEn ? 'ltr' : 'rtl';

  const ratePfx = g('rate-banner-prefix');
  if (ratePfx) ratePfx.textContent = t.rateBannerPrefix;
  const rateSfx = g('rate-banner-suffix');
  if (rateSfx) rateSfx.textContent = t.rateBannerSuffix;
  const rateBanner = g('rate-banner');
  if (rateBanner) rateBanner.dir = isEn ? 'ltr' : 'rtl';

  copyLabel.textContent = t.copyBtn;

  const confirmTextEl = g('confirm-text');
  if (confirmTextEl) confirmTextEl.textContent = t.confirmText;
  const confirmCancelEl = g('confirm-cancel');
  if (confirmCancelEl) confirmCancelEl.textContent = t.confirmCancel;
  const confirmProceedEl = g('confirm-proceed');
  if (confirmProceedEl) confirmProceedEl.textContent = t.confirmProceed;

  const contactHdr = g('contact-header');
  if (contactHdr) contactHdr.textContent = t.contactHeader;
  const contactDsc = g('contact-desc');
  if (contactDsc) contactDsc.textContent = t.contactDesc;
  const contactMsg = g('contact-msg');
  if (contactMsg) { contactMsg.placeholder = t.contactPlaceholder; contactMsg.dir = isEn ? 'ltr' : 'rtl'; }
  const contactSendBtn = g('contact-send');
  if (contactSendBtn && !contactSendBtn.disabled) contactSendBtn.textContent = t.contactSend;
  const contactErrEl = g('contact-error');
  if (contactErrEl) contactErrEl.textContent = t.contactError;
  const contactToggleText = g('contact-toggle-text');
  if (contactToggleText) contactToggleText.textContent = t.contactToggle;

  const letterBadgeText = g('letter-badge-text');
  if (letterBadgeText) letterBadgeText.textContent = t.letterBadge;
  const letterFromEl = g('letter-from');
  if (letterFromEl) letterFromEl.textContent = t.letterFrom;
  const letterCloseEl = g('letter-close');
  if (letterCloseEl) letterCloseEl.textContent = t.letterClose;
}

// ── Mode toggle ───────────────────────────────────────────────────────────────
function setMode(mode) {
  if (appState !== 'idle') return; // don't switch while recording

  currentMode = mode;

  document.getElementById('mode-accurate').classList.toggle('mode-pill--active', mode === 'accurate');
  document.getElementById('mode-live').classList.toggle('mode-pill--active', mode === 'live');

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
applyLang();

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

  const t = UI_TEXT[currentLang] || UI_TEXT.ar;
  if (s === 'idle') {
    btnIcon.textContent  = '🎙️';
    btnLabel.textContent = t.btnIdle;
    btnRecord.disabled   = false;
  } else if (s === 'recording') {
    btnIcon.textContent  = '⏹';
    btnLabel.textContent = t.btnRecording;
    btnRecord.disabled   = false;
  } else if (s === 'processing') {
    btnIcon.textContent  = '⏳';
    btnLabel.textContent = t.btnProcessing;
    btnRecord.disabled   = true;
  }
}

// ── Button handler — routes to correct mode ───────────────────────────────────
async function handleRecordBtn() {
  // Confirm before overwriting in accurate mode only. مستمر appends, so no warning.
  if (appState === 'idle' && currentMode === 'accurate') {
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
    showError((UI_TEXT[currentLang] || UI_TEXT.ar).errMic);
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
    formData.append('model',    devModel);
    formData.append('language', currentLang);

    const res = await fetch(GROQ_URL, {
      method:  'POST',
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
      showError((UI_TEXT[currentLang] || UI_TEXT.ar).errTranscribe);
      showRetry();
      alertMustafa(err);
    }
  }
}

function manualRetry() {
  if (audioBlob) transcribe(false);
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTINUOUS MODE (مستمر) — Chunked Groq Whisper
// ══════════════════════════════════════════════════════════════════════════════
//
// Records continuously; every CHUNK_MS the active MediaRecorder is rotated and
// the produced blob is queued for transcription. Whisper requests are throttled
// to stay under Groq's 20 req/min limit (we pause at 18). New chunks keep
// being recorded while sending is paused — they just stack up in the queue and
// drain automatically once a slot opens.

let CHUNK_MS           = 5000;
const RATE_WINDOW_MS   = 60000;
let RATE_MAX           = 18;   // safe buffer below Groq's 20/min
let COOLDOWN_429_MS    = 30000;

let devModel          = 'whisper-large-v3-turbo';

let continuousStream  = null;
let chunkRecorder     = null;
let chunkTimer        = null;
let pendingChunks     = [];
let requestTimestamps = [];
let cooldownUntil     = 0;
let pumping           = false;
let bannerTicker      = null;

function toggleLive() {
  if (appState === 'idle') {
    startContinuous();
  } else if (appState === 'recording') {
    stopContinuous();
  }
}

async function startContinuous() {
  hideError();
  hideRetry();

  try {
    continuousStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showError((UI_TEXT[currentLang] || UI_TEXT.ar).errMic);
    return;
  }

  setState('recording');
  startNewChunk();
}

function startNewChunk() {
  if (!continuousStream || appState !== 'recording') return;

  const mimeType = bestMimeType();
  const chunks   = [];
  const rec      = new MediaRecorder(continuousStream, mimeType ? { mimeType } : {});

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    const type = rec.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type });
    if (blob.size > 0) enqueueChunk(blob);
  };

  rec.start();
  chunkRecorder = rec;

  chunkTimer = setTimeout(() => {
    if (rec.state !== 'inactive') rec.stop();
    startNewChunk();
  }, CHUNK_MS);
}

function stopContinuous() {
  if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
  if (chunkRecorder && chunkRecorder.state !== 'inactive') {
    chunkRecorder.stop(); // final chunk → queue
  }
  if (continuousStream) {
    continuousStream.getTracks().forEach(t => t.stop());
    continuousStream = null;
  }
  setState('idle');
}

// ── Chunk queue + rate limiting ──────────────────────────────────────────────
function pruneRequests() {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  requestTimestamps = requestTimestamps.filter(t => t > cutoff);
}

function waitSeconds() {
  const now = Date.now();
  let wait = 0;
  if (now < cooldownUntil) wait = Math.max(wait, cooldownUntil - now);
  pruneRequests();
  if (requestTimestamps.length >= RATE_MAX) {
    wait = Math.max(wait, requestTimestamps[0] + RATE_WINDOW_MS - now);
  }
  return Math.ceil(wait / 1000);
}

function canSendNow() {
  return waitSeconds() === 0;
}

function enqueueChunk(blob) {
  pendingChunks.push(blob);
  pumpQueue();
}

async function pumpQueue() {
  if (pumping) return;
  pumping = true;

  while (pendingChunks.length > 0) {
    if (!canSendNow()) {
      showRateBanner();
      pumping = false;
      return;
    }
    const blob = pendingChunks.shift();
    requestTimestamps.push(Date.now());
    try {
      const text = await transcribeChunk(blob);
      if (text) appendChunkText(text);
    } catch (err) {
      if (err && err.is429) {
        cooldownUntil = Date.now() + COOLDOWN_429_MS;
        pendingChunks.unshift(blob); // retry this same chunk later
        showRateBanner();
        pumping = false;
        return;
      }
      console.error('Chunk failed:', err);
    }
  }

  hideRateBanner();
  pumping = false;
}

async function transcribeChunk(blob) {
  const ext      = extFromMime(blob.type);
  const formData = new FormData();
  formData.append('file',     blob, `audio.${ext}`);
  formData.append('model',    devModel);
  formData.append('language', currentLang);

  const blobKB = Math.round(blob.size / 1024);
  const t0     = Date.now();

  const res = await fetch(GROQ_URL, {
    method:  'POST',
    body:    formData,
  });

  if (res.status === 429) {
    devAddLogEntry({ time: new Date().toLocaleTimeString(), latency: null, chars: null, blobKB, ok: false, err: '429' });
    const e = new Error('rate-limited');
    e.is429 = true;
    throw e;
  }
  if (!res.ok) {
    devAddLogEntry({ time: new Date().toLocaleTimeString(), latency: null, chars: null, blobKB, ok: false, err: `HTTP ${res.status}` });
    throw new Error(`HTTP ${res.status}`);
  }

  const data    = await res.json();
  const text    = (data.text || '').trim();
  const latency = Date.now() - t0;

  devStats.totalSent++;
  devStats.totalChars += text.length;
  devStats.lastBlobKB  = blobKB;
  devStats.latencies.push(latency);
  if (devStats.latencies.length > 50) devStats.latencies.shift();
  devAddLogEntry({ time: new Date().toLocaleTimeString(), latency, chars: text.length, blobKB, ok: true, err: null });

  return text;
}

function appendChunkText(text) {
  text = text.trim();
  if (!text) return;
  const cur = transcript.value;
  const sep = (!cur || /\s$/.test(cur)) ? '' : ' ';
  transcript.value = cur + sep + text;
  transcript.dispatchEvent(new Event('input'));
}

// ── Rate-limit banner ────────────────────────────────────────────────────────
function showRateBanner() {
  const banner = document.getElementById('rate-banner');
  const count  = document.getElementById('rate-countdown');
  banner.hidden = false;
  count.textContent = waitSeconds();
  if (!bannerTicker) {
    bannerTicker = setInterval(() => {
      const s = waitSeconds();
      count.textContent = s;
      if (s === 0) {
        hideRateBanner();
        pumpQueue();
      }
    }, 500);
  }
}

function hideRateBanner() {
  document.getElementById('rate-banner').hidden = true;
  if (bannerTicker) { clearInterval(bannerTicker); bannerTicker = null; }
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

  const ct = UI_TEXT[currentLang] || UI_TEXT.ar;
  btnCopy.classList.add('copied');
  copyLabel.textContent = ct.copiedBtn;
  setTimeout(() => {
    btnCopy.classList.remove('copied');
    copyLabel.textContent = ct.copyBtn;
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
      `Proxy: ${GROQ_URL}`,
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

  const st = UI_TEXT[currentLang] || UI_TEXT.ar;
  sendBtn.disabled    = true;
  sendBtn.textContent = st.contactSending;

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
  sendBtn.textContent = st.contactSend;

  if (succeeded) {
    msgEl.value = '';
    contactOpen = false;
    document.getElementById('contact-panel').hidden = true;
    toggleBtn.innerHTML = `<span>✅</span><span id="contact-toggle-text">${st.contactSent}</span>`;
    setTimeout(() => {
      toggleBtn.innerHTML = `<span>💬</span><span id="contact-toggle-text">${st.contactToggle}</span>`;
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

// ── Hidden language toggle (Ctrl+Shift+E) ────────────────────────────────────
function toggleLanguage() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem(LS_LANG_KEY, currentLang); } catch { /* silent */ }
  applyLang();
  flashLangToast(currentLang === 'en' ? 'English mode' : 'الوضع العربي');
}

function flashLangToast(msg) {
  let el = document.getElementById('lang-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lang-toast';
    el.style.cssText =
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
      'background:#1c1c1e;color:#fff;padding:10px 18px;border-radius:10px;' +
      'font-size:16px;font-weight:600;z-index:500;opacity:0;' +
      'transition:opacity 0.2s;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  clearTimeout(flashLangToast._t);
  flashLangToast._t = setTimeout(() => { el.style.opacity = '0'; }, 1500);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
    e.preventDefault();
    toggleLanguage();
  }
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault();
    toggleDevPanel();
  }
});

// 5 rapid taps on title opens dev panel (mobile)
let _titleTaps = 0, _titleTapTimer = null;
document.querySelector('.app-title').addEventListener('click', () => {
  _titleTaps++;
  clearTimeout(_titleTapTimer);
  _titleTapTimer = setTimeout(() => { _titleTaps = 0; }, 800);
  if (_titleTaps >= 5) { _titleTaps = 0; toggleDevPanel(); }
});

// ── Developer Mode ───────────────────────────────────────────────────────────

let devPanelOpen   = false;
let devStatsTicker = null;

const devStats = {
  totalSent: 0,
  totalChars: 0,
  latencies: [],
  lastBlobKB: 0,
};

const devLog = [];

function openDevPanel() {
  devPanelOpen = true;
  document.getElementById('dev-panel').classList.add('dev-panel--open');

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('dev-chunk-ms',      CHUNK_MS);
  set('dev-chunk-ms-num',  CHUNK_MS);
  set('dev-rate-max',      RATE_MAX);
  set('dev-rate-max-num',  RATE_MAX);
  set('dev-cooldown',      COOLDOWN_429_MS / 1000);
  set('dev-cooldown-num',  COOLDOWN_429_MS / 1000);
  set('dev-model',         devModel);

  devOnChunkMs();
  devOnRateMax();
  devRenderLog();
  devRefreshStats();
  devStatsTicker = setInterval(devRefreshStats, 1000);
}

function closeDevPanel() {
  devPanelOpen = false;
  document.getElementById('dev-panel').classList.remove('dev-panel--open');
  if (devStatsTicker) { clearInterval(devStatsTicker); devStatsTicker = null; }
}

function toggleDevPanel() {
  if (devPanelOpen) closeDevPanel(); else openDevPanel();
}

function devOnChunkMs() {
  const ms  = parseInt(document.getElementById('dev-chunk-ms').value);
  CHUNK_MS  = ms;
  const tpm = (60000 / ms).toFixed(1);
  const eff = Math.min(parseFloat(tpm), RATE_MAX).toFixed(1);
  document.getElementById('dev-chunk-calc').textContent =
    `${(ms / 1000).toFixed(1)}s chunks → theoretical ${tpm}/min · effective max ${eff}/min`;
}

function devOnRateMax() {
  const max  = parseInt(document.getElementById('dev-rate-max').value);
  RATE_MAX   = max;
  const minS = (60 / max).toFixed(1);
  document.getElementById('dev-rate-calc').textContent =
    `allow ${max}/min · chunks need ≥${minS}s to avoid queue buildup`;
}

function devOnCooldown() {
  COOLDOWN_429_MS = parseInt(document.getElementById('dev-cooldown').value) * 1000;
}

function devOnModel() {
  devModel = document.getElementById('dev-model').value;
}

function devRefreshStats() {
  pruneRequests();
  const rolling = requestTimestamps.length;
  const avgLat  = devStats.latencies.length
    ? Math.round(devStats.latencies.reduce((a, b) => a + b, 0) / devStats.latencies.length)
    : 0;
  const coolLeft = cooldownUntil > Date.now()
    ? Math.ceil((cooldownUntil - Date.now()) / 1000) + 's remaining'
    : 'No';

  const g = (id) => document.getElementById(id);
  g('dstat-rate').textContent     = rolling + '/min';
  g('dstat-queue').textContent    = pendingChunks.length + ' chunk' + (pendingChunks.length !== 1 ? 's' : '');
  g('dstat-sent').textContent     = devStats.totalSent;
  g('dstat-chars').textContent    = devStats.totalChars.toLocaleString();
  g('dstat-latency').textContent  = avgLat ? avgLat + 'ms' : '—';
  g('dstat-blob').textContent     = devStats.lastBlobKB ? devStats.lastBlobKB + ' KB' : '—';
  g('dstat-mime').textContent     = bestMimeType() || 'unknown';
  g('dstat-cooldown').textContent = coolLeft;
}

function devAddLogEntry(entry) {
  devLog.push(entry);
  if (devLog.length > 100) devLog.shift();
  const countEl = document.getElementById('dev-log-count');
  if (countEl) countEl.textContent = devLog.length;
  if (devPanelOpen) devRenderLog();
}

function devRenderLog() {
  const container = document.getElementById('dev-log-entries');
  if (!container) return;
  if (devLog.length === 0) {
    container.innerHTML = '<div class="dev-log-empty">No requests yet</div>';
    return;
  }
  container.innerHTML = devLog.slice().reverse().map(e =>
    `<div class="dev-log-entry${e.ok ? '' : ' dev-log-entry--err'}">` +
      `<span>${e.time}</span>` +
      `<span>${e.latency != null ? e.latency + 'ms' : '—'}</span>` +
      `<span>${e.chars != null ? e.chars : '—'}</span>` +
      `<span>${e.blobKB}KB</span>` +
      `<span class="dev-log-status">${e.ok ? '✓' : '✗ ' + e.err}</span>` +
    `</div>`
  ).join('');
}

function devClearQueue() {
  pendingChunks = [];
  if (devPanelOpen) devRefreshStats();
}

function devForceFlush() {
  if (!pumping) pumpQueue();
}

function devSimulate429() {
  cooldownUntil = Date.now() + COOLDOWN_429_MS;
  showRateBanner();
  if (devPanelOpen) devRefreshStats();
}

function devCopyDebugInfo() {
  pruneRequests();
  const avgLat = devStats.latencies.length
    ? Math.round(devStats.latencies.reduce((a, b) => a + b, 0) / devStats.latencies.length)
    : 0;
  const info = [
    '=== Voice Transcriber Debug Info ===',
    `Time:         ${new Date().toISOString()}`,
    `CHUNK_MS:     ${CHUNK_MS}`,
    `RATE_MAX:     ${RATE_MAX}`,
    `COOLDOWN_MS:  ${COOLDOWN_429_MS}`,
    `Model:        ${devModel}`,
    `Language:     ${currentLang}`,
    `Mode:         ${currentMode}`,
    `Rolling RPM:  ${requestTimestamps.length}`,
    `Queue depth:  ${pendingChunks.length}`,
    `Total sent:   ${devStats.totalSent}`,
    `Total chars:  ${devStats.totalChars}`,
    `Avg latency:  ${avgLat}ms`,
    `Last blob:    ${devStats.lastBlobKB}KB`,
    `MIME type:    ${bestMimeType()}`,
    `UserAgent:    ${navigator.userAgent}`,
  ].join('\n');
  navigator.clipboard.writeText(info).catch(() => {});
  const btn = document.getElementById('dev-copy-btn');
  const orig = btn.textContent;
  btn.textContent = '✓ Copied!';
  setTimeout(() => { btn.textContent = orig; }, 2000);
}

function devDownloadLog() {
  if (!devLog.length) return;
  const lines = ['time,latency_ms,chars,blob_kb,ok,error'].concat(
    devLog.map(e =>
      `${e.time},${e.latency ?? ''},${e.chars ?? ''},${e.blobKB},${e.ok},${e.err ?? ''}`
    )
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `transcriber-log-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function devClearLog() {
  devLog.length = 0;
  const countEl = document.getElementById('dev-log-count');
  if (countEl) countEl.textContent = '0';
  devRenderLog();
}

checkForLetter();
setInterval(checkForLetter, 2 * 60 * 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForLetter();
});
