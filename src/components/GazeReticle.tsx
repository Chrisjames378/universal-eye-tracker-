import React from 'react';

interface GazeReticleProps {
  reticleRef: React.RefObject<HTMLDivElement | null>;
  dwellCircleRef: React.RefObject<SVGCircleElement | null>;
  reticleDotRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  paused: boolean;
  snapped: boolean;
}

export const GazeReticle: React.FC<GazeReticleProps> = ({
  reticleRef,
  dwellCircleRef,
  reticleDotRef,
  visible,
  paused,
  snapped,
}) => {
  if (!visible) return null;

  return (
    <div
      ref={reticleRef}
      className="fixed top-0 left-0 pointer-events-none z-50 flex items-center justify-center transition-opacity duration-150"
      style={{
        width: 56,
        height: 56,
        marginLeft: -28,
        marginTop: -28,
        opacity: paused ? 0.35 : 1,
      }}
    >
      <svg className="w-full h-full drop-shadow-md" viewBox="0 0 60 60">
        <circle
          cx="30"
          cy="30"
          r="24"
          fill={snapped ? 'rgba(56, 189, 248, 0.16)' : 'rgba(56, 189, 248, 0.08)'}
          stroke={snapped ? 'rgba(56, 189, 248, 0.7)' : 'rgba(255, 255, 255, 0.25)'}
          strokeWidth="2.5"
        />
        <circle
          ref={dwellCircleRef}
          className="dwell-ring-circle"
          cx="30"
          cy="30"
          r="24"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="150.8"
          strokeDashoffset="150.8"
        />
      </svg>
      <div
        ref={reticleDotRef}
        className={`absolute w-2.5 h-2.5 rounded-full transition-transform duration-150 ${
          paused ? 'bg-amber-400' : 'bg-sky-400 shadow-[0_0_8px_#38bdf8]'
        }`}
      />
    </div>
  );
};
