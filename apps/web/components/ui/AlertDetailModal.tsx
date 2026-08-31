"use client";

import { useEffect, useRef } from "react";
import type { Alert } from "../../lib/types";
import { RISK_COLORS, ACTION_LABELS } from "../../lib/types";
import { format, parseISO } from "date-fns";
import ScoreRing from "./ScoreRing";

interface AlertDetailModalProps {
  alert: Alert;
  onClose: () => void;
  onAcknowledge: (alertId: string) => Promise<void>;
}

export default function AlertDetailModal({
  alert,
  onClose,
  onAcknowledge,
}: AlertDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const report = alert.report;
  const color = RISK_COLORS[alert.riskLevel];

  // Close on backdrop click
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      if (e.target === el) onClose();
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,12,16,0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#0f1318",
          border: `1px solid ${color}44`,
          borderRadius: 10,
          width: "100%",
          maxWidth: 680,
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: `0 0 40px ${color}22`,
          position: "relative",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #1e2836",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "#0f1318",
            zIndex: 1,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: "'IBM Plex Mono', monospace",
                color: color,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              {alert.riskLevel} risk · {alert.actionTier.replace("_", " ")}
            </div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#e2eaf4",
                letterSpacing: "-0.01em",
              }}
            >
              {report?.title ?? `Degradation Alert — ${alert.assetName}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#4a6080",
              cursor: "pointer",
              fontSize: 18,
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Score + meta strip */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #1e2836",
            display: "flex",
            gap: 24,
            alignItems: "center",
          }}
        >
          <ScoreRing score={alert.riskScore} level={alert.riskLevel} size={80} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <div className="stat-label">Asset</div>
                <div style={{ fontSize: 13, marginTop: 4, color: "#e2eaf4" }}>
                  {alert.assetName}
                </div>
              </div>
              <div>
                <div className="stat-label">Type</div>
                <div style={{ fontSize: 13, marginTop: 4, color: "#e2eaf4" }}>
                  {alert.assetType === "bridge" ? "🌉 Bridge" : "🌾 Farmland"}
                </div>
              </div>
              <div>
                <div className="stat-label">Generated</div>
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: "#8fa3bc",
                  }}
                >
                  {report?.generatedAt
                    ? format(parseISO(report.generatedAt), "MMM d, HH:mm")
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Before / After imagery */}
        {report?.beforeImageUrl && report?.afterImageUrl && (
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e2836" }}>
            <div
              className="card-title"
              style={{ marginBottom: 12 }}
            >
              Satellite Comparison
            </div>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: "#4a6080",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Baseline
                </div>
                <img
                  src={report.beforeImageUrl}
                  alt="Baseline imagery"
                  style={{
                    width: "100%",
                    borderRadius: 6,
                    border: "1px solid #1e2836",
                    display: "block",
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: color,
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Latest capture
                </div>
                <img
                  src={report.afterImageUrl}
                  alt="Latest imagery"
                  style={{
                    width: "100%",
                    borderRadius: 6,
                    border: `1px solid ${color}55`,
                    display: "block",
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Report body */}
        {report && (
          <div style={{ padding: "20px 24px" }}>
            {/* Executive summary */}
            <div style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>
                Executive Summary
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "#c8d8ec",
                  lineHeight: 1.7,
                  background: "#151c24",
                  padding: "14px 16px",
                  borderRadius: 6,
                  borderLeft: `3px solid ${color}`,
                }}
              >
                {report.executiveSummary}
              </p>
            </div>

            {/* Observed changes */}
            {report.observedChanges?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="card-title" style={{ marginBottom: 10 }}>
                  Observed Changes
                </div>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                  {report.observedChanges.map((change, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 13,
                        color: "#c8d8ec",
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ color: color, marginTop: 2, flexShrink: 0 }}>◆</span>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Contributing factors */}
            {report.contributingFactors?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="card-title" style={{ marginBottom: 10 }}>
                  Contributing Factors
                </div>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                  {report.contributingFactors.map((factor, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 13,
                        color: "#8fa3bc",
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ color: "#4a6080", marginTop: 2, flexShrink: 0 }}>→</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended actions */}
            {report.recommendedActions?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="card-title" style={{ marginBottom: 10 }}>
                  Recommended Actions
                </div>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {report.recommendedActions.map((action, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 13,
                        color: "#e2eaf4",
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        background: "#151c24",
                        padding: "10px 14px",
                        borderRadius: 6,
                        border: "1px solid #1e2836",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 10,
                          color: "#4a6080",
                          marginTop: 2,
                          flexShrink: 0,
                          minWidth: 20,
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action footer */}
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                borderTop: "1px solid #1e2836",
                paddingTop: 20,
              }}
            >
              <button className="btn btn--ghost" onClick={onClose}>
                Close
              </button>
              {alert.status === "pending" && (
                <button
                  className="btn btn--primary"
                  onClick={async () => {
                    await onAcknowledge(alert.id);
                    onClose();
                  }}
                >
                  Acknowledge & dispatch inspector
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
