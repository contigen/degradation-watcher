"use client";

import { useEffect, useState, useCallback } from "react";
import {
  subscribeToAssets,
  subscribeToAlerts,
  acknowledgeAlert,
} from "../../lib/firestore";
import type { Asset, Alert } from "../../lib/types";
import { RISK_COLORS } from "../../lib/types";
import AssetMap from "../../components/map/AssetMap";
import RiskScoreChart from "../../components/charts/RiskScoreChart";
import AlertFeed from "../../components/ui/AlertFeed";
import ScoreRing from "../../components/ui/ScoreRing";

export default function DashboardPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub1 = subscribeToAssets((a) => {
      setAssets(a);
      setLoading(false);
    });
    const unsub2 = subscribeToAlerts(setAlerts);
    return () => { unsub1(); unsub2(); };
  }, []);

  // Aggregate stats
  const criticalCount = assets.filter((a) => a.currentRisk?.level === "critical").length;
  const highCount = assets.filter((a) => a.currentRisk?.level === "high").length;
  const pendingAlerts = alerts.filter((a) => a.status === "pending").length;
  const avgScore =
    assets.length > 0
      ? Math.round(
          assets.reduce((sum, a) => sum + (a.currentRisk?.score ?? 0), 0) / assets.length
        )
      : 0;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Mission Control</h1>
        <p className="page-subtitle">
          {assets.length} assets monitored · Sentinel-2 refresh every 5 days
        </p>
      </div>

      <div className="page-body" style={{ flex: 1, overflow: "auto" }}>
        {/* Stat strip */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-cell">
            <div className="stat-label">Assets Monitored</div>
            <div className="stat-value">{assets.length}</div>
            <div className="stat-sub">Bridges + farmland</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">Critical</div>
            <div className="stat-value" style={{ color: RISK_COLORS.critical }}>
              {criticalCount}
            </div>
            <div className="stat-sub">Immediate action</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">High Risk</div>
            <div className="stat-value" style={{ color: RISK_COLORS.high }}>
              {highCount}
            </div>
            <div className="stat-sub">Inspect within 30 days</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">Pending Alerts</div>
            <div className="stat-value" style={{ color: pendingAlerts > 0 ? RISK_COLORS.high : "inherit" }}>
              {pendingAlerts}
            </div>
            <div className="stat-sub">Awaiting review</div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">Fleet Avg Score</div>
            <div className="stat-value">{avgScore}</div>
            <div className="stat-sub">Out of 100</div>
          </div>
        </div>

        {/* Main grid: map + alerts */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Map */}
          <div className="card" style={{ minHeight: 480 }}>
            <div className="card-header">
              <span className="card-title">Asset Map</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {assets.length} active
              </span>
            </div>
            <div style={{ height: 440 }}>
              {!loading && (
                <AssetMap
                  assets={assets}
                  onAssetSelect={setSelectedAsset}
                  selectedAssetId={selectedAsset?.id}
                />
              )}
            </div>
          </div>

          {/* Alert feed */}
          <div className="card" style={{ display: "flex", flexDirection: "column" }}>
            <div className="card-header">
              <span className="card-title">Live Alerts</span>
              {pendingAlerts > 0 && (
                <span
                  className="risk-badge risk-badge--critical"
                  style={{ fontSize: 10 }}
                >
                  {pendingAlerts} pending
                </span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <AlertFeed
                alerts={alerts.slice(0, 12)}
                onAcknowledge={acknowledgeAlert}
              />
            </div>
          </div>
        </div>

        {/* Selected asset detail */}
        {selectedAsset && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                {selectedAsset.name}
                <span style={{ marginLeft: 8, opacity: 0.5 }}>
                  — {selectedAsset.type}
                </span>
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  className={`risk-badge risk-badge--${selectedAsset.currentRisk?.level ?? "low"}`}
                >
                  {selectedAsset.currentRisk?.level ?? "unscored"}
                </span>
                <a href={`/assets/${selectedAsset.id}`} className="btn btn--ghost" style={{ padding: "4px 12px" }}>
                  Full report →
                </a>
                <button
                  className="btn btn--ghost"
                  style={{ padding: "4px 12px" }}
                  onClick={() => setSelectedAsset(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 24, alignItems: "start" }}>
                <ScoreRing
                  score={selectedAsset.currentRisk?.score ?? 0}
                  level={selectedAsset.currentRisk?.level ?? "low"}
                  size={100}
                />
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div className="stat-label">Coordinates</div>
                      <div className="mono" style={{ marginTop: 4 }}>
                        {selectedAsset.coordinates.lat.toFixed(4)},&nbsp;
                        {selectedAsset.coordinates.lng.toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Type</div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        {selectedAsset.type === "bridge" ? "🌉 Bridge" : "🌾 Farmland"}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Score velocity</div>
                      <div
                        className={`velocity velocity--${
                          (selectedAsset.currentRisk?.velocity ?? 0) > 0
                            ? "up"
                            : (selectedAsset.currentRisk?.velocity ?? 0) < 0
                            ? "down"
                            : "flat"
                        }`}
                        style={{ marginTop: 4 }}
                      >
                        {(selectedAsset.currentRisk?.velocity ?? 0) > 0 ? "↑" : (selectedAsset.currentRisk?.velocity ?? 0) < 0 ? "↓" : "→"}
                        &nbsp;{Math.abs(selectedAsset.currentRisk?.velocity ?? 0)} pts / cycle
                      </div>
                    </div>
                  </div>
                  <RiskScoreChart assetId={selectedAsset.id} compact />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
