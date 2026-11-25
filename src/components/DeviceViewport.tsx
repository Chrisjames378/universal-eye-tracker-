import React, { useEffect, useRef, useState } from 'react';
import {
  Bluetooth,
  Camera,
  CheckCircle2,
  Crosshair,
  Globe,
  Image as ImageIcon,
  Keyboard,
  Lightbulb,
  MessageSquare,
  Moon,
  Music,
  Pause,
  Phone,
  Play,
  PlayCircle,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Volume2,
  Wifi,
  X,
} from 'lucide-react';
import {
  DEVICE_PROFILES,
  type AppView,
  type DeviceProfileId,
  type LiveGazeData,
  type PhotoItem,
} from '../types/gaze';
import { audioEngine } from '../utils/audioEngine';
import { GazeKeyboardApp } from './apps/GazeKeyboardApp';
import { SafariReaderApp } from './apps/SafariReaderApp';
import { PrecisionBenchmarkApp } from './apps/PrecisionBenchmarkApp';

interface DeviceViewportProps {
  deviceProfile: DeviceProfileId;
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  gazeRef: React.MutableRefObject<LiveGazeData>;
  gazePaused: boolean;
  onTogglePauseGaze: () => void;
  heatmapEnabled: boolean;
  fixationsRef: React.MutableRefObject<{ x: number; y: number; r: number }[]>;
  webcamStream: MediaStream | null;
  onStartCalibration: () => void;
  toast: { title: string; sub: string } | null;
  onNotify: (title: string, sub: string) => void;
}

const TRACKS = ['Midnight Horizon', 'Ambient Focus', 'Deep Orbit'];

const INITIAL_PHOTOS: PhotoItem[] = [
  {
    id: 'seed-1',
    title: 'Evening Sky',
    subtitle: 'Gaze Capture #1',
    gradient: 'from-sky-600 to-indigo-800',
    createdAt: 'Sample',
  },
  {
    id: 'seed-2',
    title: 'Lab Calibration',
    subtitle: 'Gaze Capture #2',
    gradient: 'from-emerald-600 to-teal-800',
    createdAt: 'Sample',
  },
];

export const DeviceViewport: React.FC<DeviceViewportProps> = ({
  deviceProfile,
  activeView,
  onChangeView,
  gazeRef,
  gazePaused,
  onTogglePauseGaze,
  heatmapEnabled,
  fixationsRef,
  webcamStream,
  onStartCalibration,
  toast,
  onNotify,
}) => {
  const profile = DEVICE_PROFILES[deviceProfile];
  const screenRef = useRef<HTMLDivElement | null>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  const [clock, setClock] = useState('4:23');
  const [assistiveOpen, setAssistiveOpen] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);

  // Device system states
  const [brightness, setBrightness] = useState(100);
  const [volume, setVolume] = useState(70);
  const [wifiOn, setWifiOn] = useState(true);
  const [btOn, setBtOn] = useState(true);
  const [focusOn, setFocusOn] = useState(false);
  const [lightsOn, setLightsOn] = useState(true);

  // Media Player states
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);

  // Camera & Photos states
  const [lensZoom, setLensZoom] = useState<'1x' | '2x'>('1x');
  const [showGrid, setShowGrid] = useState(true);
  const [flashActive, setFlashActive] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>(INITIAL_PHOTOS);

  // Sync clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = now.getHours() % 12 || 12;
      const m = String(now.getMinutes()).padStart(2, '0');
      setClock(`${h}:${m}`);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Sync audio volume
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Cleanup music on unmount
  useEffect(() => {
    return () => audioEngine.stopMusic();
  }, []);

  // Sync live webcam stream to Camera App viewfinder
  useEffect(() => {
    if (activeView === 'camera' && camVideoRef.current && webcamStream) {
      camVideoRef.current.srcObject = webcamStream;
      camVideoRef.current.play().catch(() => {});
    }
  }, [activeView, webcamStream]);

  // Saccade trajectory & fixation heatmap render loop
  useEffect(() => {
    if (!heatmapEnabled) {
      trailRef.current = [];
      return;
    }

    let rafId = 0;
    const render = () => {
      const canvas = heatmapCanvasRef.current;
      const screen = screenRef.current;
      if (canvas && screen) {
        const rect = screen.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(rect.width * dpr);
        const h = Math.round(rect.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, rect.width, rect.height);

          const gx = gazeRef.current.smoothX;
          const gy = gazeRef.current.smoothY;
          if (gx >= rect.left && gx <= rect.right && gy >= rect.top && gy <= rect.bottom) {
            trailRef.current.push({ x: gx - rect.left, y: gy - rect.top });
            if (trailRef.current.length > 48) trailRef.current.shift();
          }

          // Fixation clusters
          fixationsRef.current.forEach((pt) => {
            const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, pt.r);
            grad.addColorStop(0, 'rgba(244, 63, 94, 0.55)');
            grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
            grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
            ctx.fill();
          });

          // Saccade trajectory path
          const trail = trailRef.current;
          if (trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(trail[0].x, trail[0].y);
            for (let i = 1; i < trail.length; i++) {
              ctx.lineTo(trail[i].x, trail[i].y);
            }
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [heatmapEnabled, gazeRef, fixationsRef]);

  const capturePhoto = (title: string) => {
    setFlashActive(true);
    window.setTimeout(() => setFlashActive(false), 160);

    let dataUrl: string | undefined;
    if (camVideoRef.current && webcamStream && camVideoRef.current.readyState >= 2) {
      const snap = document.createElement('canvas');
      snap.width = 320;
      snap.height = 240;
      const sCtx = snap.getContext('2d');
      if (sCtx) {
        sCtx.save();
        sCtx.scale(-1, 1);
        sCtx.drawImage(camVideoRef.current, -320, 0, 320, 240);
        sCtx.restore();
        dataUrl = snap.toDataURL('image/jpeg', 0.8);
      }
    }

    const nextNum = photos.length + 1;
    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setPhotos((prev) => [
      {
        id: `cap-${Date.now()}`,
        title,
        subtitle: `Gaze Capture #${nextNum}`,
        dataUrl,
        gradient: 'from-cyan-600 via-blue-700 to-indigo-800',
        createdAt: nowLabel,
      },
      ...prev,
    ]);
    onNotify(title, 'Saved to Gaze Photos');
  };

  const toggleMusic = () => {
    if (isPlaying) {
      audioEngine.stopMusic();
      setIsPlaying(false);
      onNotify('Music Paused', TRACKS[trackIdx]);
    } else {
      audioEngine.startMusic(trackIdx);
      setIsPlaying(true);
      onNotify('Spatial Audio Playing', TRACKS[trackIdx]);
    }
  };

  const nextTrack = () => {
    const next = (trackIdx + 1) % TRACKS.length;
    setTrackIdx(next);
    if (isPlaying) {
      audioEngine.startMusic(next);
    }
    onNotify('Next Track', TRACKS[next]);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div
        className={`${profile.widthClass} ${profile.heightClass} ${profile.radiusClass} bg-slate-900 p-3 border border-slate-700/80 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.85)] flex flex-col transition-all duration-300`}
      >
        <div
          ref={screenRef}
          data-device-screen="true"
          className="relative w-full h-full rounded-[34px] overflow-hidden flex flex-col justify-between p-4 bg-[radial-gradient(circle_at_20%_15%,#162447_0%,#0b1120_48%,#05070e_100%)]"
        >
          {/* Brightness Dimmer */}
          <div
            className="absolute inset-0 bg-black pointer-events-none z-10 transition-opacity duration-200"
            style={{ opacity: Number(((100 - brightness) / 130).toFixed(2)) }}
          />

          {/* Saccade & Fixation Heatmap Overlay */}
          {heatmapEnabled && (
            <canvas
              ref={heatmapCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-30"
            />
          )}

          {/* Hot Corners */}
          <button
            type="button"
            data-gaze-target="true"
            data-action="Open Control Center"
            onClick={() => {
              setControlCenterOpen(true);
              onNotify('Control Center', 'Dwell on quick settings');
            }}
            title="Hot Corner: Control Center"
            className="gaze-target absolute top-0 left-0 w-11 h-11 rounded-br-2xl bg-cyan-400/10 hover:bg-cyan-400/25 border-b border-r border-white/10 z-20 flex items-center justify-center cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-300/80" />
          </button>

          <button
            type="button"
            data-gaze-target="true"
            data-action="Quick Screen Capture"
            onClick={() => capturePhoto('Hot Corner Capture')}
            title="Hot Corner: Screen Capture"
            className="gaze-target absolute top-0 right-0 w-11 h-11 rounded-bl-2xl bg-cyan-400/10 hover:bg-cyan-400/25 border-b border-l border-white/10 z-20 flex items-center justify-center cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-300/80" />
          </button>

          {/* Floating AssistiveTouch Orb */}
          <button
            type="button"
            data-gaze-target="true"
            data-action="AssistiveTouch Menu"
            onClick={() => setAssistiveOpen((o) => !o)}
            title="AssistiveTouch Hardware Menu"
            className="gaze-target absolute right-2.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-slate-900/90 border border-white/25 shadow-lg z-30 flex items-center justify-center cursor-pointer"
          >
            <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
              <span className="w-3.5 h-3.5 rounded-full bg-white/85" />
            </span>
          </button>

          {/* AssistiveTouch Radial Hardware Modal */}
          {assistiveOpen && (
            <div className="absolute inset-5 m-auto h-72 rounded-3xl bg-slate-900/95 backdrop-blur-xl border border-white/20 p-4 z-40 flex flex-col justify-between shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-400">AssistiveTouch</span>
                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Close AssistiveTouch"
                  onClick={() => setAssistiveOpen(false)}
                  className="gaze-target p-1.5 rounded-lg bg-white/10 text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Hardware Home"
                  onClick={() => {
                    onChangeView('home');
                    setAssistiveOpen(false);
                  }}
                  className="gaze-target flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 text-white cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5 text-slate-200" />
                  <span className="text-[11px]">Home</span>
                </button>

                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Open Controls"
                  onClick={() => {
                    setAssistiveOpen(false);
                    setControlCenterOpen(true);
                  }}
                  className="gaze-target flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 text-white cursor-pointer"
                >
                  <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
                  <span className="text-[11px]">Controls</span>
                </button>

                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Capture Screen"
                  onClick={() => {
                    setAssistiveOpen(false);
                    capturePhoto('Assistive Capture');
                  }}
                  className="gaze-target flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 text-white cursor-pointer"
                >
                  <Camera className="w-5 h-5 text-emerald-400" />
                  <span className="text-[11px]">Capture</span>
                </button>

                <button
                  type="button"
                  data-gaze-target="true"
                  data-action={gazePaused ? 'Resume Gaze' : 'Pause Gaze'}
                  onClick={() => {
                    onTogglePauseGaze();
                    setAssistiveOpen(false);
                  }}
                  className="gaze-target flex flex-col items-center gap-1 p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 cursor-pointer"
                >
                  {gazePaused ? <PlayCircle className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span className="text-[11px]">{gazePaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Volume Up"
                  onClick={() => {
                    setVolume((v) => Math.min(100, v + 15));
                    setAssistiveOpen(false);
                  }}
                  className="gaze-target flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 text-white cursor-pointer"
                >
                  <Volume2 className="w-5 h-5 text-sky-300" />
                  <span className="text-[11px]">Vol +</span>
                </button>

                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Open Auto-Scroll Reader"
                  onClick={() => {
                    onChangeView('safari');
                    setAssistiveOpen(false);
                  }}
                  className="gaze-target flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/10 text-white cursor-pointer"
                >
                  <Globe className="w-5 h-5 text-cyan-300" />
                  <span className="text-[11px]">Reader</span>
                </button>
              </div>

              <div className="text-[10px] text-center text-slate-400">
                Dwell or blink to trigger hardware action
              </div>
            </div>
          )}

          {/* Control Center Drawer */}
          {controlCenterOpen && (
            <div className="absolute inset-x-4 top-12 rounded-3xl bg-slate-900/95 backdrop-blur-xl border border-white/20 p-4 z-40 flex flex-col gap-3 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-400">Control Center</span>
                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Close Control Center"
                  onClick={() => setControlCenterOpen(false)}
                  className="gaze-target px-3 py-1 rounded-lg bg-white/10 text-xs font-semibold text-white cursor-pointer"
                >
                  Done
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Toggle Wi-Fi"
                  onClick={() => setWifiOn((v) => !v)}
                  className={`gaze-target p-3 rounded-2xl flex flex-col items-center gap-1 cursor-pointer ${
                    wifiOn ? 'bg-sky-500 text-white' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  <Wifi className="w-4 h-4" />
                  <span className="text-[11px] font-medium">Wi-Fi</span>
                </button>

                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Toggle Bluetooth"
                  onClick={() => setBtOn((v) => !v)}
                  className={`gaze-target p-3 rounded-2xl flex flex-col items-center gap-1 cursor-pointer ${
                    btOn ? 'bg-blue-600 text-white' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  <Bluetooth className="w-4 h-4" />
                  <span className="text-[11px] font-medium">Bluetooth</span>
                </button>

                <button
                  type="button"
                  data-gaze-target="true"
                  data-action="Toggle Focus"
                  onClick={() => setFocusOn((v) => !v)}
                  className={`gaze-target p-3 rounded-2xl flex flex-col items-center gap-1 cursor-pointer ${
                    focusOn ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  <span className="text-[11px] font-medium">Focus</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-white/10 rounded-2xl p-2.5 flex flex-col gap-2">
                  <div className="flex justify-between text-[11px] font-medium text-white">
                    <span>Brightness</span>
                    <span className="font-mono text-amber-300">{brightness}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      data-gaze-target="true"
                      data-action="Brightness Down"
                      onClick={() => setBrightness((b) => Math.max(20, b - 20))}
                      className="gaze-target py-2 rounded-xl bg-black/40 text-white font-bold text-sm cursor-pointer"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      data-gaze-target="true"
                      data-action="Brightness Up"
                      onClick={() => setBrightness((b) => Math.min(100, b + 20))}
                      className="gaze-target py-2 rounded-xl bg-amber-400/25 text-amber-200 font-bold text-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="bg-white/10 rounded-2xl p-2.5 flex flex-col gap-2">
                  <div className="flex justify-between text-[11px] font-medium text-white">
                    <span>Volume</span>
                    <span className="font-mono text-sky-300">{volume}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      data-gaze-target="true"
                      data-action="Volume Down"
                      onClick={() => setVolume((v) => Math.max(0, v - 15))}
                      className="gaze-target py-2 rounded-xl bg-black/40 text-white font-bold text-sm cursor-pointer"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      data-gaze-target="true"
                      data-action="Volume Up"
                      onClick={() => setVolume((v) => Math.min(100, v + 15))}
                      className="gaze-target py-2 rounded-xl bg-sky-400/25 text-sky-200 font-bold text-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Status Bar */}
          <div className="flex items-center justify-between px-10 pt-0.5 z-20 shrink-0">
            <span className="text-xs font-mono font-semibold text-white">{clock}</span>
            <div className="h-6 px-3 bg-black/90 rounded-full flex items-center gap-1.5 border border-white/10">
              <span className="text-[10px] font-mono text-slate-300">
                {gazePaused ? 'Gaze Paused' : 'Gaze Active'}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-300">{profile.label.split(' ')[0]}</span>
          </div>

          {/* Dynamic App Area */}
          <div className="relative flex-1 flex flex-col justify-between my-3 overflow-hidden z-20">
            {/* Notification Toast */}
            {toast && (
              <div className="absolute top-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-md border border-cyan-500/35 rounded-2xl px-3.5 py-2.5 flex items-center justify-between shadow-xl pointer-events-none">
                <div className="text-xs">
                  <div className="font-semibold text-white">{toast.title}</div>
                  <div className="text-slate-400 text-[11px]">{toast.sub}</div>
                </div>
              </div>
            )}

            {activeView === 'home' && (
              <div className="flex-1 flex flex-col justify-between gap-3 py-1">
                {/* Widgets */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Spatial Audio Player */}
                  <div className="col-span-2 rounded-2xl bg-slate-900/75 border border-white/10 p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0">
                        <Music className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{TRACKS[trackIdx]}</div>
                        <div className="text-xs text-slate-400">
                          {isPlaying ? 'Playing Synth · Web Audio' : 'Spatial Audio · Ready'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-gaze-target="true"
                        data-action={isPlaying ? 'Pause Music' : 'Play Music'}
                        onClick={toggleMusic}
                        className="gaze-target w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer"
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <button
                        type="button"
                        data-gaze-target="true"
                        data-action="Next Track"
                        onClick={nextTrack}
                        className="gaze-target w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Studio Lights */}
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Toggle Studio Lights"
                    onClick={() => {
                      setLightsOn((l) => !l);
                      onNotify('Studio Lights', lightsOn ? 'Turned Off' : 'Turned On · 85%');
                    }}
                    className="gaze-target rounded-2xl bg-slate-900/75 border border-white/10 p-3.5 flex flex-col items-start justify-between h-24 text-left cursor-pointer"
                  >
                    <Lightbulb className={`w-5 h-5 ${lightsOn ? 'text-amber-300' : 'text-slate-500'}`} />
                    <div>
                      <div className="text-xs font-semibold text-white">Studio Lights</div>
                      <div className={`text-[11px] font-mono ${lightsOn ? 'text-amber-300' : 'text-slate-400'}`}>
                        {lightsOn ? 'On · 85%' : 'Off'}
                      </div>
                    </div>
                  </button>

                  {/* Live Speech Launcher */}
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Live Speech"
                    onClick={() => onChangeView('keyboard')}
                    className="gaze-target rounded-2xl bg-slate-900/75 border border-white/10 p-3.5 flex flex-col items-start justify-between h-24 text-left cursor-pointer"
                  >
                    <MessageSquare className="w-5 h-5 text-sky-400" />
                    <div>
                      <div className="text-xs font-semibold text-white">Live Speech</div>
                      <div className="text-[11px] text-sky-300">Gaze Keyboard</div>
                    </div>
                  </button>
                </div>

                {/* App Grid */}
                <div className="grid grid-cols-3 gap-3 px-1">
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Type"
                    onClick={() => onChangeView('keyboard')}
                    className="gaze-target flex flex-col items-center gap-1.5 p-2 rounded-2xl cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-sky-500 to-blue-600 flex items-center justify-center shadow">
                      <Keyboard className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs font-medium text-white">Type</span>
                  </button>

                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Reader"
                    onClick={() => onChangeView('safari')}
                    className="gaze-target flex flex-col items-center gap-1.5 p-2 rounded-2xl cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-cyan-500 to-sky-600 flex items-center justify-center shadow">
                      <Globe className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs font-medium text-white">Reader</span>
                  </button>

                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Photos"
                    onClick={() => onChangeView('photos')}
                    className="gaze-target flex flex-col items-center gap-1.5 p-2 rounded-2xl cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow">
                      <ImageIcon className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs font-medium text-white">Photos</span>
                  </button>

                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Controls"
                    onClick={() => setControlCenterOpen(true)}
                    className="gaze-target flex flex-col items-center gap-1.5 p-2 rounded-2xl cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-white/15 flex items-center justify-center shadow">
                      <SlidersHorizontal className="w-6 h-6 text-emerald-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-200">Controls</span>
                  </button>

                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Camera"
                    onClick={() => onChangeView('camera')}
                    className="gaze-target flex flex-col items-center gap-1.5 p-2 rounded-2xl cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-white/15 flex items-center justify-center shadow">
                      <Camera className="w-6 h-6 text-sky-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-200">Camera</span>
                  </button>

                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Precision Test"
                    onClick={() => onChangeView('precision')}
                    className="gaze-target flex flex-col items-center gap-1.5 p-2 rounded-2xl cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-emerald-500 to-teal-700 flex items-center justify-center shadow">
                      <Crosshair className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs font-medium text-slate-200">Precision</span>
                  </button>
                </div>
              </div>
            )}

            {activeView === 'keyboard' && (
              <GazeKeyboardApp
                onBackHome={() => onChangeView('home')}
                onSpeak={(phrase) => onNotify('Live Speech', `"${phrase}"`)}
              />
            )}

            {activeView === 'safari' && (
              <SafariReaderApp
                gazeRef={gazeRef}
                gazePaused={gazePaused}
                onBackHome={() => onChangeView('home')}
              />
            )}

            {activeView === 'precision' && (
              <PrecisionBenchmarkApp
                onBackHome={() => onChangeView('home')}
                onScoreEvent={(summary) => onNotify('Precision Target', summary)}
              />
            )}

            {activeView === 'camera' && (
              <div className="flex-1 flex flex-col justify-between gap-2 py-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Back to Home"
                    onClick={() => onChangeView('home')}
                    className="gaze-target px-3.5 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer"
                  >
                    ← Home
                  </button>
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Toggle Grid"
                    onClick={() => setShowGrid((g) => !g)}
                    className="gaze-target px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-amber-300 cursor-pointer"
                  >
                    {showGrid ? 'Grid On' : 'Grid Off'}
                  </button>
                </div>

                <div className="relative flex-1 rounded-2xl overflow-hidden bg-slate-950 border border-white/15 flex items-center justify-center">
                  {webcamStream ? (
                    <video
                      ref={camVideoRef}
                      muted
                      playsInline
                      autoPlay
                      className={`w-full h-full object-cover transition-transform duration-200 ${
                        lensZoom === '2x' ? 'scale-x-[-1.4] scale-y-[1.4]' : 'scale-x-[-1]'
                      }`}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-950/60 via-slate-900 to-emerald-950/50 flex flex-col items-center justify-center p-4 text-center">
                      <div className="w-20 h-20 rounded-full border border-amber-400/50 flex items-center justify-center mb-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                      </div>
                      <span className="text-xs font-mono text-slate-300">
                        Optical {lensZoom} · Gaze Shutter Ready
                      </span>
                    </div>
                  )}

                  {showGrid && (
                    <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }).map((_, idx) => (
                        <div key={idx} className="border border-white/10" />
                      ))}
                    </div>
                  )}

                  <div
                    className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${
                      flashActive ? 'opacity-90' : 'opacity-0'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-around py-1">
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Open Gallery"
                    onClick={() => onChangeView('photos')}
                    className="gaze-target w-12 h-11 rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer"
                  >
                    Gallery
                  </button>
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Capture Photo"
                    onClick={() => capturePhoto(`Gaze Snap (${lensZoom})`)}
                    className="gaze-target w-15 h-15 rounded-full border-4 border-white p-1 flex items-center justify-center cursor-pointer"
                  >
                    <span className="w-full h-full rounded-full bg-white block" />
                  </button>
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Switch Lens"
                    onClick={() => setLensZoom((z) => (z === '1x' ? '2x' : '1x'))}
                    className="gaze-target w-12 h-11 rounded-xl bg-white/10 text-xs font-bold text-amber-300 cursor-pointer"
                  >
                    {lensZoom}
                  </button>
                </div>
              </div>
            )}

            {activeView === 'photos' && (
              <div className="flex-1 flex flex-col justify-between gap-2 py-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    data-gaze-target="true"
                    data-action="Back to Home"
                    onClick={() => onChangeView('home')}
                    className="gaze-target px-3.5 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer"
                  >
                    ← Home
                  </button>
                  <span className="text-xs font-semibold text-slate-200">
                    Gaze Photos · {photos.length}
                  </span>
                </div>

                <div className="flex-1 grid grid-cols-2 gap-2.5 overflow-y-auto pr-0.5">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className={`relative rounded-2xl bg-gradient-to-tr ${photo.gradient} p-2.5 flex flex-col justify-between h-28 overflow-hidden border border-white/10`}
                    >
                      {photo.dataUrl && (
                        <img
                          src={photo.dataUrl}
                          alt={photo.title}
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover opacity-80"
                        />
                      )}
                      <div className="relative z-10 flex justify-end">
                        <button
                          type="button"
                          data-gaze-target="true"
                          data-action={`Delete ${photo.title}`}
                          onClick={() =>
                            setPhotos((prev) => prev.filter((item) => item.id !== photo.id))
                          }
                          className="gaze-target p-1.5 rounded-lg bg-black/50 text-white hover:bg-rose-600/80 cursor-pointer"
                          title="Delete photo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="relative z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent -m-2.5 p-2.5">
                        <div className="text-[11px] font-bold text-white truncate">{photo.title}</div>
                        <div className="text-[9px] text-slate-200">
                          {photo.subtitle} · {photo.createdAt}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Dock */}
          <div className="flex flex-col items-center gap-2.5 z-20 shrink-0">
            <div className="w-full rounded-2xl bg-slate-900/80 border border-white/10 p-2 grid grid-cols-4 gap-2">
              <button
                type="button"
                data-gaze-target="true"
                data-action="Hands-Free Emergency Dialer"
                onClick={() => onNotify('Phone Dialer', 'Hands-free call interface ready')}
                className="gaze-target h-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white cursor-pointer"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button
                type="button"
                data-gaze-target="true"
                data-action="Open Gaze Keyboard"
                onClick={() => onChangeView('keyboard')}
                className="gaze-target h-11 rounded-xl bg-sky-600 flex items-center justify-center text-white cursor-pointer"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
              <button
                type="button"
                data-gaze-target="true"
                data-action="Open Gaze Camera"
                onClick={() => onChangeView('camera')}
                className="gaze-target h-11 rounded-xl bg-slate-700 flex items-center justify-center text-white cursor-pointer"
              >
                <Camera className="w-5 h-5" />
              </button>
              <button
                type="button"
                data-gaze-target="true"
                data-action="Recalibrate Gaze"
                onClick={onStartCalibration}
                className="gaze-target h-11 rounded-xl bg-indigo-600 flex items-center justify-center text-white cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
            <div className="w-28 h-1 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
};
