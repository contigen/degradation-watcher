"use client";

import { useState } from "react";
import type { Alert } from "../../lib/types";
import { RISK_COLORS } from "../../lib/types";
import { formatDistanceToNow, parseISO } from "date-fns";
import AlertDetailModal from "./AlertDetailModal";

interface AlertFeedProps {
  alerts: Alert[];
  onAcknowledge: (alertId: string) => Promise<void>;
}

export default function AlertFeed({ alerts, onAcknowledge }: AlertFeedProps) {
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  if (alerts.length === 0) {
    return (
      <div
        style={{
          padding: "32px 20px",
          textAlign: "center",
          color: "#4a6080",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
        }}
      >
        No active alerts
        <br />
        <span style={{ fontSize: 10, marginTop: 4, display: "block" }}>
          All assets within threshold
        </span>
      </div>
    );
  }

  const handleAcknowledge = async (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    setAcknowledging(alertId);
    try {
      await onAcknowledge(alertId);
    } finally {
      setAcknowledging(null);
    }
  };

  return (
    <>
      {alerts.map((alert) => {
        const color = RISK_COLORS[alert.riskLevel];
        const timeAgo = formatDistanceToNow(parseISO(alert.createdAt), { addSuffix: true });

        return (
          <div
            key={alert.id}
            className="alert-item"
            onClick={() => setSelectedAlert(alert)}
          >
            <div
              className={`alert-severity-bar alert-severity-bar--${alert.riskLevel}`}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="alert-name" style={{ color }}>
                {alert.assetName ?? alert.assetId}
              </div>
              <div className="alert-meta">
                {alert.assetType} · score {alert.riskScore}/100 · {timeAgo}
              </div>
              {alert.status === "pending" && (
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  <button
                    className="btn btn--ghost"
                    style={{ padding: "3px 10px", fontSize: 11 }}
                    onClick={(e) => handleAcknowledge(e, alert.id)}
                    disabled={acknowledging === alert.id}
                  >
                    {acknowledging === alert.id ? "…" : "Acknowledge"}
                  </button>
                  <button
                    className="btn btn--primary"
                    style={{ padding: "3px 10px", fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); setSelectedAlert(alert); }}
                  >
                    View report
                  </button>
                </div>
              )}
              {alert.status === "acknowledged" && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: "#4a6080",
                    fontFamily: "'IBM Plex Mono', monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  ✓ Acknowledged
                </div>
              )}
            </div>
          </div>
        );
      })}

      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onAcknowledge={onAcknowledge}
        />
      )}
    </>
  );
}
