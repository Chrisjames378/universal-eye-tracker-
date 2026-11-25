import React, { useEffect, useRef, useState } from 'react';
import type { CalibrationModel, CalibrationSample, InputMode, LiveGazeData } from '../types/gaze';
import { solveAffineCalibration } from '../utils/filters';
import { audioEngine } from '../utils/audioEngine';

interface CalibrationOverlayProps {
  isOpen: boolean;
  mode: InputMode;
  soundEnabled: boolean;
  gazeRef: React.MutableRefObject<LiveGazeData>;
  onComplete: (model: CalibrationModel) => void;
  onCancel: () => void;
}

const CALIBRATION_POINTS = [
  { x: 0.5, y: 0.5 },
  { x: 0.14, y: 0.16 },
  { x: 0.86, y: 0.16 },
  { x: 0.86, y: 0.5 },
  { x: 0.86, y: 0.84 },
  { x: 0.5, y: 0.84 },
  { x: 0.14, y: 0.84 },
  { x: 0.14, y: 0.5 },
  { x: 0.5, y: 0.5 },
];

const POINT_DURATION_MS = 1050;
const SETTLE_MS = 280;

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
  isOpen,
  mode,
  soundEnabled,
  gazeRef,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const samplesRef = useRef<CalibrationSample[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    samplesRef.current = [];
    setStep(0);
    setProgress(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let rafId = 0;
    const startTime = performance.now();
    const target = CALIBRATION_POINTS[step];

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(1, elapsed / POINT_DURATION_MS);
      setProgress(pct);

      // Collect samples after initial saccade settle delay
      if (elapsed > SETTLE_MS) {
        const current = gazeRef.current;
        samplesRef.current.push({
          targetX: target.x,
          targetY: target.y,
          irisX: current.irisNormX,
          irisY: current.irisNormY,
        });
      }

      if (elapsed >= POINT_DURATION_MS) {
        audioEngine.playFeedback('calib', soundEnabled);
        if (step + 1 >= CALIBRATION_POINTS.length) {
          const model = solveAffineCalibration(samplesRef.current);
          onComplete(model);
          return;
        }
        setStep((s) => s + 1);
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, step, gazeRef, onComplete, soundEnabled]);

  if (!isOpen) return null;

  const currentPoint = CALIBRATION_POINTS[step];
  const circumference = 2 * Math.PI * 22;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#05070b]/95 backdrop-blur-xl flex flex-col items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="9-Point Gaze Calibration"
    >
      <div className="absolute top-8 text-center px-6 max-w-lg">
        <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
          9-Point Affine Calibration · {mode === 'webcam' ? 'Neural Iris Lock' : 'Simulator Alignment'}
        </div>
        <h2 className="text-2xl font-semibold text-white mt-2">
          Follow the Target With Your Eyes
        </h2>
        <p className="text-sm text-slate-400 mt-1.5">
          Keep your head steady and focus directly on the illuminated ring as it samples your iris geometry.
        </p>
      </div>

      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out flex items-center justify-center"
        style={{
          left: `${currentPoint.x * 100}%`,
          top: `${currentPoint.y * 100}%`,
          width: 64,
          height: 64,
        }}
      >
        <svg className="w-16 h-16" viewBox="0 0 56 56">
          <circle
            cx="28"
            cy="28"
            r="22"
            fill="rgba(6, 182, 212, 0.12)"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth="3"
          />
          <circle
            cx="28"
            cy="28"
            r="22"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        </svg>
        <div className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_16px_#38bdf8]" />
      </div>

      <div className="absolute bottom-10 flex flex-col items-center gap-3">
        <div className="text-xs font-mono text-slate-300">
          Point {step + 1} of {CALIBRATION_POINTS.length} · Samples {samplesRef.current.length}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          Cancel Calibration
        </button>
      </div>
    </div>
  );
};
