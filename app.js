/* ===========================
   Store
=========================== */
const Store = (() => {
  const KEY = 'voice-notes';
  function getAll() { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  function saveAll(notes) { localStorage.setItem(KEY, JSON.stringify(notes)); }
  function upsert(note) {
    const notes = getAll();
    const index = notes.findIndex(n => n.id === note.id);
    if (index >= 0) notes[index] = note; else notes.unshift(note);
    saveAll(notes);
  }
  function remove(id) {
    const notes = getAll().filter(n => n.id !== id);
    saveAll(notes);
  }
  return { getAll, upsert, remove };
})();

/* ===========================
   Draft Editor
=========================== */
const DraftEditor = (() => {
  let draftId = null;
  const titleInput = document.getElementById('titleInput');
  const contentInput = document.getElementById('contentInput');

  function load(note) {
    draftId = note.id;
    titleInput.value = note.title;
    contentInput.value = note.content;
  }

  function clear() {
    draftId = null;
    titleInput.value = '';
    contentInput.value = '';
  }

  function getDraft() {
    return {
      id: draftId ?? crypto.randomUUID(),
      title: titleInput.value.trim() || 'Untitled',
      content: contentInput.value.trim(),
      updatedAt: new Date().toISOString()
    };
  }

  return { load, clear, getDraft };
})();

/* ===========================
   Clipboard
=========================== */
const Clipboard = (() => ({
  copy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => UI.setStatus('Copied!'))
      .catch(err => console.error('Clipboard error:', err));
    setTimeout(() => UI.setStatus('Idle'), 1000);
  },
  copyDraft() {
    const text = document.getElementById('contentInput').value.trim();
    if (!text) return;
    Clipboard.copy(text);
  },
  copyNote(note) {
    if (!note?.content) return;
    Clipboard.copy(note.content);
  }
}))();

/* ===========================
   Notes List
=========================== */
const NotesList = (() => {
  const container = document.getElementById('notesList');
  const countEl = document.getElementById('noteCount');

  function render() {
    const notes = Store.getAll();
    container.innerHTML = '';
    countEl.textContent = notes.length;

    notes.forEach(note => {
      const card = document.createElement('div');
      card.className = 'note-card p-4 rounded-xl bg-white dark:bg-slate-800 shadow cursor-pointer border border-slate-100 dark:border-slate-700 flex justify-between items-start relative dark:text-white';
      
      card.innerHTML = `
        <div class="flex-1 cursor-pointer">
          <h3 class="font-semibold mb-1">${note.title}</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-3">${note.content}</p>
        </div>
        <div class="flex gap-2">
          <button class="text-blue-500 hover:text-blue-600 font-medium text-lg" title="Copy Note">📋</button>
          <button class="text-red-500 hover:text-red-600 font-bold text-lg" title="Delete Note">×</button>
        </div>
      `;

      const [copyBtn, deleteBtn] = card.querySelectorAll('button');

      copyBtn.onclick = (e) => {
        e.stopPropagation();
        Clipboard.copyNote(note);
      };

      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        Store.remove(note.id);
        render();
      };

      card.querySelector('div.flex-1').onclick = () => DraftEditor.load(note);

      container.appendChild(card);
    });
  }

  return { render };
})();

/* ===========================
   Speech Recognition
=========================== */
const SpeechService = (() => {
  let recognition;
  let finalTranscript = '';
  let isRecording = false;

  function init({ onResult, onStatus }) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SpeechRecognition) return alert("Your browser does not support Speech Recognition.");

    recognition = new SpeechRecognition();
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = e => {
      let interimTranscript = '';

      for(let i=e.resultIndex; i<e.results.length; i++){
        const res = e.results[i];
        let spoken = res[0].transcript;

        if(res.isFinal){
          const cmd = checkVoiceCommands(spoken);
          if (cmd.isCommand) {
            executeCommand(cmd.command);
          } else {
            const formatted = formatSentence(spoken);
            finalTranscript = (finalTranscript.trim() + ' ' + formatted).trim();
          }
        } else {
          interimTranscript += spoken;
        }
      }

      const currentContent = finalTranscript + (interimTranscript ? (finalTranscript ? ' ' : '') + interimTranscript : '');
      onResult(currentContent);
      onStatus('Speaking');
    };

    recognition.onstart = () => {
      isRecording = true;
      onStatus('Listening');
    };

    recognition.onerror = e => {
      console.warn('Speech recognition error:', e.error);
      if (e.error === 'no-speech') {
        // Just let onend handle the restart if appropriate
        return;
      }
    };

    recognition.onend = () => {
      if (isRecording) {
        // Keep listening! Auto-restart.
        try {
          recognition.start();
        } catch (err) {
          console.warn('Failed to auto-restart speech recognition:', err);
        }
      } else {
        onStatus('Stopped');
      }
    };
  }

  function start(lang) {
    isRecording = true;
    finalTranscript = document.getElementById('contentInput').value.trim();
    recognition.lang = lang;
    try {
      recognition.start();
    } catch (e) {
      console.warn('Recognition start error:', e);
    }
  }

  function stop() {
    isRecording = false;
    recognition.stop();
  }

  function clear() {
    finalTranscript = '';
  }

  function checkVoiceCommands(text) {
    const cleanText = text.trim().toLowerCase();
    
    // Command mappings
    if (/^(clear note|clear all)$/.test(cleanText)) {
      return { isCommand: true, command: 'clear' };
    }
    if (/^(new line|new paragraph)$/.test(cleanText)) {
      return { isCommand: true, command: 'newline' };
    }
    if (/^(delete last word|delete word)$/.test(cleanText)) {
      return { isCommand: true, command: 'delete_word' };
    }
    
    return { isCommand: false };
  }

  function executeCommand(command) {
    const textarea = document.getElementById('contentInput');
    let text = textarea.value;

    if (command === 'clear') {
      text = '';
      finalTranscript = '';
    } else if (command === 'newline') {
      text = text.trim() + '\n\n';
      finalTranscript = text;
    } else if (command === 'delete_word') {
      // Remove last word
      const words = text.trim().split(/\s+/);
      words.pop();
      text = words.join(' ');
      finalTranscript = text;
    }

    textarea.value = text;
    // Dispatch input event to keep visual sync
    textarea.dispatchEvent(new Event('input'));
  }

  return { init, start, stop, clear };
})();

/* ===========================
   Waveform
=========================== */
const Waveform = (() => {
  let ctx, analyser, source, raf;
  const canvas = document.getElementById('waveform');
  const cctx = canvas.getContext('2d');

  async function start() {
    try {
      ctx = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      source.connect(analyser);
      draw();
    } catch (err) {
      console.warn('Microphone access denied or error starting waveform:', err);
    }
  }

  function draw() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    cctx.clearRect(0,0,canvas.width,canvas.height);
    cctx.lineWidth = 2;
    cctx.strokeStyle = '#3b82f6'; // Modern blue color
    cctx.beginPath();
    data.forEach((v,i) => {
      const x = (i / data.length) * canvas.width;
      const y = (v / 255) * canvas.height;
      i===0 ? cctx.moveTo(x,y) : cctx.lineTo(x,y);
    });
    cctx.stroke();
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(raf);
    ctx?.close();
    cctx.clearRect(0,0,canvas.width,canvas.height);
  }

  return { start, stop };
})();

function formatSentence(text) {
  if (!text) return '';
  text = text.trim();

  // User preferences from DOM check
  const autoPunctuate = document.getElementById('autoPunctuateToggle')?.checked ?? true;
  const autoCapitalize = document.getElementById('autoCapitalizeToggle')?.checked ?? true;

  if (autoCapitalize) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  if (autoPunctuate && !/[.!?]$/.test(text)) {
    text += '.';
  }

  return text;
}

/* ===========================
   UI
=========================== */
const UI = (() => {
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');

  function setStatus(text) {
    statusText.textContent = text;
    if(text === 'Idle') { statusDot.className = 'w-3 h-3 rounded-full bg-slate-400'; }
    else if(text === 'Listening') { statusDot.className = 'w-3 h-3 rounded-full bg-blue-500 animate-pulse'; }
    else if(text === 'Speaking') { statusDot.className = 'w-3 h-3 rounded-full bg-green-500 animate-pulse'; }
    else if(text === 'Polished') { statusDot.className = 'w-3 h-3 rounded-full bg-indigo-500 animate-pulse'; }
    else { statusDot.className = 'w-3 h-3 rounded-full bg-slate-400'; }
  }
  return { setStatus };
})();

/* ===========================
   App
=========================== */
(() => {
  NotesList.render();

  SpeechService.init({
    onResult: text => { document.getElementById('contentInput').value = text; },
    onStatus: UI.setStatus
  });

  // Initialize theme
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.documentElement.classList.add('dark');
    document.getElementById('themeToggleBtn').textContent = '☀️';
  } else {
    document.documentElement.classList.remove('dark');
    document.getElementById('themeToggleBtn').textContent = '🌙';
  }

  // Theme Toggle click handler
  document.getElementById('themeToggleBtn').onclick = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('themeToggleBtn').textContent = isDark ? '☀️' : '🌙';
  };

  // Settings Modal toggles
  const settingsModal = document.getElementById('settingsModal');
  const providerSelect = document.getElementById('aiProviderSelect');
  const apiKeyInput = document.getElementById('apiKeyInput');

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
  
  document.getElementById('saveSettingsBtn').onclick = () => {
    localStorage.setItem('ai-provider', providerSelect.value);
    localStorage.setItem('ai-key', apiKeyInput.value.trim());
    closeSettings();
    UI.setStatus('Settings Saved');
    setTimeout(() => UI.setStatus('Idle'), 1000);
  };

  // Close modal when clicking backdrop
  settingsModal.onclick = (e) => {
    if (e.target === settingsModal) closeSettings();
  };

  // AI Summarization handler
  document.getElementById('summarizeBtn').onclick = async () => {
    const content = document.getElementById('contentInput').value.trim();
    if (!content) return alert('Please speak or type some text first.');

    const provider = localStorage.getItem('ai-provider') || 'gemini';
    const apiKey = localStorage.getItem('ai-key');

    if (!apiKey) {
      alert('Please configure your AI API Key in the settings first.');
      openSettings();
      return;
    }

    const summarySection = document.getElementById('aiSummarySection');
    const summaryContent = document.getElementById('aiSummaryContent');
    const summarizeBtn = document.getElementById('summarizeBtn');

    summarySection.classList.remove('hidden');
    summaryContent.textContent = 'Processing... Please wait.';
    UI.setStatus('Processing AI...');
    summarizeBtn.disabled = true;
    summarizeBtn.textContent = '🧠 Processing...';

    const prompt = `Provide a concise summary followed by a bulleted checklist of any key action items/todos from the following transcript:\n\n${content}`;

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
        if (!response.ok) throw new Error(`API error: ${response.statusText}`);
        const data = await response.json();
        resultText = data.candidates[0].content.parts[0].text;
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
        if (!response.ok) throw new Error(`API error: ${response.statusText}`);
        const data = await response.json();
        resultText = data.choices[0].message.content;
      }

      summaryContent.textContent = resultText;
      UI.setStatus('AI Success');
    } catch (err) {
      console.error(err);
      summaryContent.textContent = `Error calling ${provider === 'gemini' ? 'Gemini' : 'ChatGPT'} API. Please verify your API Key and network connection.`;
      UI.setStatus('AI Error');
    } finally {
      summarizeBtn.disabled = false;
      summarizeBtn.textContent = '🧠 AI Summary';
      setTimeout(() => UI.setStatus('Idle'), 2000);
    }
  };

  document.getElementById('closeSummaryBtn').onclick = () => {
    document.getElementById('aiSummarySection').classList.add('hidden');
  };

  document.getElementById('recordBtn').onclick = async () => {
    UI.setStatus('Listening');
    await Waveform.start();
    SpeechService.start(document.getElementById('languageSelect').value);
  };

  document.getElementById('stopBtn').onclick = () => { 
    SpeechService.stop(); 
    Waveform.stop(); 
  };

  document.getElementById('saveBtn').onclick = () => { 
    Store.upsert(DraftEditor.getDraft()); 
    NotesList.render(); 
  };

  document.getElementById('clearBtn').onclick = () => { 
    DraftEditor.clear(); 
    SpeechService.clear(); 
  };

  document.getElementById('polishBtn').onclick = () => {
    const contentInput = document.getElementById('contentInput');
    const cleaned = cleanTextContent(contentInput.value);
    contentInput.value = cleaned;
    // Update SpeechService's internal transcript so future speech appends to the cleaned version
    SpeechService.start(document.getElementById('languageSelect').value);
    SpeechService.stop(); // Stop/reset context with the new text
    UI.setStatus('Polished');
    setTimeout(() => UI.setStatus('Idle'), 1000);
  };

  document.getElementById('copyBtn').onclick = () => { 
    Clipboard.copyDraft(); 
  };

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;

    // 1. Space: toggle record/stop (only when NOT typing in an input field)
    if (e.code === 'Space' && !isTyping) {
      e.preventDefault();
      const status = document.getElementById('statusText').textContent;
      if (status === 'Listening' || status === 'Speaking') {
        document.getElementById('stopBtn').click();
      } else {
        document.getElementById('recordBtn').click();
      }
    }

    // 2. Cmd+S / Ctrl+S: save note
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      document.getElementById('saveBtn').click();
      UI.setStatus('Saved via Hotkey');
      setTimeout(() => UI.setStatus('Idle'), 1000);
    }

    // 3. Cmd+P / Ctrl+P: clean/polish text
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      document.getElementById('polishBtn').click();
    }
  });
})();

function cleanTextContent(text) {
  if (!text) return '';
  
  // 1. Remove filler words (case-insensitive with word boundaries)
  const fillerWords = ['um', 'uh', 'err', 'ah', 'you know'];
  let cleaned = text;
  fillerWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b,?\\s*`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  // 2. Fix multiple spaces and trim
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();

  // 3. Sentence casing
  // Split by sentence endings (., !, ?) while keeping the separators
  const parts = cleaned.split(/([.!?]\s+)/);
  cleaned = parts.map((part, index) => {
    if (index % 2 === 1) return part;
    if (!part) return '';
    let sentence = part.trim();
    if (sentence) {
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }
    return sentence;
  }).join('');

  // 4. Ensure final punctuation
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}
