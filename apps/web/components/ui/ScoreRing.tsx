// ScoreRing.tsx — Circular score indicator
"use client";

import { RISK_COLORS } from "../../lib/types";
import type { RiskLevel } from "../../lib/types";

interface ScoreRingProps {
  score: number;
  level: RiskLevel;
  size?: number;
}

export default function ScoreRing({ score, level, size = 80 }: ScoreRingProps) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = RISK_COLORS[level];

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e2836"
          strokeWidth={6}
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.6s ease",
            filter: `drop-shadow(0 0 4px ${color}66)`,
          }}
        />
      </svg>
      <span className="score-ring__value" style={{ color, fontSize: size * 0.22 }}>
        {score}
      </span>
      <span className="score-ring__label">/100</span>
    </div>
  );
}
