import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { DEVICE_PROFILES, type DeviceProfileId, type InputMode } from '../types/gaze';

export interface WebcamIrisSample {
  irisNormX: number;
  irisNormY: number;
  rawIrisX: number;
  rawIrisY: number;
  earLeft: number;
  earRight: number;
  headYaw: number;
  headPitch: number;
  faceDetected: boolean;
  confidence: number;
}

interface UseWebcamGazeOptions {
  mode: InputMode;
  deviceProfile: DeviceProfileId;
  headPoseFusion: boolean;
  onSample: (sample: WebcamIrisSample) => void;
  onErrorFallback: (reason: string) => void;
}

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function useWebcamGaze({
  mode,
  deviceProfile,
  headPoseFusion,
  onSample,
  onErrorFallback,
}: UseWebcamGazeOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;

  const onErrorRef = useRef(onErrorFallback);
  onErrorRef.current = onErrorFallback;

  const configRef = useRef({ deviceProfile, headPoseFusion });
  configRef.current = { deviceProfile, headPoseFusion };

  const [status, setStatus] = useState<'idle' | 'loading' | 'active' | 'error'>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (mode !== 'webcam') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setStream(null);
      setStatus('idle');
      return;
    }

    let cancelled = false;

    async function start() {
      setStatus('loading');
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API unavailable in this browser context.');
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);

        const video = videoRef.current;
        if (video) {
          video.srcObject = mediaStream;
          await video.play();
        }

        if (!landmarkerRef.current) {
          const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
          if (cancelled) return;
          landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
          });
        }

        if (cancelled) return;
        setStatus('active');

        const detectFrame = () => {
          if (cancelled) return;
          const v = videoRef.current;
          const lmModel = landmarkerRef.current;

          if (v && lmModel && v.readyState >= 2 && v.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = v.currentTime;
            const nowMs = performance.now();
            const res = lmModel.detectForVideo(v, nowMs);

            if (res.faceLandmarks && res.faceLandmarks.length > 0) {
              const lm = res.faceLandmarks[0];
              const blend = res.faceBlendshapes?.[0]?.categories;

              // Binocular iris center landmarks (Left: 468, Right: 473)
              const lIris = lm[468];
              const lOuter = lm[33];
              const lInner = lm[133];
              const lTop = lm[159];
              const lBot = lm[145];

              const rIris = lm[473];
              const rInner = lm[362];
              const rOuter = lm[263];
              const rTop = lm[386];
              const rBot = lm[374];

              const lW = Math.hypot(lInner.x - lOuter.x, lInner.y - lOuter.y) || 0.01;
              const lH = Math.hypot(lTop.x - lBot.x, lTop.y - lBot.y) || 0.01;
              const rW = Math.hypot(rOuter.x - rInner.x, rOuter.y - rInner.y) || 0.01;
              const rH = Math.hypot(rTop.x - rBot.x, rTop.y - rBot.y) || 0.01;

              let earLeft = lH / lW;
              let earRight = rH / rW;

              // Fuse ARKit blink blendshapes when available for robust blink/wink fidelity
              if (blend) {
                const blinkL = blend.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
                const blinkR = blend.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0;
                if (blinkL > 0.55) earLeft = Math.min(earLeft, 0.11);
                if (blinkR > 0.55) earRight = Math.min(earRight, 0.11);
              }

              // Mirror X for natural selfie-camera alignment
              const lRelX = 1 - (lIris.x - lOuter.x) / (lInner.x - lOuter.x || 0.01);
              const lRelY = (lIris.y - lTop.y) / (lBot.y - lTop.y || 0.01);

              const rRelX = 1 - (rIris.x - rInner.x) / (rOuter.x - rInner.x || 0.01);
              const rRelY = (rIris.y - rTop.y) / (rBot.y - rTop.y || 0.01);

              const avgRelX = (lRelX + rRelX) * 0.5;
              const avgRelY = (lRelY + rRelY) * 0.5;

              let headYaw = 0;
              let headPitch = 0;
              if (lm[1] && lm[234] && lm[454]) {
                const nose = lm[1];
                const leftCheek = lm[234];
                const rightCheek = lm[454];
                const faceMidX = (leftCheek.x + rightCheek.x) * 0.5;
                const faceMidY = (leftCheek.y + rightCheek.y) * 0.5;
                const faceWidth = Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y) || 0.1;
                headYaw = -((nose.x - faceMidX) / faceWidth);
                headPitch = (nose.y - faceMidY) / faceWidth;
              }

              const profile = DEVICE_PROFILES[configRef.current.deviceProfile];
              const yawFusion = configRef.current.headPoseFusion ? headYaw * 0.42 : 0;
              const pitchFusion = configRef.current.headPoseFusion ? headPitch * 0.42 : 0;

              const rawIrisX = Math.min(1, Math.max(0, (avgRelX - 0.5) * profile.gainX + 0.5 + yawFusion));
              const rawIrisY = Math.min(1, Math.max(0, (avgRelY - 0.5) * profile.gainY + 0.5 + pitchFusion));

              onSampleRef.current({
                irisNormX: rawIrisX,
                irisNormY: rawIrisY,
                rawIrisX,
                rawIrisY,
                earLeft,
                earRight,
                headYaw,
                headPitch,
                faceDetected: true,
                confidence: 0.96,
              });
            } else {
              onSampleRef.current({
                irisNormX: 0.5,
                irisNormY: 0.5,
                rawIrisX: 0.5,
                rawIrisY: 0.5,
                earLeft: 0.3,
                earRight: 0.3,
                headYaw: 0,
                headPitch: 0,
                faceDetected: false,
                confidence: 0,
              });
            }
          }

          rafRef.current = requestAnimationFrame(detectFrame);
        };

        rafRef.current = requestAnimationFrame(detectFrame);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        const message = err instanceof Error ? err.message : 'Unable to initialize webcam tracking.';
        onErrorRef.current(message);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setStream(null);
    };
  }, [mode]);

  return { videoRef, status, stream };
}
