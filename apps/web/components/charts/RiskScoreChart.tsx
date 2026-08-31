"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { getRiskScoreHistory } from "../../lib/firestore";
import type { RiskScore } from "../../lib/types";
import { format, parseISO } from "date-fns";

interface RiskScoreChartProps {
  assetId: string;
  compact?: boolean;
}

const THRESHOLDS = [
  { value: 75, label: "CRITICAL", color: "#f87171" },
  { value: 55, label: "HIGH", color: "#fb923c" },
  { value: 35, label: "MODERATE", color: "#fbbf24" },
];

function scoreToColor(score: number): string {
  if (score >= 75) return "#f87171";
  if (score >= 55) return "#fb923c";
  if (score >= 35) return "#fbbf24";
  return "#4ade80";
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { level: string; velocity: number } }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div
      style={{
        background: "#0f1318",
        border: "1px solid #1e2836",
        borderRadius: 6,
        padding: "10px 14px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        color: "#e2eaf4",
      }}
    >
      <div style={{ color: "#8fa3bc", marginBottom: 4 }}>{label}</div>
      <div style={{ color: scoreToColor(d.value), fontWeight: 600, fontSize: 16 }}>
        {d.value}
        <span style={{ fontSize: 10, color: "#8fa3bc", marginLeft: 4 }}>/100</span>
      </div>
      <div style={{ color: "#8fa3bc", marginTop: 2, textTransform: "uppercase" }}>
        {d.payload.level}
      </div>
      {d.payload.velocity !== 0 && (
        <div
          style={{
            color: d.payload.velocity > 0 ? "#f87171" : "#4ade80",
            marginTop: 4,
          }}
        >
          {d.payload.velocity > 0 ? "↑" : "↓"} {Math.abs(d.payload.velocity)} pts
        </div>
      )}
    </div>
  );
};

export default function RiskScoreChart({ assetId, compact = false }: RiskScoreChartProps) {
  const [scores, setScores] = useState<RiskScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRiskScoreHistory(assetId).then((s) => {
      setScores(s);
      setLoading(false);
    });
  }, [assetId]);

  if (loading) {
    return (
      <div
        style={{
          height: compact ? 80 : 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4a6080",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
        }}
      >
        Loading history…
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div
        style={{
          height: compact ? 80 : 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4a6080",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
        }}
      >
        No score history yet
      </div>
    );
  }

  const chartData = scores.map((s) => ({
    date: format(parseISO(s.scoredAt), "MMM d"),
    score: s.compositeScore,
    level: s.riskLevel,
    velocity: s.velocity,
  }));

  const latestScore = scores[scores.length - 1]?.compositeScore ?? 0;
  const chartColor = scoreToColor(latestScore);

  return (
    <ResponsiveContainer width="100%" height={compact ? 80 : 220}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#4a6080", fontFamily: "'IBM Plex Mono', monospace" }}
          axisLine={false}
          tickLine={false}
          hide={compact}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "#4a6080", fontFamily: "'IBM Plex Mono', monospace" }}
          axisLine={false}
          tickLine={false}
          hide={compact}
        />
        {!compact &&
          THRESHOLDS.map((t) => (
            <ReferenceLine
              key={t.value}
              y={t.value}
              stroke={t.color}
              strokeOpacity={0.3}
              strokeDasharray="4 4"
            />
          ))}
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="score"
          stroke={chartColor}
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props;
            return (
              <circle
                key={`dot-${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={3}
                fill={scoreToColor(payload.score)}
                stroke="none"
              />
            );
          }}
          activeDot={{ r: 5, fill: chartColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
