import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  MousePointer,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  DEVICE_PROFILES,
  type AppView,
  type CalibrationModel,
  type DeviceProfileId,
  type FilterMode,
  type GazePreferences,
  type InputMode,
  type LiveGazeData,
  type TelemetryPoint,
} from './types/gaze';
import { OneEuroFilter2D, applyCalibration } from './utils/filters';
import { audioEngine } from './utils/audioEngine';
import { useWebcamGaze, type WebcamIrisSample } from './hooks/useWebcamGaze';
import { BiometricTelemetryPanel } from './components/BiometricTelemetryPanel';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { GazeReticle } from './components/GazeReticle';
import { DeviceViewport } from './components/DeviceViewport';

const STORAGE_KEY = 'universal_gaze_os_prefs_v2';
const CIRCUMFERENCE = 150.8;

const DEFAULT_PREFS: GazePreferences = {
  deviceProfile: 'iphone',
  dwellEnabled: true,
  snapEnabled: true,
  headPoseFusion: true,
  blinkClickEnabled: true,
  winkNavEnabled: true,
  soundEnabled: true,
  heatmapEnabled: false,
  filterMode: 'one-euro',
  dwellDuration: 900,
  smoothingFactor: 0.16,
  calibration: null,
};

function loadInitialPrefs(): GazePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<GazePreferences>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function App() {
  const [prefs, setPrefs] = useState<GazePreferences>(loadInitialPrefs);
  const [mode, setMode] = useState<InputMode>('sim');
  const [activeView, setActiveView] = useState<AppView>('home');
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [gazePaused, setGazePaused] = useState(false);
  const [reticleVisible, setReticleVisible] = useState(true);
  const [snappedState, setSnappedState] = useState(false);
  const [fps, setFps] = useState(60);
  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);

  const reticleRef = useRef<HTMLDivElement | null>(null);
  const dwellCircleRef = useRef<SVGCircleElement | null>(null);
  const reticleDotRef = useRef<HTMLDivElement | null>(null);

  const euroFilterRef = useRef(new OneEuroFilter2D());
  const toastTimerRef = useRef<number | null>(null);
  const fixationsRef = useRef<{ x: number; y: number; r: number }[]>([]);
  const waveformRef = useRef<TelemetryPoint[]>([]);

  const gazeRef = useRef<LiveGazeData>({
    rawX: typeof window !== 'undefined' ? window.innerWidth * 0.6 : 600,
    rawY: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400,
    smoothX: typeof window !== 'undefined' ? window.innerWidth * 0.6 : 600,
    smoothY: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400,
    irisNormX: 0.5,
    irisNormY: 0.5,
    headYaw: 0,
    headPitch: 0,
    earLeft: 0.31,
    earRight: 0.31,
    isBlinking: false,
    isLeftWink: false,
    isRightWink: false,
    velocity: 0,
    stateKind: 'Fixation',
    confidence: 0.99,
    faceDetected: true,
  });

  const dwellStateRef = useRef<{
    hoveredEl: HTMLElement | null;
    startTime: number;
    triggered: boolean;
  }>({
    hoveredEl: null,
    startTime: 0,
    triggered: false,
  });

  const blinkTrackerRef = useRef({
    blinking: false,
    blinkStart: 0,
    leftWinking: false,
    leftWinkStart: 0,
  });

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pausedRef = useRef(gazePaused);
  pausedRef.current = gazePaused;
  const calibRef = useRef(isCalibrating);
  calibRef.current = isCalibrating;

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage errors
    }
  }, [prefs]);

  const showToast = useCallback((title: string, sub: string) => {
    setToast({ title, sub });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2200);
  }, []);

  const activateElement = useCallback(
    (el: HTMLElement, source: 'dwell' | 'blink') => {
      audioEngine.playFeedback(source === 'blink' ? 'blink' : 'tap', prefsRef.current.soundEnabled);

      if (reticleDotRef.current) {
        reticleDotRef.current.style.transform = 'scale(1.85)';
        window.setTimeout(() => {
          if (reticleDotRef.current) reticleDotRef.current.style.transform = 'scale(1)';
        }, 160);
      }

      // Record fixation cluster if inside device screen
      const g = gazeRef.current;
      const screenEl = el.closest('[data-device-screen="true"]') as HTMLElement | null;
      if (screenEl) {
        const rect = screenEl.getBoundingClientRect();
        if (g.smoothX >= rect.left && g.smoothX <= rect.right && g.smoothY >= rect.top && g.smoothY <= rect.bottom) {
          fixationsRef.current.push({
            x: g.smoothX - rect.left,
            y: g.smoothY - rect.top,
            r: 28,
          });
          if (fixationsRef.current.length > 30) fixationsRef.current.shift();
        }
      }

      el.click();
    },
    []
  );

  // Webcam Iris Sample Handler
  const handleWebcamSample = useCallback(
    (sample: WebcamIrisSample) => {
      if (modeRef.current !== 'webcam') return;
      const g = gazeRef.current;
      g.irisNormX = sample.rawIrisX;
      g.irisNormY = sample.rawIrisY;
      g.earLeft = sample.earLeft;
      g.earRight = sample.earRight;
      g.headYaw = sample.headYaw;
      g.headPitch = sample.headPitch;
      g.faceDetected = sample.faceDetected;
      g.confidence = sample.confidence;

      if (sample.faceDetected) {
        const mapped = applyCalibration(sample.rawIrisX, sample.rawIrisY, prefsRef.current.calibration);
        g.rawX = mapped.x * window.innerWidth;
        g.rawY = mapped.y * window.innerHeight;

        const now = performance.now();
        const avgEar = (sample.earLeft + sample.earRight) * 0.5;
        const bt = blinkTrackerRef.current;

        // Bilateral Blink-to-Click
        if (prefsRef.current.blinkClickEnabled && !calibRef.current && !pausedRef.current) {
          if (avgEar < 0.16 && !bt.blinking) {
            bt.blinking = true;
            bt.blinkStart = now;
            g.isBlinking = true;
          } else if (avgEar >= 0.19 && bt.blinking) {
            const dur = now - bt.blinkStart;
            bt.blinking = false;
            g.isBlinking = false;
            if (dur >= 85 && dur <= 700 && dwellStateRef.current.hoveredEl) {
              dwellStateRef.current.triggered = true;
              showToast('Blink-to-Click', 'Intentional ocular blink detected');
              activateElement(dwellStateRef.current.hoveredEl, 'blink');
            }
          }
        } else {
          bt.blinking = false;
          g.isBlinking = false;
        }

        // Unilateral Left-Wink -> Back Home
        if (prefsRef.current.winkNavEnabled && !calibRef.current && !pausedRef.current) {
          const isLeftOnly = sample.earLeft < 0.14 && sample.earRight > 0.22;
          if (isLeftOnly && !bt.leftWinking) {
            bt.leftWinking = true;
            bt.leftWinkStart = now;
            g.isLeftWink = true;
          } else if (!isLeftOnly && bt.leftWinking) {
            const dur = now - bt.leftWinkStart;
            bt.leftWinking = false;
            g.isLeftWink = false;
            if (dur >= 140 && dur <= 750) {
              audioEngine.playFeedback('wink', prefsRef.current.soundEnabled);
              setActiveView('home');
              showToast('Left Wink Navigation', 'Returned to Home Screen');
            }
          }
        }
      }
    },
    [activateElement, showToast]
  );

  const { videoRef, status: webcamStatus, stream: webcamStream } = useWebcamGaze({
    mode,
    deviceProfile: prefs.deviceProfile,
    headPoseFusion: prefs.headPoseFusion,
    onSample: handleWebcamSample,
    onErrorFallback: (reason) => {
      setMode('sim');
      showToast('Camera Unavailable', reason);
    },
  });

  // Mouse & Touch Simulation Input
  useEffect(() => {
    const onPointerMove = (clientX: number, clientY: number) => {
      if (modeRef.current !== 'sim') return;
      const g = gazeRef.current;
      const nx = clientX / Math.max(1, window.innerWidth);
      const ny = clientY / Math.max(1, window.innerHeight);
      g.irisNormX = nx;
      g.irisNormY = ny;

      const mapped = applyCalibration(nx, ny, prefsRef.current.calibration);
      g.rawX = mapped.x * window.innerWidth;
      g.rawY = mapped.y * window.innerHeight;
      g.faceDetected = true;
      g.confidence = 0.99;
      setReticleVisible(true);
    };

    const handleMouseMove = (e: MouseEvent) => onPointerMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'b' && prefsRef.current.blinkClickEnabled && !calibRef.current) {
        const g = gazeRef.current;
        g.isBlinking = true;
        g.earLeft = 0.08;
        g.earRight = 0.08;
        window.setTimeout(() => {
          g.isBlinking = false;
          g.earLeft = 0.31;
          g.earRight = 0.31;
          if (!pausedRef.current && dwellStateRef.current.hoveredEl) {
            dwellStateRef.current.triggered = true;
            showToast('Blink-to-Click', 'Simulated blink tap triggered');
            activateElement(dwellStateRef.current.hoveredEl, 'blink');
          }
        }, 150);
      } else if (e.code === 'Space' && !calibRef.current) {
        e.preventDefault();
        setGazePaused((p) => {
          const next = !p;
          showToast(next ? 'Gaze Paused' : 'Gaze Resumed', next ? 'Dwell suspended' : 'Tracking active');
          return next;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activateElement, showToast]);

  // Real-Time 60Hz Gaze Physics, Filtering, Snap-to-Item & Dwell Loop
  useEffect(() => {
    let rafId = 0;
    let lastNow = performance.now();
    let fpsCount = 0;
    let fpsLast = performance.now();
    let prevSmoothX = gazeRef.current.smoothX;
    let prevSmoothY = gazeRef.current.smoothY;
    let lastSnapped = false;

    const loop = (now: number) => {
      const dtSec = Math.max(0.001, (now - lastNow) / 1000);
      lastNow = now;

      fpsCount++;
      if (now - fpsLast >= 500) {
        setFps(Math.round((fpsCount * 1000) / (now - fpsLast)));
        fpsCount = 0;
        fpsLast = now;
      }

      const g = gazeRef.current;
      const p = prefsRef.current;

      // Subtle physiological micro-tremor in simulator mode
      const tremorX = modeRef.current === 'sim' ? Math.sin(now * 0.024) * 1.4 : 0;
      const tremorY = modeRef.current === 'sim' ? Math.cos(now * 0.031) * 1.4 : 0;

      let targetX = g.rawX + tremorX;
      let targetY = g.rawY + tremorY;

      // Hit-test gaze targets
      let hoveredTarget: HTMLElement | null = null;
      const targets = document.querySelectorAll<HTMLElement>('[data-gaze-target="true"]');
      targets.forEach((el) => {
        if (el.offsetParent === null) return;
        const rect = el.getBoundingClientRect();
        const pad = 8;
        if (
          targetX >= rect.left - pad &&
          targetX <= rect.right + pad &&
          targetY >= rect.top - pad &&
          targetY <= rect.bottom + pad
        ) {
          hoveredTarget = el;
        }
      });

      const isSnapping = Boolean(hoveredTarget && p.snapEnabled && !pausedRef.current);
      if (isSnapping && hoveredTarget) {
        const rect = (hoveredTarget as HTMLElement).getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        targetX = targetX * 0.3 + cx * 0.7;
        targetY = targetY * 0.3 + cy * 0.7;
      }
      if (isSnapping !== lastSnapped) {
        lastSnapped = isSnapping;
        setSnappedState(isSnapping);
      }

      // Filtering Engine: 1-Euro Adaptive vs Exponential
      if (p.filterMode === 'one-euro') {
        const minCutoff = 0.45 + p.smoothingFactor * 3.2;
        const beta = 0.008 + p.smoothingFactor * 0.08;
        const filtered = euroFilterRef.current.filter(targetX, targetY, now, minCutoff, beta);
        g.smoothX = filtered.x;
        g.smoothY = filtered.y;
      } else {
        g.smoothX += (targetX - g.smoothX) * p.smoothingFactor;
        g.smoothY += (targetY - g.smoothY) * p.smoothingFactor;
      }

      // Compute Velocity (% viewport / s) and classify I-VT state
      const dxPct = ((g.smoothX - prevSmoothX) / Math.max(1, window.innerWidth)) * 100;
      const dyPct = ((g.smoothY - prevSmoothY) / Math.max(1, window.innerHeight)) * 100;
      prevSmoothX = g.smoothX;
      prevSmoothY = g.smoothY;

      const vel = Math.hypot(dxPct, dyPct) / dtSec;
      g.velocity = g.velocity * 0.7 + vel * 0.3;

      if (pausedRef.current) {
        g.stateKind = 'Paused';
      } else if (g.isBlinking) {
        g.stateKind = 'Blink';
      } else if (g.velocity > 38) {
        g.stateKind = 'Saccade';
      } else {
        g.stateKind = 'Fixation';
      }

      // Push telemetry waveform sample (~120 points)
      waveformRef.current.push({
        t: now,
        ear: (g.earLeft + g.earRight) * 0.5,
        velocity: g.velocity,
        stateKind: g.stateKind,
      });
      if (waveformRef.current.length > 110) {
        waveformRef.current.shift();
      }

      // Position Reticle via compositor transform
      if (reticleRef.current) {
        reticleRef.current.style.transform = `translate3d(${g.smoothX}px, ${g.smoothY}px, 0)`;
      }

      // Dwell-to-Click State Machine
      const ds = dwellStateRef.current;
      if (pausedRef.current || calibRef.current) {
        if (ds.hoveredEl) {
          ds.hoveredEl.classList.remove('gaze-hovered');
          ds.hoveredEl = null;
        }
        if (dwellCircleRef.current) {
          dwellCircleRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
        }
      } else if (hoveredTarget !== ds.hoveredEl) {
        if (ds.hoveredEl) {
          ds.hoveredEl.classList.remove('gaze-hovered');
        }
        ds.hoveredEl = hoveredTarget;
        ds.startTime = hoveredTarget ? now : 0;
        ds.triggered = false;
        if (dwellCircleRef.current) {
          dwellCircleRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
        }
        if (hoveredTarget) {
          (hoveredTarget as HTMLElement).classList.add('gaze-hovered');
          audioEngine.playFeedback('hover', p.soundEnabled);
        }
      } else if (hoveredTarget && p.dwellEnabled && !ds.triggered) {
        const elapsed = now - ds.startTime;
        const prog = Math.min(1, elapsed / p.dwellDuration);
        if (dwellCircleRef.current) {
          dwellCircleRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - prog));
        }
        if (prog >= 1) {
          ds.triggered = true;
          if (dwellCircleRef.current) {
            dwellCircleRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
          }
          activateElement(hoveredTarget, 'dwell');
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [activateElement]);

  const applyPreset = (preset: 'stable' | 'balanced' | 'rapid' | 'blink') => {
    if (preset === 'stable') {
      setPrefs((p) => ({
        ...p,
        dwellEnabled: true,
        dwellDuration: 1400,
        smoothingFactor: 0.1,
        filterMode: 'one-euro',
      }));
      showToast('Stable Preset', '1.4s dwell · 1-Euro ultra stabilization');
    } else if (preset === 'balanced') {
      setPrefs((p) => ({
        ...p,
        dwellEnabled: true,
        dwellDuration: 900,
        smoothingFactor: 0.16,
        filterMode: 'one-euro',
      }));
      showToast('Balanced Preset', '0.9s dwell · adaptive filter');
    } else if (preset === 'rapid') {
      setPrefs((p) => ({
        ...p,
        dwellEnabled: true,
        dwellDuration: 500,
        smoothingFactor: 0.28,
        filterMode: 'one-euro',
      }));
      showToast('Rapid Preset', '0.5s dwell · fast saccade response');
    } else {
      setPrefs((p) => ({ ...p, dwellEnabled: false, blinkClickEnabled: true }));
      showToast('Blink-Only Mode', 'Focus target and blink or press B');
    }
  };

  const handleExportTelemetry = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      mode,
      deviceProfile: prefs.deviceProfile,
      filterMode: prefs.filterMode,
      calibration: prefs.calibration,
      fixationCount: fixationsRef.current.length,
      fixations: fixationsRef.current,
      recentTelemetry: waveformRef.current.slice(-60),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gaze-telemetry-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Telemetry Exported', 'Saved JSON snapshot');
  };

  const smoothingLabel =
    prefs.smoothingFactor <= 0.12
      ? 'Ultra'
      : prefs.smoothingFactor <= 0.22
      ? 'High'
      : prefs.smoothingFactor <= 0.34
      ? 'Medium'
      : 'Low';

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col">
      {/* Hidden video element driving MediaPipe FaceLandmarker */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Floating Gaze Reticle */}
      <GazeReticle
        reticleRef={reticleRef}
        dwellCircleRef={dwellCircleRef}
        reticleDotRef={reticleDotRef}
        visible={reticleVisible && !isCalibrating}
        paused={gazePaused}
        snapped={snappedState}
      />

      {/* Fullscreen 9-Point Affine Calibration */}
      <CalibrationOverlay
        isOpen={isCalibrating}
        mode={mode}
        soundEnabled={prefs.soundEnabled}
        gazeRef={gazeRef}
        onComplete={(model: CalibrationModel) => {
          setIsCalibrating(false);
          setPrefs((p) => ({ ...p, calibration: model }));
          showToast('Calibration Complete', `Affine fit ±${model.rmsePercent}% residual error`);
        }}
        onCancel={() => setIsCalibrating(false)}
      />

      {/* 3-Zone Top Bar */}
      <header className="w-full border-b border-slate-800/80 bg-[#07090e]/95 px-6 py-3.5 flex items-center justify-between gap-8">
        <span className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          GazeOS
        </span>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          {(
            [
              ['home', 'Home'],
              ['keyboard', 'Keyboard'],
              ['safari', 'Reader'],
              ['precision', 'Precision'],
              ['camera', 'Camera'],
            ] as [AppView, string][]
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === view ? 'text-cyan-400' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsCalibrating(true)}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Calibrate Gaze
          </button>
        </div>
      </header>

      {/* Main Split Console */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 items-start">
        {/* LEFT COLUMN: Controls & Biometric Telemetry */}
        <aside className="w-full flex flex-col gap-5">
          {/* Input Source & Device Optics */}
          <section className="rounded-2xl bg-[#0f141d] border border-slate-800/90 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-base font-semibold text-white">Eye Tracking Console</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {mode === 'webcam' ? 'Neural Iris Tracker' : 'Cursor & Touch Simulator'} ·{' '}
                  {DEVICE_PROFILES[prefs.deviceProfile].opticsHint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGazePaused((p) => !p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  gazePaused
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {gazePaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{gazePaused ? 'Resume' : 'Pause'}</span>
              </button>
            </div>

            {/* Input Source Segmented Control */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#07090e] rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setMode('sim')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'sim' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span>Simulator</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('webcam')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'webcam' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Webcam AI</span>
              </button>
            </div>

            {/* Hardware Viewport & Camera Profile */}
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Hardware Viewport Profile</div>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#07090e] rounded-xl border border-slate-800">
                {(Object.keys(DEVICE_PROFILES) as DeviceProfileId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, deviceProfile: id }))}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      prefs.deviceProfile === id
                        ? 'bg-slate-800 text-cyan-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {DEVICE_PROFILES[id].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Accessibility Presets */}
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Response Presets</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    ['stable', 'Stable 1.4s'],
                    ['balanced', 'Balanced'],
                    ['rapid', 'Rapid 0.5s'],
                    ['blink', 'Blink-Only'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className="py-1.5 px-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/70 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Biometric Telemetry Canvas & Waveform */}
          <BiometricTelemetryPanel
            gazeRef={gazeRef}
            waveformRef={waveformRef}
            mode={mode}
            webcamStatus={webcamStatus}
            webcamStream={webcamStream}
            fps={fps}
            calibration={prefs.calibration}
          />

          {/* Calibration & Filtering Controls */}
          <section className="rounded-2xl bg-[#0f141d] border border-slate-800/90 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">Dwell Control</div>
                <div className="text-xs text-slate-400">Auto-activate after holding gaze</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.dwellEnabled}
                onClick={() => setPrefs((p) => ({ ...p, dwellEnabled: !p.dwellEnabled }))}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
                  prefs.dwellEnabled ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow" />
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">Dwell Duration</span>
                <span className="font-mono text-cyan-400">
                  {(prefs.dwellDuration / 1000).toFixed(1)} s
                </span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.1"
                value={(prefs.dwellDuration / 1000).toFixed(1)}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, dwellDuration: parseFloat(e.target.value) * 1000 }))
                }
                className="w-full gaze-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">Filter Engine</span>
                <div className="flex items-center gap-2">
                  {(['one-euro', 'exponential'] as FilterMode[]).map((fm) => (
                    <button
                      key={fm}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, filterMode: fm }))}
                      className={`text-[11px] font-mono cursor-pointer ${
                        prefs.filterMode === fm ? 'text-cyan-400 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {fm === 'one-euro' ? '1-Euro' : 'Exp'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Anti-Jitter Cutoff</span>
                <span className="font-mono text-cyan-400">{smoothingLabel}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.45"
                step="0.05"
                value={prefs.smoothingFactor}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, smoothingFactor: parseFloat(e.target.value) }))
                }
                className="w-full gaze-slider"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200">Snap to Item</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.snapEnabled}
                  onClick={() => setPrefs((p) => ({ ...p, snapEnabled: !p.snapEnabled }))}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
                    prefs.snapEnabled ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200">Head Fusion</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.headPoseFusion}
                  onClick={() => setPrefs((p) => ({ ...p, headPoseFusion: !p.headPoseFusion }))}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
                    prefs.headPoseFusion ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, blinkClickEnabled: !p.blinkClickEnabled }))}
                className={`py-2 px-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  prefs.blinkClickEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Blink
              </button>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, winkNavEnabled: !p.winkNavEnabled }))}
                className={`py-2 px-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  prefs.winkNavEnabled
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Wink Back
              </button>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, soundEnabled: !p.soundEnabled }))}
                className={`py-2 px-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  prefs.soundEnabled
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Audio
              </button>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, heatmapEnabled: !p.heatmapEnabled }))}
                className={`py-2 px-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  prefs.heatmapEnabled
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Heatmap
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCalibrating(true)}
                className="py-2.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Calibrate (9-Pt)</span>
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    fixationsRef.current = [];
                    setPrefs((p) => ({ ...p, calibration: null }));
                    showToast('Reset Calibration', 'Cleared affine calibration & heatmap');
                  }}
                  className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Reset calibration and heatmap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportTelemetry}
                  className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Export telemetry JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>
            </div>
          </section>
        </aside>

        {/* RIGHT STAGE: Adaptive Gaze OS Viewport */}
        <section className="w-full flex flex-col items-center justify-center gap-4">
          <DeviceViewport
            deviceProfile={prefs.deviceProfile}
            activeView={activeView}
            onChangeView={setActiveView}
            gazeRef={gazeRef}
            gazePaused={gazePaused}
            onTogglePauseGaze={() => setGazePaused((p) => !p)}
            heatmapEnabled={prefs.heatmapEnabled}
            fixationsRef={fixationsRef}
            webcamStream={webcamStream}
            onStartCalibration={() => setIsCalibrating(true)}
            toast={toast}
            onNotify={showToast}
          />

          <p className="text-xs text-slate-400 font-mono text-center">
            Shortcuts: Press B to simulate blink-click · Press Space to pause/resume gaze · Hot corners in top-left &amp; top-right
          </p>
        </section>
      </main>
    </div>
  );
}
