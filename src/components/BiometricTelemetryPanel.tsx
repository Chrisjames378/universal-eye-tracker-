import React, { useEffect, useRef, useState } from 'react';
import { Eye, Video, VideoOff } from 'lucide-react';
import type { CalibrationModel, InputMode, LiveGazeData, TelemetryPoint } from '../types/gaze';

interface BiometricTelemetryPanelProps {
  gazeRef: React.MutableRefObject<LiveGazeData>;
  waveformRef: React.MutableRefObject<TelemetryPoint[]>;
  mode: InputMode;
  webcamStatus: 'idle' | 'loading' | 'active' | 'error';
  webcamStream: MediaStream | null;
  fps: number;
  calibration: CalibrationModel | null;
}

export const BiometricTelemetryPanel: React.FC<BiometricTelemetryPanelProps> = ({
  gazeRef,
  waveformRef,
  mode,
  webcamStatus,
  webcamStream,
  fps,
  calibration,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [readout, setReadout] = useState({
    xPct: 50,
    yPct: 50,
    stateKind: 'Fixation' as LiveGazeData['stateKind'],
    ear: 0.31,
    velocity: 0,
    confidence: 99,
    faceDetected: true,
  });

  useEffect(() => {
    if (miniVideoRef.current && webcamStream && showPreview) {
      miniVideoRef.current.srcObject = webcamStream;
      miniVideoRef.current.play().catch(() => {});
    }
  }, [webcamStream, showPreview]);

  useEffect(() => {
    let rafId = 0;
    let lastUiUpdate = 0;

    const renderFrame = (now: number) => {
      const canvas = canvasRef.current;
      const data = gazeRef.current;
      const history = waveformRef.current;

      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx && rect.width > 0 && rect.height > 0) {
          ctx.save();
          ctx.scale(dpr, dpr);
          const w = rect.width;
          const h = rect.height;

          ctx.clearRect(0, 0, w, h);

          // Technical hairline grid
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
          ctx.lineWidth = 1;
          for (let gx = 0; gx < w; gx += 28) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
          }
          for (let gy = 0; gy < h; gy += 28) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
          }

          // Upper region: Dual Biometric Eyes + Head Orientation Crosshair
          const eyeY = h * 0.36;
          const eyeCenters = [w * 0.28, w * 0.72];
          const offsetX = (data.irisNormX - 0.5) * 24;
          const offsetY = (data.irisNormY - 0.5) * 12;

          eyeCenters.forEach((cx, idx) => {
            const ear = idx === 0 ? data.earLeft : data.earRight;
            const lidClosed = ear < 0.16;
            const lidOpen = lidClosed ? 2.5 : Math.min(24, Math.max(8, ear * 76));

            ctx.beginPath();
            ctx.moveTo(cx - 40, eyeY);
            ctx.quadraticCurveTo(cx, eyeY - lidOpen, cx + 40, eyeY);
            ctx.quadraticCurveTo(cx, eyeY + lidOpen, cx - 40, eyeY);
            ctx.strokeStyle = lidClosed ? '#f59e0b' : 'rgba(56, 189, 248, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = lidClosed ? 'rgba(245, 158, 11, 0.08)' : 'rgba(14, 165, 233, 0.07)';
            ctx.fill();

            if (!lidClosed) {
              const ix = cx + offsetX;
              const iy = eyeY + offsetY;

              ctx.beginPath();
              ctx.arc(ix, iy, 11.5, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
              ctx.fill();
              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(ix, iy, 4.8, 0, Math.PI * 2);
              ctx.fillStyle = '#f8fafc';
              ctx.fill();

              ctx.beginPath();
              ctx.moveTo(ix, iy);
              ctx.lineTo(ix + offsetX * 1.35, iy + offsetY * 1.35);
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }
          });

          // Center Head-Pose Attitude Reticle
          const headX = w * 0.5;
          const headY = eyeY;
          ctx.beginPath();
          ctx.arc(headX, headY, 15, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(
            headX + Math.max(-10, Math.min(10, data.headYaw * 36)),
            headY + Math.max(-10, Math.min(10, data.headPitch * 36)),
            3.5,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = '#10b981';
          ctx.fill();

          // Divider between Eyes and Waveform Strip
          const waveTop = h * 0.68;
          ctx.beginPath();
          ctx.moveTo(0, waveTop);
          ctx.lineTo(w, waveTop);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Lower region: Real-time Gaze Velocity & EAR Waveform
          if (history.length > 1) {
            const waveH = h - waveTop - 6;
            const stepX = w / Math.max(1, history.length - 1);

            // Velocity curve (cyan)
            ctx.beginPath();
            history.forEach((pt, i) => {
              const px = i * stepX;
              const normVel = Math.min(1, pt.velocity / 180);
              const py = h - 4 - normVel * waveH;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Binocular EAR curve (amber)
            ctx.beginPath();
            history.forEach((pt, i) => {
              const px = i * stepX;
              const normEar = Math.min(1, Math.max(0, pt.ear / 0.45));
              const py = h - 4 - normEar * waveH;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }

          ctx.restore();
        }
      }

      if (now - lastUiUpdate > 85) {
        lastUiUpdate = now;
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        setReadout({
          xPct: Math.min(100, Math.max(0, (data.smoothX / vw) * 100)),
          yPct: Math.min(100, Math.max(0, (data.smoothY / vh) * 100)),
          stateKind: data.stateKind,
          ear: (data.earLeft + data.earRight) * 0.5,
          velocity: data.velocity,
          confidence: Math.round(data.confidence * 100),
          faceDetected: data.faceDetected,
        });
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [gazeRef, waveformRef]);

  const stateColor =
    readout.stateKind === 'Fixation'
      ? 'text-emerald-400'
      : readout.stateKind === 'Saccade'
      ? 'text-cyan-400'
      : readout.stateKind === 'Blink'
      ? 'text-amber-400'
      : 'text-slate-400';

  return (
    <section className="rounded-2xl bg-[#0f141d] border border-slate-800/90 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Biometric Iris Telemetry</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>{fps} FPS</span>
          {mode === 'webcam' && webcamStatus === 'active' && (
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title="Toggle camera preview"
            >
              {showPreview ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
              <span>{showPreview ? 'Hide Cam' : 'Cam'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative w-full h-40 rounded-xl bg-[#07090e] border border-slate-800 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {showPreview && mode === 'webcam' && webcamStatus === 'active' && (
          <video
            ref={miniVideoRef}
            muted
            playsInline
            className="absolute top-2 right-2 w-24 h-18 object-cover rounded-lg border border-slate-700 scale-x-[-1] opacity-90"
          />
        )}

        <div className="absolute bottom-1.5 left-2.5 flex items-center gap-3 text-[10px] font-mono text-slate-400 pointer-events-none">
          <span className="text-cyan-400">Velocity</span>
          <span className="text-amber-400">EAR Aperture</span>
        </div>

        {mode === 'webcam' && webcamStatus === 'loading' && (
          <div className="absolute inset-0 bg-[#07090e]/90 flex flex-col items-center justify-center gap-2 text-center p-4">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-300">Loading neural iris &amp; blendshape tracker...</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-left border-t border-slate-800/80 pt-3">
        <div>
          <div className="text-[11px] text-slate-400">Gaze X / Y</div>
          <div className="text-xs font-mono font-semibold text-slate-100 mt-0.5">
            {readout.xPct.toFixed(1)}% · {readout.yPct.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Ocular State</div>
          <div className={`text-xs font-mono font-semibold mt-0.5 ${stateColor}`}>
            {readout.stateKind}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">EAR / Vel</div>
          <div className="text-xs font-mono font-semibold text-slate-100 mt-0.5">
            {readout.ear.toFixed(2)} · {Math.round(readout.velocity)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Calibration</div>
          <div className="text-xs font-mono font-semibold text-slate-100 mt-0.5">
            {calibration ? `±${calibration.rmsePercent}%` : `${readout.confidence}%`}
          </div>
        </div>
      </div>

      {mode === 'webcam' && webcamStatus === 'active' && !readout.faceDetected && (
        <div className="text-xs text-amber-300 font-medium">
          Face not detected — center your face in front of the camera.
        </div>
      )}
    </section>
  );
};
