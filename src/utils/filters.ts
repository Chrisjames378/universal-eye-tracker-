import type { CalibrationModel, CalibrationSample } from '../types/gaze';

/**
 * Real-time One-Euro Filter (Casiez et al., CHI 2012)
 * Balances ultra-low fixation jitter with near-zero saccadic lag.
 */
class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  filterWithAlpha(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  hasLastRawValue(): boolean {
    return this.y !== null;
  }

  lastRawValue(): number {
    return this.y ?? 0;
  }

  reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter2D {
  private xFilter = new LowPassFilter();
  private yFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private dyFilter = new LowPassFilter();
  private lastTimeMs: number | null = null;

  private smoothingAlpha(te: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(
    x: number,
    y: number,
    timestampMs: number,
    minCutoff = 0.85,
    beta = 0.015,
    dCutoff = 1.0
  ): { x: number; y: number } {
    if (this.lastTimeMs === null) {
      this.lastTimeMs = timestampMs;
      return {
        x: this.xFilter.filterWithAlpha(x, 1),
        y: this.yFilter.filterWithAlpha(y, 1),
      };
    }

    const te = Math.max(1 / 240, (timestampMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = timestampMs;

    const dx = this.xFilter.hasLastRawValue()
      ? (x - this.xFilter.lastRawValue()) / te
      : 0;
    const dy = this.yFilter.hasLastRawValue()
      ? (y - this.yFilter.lastRawValue()) / te
      : 0;

    const edx = this.dxFilter.filterWithAlpha(dx, this.smoothingAlpha(te, dCutoff));
    const edy = this.dyFilter.filterWithAlpha(dy, this.smoothingAlpha(te, dCutoff));

    const cutoffX = minCutoff + beta * Math.abs(edx);
    const cutoffY = minCutoff + beta * Math.abs(edy);

    return {
      x: this.xFilter.filterWithAlpha(x, this.smoothingAlpha(te, cutoffX)),
      y: this.yFilter.filterWithAlpha(y, this.smoothingAlpha(te, cutoffY)),
    };
  }

  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
    this.dxFilter.reset();
    this.dyFilter.reset();
    this.lastTimeMs = null;
  }
}

/**
 * Solves 3x3 linear system A * w = b via Gaussian elimination with partial pivoting.
 */
function solve3x3(A: number[][], b: number[]): [number, number, number] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) {
        pivotRow = r;
      }
    }
    if (Math.abs(M[pivotRow][col]) < 1e-8) {
      return null;
    }
    if (pivotRow !== col) {
      [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    }
    const div = M[col][col];
    for (let j = col; j < 4; j++) M[col][j] /= div;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let j = col; j < 4; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

/**
 * Fits an affine 2D calibration model mapping raw iris (x, y) to normalized screen (x, y).
 */
export function solveAffineCalibration(samples: CalibrationSample[]): CalibrationModel {
  if (samples.length < 4) {
    return {
      ax: [0, 1, 0],
      ay: [0, 0, 1],
      rmsePercent: 0,
      calibratedAt: Date.now(),
      sampleCount: samples.length,
    };
  }

  // Normal equations: (X^T X) * w = X^T y, with slight ridge regularization for stability
  const XtX = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const XtyX = [0, 0, 0];
  const XtyY = [0, 0, 0];

  for (const s of samples) {
    const row = [1, s.irisX, s.irisY];
    for (let i = 0; i < 3; i++) {
      XtyX[i] += row[i] * s.targetX;
      XtyY[i] += row[i] * s.targetY;
      for (let j = 0; j < 3; j++) {
        XtX[i][j] += row[i] * row[j];
      }
    }
  }

  // Small ridge regularization on linear terms
  XtX[1][1] += 1e-4;
  XtX[2][2] += 1e-4;

  const ax = solve3x3(XtX, XtyX) ?? [0, 1, 0];
  const ay = solve3x3(XtX, XtyY) ?? [0, 0, 1];

  let sqErr = 0;
  for (const s of samples) {
    const px = ax[0] + ax[1] * s.irisX + ax[2] * s.irisY;
    const py = ay[0] + ay[1] * s.irisX + ay[2] * s.irisY;
    const dx = (px - s.targetX) * 100;
    const dy = (py - s.targetY) * 100;
    sqErr += dx * dx + dy * dy;
  }

  const rmsePercent = Math.sqrt(sqErr / samples.length);

  return {
    ax,
    ay,
    rmsePercent: Number(rmsePercent.toFixed(2)),
    calibratedAt: Date.now(),
    sampleCount: samples.length,
  };
}

export function applyCalibration(
  irisX: number,
  irisY: number,
  model: CalibrationModel | null
): { x: number; y: number } {
  if (!model) {
    return { x: irisX, y: irisY };
  }
  const x = model.ax[0] + model.ax[1] * irisX + model.ax[2] * irisY;
  const y = model.ay[0] + model.ay[1] * irisX + model.ay[2] * irisY;
  return {
    x: Math.min(1.04, Math.max(-0.04, x)),
    y: Math.min(1.04, Math.max(-0.04, y)),
  };
}
