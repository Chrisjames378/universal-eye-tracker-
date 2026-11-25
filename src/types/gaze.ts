export type DeviceProfileId = 'iphone' | 'surface' | 'desktop';
export type InputMode = 'sim' | 'webcam';
export type FilterMode = 'one-euro' | 'exponential';
export type GazeStateKind = 'Fixation' | 'Saccade' | 'Blink' | 'Paused';
export type AppView = 'home' | 'keyboard' | 'safari' | 'camera' | 'photos' | 'precision';

export interface DeviceProfile {
  id: DeviceProfileId;
  label: string;
  opticsHint: string;
  gainX: number;
  gainY: number;
  widthClass: string;
  heightClass: string;
  radiusClass: string;
}

export const DEVICE_PROFILES: Record<DeviceProfileId, DeviceProfile> = {
  iphone: {
    id: 'iphone',
    label: 'Mobile iOS',
    opticsHint: '19.5:9 · TrueDepth',
    gainX: 2.35,
    gainY: 2.85,
    widthClass: 'w-full max-w-[390px]',
    heightClass: 'h-[740px]',
    radiusClass: 'rounded-[46px]',
  },
  surface: {
    id: 'surface',
    label: 'Surface Pro 6',
    opticsHint: '3:2 · 5MP IR Cam',
    gainX: 2.1,
    gainY: 2.35,
    widthClass: 'w-full max-w-[540px]',
    heightClass: 'h-[680px]',
    radiusClass: 'rounded-[28px]',
  },
  desktop: {
    id: 'desktop',
    label: 'Desktop 16:9',
    opticsHint: '16:9 · 1080p Webcam',
    gainX: 1.9,
    gainY: 2.2,
    widthClass: 'w-full max-w-[680px]',
    heightClass: 'h-[620px]',
    radiusClass: 'rounded-[20px]',
  },
};

export interface CalibrationSample {
  targetX: number; // normalized 0..1 screen coordinate
  targetY: number; // normalized 0..1 screen coordinate
  irisX: number;   // normalized 0..1 raw iris coordinate
  irisY: number;   // normalized 0..1 raw iris coordinate
}

export interface CalibrationModel {
  // Affine weights: screenNorm = c0 + c1*irisX + c2*irisY
  ax: [number, number, number];
  ay: [number, number, number];
  rmsePercent: number;
  calibratedAt: number;
  sampleCount: number;
}

export interface GazePreferences {
  deviceProfile: DeviceProfileId;
  dwellEnabled: boolean;
  snapEnabled: boolean;
  headPoseFusion: boolean;
  blinkClickEnabled: boolean;
  winkNavEnabled: boolean;
  soundEnabled: boolean;
  heatmapEnabled: boolean;
  filterMode: FilterMode;
  dwellDuration: number; // ms
  smoothingFactor: number; // 0.05..0.45
  calibration: CalibrationModel | null;
}

export interface LiveGazeData {
  rawX: number;
  rawY: number;
  smoothX: number;
  smoothY: number;
  irisNormX: number;
  irisNormY: number;
  headYaw: number;
  headPitch: number;
  earLeft: number;
  earRight: number;
  isBlinking: boolean;
  isLeftWink: boolean;
  isRightWink: boolean;
  velocity: number; // % viewport per second
  stateKind: GazeStateKind;
  confidence: number;
  faceDetected: boolean;
}

export interface PhotoItem {
  id: string;
  title: string;
  subtitle: string;
  dataUrl?: string;
  gradient: string;
  createdAt: string;
}

export interface TelemetryPoint {
  t: number;
  ear: number;
  velocity: number;
  stateKind: GazeStateKind;
}
