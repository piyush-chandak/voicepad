# VoicePad

A modern, responsive Progressive Web App (PWA) for voice notes and transcription. Speak naturally, see live transcripts with intelligent punctuation, and capture your ideas with zero dropped words — works both online and offline.

## Key Features

- **Offline PWA Support**: Installable as a native app on mobile and desktop. Works offline via a Service Worker with full local access to your saved notes and drafting tools (just like YouTube offline).
- **Interactive Toast Notifications**: Instant, elegant visual toasts when you start recording, stop, copy text, clean/polish text, save, or change settings.
- **Top Hearing Indicator**: High-visibility real-time transcription strip placed right below the waveform graph so you can clearly see spoken words as they are being processed.
- **Hands-Free Voice Commands**: Say *"stop recording"*, *"stop listening"*, *"new line"*, *"new paragraph"*, *"delete last word"*, or *"clear note"* to control drafting completely hands-free.
- **Continuous & Seamless Speech Recognition**: Engineered with auto-recovery and interim speech buffering so no words get missed during pauses or audio stream reconnects.
- **Smart Spoken Punctuation**: Naturally converts words like *"period"*, *"comma"*, *"question mark"*, *"new line"*, and *"new paragraph"* into real formatting.
- **Mobile-Responsive UI**: Mobile-first design with touch-friendly controls, collapsible guides, and Screen Wake Lock to prevent your phone from sleeping while speaking.
- **Font Icons**: Clean, professional design powered by Font Awesome 6 icons (no emojis).
- **Audio Visualizer**: High-DPI canvas audio waveform with simulated animation fallback.
- **AI Summary & Action Items**: Generate executive summaries and todo checklists using Google Gemini (Gemini 1.5 Flash) or OpenAI (GPT-4o-mini).
- **Local & Private**: Voice notes are saved directly in your browser's `localStorage` with JSON export capabilities.

## Getting Started

Open [index.html](file:///Users/piyush/Documents/projects/ideas/voicepad/index.html) in any modern browser (Google Chrome, Microsoft Edge, or Safari recommended for full Web Speech API and PWA support).
