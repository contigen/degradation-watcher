"use client";

import { useEffect, useState } from "react";
import { subscribeToAlerts, acknowledgeAlert, resolveAlert } from "../../lib/firestore";
import type { Alert } from "../../lib/types";
import { RISK_COLORS, ACTION_LABELS } from "../../lib/types";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import AlertDetailModal from "../../components/ui/AlertDetailModal";
import ScoreRing from "../../components/ui/ScoreRing";

type StatusFilter = "pending" | "acknowledged" | "all";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToAlerts((a) => {
      setAlerts(a);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = alerts.filter((a) =>
    statusFilter === "all" ? true : a.status === statusFilter
  );

  const pendingCount = alerts.filter((a) => a.status === "pending").length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          Alert Inbox
          {pendingCount > 0 && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 13,
                fontFamily: "'IBM Plex Mono', monospace",
                color: RISK_COLORS.critical,
                fontWeight: 400,
              }}
            >
              {pendingCount} pending
            </span>
          )}
        </h1>
        <p className="page-subtitle">
          Human-in-the-loop review queue · Autonomous reports from the agent fleet
        </p>
      </div>

      <div className="page-body">
        {/* Filter strip */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
          {(["pending", "acknowledged", "all"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              className={`btn ${statusFilter === f ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "6px 14px", textTransform: "capitalize" }}
              onClick={() => setStatusFilter(f)}
            >
              {f}
              {f === "pending" && pendingCount > 0 && (
                <span style={{
                  marginLeft: 6,
                  background: RISK_COLORS.critical,
                  color: "#fff",
                  borderRadius: 10,
                  padding: "0 5px",
                  fontSize: 10,
                  fontWeight: 700,
                }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Alert cards */}
        {loading ? (
          <div style={{ color: "#4a6080", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: 32 }}>
            Loading alerts…
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div style={{ padding: "48px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#e2eaf4", marginBottom: 6 }}>
                No {statusFilter === "all" ? "" : statusFilter} alerts
              </div>
              <div style={{ fontSize: 12, color: "#4a6080", fontFamily: "'IBM Plex Mono', monospace" }}>
                The agent fleet is watching — you'll be notified when thresholds are crossed
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((alert) => {
              const color = RISK_COLORS[alert.riskLevel];
              const isUrgent = alert.actionTier === "urgent";

              return (
                <div
                  key={alert.id}
                  className="card"
                  style={{
                    cursor: "pointer",
                    border: isUrgent && alert.status === "pending"
                      ? `1px solid ${color}55`
                      : "1px solid #1e2836",
                    transition: "all 0.15s",
                  }}
                  onClick={() => setSelectedAlert(alert)}
                >
                  <div style={{ padding: "16px 20px", display: "flex", gap: 20, alignItems: "center" }}>
                    {/* Score ring */}
                    <ScoreRing score={alert.riskScore} level={alert.riskLevel} size={64} />

                    {/* Main content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#e2eaf4" }}>
                          {alert.assetName ?? alert.assetId}
                        </span>
                        <span className={`risk-badge risk-badge--${alert.riskLevel}`}>
                          {alert.riskLevel}
                        </span>
                        {alert.status === "acknowledged" && (
                          <span style={{
                            fontSize: 10,
                            fontFamily: "'IBM Plex Mono', monospace",
                            color: "#4a6080",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}>
                            ✓ acknowledged
                          </span>
                        )}
                      </div>

                      <p style={{
                        fontSize: 12,
                        color: "#8fa3bc",
                        lineHeight: 1.5,
                        marginBottom: 10,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}>
                        {alert.report?.executiveSummary ?? alert.summary}
                      </p>

                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#4a6080", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {alert.assetType === "bridge" ? "🌉" : "🌾"} {alert.assetType}
                        </span>
                        <span style={{ fontSize: 11, color: "#4a6080", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {formatDistanceToNow(parseISO(alert.createdAt), { addSuffix: true })}
                        </span>
                        <span style={{ color, fontSize: 11, fontWeight: 600 }}>
                          → {ACTION_LABELS[alert.actionTier]}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {alert.status === "pending" && (
                        <>
                          <button
                            className="btn btn--primary"
                            style={{ padding: "6px 14px", fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAlert(alert);
                            }}
                          >
                            View report
                          </button>
                          <button
                            className="btn btn--ghost"
                            style={{ padding: "6px 14px", fontSize: 12 }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              await acknowledgeAlert(alert.id);
                            }}
                          >
                            Acknowledge
                          </button>
                        </>
                      )}
                      {alert.status === "acknowledged" && (
                        <button
                          className="btn btn--ghost"
                          style={{ padding: "6px 14px", fontSize: 12 }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await resolveAlert(alert.id);
                          }}
                        >
                          Mark resolved
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Report preview strip — recommended actions */}
                  {alert.report?.recommendedActions?.length > 0 && (
                    <div style={{
                      borderTop: "1px solid #1e2836",
                      padding: "10px 20px",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}>
                      {alert.report.recommendedActions.slice(0, 3).map((action, i) => (
                        <span key={i} style={{
                          fontSize: 11,
                          color: "#8fa3bc",
                          padding: "3px 10px",
                          background: "#151c24",
                          borderRadius: 4,
                          border: "1px solid #1e2836",
                        }}>
                          {String(i + 1).padStart(2, "0")} {action}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onAcknowledge={acknowledgeAlert}
        />
      )}
    </div>
  );
}
