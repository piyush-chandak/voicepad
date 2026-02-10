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
      card.className = 'note-card p-4 rounded-xl bg-white shadow cursor-pointer border border-slate-100 flex justify-between items-start relative';
      
      card.innerHTML = `
        <div class="flex-1 cursor-pointer">
          <h3 class="font-semibold mb-1">${note.title}</h3>
          <p class="text-sm text-slate-500 line-clamp-3">${note.content}</p>
        </div>
        <div class="flex gap-1">
          <button class="text-blue-500 font-medium" title="Copy Note">📋</button>
          <button class="text-red-500 font-bold" title="Delete Note">×</button>
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

        let spoken = res[0].transcript.trim();
        spoken = addPunctuation(spoken);
        if(res.isFinal){
          finalTranscript += (finalTranscript ? ' ' : '') + spoken;
        } else {
          interimTranscript += spoken;
        }
      }

      onResult(finalTranscript + (interimTranscript ? ' ' + interimTranscript : ''));
      onStatus('Speaking');
    };

    recognition.onstart = () => onStatus('Listening');
    recognition.onend = () => onStatus('Stopped');
  }

  function start(lang) { 
    finalTranscript = document.getElementById('contentInput').value.trim(); // preserve old text
    recognition.lang = lang; 
    recognition.start(); 
  }

  function stop() { recognition.stop(); }

  function clear() { finalTranscript = ''; }

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
    ctx = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    source.connect(analyser);
    draw();
  }

  function draw() {
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    cctx.clearRect(0,0,canvas.width,canvas.height);
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

function addPunctuation(text) {
  if (!text) return '';
  text = text.trim();
  text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_, g1, g2) => g1 + g2.toUpperCase());
  if (!/[.!?]$/.test(text)) text += '.';
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

  document.getElementById('copyBtn').onclick = () => { 
    Clipboard.copyDraft(); 
  };
})();
