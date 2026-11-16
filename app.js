/* ============================================================
   VoicePad - Professional Offline Voice Notes & AI Transcription
   ============================================================ */

/* ===========================
   Toast Notification System
=========================== */
const Toast = (() => {
  const container = document.getElementById('toastContainer');
  let activeTimeout = null;

  function show(message, type = 'info', icon = 'fa-solid fa-circle-info') {
    if (!container) return;

    let iconColor = 'text-blue-400';
    if (type === 'success') {
      iconColor = 'text-emerald-400';
    } else if (type === 'warning') {
      iconColor = 'text-amber-400';
    } else if (type === 'error') {
      iconColor = 'text-rose-400';
    }

    container.innerHTML = `
      <div class="toast-enter pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-900/95 dark:bg-slate-800/95 text-white shadow-xl shadow-black/25 border border-slate-700/70 text-xs sm:text-sm font-medium backdrop-blur-md">
        <i class="${icon} ${iconColor} text-sm"></i>
        <span>${message}</span>
      </div>
    `;

    clearTimeout(activeTimeout);
    activeTimeout = setTimeout(() => {
      const el = container.firstElementChild;
      if (el) {
        el.className = el.className.replace('toast-enter', 'toast-exit');
        setTimeout(() => { container.innerHTML = ''; }, 250);
      }
    }, 2200);
  }

  return { show };
})();

/* ===========================
   Store
=========================== */
const Store = (() => {
  const KEY = 'voice-notes';

  function getAll() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('Failed to load notes from localStorage:', e);
      return [];
    }
  }

  function saveAll(notes) {
    try {
      localStorage.setItem(KEY, JSON.stringify(notes));
    } catch (e) {
      console.error('Failed to save notes to localStorage:', e);
    }
  }

  function upsert(note) {
    const notes = getAll();
    const index = notes.findIndex(n => n.id === note.id);
    const updatedNote = {
      ...note,
      updatedAt: new Date().toISOString()
    };
    if (index >= 0) {
      notes[index] = updatedNote;
    } else {
      updatedNote.createdAt = new Date().toISOString();
      notes.unshift(updatedNote);
    }
    saveAll(notes);
    return updatedNote;
  }

  function remove(id) {
    const notes = getAll().filter(n => n.id !== id);
    saveAll(notes);
  }

  return { getAll, saveAll, upsert, remove };
})();

/* ===========================
   Draft Editor
=========================== */
const DraftEditor = (() => {
  let draftId = null;
  const titleInput = document.getElementById('titleInput');
  const contentInput = document.getElementById('contentInput');
  const statsBadge = document.getElementById('statsBadge');

  function updateStats() {
    const text = contentInput.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = contentInput.value.length;
    statsBadge.textContent = `${words} ${words === 1 ? 'word' : 'words'} · ${chars} chars`;
  }

  contentInput.addEventListener('input', () => {
    updateStats();
    // Keep SpeechService in sync with manual user edits
    SpeechService.syncContent(contentInput.value);
  });

  function load(note) {
    draftId = note.id;
    titleInput.value = note.title || '';
    contentInput.value = note.content || '';
    updateStats();
    SpeechService.syncContent(note.content || '');
    contentInput.focus();
  }

  function clear() {
    draftId = null;
    titleInput.value = '';
    contentInput.value = '';
    updateStats();
    SpeechService.clear();
  }

  function getDraft() {
    return {
      id: draftId ?? crypto.randomUUID(),
      title: titleInput.value.trim() || 'Untitled Note',
      content: contentInput.value.trim(),
      updatedAt: new Date().toISOString()
    };
  }

  function setText(text) {
    contentInput.value = text;
    updateStats();
  }

  function getText() {
    return contentInput.value;
  }

  return { load, clear, getDraft, setText, getText, updateStats };
})();

/* ===========================
   Clipboard Helper
=========================== */
const Clipboard = (() => ({
  async copy(text, successToast = 'Copied to clipboard!') {
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-HTTPS or older browsers
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      UI.setStatus('Copied!');
      Toast.show(successToast, 'success', 'fa-regular fa-copy');
      setTimeout(() => UI.resetStatus(), 1500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      UI.setStatus('Copy failed');
      Toast.show('Failed to copy', 'error', 'fa-solid fa-triangle-exclamation');
      setTimeout(() => UI.resetStatus(), 1500);
    }
  },
  copyDraft() {
    const text = DraftEditor.getText().trim();
    if (!text) {
      Toast.show('Note is empty', 'warning', 'fa-regular fa-note-sticky');
      return;
    }
    Clipboard.copy(text, 'Copied note to clipboard!');
  },
  copyNote(note) {
    if (!note?.content) return;
    Clipboard.copy(note.content, 'Copied note to clipboard!');
  }
}))();

/* ===========================
   Notes List & Search
=========================== */
const NotesList = (() => {
  const container = document.getElementById('notesList');
  const countEl = document.getElementById('noteCount');
  const searchInput = document.getElementById('searchNotesInput');

  function formatTime(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function render(query = '') {
    let notes = Store.getAll();
    const cleanQuery = query.trim().toLowerCase();

    if (cleanQuery) {
      notes = notes.filter(n =>
        (n.title && n.title.toLowerCase().includes(cleanQuery)) ||
        (n.content && n.content.toLowerCase().includes(cleanQuery))
      );
    }

    container.innerHTML = '';
    countEl.textContent = Store.getAll().length;

    if (notes.length === 0) {
      container.innerHTML = `
        <div class="py-8 px-4 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center gap-2">
          <i class="fa-regular fa-note-sticky text-3xl opacity-50 mb-1"></i>
          <p class="text-xs font-medium">${cleanQuery ? 'No matching notes found.' : 'No notes saved yet. Hit Record to begin!'}</p>
        </div>
      `;
      return;
    }

    notes.forEach(note => {
      const card = document.createElement('div');
      card.className = 'note-card p-3.5 rounded-xl bg-slate-50 dark:bg-slate-750/70 dark:bg-slate-700/40 hover:bg-slate-100/90 dark:hover:bg-slate-700/70 border border-slate-200/80 dark:border-slate-700 transition-all flex justify-between items-start gap-3 cursor-pointer group';

      const timeFormatted = formatTime(note.updatedAt || note.createdAt);

      card.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <h3 class="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${escapeHtml(note.title || 'Untitled')}</h3>
            ${timeFormatted ? `<span class="text-[10px] text-slate-400 shrink-0"><i class="fa-regular fa-clock text-[9px] mr-1"></i>${timeFormatted}</span>` : ''}
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">${escapeHtml(note.content || 'No content...')}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0 pt-0.5">
          <button class="copy-note-btn p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-600 text-xs transition-colors" title="Copy Note">
            <i class="fa-regular fa-copy"></i>
          </button>
          <button class="delete-note-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-600 text-xs transition-colors" title="Delete Note">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      `;

      card.querySelector('.copy-note-btn').onclick = (e) => {
        e.stopPropagation();
        Clipboard.copyNote(note);
      };

      card.querySelector('.delete-note-btn').onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this note?')) {
          Store.remove(note.id);
          render(searchInput.value);
          UI.setStatus('Note deleted');
          Toast.show('Note deleted', 'neutral', 'fa-regular fa-trash-can');
          setTimeout(() => UI.resetStatus(), 1200);
        }
      };

      card.onclick = () => {
        DraftEditor.load(note);
        UI.setStatus('Loaded');
        Toast.show(`Loaded "${note.title || 'Untitled'}"`, 'info', 'fa-regular fa-file-lines');
        setTimeout(() => UI.resetStatus(), 1000);
      };

      container.appendChild(card);
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      render(e.target.value);
    });
  }

  return { render };
})();

/* ============================================================
   Speech Recognition Service (Engineered to Never Miss Words)
   ============================================================ */
const SpeechService = (() => {
  let recognition = null;
  let isRecordingRequested = false;
  let isEngineActive = false;
  let wakeLockSentinel = null;
  let restartDebounceTimer = null;
  let timerInterval = null;
  let startTime = 0;

  // Transcript state tracking
  let baseTranscript = '';        // Text existing in editor before speech began
  let sessionFinalTranscript = '';// All confirmed chunks in current session
  let lastInterimChunk = '';      // Temporary pending words
  let consecutiveRestarts = 0;

  // DOM Elements
  const timerBadge = document.getElementById('recordingTimer');
  const timerDigits = document.getElementById('timerDigits');

  function init({ onResult, onStatus }) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition is not supported in this browser.');
      return false;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;
    } catch (e) {
      console.error('Error creating SpeechRecognition instance:', e);
      return false;
    }

    // Handles live speech events
    recognition.onresult = (event) => {
      consecutiveRestarts = 0;
      let interimAccumulated = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        let transcript = result[0].transcript;

        if (result.isFinal) {
          // Check for spoken voice commands first
          const command = checkVoiceCommands(transcript);
          if (command.isCommand) {
            // If there was preceding text before the command (e.g. "Meeting adjourned stop recording")
            if (command.precedingText) {
              const processed = processSpokenWords(command.precedingText);
              const formatted = formatChunk(processed);
              if (formatted) {
                if (sessionFinalTranscript && !/\s$/.test(sessionFinalTranscript) && !/^\s/.test(formatted)) {
                  sessionFinalTranscript += ' ';
                }
                sessionFinalTranscript += formatted;
              }
            }
            lastInterimChunk = '';
            executeCommand(command.command);
            if (command.command === 'stop_recording') {
              return;
            }
          } else {
            // Apply natural punctuation if enabled
            const processed = processSpokenWords(transcript);
            const formatted = formatChunk(processed);
            if (formatted) {
              if (sessionFinalTranscript && !/\s$/.test(sessionFinalTranscript) && !/^\s/.test(formatted)) {
                sessionFinalTranscript += ' ';
              }
              sessionFinalTranscript += formatted;
            }
          }
          lastInterimChunk = '';
        } else {
          interimAccumulated += transcript;
        }
      }

      lastInterimChunk = interimAccumulated;

      // Build complete assembled text
      const fullText = buildFullTranscript();
      onResult(fullText);
      onStatus('Speaking');
    };

    recognition.onstart = () => {
      isEngineActive = true;
      onStatus('Listening');
    };

    recognition.onspeechstart = () => {
      onStatus('Speaking');
    };

    recognition.onspeechend = () => {
      if (isRecordingRequested) {
        onStatus('Listening');
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition warning/error:', event.error);

      if (event.error === 'no-speech') {
        // Normal silence timeout from Web Speech API - keep listening
        return;
      }

      if (event.error === 'network') {
        onStatus('Network Glitch');
        if (!navigator.onLine) {
          Toast.show('Offline: speech service may require internet on some browsers', 'warning', 'fa-solid fa-plane');
        }
        return;
      }

      if (event.error === 'not-allowed') {
        isRecordingRequested = false;
        isEngineActive = false;
        stopTimer();
        releaseWakeLock();
        UI.setStatus('Mic Blocked');
        Toast.show('Microphone access denied', 'error', 'fa-solid fa-microphone-slash');
        return;
      }

      if (event.error === 'audio-capture') {
        onStatus('Mic Busy');
        Toast.show('Microphone is busy in another app', 'warning', 'fa-solid fa-triangle-exclamation');
        return;
      }
    };

    recognition.onend = () => {
      isEngineActive = false;

      // Commit unfinalized interim speech so no words are dropped during pause
      if (lastInterimChunk.trim()) {
        const processed = processSpokenWords(lastInterimChunk);
        const formatted = formatChunk(processed);
        if (formatted) {
          if (sessionFinalTranscript && !/\s$/.test(sessionFinalTranscript)) {
            sessionFinalTranscript += ' ';
          }
          sessionFinalTranscript += formatted;
        }
        lastInterimChunk = '';
        onResult(buildFullTranscript());
      }

      // Smooth auto-restart while recording is active
      if (isRecordingRequested) {
        clearTimeout(restartDebounceTimer);
        restartDebounceTimer = setTimeout(() => {
          if (isRecordingRequested && !isEngineActive) {
            safeStartEngine();
          }
        }, 120);
      } else {
        stopTimer();
        releaseWakeLock();
        onStatus('Idle');
      }
    };

    return true;
  }

  function buildFullTranscript() {
    let text = baseTranscript;
    if (sessionFinalTranscript) {
      if (text && !/\s$/.test(text) && !/^\s/.test(sessionFinalTranscript)) {
        text += ' ';
      }
      text += sessionFinalTranscript;
    }
    if (lastInterimChunk) {
      if (text && !/\s$/.test(text) && !/^\s/.test(lastInterimChunk)) {
        text += ' ';
      }
      text += lastInterimChunk;
    }
    return text;
  }

  function safeStartEngine() {
    if (!recognition || isEngineActive) return;
    try {
      recognition.lang = document.getElementById('languageSelect')?.value || 'en-US';
      recognition.start();
      isEngineActive = true;
    } catch (err) {
      if (err.name !== 'InvalidStateError') {
        console.warn('Recognition start caught error:', err);
      }
      consecutiveRestarts++;
      if (consecutiveRestarts < 10 && isRecordingRequested) {
        clearTimeout(restartDebounceTimer);
        restartDebounceTimer = setTimeout(() => {
          if (isRecordingRequested && !isEngineActive) safeStartEngine();
        }, 200);
      }
    }
  }

  async function start(lang) {
    if (!recognition) {
      const ok = init({
        onResult: (text) => DraftEditor.setText(text),
        onStatus: UI.setStatus
      });
      if (!ok) {
        Toast.show('Speech recognition not supported in this browser.', 'error', 'fa-solid fa-triangle-exclamation');
        return false;
      }
    }

    isRecordingRequested = true;
    consecutiveRestarts = 0;

    // Capture current editor text as baseline
    baseTranscript = DraftEditor.getText().trim();
    sessionFinalTranscript = '';
    lastInterimChunk = '';

    safeStartEngine();
    startTimer();
    await requestWakeLock();

    // Start Toast
    Toast.show('Listening... Speak now', 'info', 'fa-solid fa-microphone');

    // Haptic vibration feedback on mobile
    if (navigator.vibrate) {
      try { navigator.vibrate(30); } catch { }
    }

    return true;
  }

  function stop(isVoiceCommand = false) {
    if (!isRecordingRequested) return;
    isRecordingRequested = false;
    clearTimeout(restartDebounceTimer);

    if (recognition && isEngineActive) {
      try {
        recognition.stop();
      } catch (err) {
        console.warn('Recognition stop error:', err);
      }
    }

    // Flush pending interim speech
    if (lastInterimChunk.trim()) {
      const processed = processSpokenWords(lastInterimChunk);
      const formatted = formatChunk(processed);
      if (formatted) {
        if (sessionFinalTranscript && !/\s$/.test(sessionFinalTranscript)) {
          sessionFinalTranscript += ' ';
        }
        sessionFinalTranscript += formatted;
      }
      lastInterimChunk = '';
      DraftEditor.setText(buildFullTranscript());
    }

    stopTimer();
    releaseWakeLock();

    // Stop Toast
    if (isVoiceCommand) {
      Toast.show('Voice command: Recording stopped', 'neutral', 'fa-solid fa-stop');
    } else {
      Toast.show('Recording stopped', 'neutral', 'fa-solid fa-stop');
    }

    // Vibration on mobile
    if (navigator.vibrate) {
      try { navigator.vibrate([20, 40]); } catch { }
    }

    UI.setStatus('Idle');
  }

  function clear() {
    baseTranscript = '';
    sessionFinalTranscript = '';
    lastInterimChunk = '';
  }

  function syncContent(content) {
    if (!isRecordingRequested) {
      baseTranscript = content.trim();
      sessionFinalTranscript = '';
      lastInterimChunk = '';
    }
  }

  /* Spoken Punctuation & Words Processor */
  function processSpokenWords(text) {
    if (!text) return '';
    const spokenPunctuationEnabled = document.getElementById('spokenPunctuationToggle')?.checked ?? true;
    if (!spokenPunctuationEnabled) return text;

    let processed = text;

    const replacements = [
      { regex: /\b(period|full stop)\b/gi, sym: '.' },
      { regex: /\bcomma\b/gi, sym: ',' },
      { regex: /\bquestion mark\b/gi, sym: '?' },
      { regex: /\bexclamation (point|mark)\b/gi, sym: '!' },
      { regex: /\bcolon\b/gi, sym: ':' },
      { regex: /\bsemicolon\b/gi, sym: ';' },
      { regex: /\b(new line|newline)\b/gi, sym: '\n' },
      { regex: /\b(new paragraph)\b/gi, sym: '\n\n' }
    ];

    replacements.forEach(({ regex, sym }) => {
      processed = processed.replace(regex, sym);
    });

    processed = processed.replace(/\s+([.,!?:;])/g, '$1');

    return processed;
  }

  /* Formatting (Auto-Capitalize & Auto-Punctuate) */
  function formatChunk(text) {
    if (!text) return '';
    text = text.trim();

    const autoCapitalize = document.getElementById('autoCapitalizeToggle')?.checked ?? true;
    const autoPunctuate = document.getElementById('autoPunctuateToggle')?.checked ?? true;

    if (autoCapitalize && text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    if (autoPunctuate && !/[.!?,;:\n]$/.test(text)) {
      const lastWord = text.split(/\s+/).pop()?.toLowerCase();
      const conjunctions = ['and', 'but', 'or', 'so', 'because', 'with', 'that', 'which', 'to', 'for'];
      if (!conjunctions.includes(lastWord)) {
        text += '.';
      }
    }

    return text;
  }

  /* Voice Commands Engine */
  function checkVoiceCommands(text) {
    if (!text) return { isCommand: false };
    const clean = text.trim().toLowerCase().replace(/[.!?]+$/, '');

    // 1. Stop recording command (standalone or at end of spoken phrase)
    const stopPattern = /\b(stop recording|stop listening|stop dictation|stop voice|end recording|finish recording)\b$/i;
    const stopMatch = clean.match(stopPattern);
    if (stopMatch) {
      const preceding = text.slice(0, stopMatch.index).trim();
      return { isCommand: true, command: 'stop_recording', precedingText: preceding };
    }

    // Standalone "stop" command
    if (clean === 'stop') {
      return { isCommand: true, command: 'stop_recording', precedingText: '' };
    }

    // 2. Clear note command
    if (/^(clear note|clear all)$/.test(clean)) {
      return { isCommand: true, command: 'clear' };
    }

    // 3. New line / Next line commands
    if (/^(new line|next line)$/.test(clean)) {
      return { isCommand: true, command: 'newline' };
    }
    if (/^(new paragraph)$/.test(clean)) {
      return { isCommand: true, command: 'newparagraph' };
    }

    // 4. Delete last word command
    if (/^(delete last word|delete word)$/.test(clean)) {
      return { isCommand: true, command: 'delete_word' };
    }

    return { isCommand: false };
  }

  function executeCommand(command) {
    let current = DraftEditor.getText();

    if (command === 'stop_recording') {
      lastInterimChunk = '';
      DraftEditor.setText(buildFullTranscript());
      stop(true);
      Waveform.stop();
      UI.setStatus('Idle');
      return;
    }

    if (command === 'clear') {
      DraftEditor.clear();
      UI.setStatus('Cleared via voice');
      Toast.show('Note cleared via voice command', 'neutral', 'fa-solid fa-eraser');
      setTimeout(() => UI.resetStatus(), 1200);
      return;
    }

    if (command === 'newline') {
      sessionFinalTranscript += '\n';
      DraftEditor.setText(buildFullTranscript());
      return;
    }

    if (command === 'newparagraph') {
      sessionFinalTranscript += '\n\n';
      DraftEditor.setText(buildFullTranscript());
      return;
    }

    if (command === 'delete_word') {
      const words = current.trim().split(/\s+/);
      words.pop();
      const updated = words.join(' ');
      baseTranscript = updated;
      sessionFinalTranscript = '';
      lastInterimChunk = '';
      DraftEditor.setText(updated);
      UI.setStatus('Word deleted');
      Toast.show('Last word deleted', 'neutral', 'fa-solid fa-delete-left');
      setTimeout(() => UI.resetStatus(), 1000);
    }
  }

  /* Recording Timer */
  function startTimer() {
    startTime = Date.now();
    if (timerBadge) {
      timerBadge.classList.remove('hidden');
      timerBadge.classList.add('flex');
    }
    updateTimerDisplay();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function updateTimerDisplay() {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    if (timerDigits) timerDigits.textContent = `${mins}:${secs}`;
  }

  function stopTimer() {
    clearInterval(timerInterval);
    if (timerBadge) {
      timerBadge.classList.add('hidden');
      timerBadge.classList.remove('flex');
    }
    if (timerDigits) timerDigits.textContent = '00:00';
  }

  /* Screen Wake Lock API */
  async function requestWakeLock() {
    const enabled = document.getElementById('wakeLockToggle')?.checked ?? true;
    if (!enabled || !('wakeLock' in navigator)) return;

    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    } catch (err) { }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      try {
        wakeLockSentinel.release();
      } catch { }
      wakeLockSentinel = null;
    }
  }

  function isRecording() {
    return isRecordingRequested;
  }

  return { init, start, stop, clear, syncContent, isRecording };
})();

/* ============================================================
   Waveform Visualizer (Safe AudioContext & Graceful Fallback)
   ============================================================ */
const Waveform = (() => {
  let ctx = null;
  let analyser = null;
  let source = null;
  let mediaStream = null;
  let rafId = null;
  let isSimulated = false;

  const canvas = document.getElementById('waveform');
  const cctx = canvas?.getContext('2d');

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      if (cctx) cctx.scale(dpr, dpr);
    }
  }

  async function start() {
    if (!canvas || !cctx) return;
    resizeCanvas();

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('AudioContext not supported');

      ctx = new AudioCtx();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = ctx.createMediaStreamSource(mediaStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      isSimulated = false;
      drawLive();
    } catch (err) {
      console.warn('Microphone stream for visualizer unavailable, using responsive wave animation:', err.message);
      isSimulated = true;
      drawSimulated();
    }
  }

  function drawLive() {
    if (!analyser || isSimulated) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(data);

    cctx.clearRect(0, 0, w, h);
    cctx.lineWidth = 2.5;
    cctx.strokeStyle = '#2563eb';
    cctx.lineCap = 'round';
    cctx.lineJoin = 'round';
    cctx.beginPath();

    const sliceWidth = w / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;

      if (i === 0) {
        cctx.moveTo(x, y);
      } else {
        cctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    cctx.stroke();
    rafId = requestAnimationFrame(drawLive);
  }

  let step = 0;
  function drawSimulated() {
    if (!canvas || !isSimulated) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    cctx.clearRect(0, 0, w, h);
    cctx.lineWidth = 2.5;
    cctx.strokeStyle = '#3b82f6';
    cctx.beginPath();

    step += 0.08;
    const mid = h / 2;

    for (let x = 0; x <= w; x += 3) {
      const amp = SpeechService.isRecording() ? 12 : 2;
      const y = mid + Math.sin(x * 0.05 + step) * Math.sin(x * 0.02 + step * 0.5) * amp;
      if (x === 0) cctx.moveTo(x, y);
      else cctx.lineTo(x, y);
    }

    cctx.stroke();
    rafId = requestAnimationFrame(drawSimulated);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    isSimulated = false;

    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach(track => track.stop());
      } catch { }
      mediaStream = null;
    }

    if (source) {
      try { source.disconnect(); } catch { }
      source = null;
    }

    if (analyser) {
      try { analyser.disconnect(); } catch { }
      analyser = null;
    }

    if (ctx && ctx.state !== 'closed') {
      try { ctx.close(); } catch { }
      ctx = null;
    }

    if (cctx && canvas) {
      const rect = canvas.getBoundingClientRect();
      cctx.clearRect(0, 0, rect.width, rect.height);
    }
  }

  window.addEventListener('resize', resizeCanvas);

  return { start, stop };
})();

/* ===========================
   UI Controller
=========================== */
const UI = (() => {
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const recordBtn = document.getElementById('recordBtn');

  function setStatus(text) {
    if (!statusText || !statusDot) return;
    statusText.textContent = text;

    if (text === 'Listening') {
      statusDot.className = 'w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping';
      if (recordBtn) recordBtn.classList.add('ring-2', 'ring-blue-400', 'recording-pulse');
    } else if (text === 'Speaking') {
      statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
    } else if (text === 'Polished' || text === 'Saved') {
      statusDot.className = 'w-2.5 h-2.5 rounded-full bg-indigo-500';
      if (recordBtn) recordBtn.classList.remove('ring-2', 'ring-blue-400', 'recording-pulse');
    } else if (text === 'Mic Blocked' || text === 'AI Error') {
      statusDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
      if (recordBtn) recordBtn.classList.remove('ring-2', 'ring-blue-400', 'recording-pulse');
    } else {
      statusDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-400';
      if (recordBtn) recordBtn.classList.remove('ring-2', 'ring-blue-400', 'recording-pulse');
    }
  }

  function resetStatus() {
    setStatus(SpeechService.isRecording() ? 'Listening' : 'Idle');
  }

  return { setStatus, resetStatus };
})();

/* ============================================================
   Text Polishing (Clean Grammar, Filler Words, Casing)
   ============================================================ */
function cleanTextContent(text) {
  if (!text) return '';

  const fillerWords = [
    'um', 'uh', 'err', 'ah', 'umm', 'uhh', 'you know', 'i mean', 'like literally'
  ];
  let cleaned = text;
  fillerWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b,?\\s*`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();

  const parts = cleaned.split(/([.!?]\s+|\n+)/);
  cleaned = parts.map((part, index) => {
    if (index % 2 === 1) return part;
    if (!part) return '';
    let sentence = part.trim();
    if (sentence) {
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }
    return sentence;
  }).join('');

  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

/* ============================================================
   Main Application Initialization & Event Handlers
   ============================================================ */
(() => {
  // 1. Initial Render
  NotesList.render();
  DraftEditor.updateStats();

  // 2. Initialize Speech Recognition
  SpeechService.init({
    onResult: text => DraftEditor.setText(text),
    onStatus: UI.setStatus
  });

  // 3. Theme Toggle Setup
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark');
      themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun text-amber-400"></i>';
      themeToggleBtn.title = 'Switch to Light Mode';
    } else {
      document.documentElement.classList.remove('dark');
      themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon text-slate-600"></i>';
      themeToggleBtn.title = 'Switch to Dark Mode';
    }
  }

  const isDarkInit = savedTheme === 'dark' || (!savedTheme && prefersDark);
  applyTheme(isDarkInit);

  themeToggleBtn.onclick = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    applyTheme(isDark);
  };

  // 4. Settings Modal Handlers
  const settingsModal = document.getElementById('settingsModal');
  const providerSelect = document.getElementById('aiProviderSelect');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');

  function openSettings() {
    providerSelect.value = localStorage.getItem('ai-provider') || 'gemini';
    apiKeyInput.value = localStorage.getItem('ai-key') || '';
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  document.getElementById('settingsToggleBtn').onclick = openSettings;
  document.getElementById('closeSettingsBtn').onclick = closeSettings;
  document.getElementById('cancelSettingsBtn').onclick = closeSettings;

  if (toggleApiKeyVisibility) {
    toggleApiKeyVisibility.onclick = () => {
      const isPass = apiKeyInput.type === 'password';
      apiKeyInput.type = isPass ? 'text' : 'password';
      toggleApiKeyVisibility.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    };
  }

  document.getElementById('saveSettingsBtn').onclick = () => {
    localStorage.setItem('ai-provider', providerSelect.value);
    localStorage.setItem('ai-key', apiKeyInput.value.trim());

    closeSettings();
    UI.setStatus('Settings Saved');
    Toast.show('Settings saved successfully', 'success', 'fa-solid fa-check');
    setTimeout(() => UI.resetStatus(), 1200);
  };

  settingsModal.onclick = (e) => {
    if (e.target === settingsModal) closeSettings();
  };

  // 5. Recording Controls (Start & Stop with Toasts)
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');

  recordBtn.onclick = async () => {
    if (SpeechService.isRecording()) return;
    UI.setStatus('Listening');
    const started = await SpeechService.start();
    if (started) {
      await Waveform.start();
    }
  };

  stopBtn.onclick = () => {
    if (SpeechService.isRecording()) {
      SpeechService.stop();
      Waveform.stop();
    }
  };

  // 6. Editor Action Buttons (Save, Clear, Clean/Polish, Copy)
  document.getElementById('saveBtn').onclick = () => {
    const draft = DraftEditor.getDraft();
    if (!draft.content && draft.title === 'Untitled Note') {
      UI.setStatus('Cannot save empty note');
      Toast.show('Cannot save an empty note', 'warning', 'fa-solid fa-triangle-exclamation');
      setTimeout(() => UI.resetStatus(), 1200);
      return;
    }
    Store.upsert(draft);
    NotesList.render();
    UI.setStatus('Note Saved');
    Toast.show('Note saved successfully', 'success', 'fa-solid fa-floppy-disk');
    setTimeout(() => UI.resetStatus(), 1500);
  };

  document.getElementById('clearBtn').onclick = () => {
    if (confirm('Clear current note content?')) {
      DraftEditor.clear();
      UI.setStatus('Cleared');
      Toast.show('Note cleared', 'neutral', 'fa-solid fa-eraser');
      setTimeout(() => UI.resetStatus(), 1000);
    }
  };

  // Clean / Polish Button
  document.getElementById('polishBtn').onclick = () => {
    const content = DraftEditor.getText();
    if (!content.trim()) {
      Toast.show('Nothing to clean', 'warning', 'fa-regular fa-note-sticky');
      return;
    }
    const polished = cleanTextContent(content);
    DraftEditor.setText(polished);
    SpeechService.syncContent(polished);
    UI.setStatus('Polished');
    Toast.show('Text cleaned & polished!', 'success', 'fa-solid fa-wand-magic-sparkles');
    setTimeout(() => UI.resetStatus(), 1200);
  };

  // Copy Draft Button
  document.getElementById('copyBtn').onclick = () => {
    Clipboard.copyDraft();
  };

  // 7. Notes Export Handler
  const exportBtn = document.getElementById('exportNotesBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const notes = Store.getAll();
      if (notes.length === 0) {
        Toast.show('No notes to export', 'warning', 'fa-regular fa-note-sticky');
        return;
      }
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(notes, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `voicepad-notes-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      UI.setStatus('Notes Exported');
      Toast.show('Notes exported as JSON', 'success', 'fa-solid fa-download');
      setTimeout(() => UI.resetStatus(), 1500);
    };
  }

  // 8. AI Summarization & Action Items
  const summarizeBtn = document.getElementById('summarizeBtn');
  const summarySection = document.getElementById('aiSummarySection');
  const summaryContent = document.getElementById('aiSummaryContent');
  const closeSummaryBtn = document.getElementById('closeSummaryBtn');
  const copySummaryBtn = document.getElementById('copySummaryBtn');

  summarizeBtn.onclick = async () => {
    const content = DraftEditor.getText().trim();
    if (!content) {
      Toast.show('Please speak or type some text first', 'warning', 'fa-regular fa-note-sticky');
      return;
    }

    if (!navigator.onLine) {
      Toast.show('AI features require an active internet connection', 'warning', 'fa-solid fa-plane');
      return;
    }

    const provider = localStorage.getItem('ai-provider') || 'gemini';
    const apiKey = localStorage.getItem('ai-key');

    if (!apiKey) {
      Toast.show('Please enter your AI API Key in Settings', 'warning', 'fa-solid fa-key');
      openSettings();
      return;
    }

    summarySection.classList.remove('hidden');
    summaryContent.innerHTML = '<span class="inline-flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin text-purple-500"></i> Generating AI summary & action items...</span>';
    UI.setStatus('Processing AI...');
    summarizeBtn.disabled = true;

    const prompt = `You are an executive assistant. Summarize the following transcript concisely in 2-3 sentences, followed by an actionable bulleted list of Todos / Action Items with owners/deadlines if mentioned:\n\n${content}`;

    try {
      let resultText = '';
      if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        if (!response.ok) throw new Error(`Gemini API error (${response.status}): ${response.statusText}`);
        const data = await response.json();
        resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
      } else {
        const url = 'https://api.openai.com/v1/chat/completions';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!response.ok) throw new Error(`OpenAI API error (${response.status}): ${response.statusText}`);
        const data = await response.json();
        resultText = data.choices?.[0]?.message?.content || 'No response generated.';
      }

      summaryContent.textContent = resultText;
      UI.setStatus('AI Complete');
      Toast.show('AI summary generated!', 'success', 'fa-solid fa-brain');
    } catch (err) {
      console.error(err);
      summaryContent.textContent = `Error: ${err.message}. Please check your API key and network connection.`;
      UI.setStatus('AI Error');
      Toast.show('AI request failed', 'error', 'fa-solid fa-triangle-exclamation');
    } finally {
      summarizeBtn.disabled = false;
      setTimeout(() => UI.resetStatus(), 2000);
    }
  };

  closeSummaryBtn.onclick = () => {
    summarySection.classList.add('hidden');
  };

  copySummaryBtn.onclick = () => {
    Clipboard.copy(summaryContent.textContent, 'Summary copied to clipboard!');
  };

  // 9. Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;

    // Spacebar: toggle record/stop when NOT typing
    if (e.code === 'Space' && !isTyping) {
      e.preventDefault();
      if (SpeechService.isRecording()) {
        stopBtn.click();
      } else {
        recordBtn.click();
      }
    }

    // Cmd+S / Ctrl+S: save note
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      document.getElementById('saveBtn').click();
    }

    // Cmd+P / Ctrl+P: clean/polish text
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      document.getElementById('polishBtn').click();
    }

    // Escape: close modal / summary
    if (e.key === 'Escape') {
      closeSettings();
      summarySection.classList.add('hidden');
    }
  });

  // 10. Progressive Web App (PWA) Offline & Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('VoicePad PWA Service Worker ready with scope:', reg.scope);
        })
        .catch(err => {
          console.warn('VoicePad PWA Service Worker registration notice:', err);
        });
    });
  }

  // Online / Offline Detection
  const offlineBadge = document.getElementById('offlineBadge');
  function updateNetworkStatus() {
    if (!navigator.onLine) {
      if (offlineBadge) {
        offlineBadge.classList.remove('hidden');
        offlineBadge.classList.add('flex');
      }
      Toast.show('Offline Mode: Your notes are safely stored in your browser', 'warning', 'fa-solid fa-plane');
    } else {
      if (offlineBadge) {
        offlineBadge.classList.add('hidden');
        offlineBadge.classList.remove('flex');
      }
    }
  }

  window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('online', () => {
    updateNetworkStatus();
    Toast.show('Back online!', 'success', 'fa-solid fa-wifi');
  });
  updateNetworkStatus();

  // PWA Install Prompt - Visible strictly on real mobile phones
  function isRealPhone() {
    // 1. Never show if already running inside installed standalone PWA app
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return false;

    // 2. Client hints check (modern Chromium)
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      if (!navigator.userAgentData.mobile) return false;
    }

    // 3. User agent check specifically targeting real mobile phone devices
    const ua = navigator.userAgent || '';
    const isPhoneUA = /iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua);

    // 4. Physical touch support & phone-sized screen constraints (excludes desktops and tablets)
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isPhoneScreen = window.innerWidth <= 768 && window.screen.width <= 768;

    return isPhoneUA && hasTouch && isPhoneScreen;
  }

  let deferredPrompt = null;
  const installAppBtn = document.getElementById('installAppBtn');

  // Android & Chromium mobile phones
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Only display install button if on a real mobile phone
    if (installAppBtn && isRealPhone()) {
      installAppBtn.classList.remove('hidden');
      installAppBtn.classList.add('flex');
    }
  });

  // iOS Safari on real iPhone (iOS does not fire beforeinstallprompt event)
  if (installAppBtn && isRealPhone() && /iPhone|iPod/i.test(navigator.userAgent)) {
    installAppBtn.classList.remove('hidden');
    installAppBtn.classList.add('flex');
  }

  if (installAppBtn) {
    installAppBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          Toast.show('VoicePad app installed!', 'success', 'fa-solid fa-circle-check');
        }
        deferredPrompt = null;
        installAppBtn.classList.add('hidden');
        installAppBtn.classList.remove('flex');
      } else if (/iPhone|iPod/i.test(navigator.userAgent)) {
        // Helpful installation instructions for iOS Safari on iPhone
        Toast.show('To install: tap the Share button and select "Add to Home Screen"', 'info', 'fa-solid fa-arrow-up-from-bracket');
      }
    };
  }

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installAppBtn) {
      installAppBtn.classList.add('hidden');
      installAppBtn.classList.remove('flex');
    }
  });
})();
