import React, { useMemo, useState } from 'react';

interface GazeKeyboardAppProps {
  onBackHome: () => void;
  onSpeak: (phrase: string) => void;
}

const KB_PAGES: string[][] = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'SPACE'],
  ['N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '?'],
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', ',', '!', 'SPACE'],
];

const DICTIONARY = [
  'HELLO',
  'HELP',
  'THANKS',
  'THANK YOU',
  'PLEASE',
  'WATER',
  'YES',
  'NO',
  'READY',
  'SURFACE',
  'MOBILE',
  'HOME',
  'GOOD',
  'MORNING',
  'LIGHT',
  'MUSIC',
  'SPEAK',
  'CALIBRATE',
  'SCREEN',
  'SCROLL',
];

const QUICK_PHRASES = ['YES', 'NO', 'THANK YOU', 'NEED HELP'];

export const GazeKeyboardApp: React.FC<GazeKeyboardAppProps> = ({ onBackHome, onSpeak }) => {
  const [text, setText] = useState('HELLO ');
  const [pageIdx, setPageIdx] = useState(0);
  const [speechRate, setSpeechRate] = useState<0.9 | 1.15>(1.15);

  const predictions = useMemo(() => {
    const trimmed = text.trimEnd();
    const lastToken = (trimmed.split(' ').pop() || '').toUpperCase();
    const matches = DICTIONARY.filter((w) => w.startsWith(lastToken) && w !== lastToken);
    return (matches.length ? matches : ['PLEASE', 'THANKS', 'READY']).slice(0, 3);
  }, [text]);

  const handleKey = (key: string) => {
    setText((prev) => prev + (key === 'SPACE' ? ' ' : key));
  };

  const handlePredict = (word: string) => {
    setText((prev) => {
      const endsWithSpace = prev.endsWith(' ');
      if (endsWithSpace || prev.trim().length === 0) {
        return prev + word + ' ';
      }
      const parts = prev.split(' ');
      parts[parts.length - 1] = word;
      return parts.join(' ') + ' ';
    });
  };

  const handleSpeakNow = () => {
    const phrase = text.trim() || 'Hello';
    onSpeak(phrase);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(phrase);
      utter.rate = speechRate;
      window.speechSynthesis.speak(utter);
    }
  };

  const pageLabels = ['A–M', 'N–Z', '0–9'];

  return (
    <div className="flex-1 flex flex-col justify-between gap-2 py-1 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-gaze-target="true"
          data-action="Back to Home"
          onClick={onBackHome}
          className="gaze-target px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
        >
          ← Home
        </button>

        <div className="flex items-center gap-1.5">
          {pageLabels.map((lbl, idx) => (
            <button
              key={lbl}
              type="button"
              data-gaze-target="true"
              data-action={`Keyboard Page ${lbl}`}
              onClick={() => setPageIdx(idx)}
              className={`gaze-target px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                pageIdx === idx
                  ? 'bg-sky-500/30 text-sky-200 border border-sky-400/50'
                  : 'bg-white/5 text-slate-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Live Output Buffer */}
      <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-3 flex flex-col justify-between min-h-[76px]">
        <div className="text-sm font-medium text-white break-words leading-snug">
          {text}
          <span className="inline-block w-0.5 h-4 bg-sky-400 ml-0.5 align-middle animate-pulse" />
        </div>
        <div className="flex items-center justify-between gap-1.5 mt-2 pt-2 border-t border-white/10">
          <button
            type="button"
            data-gaze-target="true"
            data-action="Toggle Voice Rate"
            onClick={() => setSpeechRate((r) => (r === 1.15 ? 0.9 : 1.15))}
            className="gaze-target px-2.5 py-1 rounded-lg bg-white/10 text-[11px] font-mono text-slate-300 cursor-pointer whitespace-nowrap"
          >
            {speechRate}x
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-gaze-target="true"
              data-action="Backspace"
              onClick={() => setText((t) => t.slice(0, -1))}
              className="gaze-target px-3 py-1 rounded-lg bg-white/10 text-slate-100 text-xs font-semibold cursor-pointer"
            >
              ⌫
            </button>
            <button
              type="button"
              data-gaze-target="true"
              data-action="Clear Text"
              onClick={() => setText('')}
              className="gaze-target px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-[11px] font-semibold cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              data-gaze-target="true"
              data-action="Speak Phrase"
              onClick={handleSpeakNow}
              className="gaze-target px-3 py-1 rounded-lg bg-emerald-500/25 text-emerald-200 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
            >
              Speak
            </button>
          </div>
        </div>
      </div>

      {/* Predictions & Quick AAC Phrases */}
      <div className="grid grid-cols-3 gap-1.5">
        {predictions.map((word) => (
          <button
            key={word}
            type="button"
            data-gaze-target="true"
            data-action={`Insert ${word}`}
            onClick={() => handlePredict(word)}
            className="gaze-target py-1.5 px-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-xs font-semibold text-sky-200 truncate cursor-pointer"
          >
            {word}
          </button>
        ))}
      </div>

      {/* Dwell Keyboard Grid */}
      <div className="grid grid-cols-4 gap-1.5 flex-1">
        {KB_PAGES[pageIdx].map((ch) => (
          <button
            key={ch}
            type="button"
            data-gaze-target="true"
            data-action={`Key ${ch}`}
            onClick={() => handleKey(ch)}
            className="gaze-target bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white flex items-center justify-center cursor-pointer"
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Quick AAC Strip */}
      <div className="grid grid-cols-4 gap-1.5">
        {QUICK_PHRASES.map((phrase) => (
          <button
            key={phrase}
            type="button"
            data-gaze-target="true"
            data-action={`Quick Phrase: ${phrase}`}
            onClick={() => {
              setText(phrase + ' ');
              onSpeak(phrase);
              if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(phrase));
              }
            }}
            className="gaze-target py-1.5 px-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-200 truncate cursor-pointer"
          >
            {phrase}
          </button>
        ))}
      </div>
    </div>
  );
};
