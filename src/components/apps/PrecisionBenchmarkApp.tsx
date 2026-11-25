import React, { useRef, useState } from 'react';
import { Crosshair, RotateCcw } from 'lucide-react';

interface PrecisionBenchmarkAppProps {
  onBackHome: () => void;
  onScoreEvent: (summary: string) => void;
}

const TARGET_POSITIONS = [
  { x: 22, y: 24, size: 56 },
  { x: 76, y: 26, size: 52 },
  { x: 50, y: 52, size: 48 },
  { x: 24, y: 74, size: 44 },
  { x: 78, y: 72, size: 44 },
  { x: 52, y: 22, size: 40 },
  { x: 30, y: 48, size: 40 },
  { x: 72, y: 48, size: 36 },
];

export const PrecisionBenchmarkApp: React.FC<PrecisionBenchmarkAppProps> = ({
  onBackHome,
  onScoreEvent,
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [hits, setHits] = useState(0);
  const [avgMs, setAvgMs] = useState<number | null>(null);
  const [throughput, setThroughput] = useState<number | null>(null);
  const spawnTimeRef = useRef<number>(performance.now());
  const reactionTimesRef = useRef<number[]>([]);

  const target = TARGET_POSITIONS[stepIdx % TARGET_POSITIONS.length];

  const handleHit = () => {
    const now = performance.now();
    const dt = Math.max(120, now - spawnTimeRef.current);
    spawnTimeRef.current = now;

    const nextTimes = [...reactionTimesRef.current, dt].slice(-12);
    reactionTimesRef.current = nextTimes;

    const mean = Math.round(nextTimes.reduce((a, b) => a + b, 0) / nextTimes.length);
    // Fitts's Index of Difficulty approximation: log2(D/W + 1)
    const idBits = Math.log2(220 / target.size + 1);
    const tp = Number((idBits / (mean / 1000)).toFixed(2));

    setHits((h) => h + 1);
    setAvgMs(mean);
    setThroughput(tp);
    setStepIdx((i) => (i + 1) % TARGET_POSITIONS.length);
    onScoreEvent(`Hit #${hits + 1} · ${Math.round(dt)} ms`);
  };

  const handleReset = () => {
    reactionTimesRef.current = [];
    spawnTimeRef.current = performance.now();
    setHits(0);
    setAvgMs(null);
    setThroughput(null);
    setStepIdx(0);
  };

  return (
    <div className="flex-1 flex flex-col justify-between gap-2 py-1 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-gaze-target="true"
          data-action="Back to Home"
          onClick={onBackHome}
          className="gaze-target px-3.5 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
        >
          ← Home
        </button>
        <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5" />
          Fitts&apos;s Precision Test
        </span>
        <button
          type="button"
          data-gaze-target="true"
          data-action="Reset Benchmark"
          onClick={handleReset}
          className="gaze-target p-1.5 rounded-lg bg-white/10 text-slate-200 cursor-pointer"
          title="Reset benchmark"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Live Metrics Strip */}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-900/80 border border-white/10 p-2.5 text-center">
        <div>
          <div className="text-[10px] text-slate-400">Hits</div>
          <div className="text-sm font-mono font-semibold text-white">{hits}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">Mean Time</div>
          <div className="text-sm font-mono font-semibold text-cyan-300">
            {avgMs ? `${avgMs} ms` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">Throughput</div>
          <div className="text-sm font-mono font-semibold text-emerald-300">
            {throughput ? `${throughput} b/s` : '—'}
          </div>
        </div>
      </div>

      {/* Target Arena */}
      <div className="relative flex-1 rounded-2xl bg-[#060911] border border-white/10 overflow-hidden">
        <button
          type="button"
          data-gaze-target="true"
          data-action={`Acquire Target ${hits + 1}`}
          onClick={handleHit}
          className="gaze-target absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/25 border-2 border-cyan-400 flex items-center justify-center cursor-pointer"
          style={{
            left: `${target.x}%`,
            top: `${target.y}%`,
            width: target.size,
            height: target.size,
          }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_#38bdf8]" />
        </button>

        <div className="absolute bottom-2 inset-x-0 text-center text-[11px] text-slate-400 pointer-events-none">
          Dwell or blink on each illuminated target to benchmark speed &amp; accuracy
        </div>
      </div>
    </div>
  );
};
