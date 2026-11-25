import React, { useEffect, useRef, useState } from 'react';
import type { LiveGazeData } from '../../types/gaze';

interface SafariReaderAppProps {
  gazeRef: React.MutableRefObject<LiveGazeData>;
  gazePaused: boolean;
  onBackHome: () => void;
}

const ARTICLES = [
  {
    id: 'optics',
    tab: 'Eye Tracking',
    title: 'How Hands-Free Gaze Control Works',
    meta: 'Neural Engine · TrueDepth & Webcam AI',
    sections: [
      {
        heading: '1. Dwell Control & Magnetic Snap',
        body: 'As your focal point moves across the screen, the gaze pointer applies adaptive smoothing and snaps magnetically toward interactive controls, eliminating jitter from natural ocular micro-saccades.',
      },
      {
        heading: '2. Proportional Edge Auto-Scroll',
        body: 'Resting your gaze in the upper or lower sensor zone smoothly scrolls long articles proportionally to your gaze depth inside the zone—no swipe gestures required.',
      },
      {
        heading: '3. Blink-to-Click & Wink Navigation',
        body: 'By measuring real-time Eye Aspect Ratio (EAR) and facial blendshapes, intentional blinks trigger instant activation while unilateral winks can invoke secondary hardware commands.',
      },
    ],
  },
  {
    id: 'filter',
    tab: '1-Euro Filter',
    title: 'Adaptive Velocity Filtering for Gaze',
    meta: 'Signal Processing · Casiez et al.',
    sections: [
      {
        heading: 'Low-Speed Fixation Stability',
        body: 'During fixations, gaze velocity drops near zero. The One-Euro filter lowers its cutoff frequency automatically, suppressing pixel tremor without introducing sluggish drift.',
      },
      {
        heading: 'Zero-Lag Saccade Tracking',
        body: 'When your eyes dart across the display in a rapid saccade, derivative velocity spikes raise the cutoff frequency instantly so the reticle tracks your new target cleanly.',
      },
      {
        heading: '9-Point Affine Calibration',
        body: 'Sampling all nine screen quadrants solves a least-squares affine transform mapping raw iris coordinates to viewport geometry, compensating for camera angle and head tilt.',
      },
    ],
  },
];

export const SafariReaderApp: React.FC<SafariReaderAppProps> = ({
  gazeRef,
  gazePaused,
  onBackHome,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const upZoneRef = useRef<HTMLDivElement | null>(null);
  const downZoneRef = useRef<HTMLDivElement | null>(null);

  const [articleIdx, setArticleIdx] = useState(0);
  const [largeText, setLargeText] = useState(false);
  const [scrollState, setScrollState] = useState<'idle' | 'up' | 'down'>('idle');
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      setScrollProgress(0);
    }
  }, [articleIdx]);

  useEffect(() => {
    let rafId = 0;

    const loop = () => {
      if (!gazePaused && scrollContainerRef.current && upZoneRef.current && downZoneRef.current) {
        const gx = gazeRef.current.smoothX;
        const gy = gazeRef.current.smoothY;

        const upRect = upZoneRef.current.getBoundingClientRect();
        const downRect = downZoneRef.current.getBoundingClientRect();
        const container = scrollContainerRef.current;

        if (gx >= upRect.left && gx <= upRect.right && gy >= upRect.top && gy <= upRect.bottom) {
          const depth = Math.max(0.25, 1 - (gy - upRect.top) / Math.max(1, upRect.height));
          container.scrollTop -= 5.5 * depth;
          setScrollState('up');
        } else if (
          gx >= downRect.left &&
          gx <= downRect.right &&
          gy >= downRect.top &&
          gy <= downRect.bottom
        ) {
          const depth = Math.max(0.25, (gy - downRect.top) / Math.max(1, downRect.height));
          container.scrollTop += 5.5 * depth;
          setScrollState('down');
        } else {
          setScrollState('idle');
        }

        const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
        setScrollProgress(Math.round((container.scrollTop / maxScroll) * 100));
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [gazeRef, gazePaused]);

  const article = ARTICLES[articleIdx];

  return (
    <div className="flex-1 flex flex-col justify-between gap-2 py-1 overflow-hidden">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          data-gaze-target="true"
          data-action="Back to Home"
          onClick={onBackHome}
          className="gaze-target px-3.5 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
        >
          ← Home
        </button>

        <div className="flex items-center gap-1.5">
          {ARTICLES.map((art, i) => (
            <button
              key={art.id}
              type="button"
              data-gaze-target="true"
              data-action={`Read ${art.tab}`}
              onClick={() => setArticleIdx(i)}
              className={`gaze-target px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                articleIdx === i ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40' : 'bg-white/5 text-slate-300'
              }`}
            >
              {art.tab}
            </button>
          ))}
          <button
            type="button"
            data-gaze-target="true"
            data-action="Toggle Text Size"
            onClick={() => setLargeText((v) => !v)}
            className="gaze-target px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold text-white cursor-pointer"
          >
            {largeText ? 'A−' : 'A+'}
          </button>
        </div>
      </div>

      {/* Progress & Status Strip */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1 shrink-0">
        <span className={scrollState !== 'idle' ? 'text-sky-300 font-semibold' : ''}>
          {scrollState === 'up'
            ? '▲ Auto-Scrolling Up'
            : scrollState === 'down'
            ? '▼ Auto-Scrolling Down'
            : 'Look Top or Bottom to Scroll'}
        </span>
        <span>{scrollProgress}%</span>
      </div>

      {/* Scrollable Reader */}
      <div className="relative flex-1 rounded-2xl bg-slate-900/75 border border-white/10 overflow-hidden flex flex-col">
        <div
          ref={upZoneRef}
          className={`h-10 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider shrink-0 transition-colors ${
            scrollState === 'up'
              ? 'bg-sky-500/35 text-white'
              : 'bg-gradient-to-b from-sky-500/15 to-transparent text-sky-300'
          }`}
        >
          ▲ Gaze Zone: Scroll Up ▲
        </div>

        <div
          ref={scrollContainerRef}
          className={`flex-1 overflow-y-auto px-4 py-2 space-y-3 leading-relaxed text-slate-200 ${
            largeText ? 'text-sm' : 'text-xs'
          }`}
        >
          <h3 className="text-base font-bold text-white">{article.title}</h3>
          <p className="text-slate-400 text-[11px] font-mono">{article.meta}</p>

          {article.sections.map((sec) => (
            <div key={sec.heading} className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="font-semibold text-sky-300 mb-1">{sec.heading}</div>
              <p className="text-slate-300">{sec.body}</p>
            </div>
          ))}

          <p className="pb-4 text-slate-400 text-[11px]">
            End of article · Rest gaze on top zone to return or tap Home.
          </p>
        </div>

        <div
          ref={downZoneRef}
          className={`h-10 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider shrink-0 transition-colors ${
            scrollState === 'down'
              ? 'bg-sky-500/35 text-white'
              : 'bg-gradient-to-t from-sky-500/15 to-transparent text-sky-300'
          }`}
        >
          ▼ Gaze Zone: Scroll Down ▼
        </div>
      </div>
    </div>
  );
};
